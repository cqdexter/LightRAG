# LightRAG Mix 模式检索全流程详解

## 概述

本文档以一个问题案例贯穿始终，逐步拆解 LightRAG 在 **mix 模式**（推荐模式）下的完整检索流程。

### 案例问题

> "我是校外读者，我应该如何使用图书馆的电子资源"

### 全流程总览

```
第 1 步：关键词提取  ──  LLM 从问题中提炼高层/低层关键词
第 2 步：多源搜索    ──  从实体/关系/文本块三个方向同时检索
第 3 步：Token 截断  ──  按 token 上限精简实体和关系
第 4 步：合并文本块  ──  轮询合并三个来源的原文片段（去重）
第 5 步：构建上下文  ──  拼接实体 + 关系 + 文本块
第 6 步：LLM 生成    ──  上下文 + 问题 → 最终回答
```

---

## 第 1 步：关键词提取

### 入口函数

[`get_keywords_from_query`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L3880) → [`extract_keywords_only`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L4010)

### 流程说明

收到用户问题后，第一步**不是搜索**，而是先让 LLM 提炼关键词。系统构造一个专门的关键词提取提示词，发给 LLM，要求返回 JSON 格式的结果：

```
你是一个关键词提取助手。
从以下问题中提取两类关键词：
- high_level_keywords：宏观主题关键词（2-5个）
- low_level_keywords：具体实体关键词（2-5个）

问题：我是校外读者，我应该如何使用图书馆的电子资源

请返回 JSON 格式：
{"high_level_keywords": [...], "low_level_keywords": [...]}
```

### 示例输出

```json
{
  "high_level_keywords": ["校外读者", "电子资源", "图书馆服务"],
  "low_level_keywords": ["校外访问", "电子资源使用", "远程访问"]
}
```

### 两类关键词的用途

| 关键词类型 | 用途 | 搜索目标 |
|-----------|------|---------|
| **高层关键词（hl_keywords）** | global 路径 | 搜索**关系向量库**（relationships_vdb），找宏观关系模式 |
| **低层关键词（ll_keywords）** | local 路径 | 搜索**实体向量库**（entities_vdb），找具体实体 |

### 预定义关键词跳过

如果用户在请求中已经提供了 `hl_keywords` 或 `ll_keywords`，直接使用，跳过 LLM 调用。

### 缓存机制

关键词提取结果会被缓存到 `llm_response_cache`。相同或相似问题下次直接命中缓存，不再调用 LLM。

### 空关键词兜底

- 如果 `ll_keywords` 为空且模式为 local/hybrid/mix，发出警告
- 如果 `hl_keywords` 为空且模式为 global/hybrid/mix，发出警告
- 如果两者都为空且问题长度小于 50 字，将原问题强制作为 `ll_keywords`
- 如果两者都为空且问题长度超过 50 字，直接返回无结果

### 关键问答：关键词是如何被搜索的？

**问：** 如果 ll_keywords 有 3 个词（A/B/C），是分别搜 A 的 top_k、B 的 top_k、C 的 top_k，再合并选 top_k？还是先合并再搜？

**答：** 都不是分别搜。关键词列表**先拼接成一个逗号分隔的字符串**，然后**整个字符串作为一个整体**被 embedding 成 **1 个向量**，做 **1 次搜索**，返回 top_k 个结果。

```python
ll_keywords_str = ", ".join(ll_keywords)  # "校外访问, 电子资源使用, 远程访问"
emb = embedding_func(["校外访问, 电子资源使用, 远程访问"])
entities_vdb.query(emb, top_k=60)
```

**为什么这样做？** embedding 模型会综合多个关键词的语义，找到同时接近所有关键词的结果中心。如果分别搜再合并，虽然覆盖范围更广，但结果更松散、API 调用次数更多。

---

## 第 2 步：多源搜索

### 入口函数

[`_perform_kg_search`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L4195)

### 流程说明

关键词提取完成后，进入核心搜索阶段。系统从 **3 个方向**同时检索。

