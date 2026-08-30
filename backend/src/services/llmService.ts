const f: any = (globalThis as any).fetch;

/**
 * Calls a real LLM when an API key is configured, otherwise returns null so
 * callers fall back to the built-in heuristics. Supports Anthropic or OpenAI
 * via env: LLM_PROVIDER = 'anthropic' | 'openai', plus the matching key.
 * `context` is the retrieval (RAG) material — e.g. knowledge-base entries and
 * live platform stats.
 */
export async function callLLM(prompt: string, context = '', system = ''): Promise<string | null> {
  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  if (!f) return null;

  try {
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      const r = await f('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: `${system}\n\nUse the following NationMart context when relevant:\n${context}`.trim(),
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json();
      return data?.content?.map((c: any) => c.text || '').join('').trim() || null;
    }

    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      const r = await f('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          max_tokens: 600,
          messages: [
            { role: 'system', content: `${system}\n\nContext:\n${context}`.trim() },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const data = await r.json();
      return data?.choices?.[0]?.message?.content?.trim() || null;
    }
  } catch (e) {
    console.error('[llm:error]', (e as Error).message);
  }
  return null; // not configured / failed → caller uses heuristics
}

export function llmEnabled(): boolean {
  const p = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  return (p === 'anthropic' && !!process.env.ANTHROPIC_API_KEY) || (p === 'openai' && !!process.env.OPENAI_API_KEY);
}
