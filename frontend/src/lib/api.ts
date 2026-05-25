import type { Message, StreamCallbacks, ChatSettings } from '../types';

export function buildConversationHistory(messages: Message[]): { role: string; content: string }[] {
  const history: { role: string; content: string }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && !m.content) continue;
    history.push({ role: m.role, content: m.content });
  }
  return history;
}

export async function streamQuery(
  text: string,
  settings: ChatSettings,
  history: { role: string; content: string }[],
  callbacks: StreamCallbacks
): Promise<void> {
  const baseUrl = settings.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers['X-API-Key'] = settings.apiKey;

  const resp = await fetch(`${baseUrl}/query/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: text,
      mode: settings.mode,
      stream: true,
      include_references: true,
      top_k: settings.topK,
      conversation_history: history,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${errText || resp.statusText}`);
  }

  if (!resp.body) throw new Error('Response body is null');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let streamError: string | null = null;
      try {
        const data = JSON.parse(line);
        if (data.references) callbacks.onReferences(data.references);
        if (data.response) callbacks.onChunk(data.response);
        if (data.error) streamError = data.error;
      } catch (e) {
        console.warn('Parse error:', e, line);
      }
      if (streamError) {
        callbacks.onError(streamError);
        throw new Error(streamError);
      }
    }
  }

  // Drain remaining buffer (final line without trailing newline)
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data.references) callbacks.onReferences(data.references);
      if (data.response) callbacks.onChunk(data.response);
      if (data.error) {
        callbacks.onError(data.error);
        throw new Error(data.error);
      }
    } catch (e) {
      if (e instanceof SyntaxError) console.warn('Parse error (final buffer):', e, buffer);
      else throw e;
    }
  }
}