### 2.1 批量预计算向量嵌入

为了效率，系统把需要计算向量的文本**合并成一次调用**，发给 embedding 模型：

| 文本 | 用途 | 用于哪条路径 |
|------|------|-------------|
| 原问题 "我是校外读者..." | 搜索**文本块向量库**（chunks_vdb） | mix 独有 |
| 低层关键词 "校外访问, 电子资源使用, 远程访问" | 搜索**实体向量库**（entities_vdb） | local |
| 高层关键词 "校外读者, 电子资源, 图书馆服务" | 搜索**关系向量库**（relationships_vdb） | global |

### 2.2 三条搜索路径详解

```
                    ┌─ low_level keywords ──────→ 实体向量库
                    │    entities_vdb.query()    ← 余弦相似度搜索
                    │         ↓
                    │    _get_node_data()        ← 第 5014 行
                    │    ├─ 向量搜实体（top_k）
                    │    ├─ 取实体详情
                    │    └─ 找实体的直连关系（一跳）
                    │         ↓
                    │    local_entities + local_relations
                    │
问题 ───────────────┼─ high_level keywords ────→ 关系向量库
                    │    relationships_vdb.query() ← 余弦相似度搜索
                    │         ↓
                    │    _get_edge_data()         ← 第 5259 行
                    │    ├─ 向量搜关系（top_k）
                    │    ├─ 取关系详情
                    │    └─ 找关系的关联实体（一跳）
                    │         ↓
                    │    global_relations + global_entities
                    │
                    └─ 原问题 ──────────────────→ 文本块向量库
                         _get_vector_context()    ← 第 4161 行
                              ↓
                         vector_chunks（仅 mix 模式有）
```

### 2.3 local 路径：实体检索（用低层关键词）

**核心函数**：[`_get_node_data`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L5014)

**步骤**：

1. `entities_vdb.query(ll_keywords_str, top_k=60)` — 把低层关键词字符串向量化，搜索实体向量库，返回最相似的 top_k 个实体
2. `knowledge_graph_inst.get_nodes_batch(node_ids)` — 一次性获取这些实体的完整属性
3. 拼接实体数据（含 `entity_name`、`rank` 等）
4. [`_find_most_related_edges_from_entities`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L5071) — 从知识图谱中**一次性查出所有实体关联的直连边**，去重后排序

### 关键问答：一跳关系的搜索深度

**问：** 该实体关联的关系，比如"校外读者 → 申请 → 电子资源访问权限"，这个关联的路径层数有没有限制？只要是一条线的都找出来吗？

**答：** 不是全路径搜索。**只找 1 跳，不继续往下深挖。**

```python
# 第 5071 行：拿实体名列表，查它们的直连边
node_names = [dp["entity_name"] for dp in node_datas]
batch_edges_dict = await knowledge_graph_inst.get_nodes_edges_batch(node_names)
```

**为什么只走 1 跳？**
- **性能**：多一层搜索量指数级增长
- **噪音**：3 跳以上的关系往往与原始问题无关
- **没必要**：mix 模式的文本块路径会直接从原文中找到相关段落，弥补了知识图谱只走 1 跳的不足

搜索深度总结：

| 路径 | 搜索深度 | 说明 |
|------|---------|------|
| **local 路径**（实体→关系） | **1 跳** | 只找向量搜索到的实体的直连边 |
| **global 路径**（关系→实体） | **1 跳** | 只找向量搜索到的关系的直接关联实体 |
| **文本块路径**（mix 独有） | 向量相似度 | 直接搜索原文段落，不受跳数限制 |

### 2.4 global 路径：关系检索（用高层关键词）

**核心函数**：[`_get_edge_data`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L5259)

**步骤**：

1. `relationships_vdb.query(hl_keywords_str, top_k=60)` — 把高层关键词字符串向量化，搜索关系向量库
2. 获取关系详情（描述、权重等）
3. [`_find_most_related_entities_from_relationships`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L5275) — 从关系的 `src_id`/`tgt_id` 中提取实体名，批量获取实体详情

