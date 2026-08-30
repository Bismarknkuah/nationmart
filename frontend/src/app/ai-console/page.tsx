'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { aiAPI, authAPI, isLoggedIn } from '../../lib/api';

const GOLD = '#C8A24B', GOLD_DK = '#9A7A2E', GOLD_LT = '#E7CB77';
const EXEC_ROLES = ['admin', 'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro'];

const TASK_TYPES = [
  { id: 'my_summary', label: 'My summary', desc: 'A quick AI summary of your own activity & tips.' },
  { id: 'platform_summary', label: 'Platform health summary', desc: 'Users, orders, deliveries, available riders.' },
  { id: 'regional_health', label: 'Analyse weak regions', desc: 'Rank regions by health and flag the weakest.' },
  { id: 'rider_rebalance', label: 'Rider rebalancing', desc: 'Find regions with more waiting parcels than riders.' },
  { id: 'custom', label: 'Custom directive', desc: 'Ask the AI in your own words (uses only data you may see).' },
];

export default function AiConsolePage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tier, setTier] = useState<string>('buyer');
  const [allowedTasks, setAllowedTasks] = useState<string[]>(['my_summary']);

  const [entries, setEntries] = useState<any[]>([]);
  const [q, setQ] = useState(''); const [a, setA] = useState(''); const [scope, setScope] = useState('all');
  const [faqMsg, setFaqMsg] = useState('');

  const [tasks, setTasks] = useState<any[]>([]);
  const [taskType, setTaskType] = useState('my_summary');
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);

  const [aiStat, setAiStat] = useState<any>(null);
  const [testQ, setTestQ] = useState('How do deliveries work?');
  const [testOut, setTestOut] = useState('');
  const [testing, setTesting] = useState(false);

  const testAssistant = async () => {
    setTesting(true); setTestOut('');
    try {
      const r = await aiAPI.chat(testQ, 'officer');
      setTestOut(r.reply ? `${r.source === 'llm' ? '🤖 LLM' : '🧠 In-built'}: ${r.reply}` : '🧠 The in-built assistant hasn\'t learned this yet. Teach it below and it will know next time.');
    } catch (e: any) { setTestOut(e.message || 'Failed'); } finally { setTesting(false); }
  };
  const [teachQ, setTeachQ] = useState(''); const [teachA, setTeachA] = useState(''); const [teachMsg, setTeachMsg] = useState('');
  const teach = async () => {
    if (!teachQ.trim() || !teachA.trim()) { setTeachMsg('Enter both a question and an answer.'); return; }
    try { const r = await aiAPI.teach(teachQ, teachA); setTeachMsg(r.message); setTeachQ(''); setTeachA(''); aiAPI.status().then(setAiStat).catch(() => {}); }
    catch (e: any) { setTeachMsg(e.message || 'Failed'); }
  };

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/ai-console'); return; }
    (async () => {
      try {
        const r = await authAPI.me(); const u = r.user || r; setMe(u);
        const exec = EXEC_ROLES.includes(u.role) || (u.accessLevel && u.accessLevel <= 2);
        setAllowed(true); // every signed-in user can open the console (scoped below)
        aiAPI.status().then(setAiStat).catch(() => {});
        if (exec) loadFaqs();
        loadTasks();
      } catch { router.push('/auth/login?redirect=/ai-console'); }
    })();
  }, [router]);

  const loadFaqs = async () => { try { const r = await aiAPI.faqsAdmin(); setEntries(r.entries || []); } catch { /* */ } };
  const loadTasks = async () => {
    try {
      const r = await aiAPI.tasks();
      setTasks(r.tasks || []);
      if ((r as any).tier) setTier((r as any).tier);
      if ((r as any).allowed) { setAllowedTasks((r as any).allowed); setTaskType((r as any).allowed[0] || 'my_summary'); }
    } catch { /* */ }
  };

  const addFaq = async () => {
    setFaqMsg('');
    if (!q.trim() || !a.trim()) { setFaqMsg('Question and answer are required.'); return; }
    try { await aiAPI.createFaq({ question: q, answer: a, scope }); setQ(''); setA(''); setFaqMsg('✓ Saved'); loadFaqs(); }
    catch (e: any) { setFaqMsg(e.message || 'Failed'); }
  };
  const removeFaq = async (id: string) => { try { await aiAPI.deleteFaq(id); loadFaqs(); } catch { /* */ } };

  const runTask = async () => {
    setRunning(true);
    try { await aiAPI.createTask({ type: taskType, prompt: taskType === 'custom' ? prompt : undefined }); setPrompt(''); await loadTasks(); }
    catch { /* */ } finally { setRunning(false); }
  };

  if (allowed === null) return <div className="min-h-[60vh] flex items-center justify-center text-slate-400">Loading…</div>;
  if (!allowed) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <p className="text-lg font-semibold text-slate-800">AI Console is restricted</p>
      <p className="text-slate-500 mt-1">Only executives and the super-admin can access this page.</p>
      <Link href="/dashboard" className="mt-4 font-semibold" style={{ color: GOLD_DK }}>← Back to dashboard</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="relative text-white rounded-2xl p-6 mb-6 overflow-hidden bg-gradient-to-br from-[#0f1228] via-[#181a36] to-[#241b40]">
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg,${GOLD_DK},${GOLD_LT},${GOLD})` }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 140% at 88% -25%, #a855f766 0%, transparent 55%)' }} />
          <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2"><span className="text-2xl">🤖</span>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>AI Console</h1></div>
              <p className="text-sm text-white/85 mt-1">Train the assistant and assign analytical tasks to the AI.</p>
              {aiStat && (
                <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={aiStat.llmEnabled ? { background: 'rgba(16,185,129,0.25)', color: '#d1fae5' } : { background: 'rgba(124,58,237,0.3)', color: '#e9d5ff' }}>
                  {aiStat.llmEnabled
                    ? `🟢 LLM connected · ${aiStat.provider}/${aiStat.model}`
                    : `🧠 Self-learning assistant active · ${aiStat.learning?.knowledge || 0} knowledge + ${aiStat.learning?.learned || 0} learned (no API key, no cost)`}
                </span>
              )}
            </div>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>← Dashboard</Link>
          </div>
          <div className="relative z-10 mt-4 flex flex-wrap gap-2 items-center">
            <input value={testQ} onChange={(e) => setTestQ(e.target.value)} placeholder="Ask the assistant a test question…"
              className="flex-1 min-w-[200px] text-sm rounded-lg px-3 py-2 text-slate-800" />
            <button onClick={testAssistant} disabled={testing} className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: GOLD_DK }}>
              {testing ? 'Asking…' : 'Test assistant'}
            </button>
          </div>
          {testOut && <p className="relative z-10 mt-2 text-sm text-white/90 bg-black/20 rounded-lg px-3 py-2">{testOut}</p>}
          <div className="relative z-10 mt-3 bg-white/10 rounded-xl p-3">
            <p className="text-xs font-semibold text-white/90 mb-2">🧠 Teach the assistant (it remembers for next time)</p>
            <div className="flex flex-wrap gap-2">
              <input value={teachQ} onChange={(e) => setTeachQ(e.target.value)} placeholder="Question / topic" className="flex-1 min-w-[160px] text-sm rounded-lg px-3 py-2 text-slate-800" />
              <input value={teachA} onChange={(e) => setTeachA(e.target.value)} placeholder="The answer it should give" className="flex-1 min-w-[160px] text-sm rounded-lg px-3 py-2 text-slate-800" />
              <button onClick={teach} className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: '#7c3aed' }}>Teach</button>
            </div>
            {teachMsg && <p className="text-xs text-white/85 mt-2">{teachMsg}</p>}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Assign a task to the AI */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-900 text-lg mb-1">Assign a task to the AI</h2>
            <p className="text-sm text-slate-500 mb-4">The AI runs the analysis over live platform data and returns a recommendation.</p>
            <div className="space-y-2">
              {TASK_TYPES.filter((t) => allowedTasks.includes(t.id)).map((t) => (
                <label key={t.id} className={`flex items-start gap-3 border rounded-xl p-3 cursor-pointer ${taskType === t.id ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
                  <input type="radio" name="tt" checked={taskType === t.id} onChange={() => setTaskType(t.id)} className="mt-1" />
                  <span><span className="font-semibold text-slate-800 text-sm block">{t.label}</span><span className="text-xs text-slate-500">{t.desc}</span></span>
                </label>
              ))}
            </div>
            {taskType === 'custom' && (
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe the task for the AI…"
                className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            )}
            <button onClick={runTask} disabled={running} className="mt-4 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50" style={{ background: GOLD_DK }}>
              {running ? 'Running…' : '▶ Run task'}
            </button>

            <div className="mt-5 space-y-3">
              {tasks.map((t) => (
                <div key={t._id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: GOLD_DK }}>{t.type.replace(/_/g, ' ')}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : t.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{t.status}</span>
                  </div>
                  {t.prompt && <p className="text-xs text-slate-500 mt-1 italic">“{t.prompt}”</p>}
                  {t.result && <p className="text-sm text-slate-700 mt-1.5">{t.result}</p>}
                  <p className="text-[11px] text-slate-400 mt-1">{t.createdByName} · {new Date(t.createdAt).toLocaleString()}</p>
                </div>
              ))}
              {tasks.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No tasks run yet.</p>}
            </div>
          </div>

          {/* Assistant knowledge base — executives only */}
          {tier === 'exec' ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-900 text-lg mb-1">Assistant knowledge</h2>
            <p className="text-sm text-slate-500 mb-4">Add answers the chatbot will give users. These take priority over the built-in replies.</p>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question / topic (e.g. refund policy)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
            <textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} placeholder="Answer the assistant should give" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
            <div className="flex items-center gap-2">
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="all">Everyone</option>
                <option value="buyer">Buyers</option>
                <option value="seller">Sellers</option>
                <option value="officer">Officers</option>
                <option value="partner">Riders/Drivers</option>
              </select>
              <button onClick={addFaq} className="text-white font-semibold px-4 py-2 rounded-lg" style={{ background: GOLD_DK }}>Add answer</button>
              {faqMsg && <span className="text-xs" style={{ color: faqMsg.startsWith('✓') ? '#047857' : '#dc2626' }}>{faqMsg}</span>}
            </div>

            <div className="mt-5 space-y-2 max-h-80 overflow-y-auto">
              {entries.map((e) => (
                <div key={e._id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{e.question}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{e.answer}</p>
                      <span className="text-[11px] text-slate-400 capitalize">scope: {e.scope}</span>
                    </div>
                    <button onClick={() => removeFaq(e._id)} className="text-xs text-red-600 font-semibold shrink-0">Delete</button>
                  </div>
                </div>
              ))}
              {entries.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No custom answers yet.</p>}
            </div>
          </div>
          ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-900 text-lg mb-1">Your AI assistant</h2>
            <p className="text-sm text-slate-500 mb-3">Ask the floating assistant (bottom-right of any page) anything — it can help with your {tier === 'seller' ? 'store, orders and payouts' : tier === 'partner' ? 'deliveries, availability and earnings' : tier === 'officer' ? 'tasks and area analytics' : 'orders and deliveries'}, and general questions too.</p>
            <ul className="text-sm text-slate-600 space-y-1.5">
              <li>• Run <b>My summary</b> for an instant snapshot of your activity.</li>
              <li>• Use <b>Custom</b> to ask the AI in your own words (it only sees your own data).</li>
              <li>• Managing the shared knowledge base is reserved for executives.</li>
            </ul>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
