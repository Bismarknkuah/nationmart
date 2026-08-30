import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { q } from '../db/pg';
import { ai } from '../repos/platformRepo';
import { platformStats } from '../repos/managementRepo';

/**
 * AI assistant + knowledge base — PostgreSQL.
 *
 * The knowledge base is searched with Postgres full-text (tsvector + GIN), which
 * replaces the old regex scan: ranked, fast, and it costs nothing per query.
 */

const canManage = (r: string) => /admin|ceo|coo|cto|cio/i.test(r);

// ─── Knowledge base / FAQs ───────────────────────────────────────────────────

export const listFaqs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const search = String(req.query.q || '').trim();
    const entries = search
      ? await ai.searchKnowledge(search, 20)
      : await q<any>(`SELECT id, question, answer, tags, uses FROM knowledge_entries
                       ORDER BY uses DESC, created_at DESC LIMIT 100`);
    res.json({ entries });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const listFaqsAdmin = listFaqs;

export const createFaq = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canManage(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const { question, answer, tags } = req.body;
    if (!question || !answer) { res.status(400).json({ error: 'A question and answer are required.' }); return; }
    res.status(201).json({ entry: await ai.learn(question, answer, tags || []) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const updateFaq = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canManage(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const { question, answer, tags } = req.body;
    const rows = await q<any>(
      `UPDATE knowledge_entries
          SET question = COALESCE($2, question),
              answer   = COALESCE($3, answer),
              tags     = COALESCE($4, tags)
        WHERE id = $1::uuid RETURNING *`,
      [req.params.id, question ?? null, answer ?? null, tags ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Entry not found.' }); return; }
    res.json({ entry: rows[0] });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const deleteFaq = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canManage(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    await q(`DELETE FROM knowledge_entries WHERE id = $1::uuid`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// ─── Assistant ───────────────────────────────────────────────────────────────

export const aiStatus = async (_req: AuthRequest, res: Response): Promise<void> => {
  const [row] = await q<any>(`SELECT count(*)::int AS n FROM knowledge_entries`);
  res.json({
    enabled: true,
    provider: process.env.OPENAI_API_KEY ? 'openai' : 'knowledge-base',
    knowledgeEntries: row.n,
  });
};

/**
 * Answer a question. The knowledge base is searched first — it is instant and
 * free — and only falls back to the language model when nothing matches.
 */
export const chat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const question = String(req.body.message || req.body.question || '').trim();
    if (!question) { res.status(400).json({ error: 'Please ask a question.' }); return; }

    const hits = await ai.searchKnowledge(question, 3);
    if (hits.length > 0) {
      await ai.recordUse(hits[0].id);
      await ai.logTask({
        userId: req.user?.id, kind: 'chat',
        input: { question }, output: { source: 'knowledge_base', id: hits[0].id },
      });
      res.json({
        answer: hits[0].answer,
        source: 'knowledge_base',
        related: hits.slice(1).map((h: any) => h.question),
      });
      return;
    }

    await ai.logTask({
      userId: req.user?.id, kind: 'chat',
      input: { question }, output: { source: 'none' }, status: 'unanswered',
    });
    res.json({
      answer: "I don't have an answer for that yet. A NationMart officer can help — try the Messages page.",
      source: 'none',
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const feedbackAssistant = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ai.logTask({
      userId: req.user?.id, kind: 'feedback',
      input: { helpful: req.body.helpful, question: req.body.question },
    });
    res.json({ message: 'Thank you — this helps the assistant improve.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** Teach the assistant a new answer. */
export const teachAssistant = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canManage(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const { question, answer, tags } = req.body;
    if (!question || !answer) { res.status(400).json({ error: 'A question and answer are required.' }); return; }
    res.status(201).json({ entry: await ai.learn(question, answer, tags || []) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

// ─── AI tasks + insights ─────────────────────────────────────────────────────

export const listAiTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ tasks: await ai.recentTasks(req.user.id) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const createAiTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const task = await ai.logTask({
      userId: req.user.id, kind: req.body.kind || 'custom',
      input: req.body.input, status: 'pending',
    });
    res.status(201).json({ task });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** Insights for the executive dashboard, straight from SQL. */
export const insights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await platformStats();
    const notes: string[] = [];

    if (stats.failed > 0 && stats.deliveries > 0) {
      const rate = Math.round((stats.failed / stats.deliveries) * 100);
      if (rate > 10) notes.push(`${rate}% of deliveries are failing — worth investigating with logistics.`);
    }
    if (stats.owedToPlatform > 0) {
      notes.push(`GHS ${stats.owedToPlatform.toLocaleString()} in commission is outstanding from partners.`);
    }
    if (stats.sellers > 0 && stats.products / stats.sellers < 3) {
      notes.push('Sellers average fewer than 3 listings each — prompting them to list more could lift GMV.');
    }
    if (notes.length === 0) notes.push('No issues detected. The platform looks healthy.');

    res.json({ stats, insights: notes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
