'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { aiAPI } from '../lib/api';

const GOLD = '#C8A24B', GOLD_DK = '#9A7A2E', GOLD_LT = '#E7CB77';

interface Msg { from: 'bot' | 'user'; text: string; links?: { label: string; href: string }[]; q?: string; rated?: boolean; }

/**
 * Context-aware assistant. Answers from what the dashboard already knows
 * (role, persona, task/delivery counts) using transparent rules — no external
 * calls. Designed so an LLM backend can later replace `answer()`.
 */
export default function AssistantChatbot({
  name, roleTitle, persona, context,
}: {
  name?: string; roleTitle: string; persona: string;
  context: { openTasks?: number; deliveries?: number; orders?: number; isManager?: boolean };
}) {
  const [open, setOpen] = useState(false);
  const greeting: Msg = {
    from: 'bot',
    text: `Hi ${name?.split(' ')[0] || 'there'} 👋 I'm your NationMart assistant. I can help you navigate as ${roleTitle}. Try a question below.`,
  };
  const [msgs, setMsgs] = useState<Msg[]>([greeting]);
  const [input, setInput] = useState('');
  const [faqs, setFaqs] = useState<{ question: string; answer: string; keywords: string[] }[]>([]);

  useEffect(() => {
    aiAPI.faqs(persona).then((r) => setFaqs(r.entries || [])).catch(() => {});
  }, [persona]);

  /** Try the admin-curated knowledge base before the built-in rules. */
  function matchFaq(q: string): string | null {
    const text = q.toLowerCase();
    let best: { score: number; answer: string } | null = null;
    for (const f of faqs) {
      const kws = (f.keywords || []).map((k) => k.toLowerCase());
      let score = kws.reduce((s, k) => (k && text.includes(k) ? s + 1 : s), 0);
      if (f.question && text.includes(f.question.toLowerCase().slice(0, 12))) score += 1;
      if (score > 0 && (!best || score > best.score)) best = { score, answer: f.answer };
    }
    return best?.answer || null;
  }

  const suggestions = persona === 'officer' || persona === 'partner'
    ? ['What are my tasks?', 'How do deliveries work?', 'How do I update my profile?', 'What can I do?']
    : ['Track my order', 'How does the subscription work?', 'Update my profile', 'How do I sell?'];

  function answer(qRaw: string): Msg {
    const q = qRaw.toLowerCase();
    const profile = { label: 'Open profile', href: '/profile' };

    // Admin-curated answers take priority.
    const faq = matchFaq(qRaw);
    if (faq) return { from: 'bot', text: faq };

    if (/(task|inbox|assign)/.test(q)) {
      return { from: 'bot', text: `You have ${context.openTasks ?? 0} open task(s) routed to your role. Open your inbox to approve, reject or escalate them.`, links: [{ label: 'My task inbox', href: '/admin/inbox' }] };
    }
    if (/(deliver|rider|parcel|dispatch)/.test(q)) {
      if (persona === 'partner') return { from: 'bot', text: 'Set yourself “Available” in your profile so the AI can assign you nearby parcels. Accept a job, mark it picked-up, then in-transit, then delivered — your earnings update automatically.', links: [profile] };
      if (context.isManager) return { from: 'bot', text: 'Use the Delivery board on your dashboard: it shows live status and lets you Auto-assign the nearest available rider via AI. You can also approve new riders.', links: [{ label: 'Full inbox', href: '/admin/inbox' }] };
      return { from: 'bot', text: 'On a paid/confirmed order, use “Arrange delivery” (sellers) or request a rider — the AI assigns the nearest available one and gives an ETA.' };
    }
    if (/(profile|password|photo|picture|reset|edit)/.test(q)) {
      return { from: 'bot', text: 'Open your profile to edit your details, upload a photo, set duty status, or reset your password.', links: [profile] };
    }
    if (/(subscription|pay|fee|cost|price|momo)/.test(q)) {
      return { from: 'bot', text: 'The first 4 months are free. After that: stores pay ₵50/month (one store) or ₵70/month (two); riders and drivers pay ₵30/month. Paid by Mobile Money to +233 24 071 5156. Management can apply discounts.', links: [{ label: 'Billing', href: '/seller/dues' }] };
    }
    if (/(sell|store|product|list)/.test(q)) {
      return { from: 'bot', text: 'Open a store, then list products from the Sell page. Buyers can find you in the marketplace.', links: [{ label: 'Manage stores', href: '/stores/manage' }, { label: 'List a product', href: '/sell' }] };
    }
    if (/(order|track)/.test(q)) {
      return { from: 'bot', text: `You have ${context.orders ?? 0} order(s). Open one to see live delivery tracking.`, links: [{ label: 'Browse catalog', href: '/catalog' }] };
    }
    if (/(can i|what can|permission|able)/.test(q)) {
      return { from: 'bot', text: 'Your dashboard shows a “Permissions” card listing exactly what your role can and cannot do, plus your modules and AI assistants.' };
    }
    if (/(staff|hire|add.*officer|new.*staff)/.test(q)) {
      return { from: 'bot', text: context.isManager ? 'Use the Staff panel on your dashboard to add officers and assign tasks across regions and districts.' : 'Adding staff is limited to executive/management roles.' };
    }
    return { from: 'bot', text: 'I can help with tasks, deliveries, profile, subscription, selling, and orders. Pick a suggestion below or rephrase your question.' };
  }

  const send = async (text: string) => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { from: 'user', text }]);
    setInput('');
    // 1) Ask the assistant (in-built self-learning AI; LLM only if operator added a key).
    try {
      const r = await aiAPI.chat(text, persona);
      if (r.reply) { setMsgs((m) => [...m, { from: 'bot', text: r.reply as string, q: text }]); return; }
    } catch { /* fall through */ }
    // 2) Fall back to admin knowledge base + built-in rules.
    setMsgs((m) => [...m, { ...answer(text), q: text }]);
  };

  const rate = async (i: number, helpful: boolean) => {
    const m = msgs[i]; if (!m?.q) return;
    setMsgs((prev) => prev.map((x, idx) => (idx === i ? { ...x, rated: true } : x)));
    try { await aiAPI.feedback(m.q, m.text, helpful, persona); } catch { /* */ }
  };

  return (
    <>
      {/* Launcher */}
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl text-white"
        style={{ background: `linear-gradient(135deg,${GOLD_DK},${GOLD_LT})` }} aria-label="Assistant">
        {open ? '✕' : '🧠'}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[92vw] max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
          <div className="px-4 py-3 text-white" style={{ background: `linear-gradient(135deg,${GOLD_DK},${GOLD_LT})` }}>
            <p className="font-bold text-sm">NationMart Assistant</p>
            <p className="text-[11px] text-white/80">{roleTitle}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === 'user' ? 'text-white' : 'bg-slate-100 text-slate-800'}`}
                  style={m.from === 'user' ? { background: GOLD_DK } : undefined}>
                  <p className="leading-snug">{m.text}</p>
                  {m.links && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.links.map((l) => (
                        <Link key={l.href} href={l.href} className="text-xs font-semibold underline" style={{ color: m.from === 'user' ? '#fff' : GOLD_DK }}>{l.label}</Link>
                      ))}
                    </div>
                  )}
                  {m.from === 'bot' && m.q && (
                    m.rated
                      ? <p className="text-[10px] text-emerald-600 mt-1.5">✓ Thanks — the assistant learned from this.</p>
                      : <div className="flex gap-2 mt-1.5">
                          <button onClick={() => rate(i, true)} className="text-[11px] text-slate-400 hover:text-emerald-600" title="Helpful — teach the assistant">👍</button>
                          <button onClick={() => rate(i, false)} className="text-[11px] text-slate-400 hover:text-rose-600" title="Not helpful">👎</button>
                        </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 pt-1 pb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-600">{s}</button>
            ))}
          </div>
          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder="Ask me anything…" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
            <button onClick={() => send(input)} className="text-white font-semibold px-3 rounded-lg" style={{ background: GOLD_DK }}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}