### 2.5 文本块路径（mix 模式独有）

**核心函数**：[`_get_vector_context`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L4161)

直接用原问题向量搜索文本块向量库（chunks_vdb），找到最相似的原始文档段落。这是 mix 模式区别于 hybrid 的关键——额外加入了纯向量检索的文档块，弥补了知识图谱只走 1 跳的不足。

### 2.6 实体与关系的入库向量化方式

#### 实体入库（第 1426 行）

```python
entity_content = f"{entity_name}\n{final_description}"

vdb_data = {
    "content": entity_content,
    "entity_name": entity_name,
    "description": final_description,
    "entity_type": entity_type,
}
```

被向量化的文本示例：
```
校外读者
指非西南政法大学在职教职工、在校学生、在编工作人员，需凭有效证件申请临时借阅权限
```

#### 关系入库（第 1857 行）

```python
rel_content = f"{combined_keywords}\t{src}\n{tgt}\n{final_description}"

vdb_data = {
    "content": rel_content,
    "src_id": src,
    "tgt_id": tgt,
    "keywords": combined_keywords,
    "description": final_description,
}
```

被向量化的文本示例：
```
校外访问, 远程访问, VPN    校外读者
电子资源
校外读者可通过VPN远程访问图书馆电子资源
```

#### 关键问答：搜索匹配的字段

**问：** global 路径用"校外访问"搜索，匹配的是关系数据库的哪个字段？是 src_id、tgt_id、keywords 还是 description？

**答：** 匹配的是 **`content` 字段**。入库时所有关键信息都拼接到了 `content` 中，只有 `content` 被 embedding 模型向量化。

| 字段 | 入库时是否参与向量化 | 能否被搜索匹配 |
|------|-------------------|--------------|
| **`content`** | ✅ 是（核心字段） | ✅ 匹配的依据 |
| `description` | ❌ 单独不向量化（已合并到 content） | ❌ |
| `keywords` | ❌ 单独不向量化（已合并到 content） | ❌ |
| `entity_name` / `src_id` / `tgt_id` | ❌ | ❌ |

### 2.7 合并结果

local 和 global 的结果采用**轮询合并（round-robin）**，交替排列并去重：

```python
final_entities = []
max_len = max(len(local_entities), len(global_entities))
for i in range(max_len):
    if i < len(local_entities):
        if 未重复: final_entities.append(local_entities[i])
    if i < len(global_entities):
        if 未重复: final_entities.append(global_entities[i])
```

最终产出：
- **final_entities**：去重后的实体列表
- **final_relations**：去重后的关系列表
- **vector_chunks**：mix 模式独有的向量检索文本块
- **chunk_tracking**：每个文本块的来源标记（C=向量块, E=实体关联, R=关系关联）

---

## 第 3 步：Token 截断

### 入口函数

[`_apply_token_truncation`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L4595)

### 流程说明

第二步搜到的实体和关系可能很多（默认 `top_k=60`），不能一股脑全塞给 LLM。系统对实体列表和关系列表分别进行 token 截断。

### 截断的两个维度

| 截断对象 | 参数 | 环境变量 | 默认值 |
|---------|------|---------|-------|
| **实体上下文** | `max_entity_tokens` | `MAX_ENTITY_TOKENS` | 4000 |
| **关系上下文** | `max_relation_tokens` | `MAX_RELATION_TOKENS` | 8000 |

### 截断算法

`truncate_list_by_token_size()` — 格式化后的实体/关系列表按顺序（由向量相似度排序，最相关的在前），逐个计算 token 数，超过上限则截断后面的。

### 产出

```python
entities_context   # 截断后的实体格式化文本列表
relations_context  # 截断后的关系格式化文本列表
filtered_entities  # 截断后的原始实体对象
filtered_relations # 截断后的原始关系对象
```

---

## 第 4 步：合并文本块

### 入口函数

[`_merge_all_chunks`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L4660)

