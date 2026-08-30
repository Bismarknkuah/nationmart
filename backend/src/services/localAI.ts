import { ai } from '../repos/platformRepo';

/**
 * The local assistant.
 *
 * Answers from the knowledge base using Postgres full-text search (tsvector +
 * GIN) — instant, free, and it improves as officers teach it. Only falls through
 * to a language model if one is configured.
 */
export async function answer(question: string): Promise<{
  answer: string; source: 'knowledge_base' | 'none'; confidence: number;
}> {
  const hits = await ai.searchKnowledge(question, 3);
  if (hits.length > 0) {
    await ai.recordUse(hits[0].id);
    return {
      answer: hits[0].answer,
      source: 'knowledge_base',
      confidence: Math.min(1, Number(hits[0].rank) || 0.5),
    };
  }
  return {
    answer: "I don't have an answer for that yet.",
    source: 'none',
    confidence: 0,
  };
}

export async function learn(question: string, text: string, tags: string[] = []) {
  return ai.learn(question, text, tags);
}

export default answer;
