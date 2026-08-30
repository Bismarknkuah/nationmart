import { Request, Response } from 'express';
import { llmEnabled } from '../services/llmService';

/**
 * Visual search: accept a photo (base64 data URL) and return search keywords.
 * Uses an OpenAI vision model when an API key is configured; otherwise returns
 * a graceful note so the UI can ask the buyer to type instead.
 */
export const visualSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { image } = req.body as { image?: string };
    if (!image || !image.startsWith('data:image')) {
      res.status(400).json({ error: 'A photo is required.' }); return;
    }
    if (!llmEnabled() || !process.env.OPENAI_API_KEY) {
      res.json({ keywords: [], note: 'Photo recognition needs a vision API key. You can still type what you are looking for.' });
      return;
    }
    const f: any = (global as any).fetch;
    const r = await f('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 60,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Identify the product in this photo for a marketplace search. Reply with 2-5 short search keywords only, comma-separated, no sentences.' },
            { type: 'image_url', image_url: { url: image } },
          ],
        }],
      }),
    });
    const data = await r.json();
    const text: string = data?.choices?.[0]?.message?.content || '';
    const keywords = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    res.json({ keywords, query: keywords.join(' ') });
  } catch (err: any) {
    res.json({ keywords: [], note: 'Could not analyse the photo. Please type what you are looking for.' });
  }
};