### 流程说明

前两步产生了实体和关系，但实体/关系只包含结构化摘要，不包含完整的原文。要给出有依据的回答，还需要找到这些实体和关系对应的**原始文档片段**。

### 三个来源的文本块

```
vector_chunks（第2步直接向量检索到的）   ──── 直接用，无需再查

entity_chunks ── _find_related_text_unit_from_entities()  ← 第 5100 行
    └─ 根据实体的 source_id，从 text_chunks_db 取原文

relation_chunks ─ _find_related_text_unit_from_relations() ← 第 5360 行
    └─ 根据关系的 source_id，从 text_chunks_db 取原文
```

### 每个来源内部的文本块选择策略

由 `kg_chunk_pick_method` 配置控制（默认 `WEIGHT`）：

| 策略 | 说明 |
|------|------|
| **WEIGHT（默认）** | 基于文本块被多少个实体/关系引用的频次加权选择 |
| **VECTOR** | 基于向量相似度选择文本块 |

### 轮询合并与去重

```
第1轮：vector_chunks[0] → entity_chunks[0] → relation_chunks[0]
第2轮：vector_chunks[1] → entity_chunks[1] → relation_chunks[1]
...
相同 chunk_id 只保留第一次出现的
```

---

## 第 5 步：构建 LLM 上下文

### 入口函数

[`_build_context_str`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L4740)

### 流程说明

将截断后的实体描述、关系描述和合并后的文本块，拼接成一段完整的上下文字符串。

### 拼接后的上下文结构

```
-----实体-----
实体名: 校外读者
类型: 读者类型
描述: 指非西南政法大学在职教职工、在校学生...
来源文件: 读者服务管理办法.docx

实体名: 电子资源
类型: 资源类型
描述: 图书馆购买的各类数据库...
来源文件: 电子资源管理办法.docx

-----关系-----
校外读者 → 申请 → 电子资源访问权限
描述: 校外读者需提交申请获取电子资源访问权限
来源文件: 电子资源管理办法.docx

-----文本块-----
【文档原文片段 1】根据《电子资源管理办法》...
【文档原文片段 2】校外读者办理临时借阅证后...
```

### 最终 Token 控制

三个限制同时生效，取最严格的那个：

```
实体描述长度 ≤ max_entity_tokens（默认 4000）
关系描述长度 ≤ max_relation_tokens（默认 8000）
总上下文长度 ≤ max_total_tokens（默认 30000）
```

### 产出

```python
context   # 完整上下文字符串（发给 LLM）
raw_data  # 结构化数据（含引用信息、关键词、处理统计等）
```

`raw_data` 中的 `references` 最终会展示在前端，用户可以看到 AI 回答引用了哪些文件。

---

## 第 6 步：LLM 生成回答

### 入口函数

