import sqlite3
import json
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from lightrag.utils import logger
from lightrag.api.utils_api import get_combined_auth_dependency


class ConversationCreate(BaseModel):
    id: str = Field(description="UUID of the conversation")
    title: str = Field(default="新对话", description="Conversation title")
    updated_at: str = Field(description="ISO 8601 timestamp")


class ConversationUpdate(BaseModel):
    title: Optional[str] = Field(default=None, description="New title")
    updated_at: Optional[str] = Field(default=None, description="ISO 8601 timestamp")


class MessageCreate(BaseModel):
    id: str = Field(description="UUID of the message")
    conversation_id: str = Field(description="Parent conversation UUID")
    role: str = Field(pattern="^(user|assistant)$", description="Message role")
    content: str = Field(default="", description="Message content")
    references: Optional[str] = Field(default=None, description="JSON reference data")
    is_error: bool = Field(default=False, description="Whether this is an error message")


class MessageUpdate(BaseModel):
    content: str = Field(description="Updated message content")


class MessageFeedback(BaseModel):
    feedback: Optional[str] = Field(default=None, pattern="^(useful|useless)?$", description="Feedback value")


def get_db_path(working_dir: str) -> str:
    return os.path.join(working_dir, "conversations.db")


def init_db(db_path: str):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS conversations (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL DEFAULT '新对话',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id               TEXT PRIMARY KEY,
                conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content          TEXT NOT NULL DEFAULT '',
                "references"     TEXT,
                is_error         INTEGER NOT NULL DEFAULT 0,
                feedback         TEXT CHECK (feedback IN ('useful', 'useless')),
                created_at       TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
        """)
        conn.commit()
    finally:
        conn.close()


def create_conversation_routes(rag, api_key: Optional[str] = None):
    router = APIRouter(tags=["conversations"])
    combined_auth = get_combined_auth_dependency(api_key)

    db_path = get_db_path(rag.working_dir)
    init_db(db_path)

    def get_conn():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @router.get("/conversations", dependencies=[Depends(combined_auth)])
    async def list_conversations():
        conn = get_conn()
        try:
            rows = conn.execute(
                "SELECT id, title, updated_at FROM conversations ORDER BY updated_at DESC"
            ).fetchall()
            return [
                {"id": row["id"], "title": row["title"], "updated_at": row["updated_at"]}
                for row in rows
            ]
        finally:
            conn.close()

    @router.post("/conversations", dependencies=[Depends(combined_auth)])
    async def create_conversation(body: ConversationCreate):
        conn = get_conn()
        try:
            conn.execute(
                "INSERT INTO conversations (id, title, updated_at) VALUES (?, ?, ?)",
                (body.id, body.title, body.updated_at),
            )
            conn.commit()
            return {"status": "ok", "id": body.id}
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Conversation already exists")
        finally:
            conn.close()

    @router.put("/conversations/{conv_id}", dependencies=[Depends(combined_auth)])
    async def update_conversation(conv_id: str, body: ConversationUpdate):
        conn = get_conn()
        try:
            fields = []
            values = []
            if body.title is not None:
                fields.append("title = ?")
                values.append(body.title)
            if body.updated_at is not None:
                fields.append("updated_at = ?")
                values.append(body.updated_at)
            if not fields:
                return {"status": "ok"}
            values.append(conv_id)
            conn.execute(
                f"UPDATE conversations SET {', '.join(fields)} WHERE id = ?",
                values,
            )
            conn.commit()
            if conn.total_changes == 0:
                raise HTTPException(status_code=404, detail="Conversation not found")
            return {"status": "ok"}
        finally:
            conn.close()

    @router.delete("/conversations/{conv_id}", dependencies=[Depends(combined_auth)])
    async def delete_conversation(conv_id: str):
        conn = get_conn()
        try:
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
            conn.commit()
            if conn.total_changes == 0:
                raise HTTPException(status_code=404, detail="Conversation not found")
            return {"status": "ok"}
        finally:
            conn.close()

    @router.get("/conversations/{conv_id}/messages", dependencies=[Depends(combined_auth)])
    async def list_messages(conv_id: str):
        conn = get_conn()
        try:
            rows = conn.execute(
                'SELECT id, role, content, "references", is_error, feedback, created_at '
                "FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
                (conv_id,),
            ).fetchall()
            result = []
            for row in rows:
                msg = {
                    "id": row["id"],
                    "role": row["role"],
                    "content": row["content"],
                    "is_error": bool(row["is_error"]),
                    "created_at": row["created_at"],
                }
                if row["references"]:
                    msg["references"] = json.loads(row["references"])
                if row["feedback"]:
                    msg["feedback"] = row["feedback"]
                result.append(msg)
            return result
        finally:
            conn.close()

    @router.post("/conversations/{conv_id}/messages", dependencies=[Depends(combined_auth)])
    async def create_message(conv_id: str, body: MessageCreate):
        conn = get_conn()
        try:
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                'INSERT INTO messages (id, conversation_id, role, content, "references", is_error, created_at) '
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (body.id, conv_id, body.role, body.content, body.references, int(body.is_error), now),
            )
            conn.commit()
            return {"status": "ok", "id": body.id}
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Message already exists")
        finally:
            conn.close()

    @router.put("/messages/{msg_id}", dependencies=[Depends(combined_auth)])
    async def update_message(msg_id: str, body: MessageUpdate):
        conn = get_conn()
        try:
            conn.execute(
                "UPDATE messages SET content = ? WHERE id = ?",
                (body.content, msg_id),
            )
            conn.commit()
            if conn.total_changes == 0:
                raise HTTPException(status_code=404, detail="Message not found")
            return {"status": "ok"}
        finally:
            conn.close()

    @router.put("/messages/{msg_id}/feedback", dependencies=[Depends(combined_auth)])
    async def update_message_feedback(msg_id: str, body: MessageFeedback):
        conn = get_conn()
        try:
            conn.execute(
                "UPDATE messages SET feedback = ? WHERE id = ?",
                (body.feedback, msg_id),
            )
            conn.commit()
            if conn.total_changes == 0:
                raise HTTPException(status_code=404, detail="Message not found")
            return {"status": "ok"}
        finally:
            conn.close()

    @router.delete("/messages/{msg_id}", dependencies=[Depends(combined_auth)])
    async def delete_message(msg_id: str):
        conn = get_conn()
        try:
            conn.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
            conn.commit()
            if conn.total_changes == 0:
                raise HTTPException(status_code=404, detail="Message not found")
            return {"status": "ok"}
        finally:
            conn.close()

    return router