[`kg_query`](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py#L3659)

### 流程说明

第 5 步构建好的上下文 + 用户原始问题 + 对话历史（如果有）一起发送给 LLM，生成最终回答。

### 最终发出去的提示词

```
---系统提示词---
你是一个知识库问答助手。
基于以下上下文回答用户的问题。

上下文：
[第 5 步构建的完整上下文]

回答格式：Multiple Paragraphs
────────────────────────

---用户问题---
我是校外读者，我应该如何使用图书馆的电子资源
```

### 返回给前端的数据

```json
{
  "response": "作为校外读者，您可以通过以下步骤...",
  "references": [
    {"reference_id": "1", "file_path": "电子资源管理办法.docx"},
    {"reference_id": "2", "file_path": "读者服务指南.docx"}
  ]
}
```

### 流式输出

如果请求中 `stream: true`，LLM 的回答会通过 SSE 协议逐字推送到前端实时显示。

### 缓存机制

如果缓存已启用，完全相同的查询参数下次直接命中缓存，无需重新调用 LLM。

---

## 全流程数据流

```
用户问题 "我是校外读者，我应该如何使用图书馆的电子资源"
    │
    ▼
第1步：LLM 提取关键词
  hl_keywords: ["校外读者", "电子资源", "图书馆服务"]
  ll_keywords: ["校外访问", "电子资源使用", "远程访问"]
    │
    ▼ (mix 模式)
第2步：多源搜索
  ├─ ll  → 实体向量库 → 实体"校外读者"→ 一跳关系"校外读者 → 申请 → 电子资源权限"
  ├─ hl  → 关系向量库 → 关系"图书馆 → 提供 → 电子资源"→ 关联实体"图书馆"、"电子资源"
  └─ 原问题 → 文本块向量库 → 《电子资源管理办法》相关原文段落
    │
    ▼
第3步：Token 截断（只保留最重要的实体和关系）
    │
    ▼
第4步：合并文本块（轮询去重）
    │
    ▼
第5步：构建上下文（拼接实体 + 关系 + 文本块）
    │
    ▼
第6步：LLM 生成回答
  "作为校外读者，您可以通过以下步骤使用图书馆的电子资源：..."
```

---

## 6 种查询模式对比

| 模式 | 实体检索 | 关系检索 | 向量文本块 | 适用场景 |
|------|---------|---------|-----------|---------|
| **naive** | ❌ | ❌ | ✅ | 最简模式，纯向量搜索 |
| **local** | ✅（低层关键词） | ✅（1 跳直连关系） | ❌ | 针对具体事物的详细查询 |
| **global** | ❌ | ✅（高层关键词） | ❌ | 宏观趋势、主题分析 |
| **hybrid** | ✅ | ✅ | ❌ | 综合知识图谱检索 |
| **mix（推荐）** | ✅ | ✅ | ✅ | 知识图谱 + 向量检索的最佳综合效果 |
| **bypass** | ❌ | ❌ | ❌ | 直接问 LLM，不检索知识库 |

---

## 关键参数速查

| 参数 | API 字段 | 环境变量 | 默认值 | 作用环节 |
|------|---------|---------|-------|---------|
| 检索实体/关系数量 | `top_k` | `TOP_K` | 60 | 第 2 步 |
| 检索文本块数量 | `chunk_top_k` | `CHUNK_TOP_K` | 对应 top_k | 第 2 步 |
| 实体 token 上限 | `max_entity_tokens` | `MAX_ENTITY_TOKENS` | 4000 | 第 3 步 |
| 关系 token 上限 | `max_relation_tokens` | `MAX_RELATION_TOKENS` | 8000 | 第 3 步 |
| 总 token 上限 | `max_total_tokens` | `MAX_TOTAL_TOKENS` | 30000 | 第 5 步 |
| 启用重排序 | `enable_rerank` | `RERANK_BY_DEFAULT` | true | 第 4 步 |

---

## 参考源代码

| 环节 | 函数 | 文件 | 行号 |
|------|------|------|------|
| 关键词提取 | `get_keywords_from_query` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 3880 |
| 关键词提取（核心） | `extract_keywords_only` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 4010 |
| 搜索检索 | `_perform_kg_search` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 4195 |
| local-实体搜索 | `_get_node_data` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 5014 |
| local-一跳关系 | `_find_most_related_edges_from_entities` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 5071 |
| global-关系搜索 | `_get_edge_data` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 5259 |
| Token 截断 | `_apply_token_truncation` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 4595 |
| 合并文本块 | `_merge_all_chunks` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 4660 |
| 构建上下文 | `_build_context_str` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 4740 |
| LLM 生成 | `kg_query` | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 3659 |
| QueryParam | — | [base.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/base.py) | 95 |
| 实体入库向量化 | — | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 1426 |
| 关系入库向量化 | — | [operate.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/operate.py) | 1857 |
| 向量库查询 | `query` | [nano_vector_db_impl.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/kg/nano_vector_db_impl.py) | 146 |
| API 入口 | — | [query_routes.py](file:///f:/knowledge_base/LightRAG-1.5.0rc2/lightrag/api/routers/query_routes.py) | 1 |
