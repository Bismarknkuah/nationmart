'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { officerCommsAPI } from '../../../lib/api';

const KIND_BADGE: Record<string, string> = {
  department: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  regional:   'bg-blue-50 text-blue-700 border-blue-200',
  incident:   'bg-amber-50 text-amber-800 border-amber-200',
  broadcast:  'bg-rose-50 text-rose-700 border-rose-200',
};

const PRIORITY_PILL: Record<string, string> = {
  emergency: 'bg-red-600 text-white',
  urgent:    'bg-orange-500 text-white',
  normal:    '',
};

export default function OfficerCommsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'emergency'>('normal');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [me, setMe] = useState<any>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wt_token') : null;
    if (!token) { router.replace('/auth/login?redirect=/admin/comms'); return; }
    try { setMe(JSON.parse(localStorage.getItem('wt_user') || 'null')); } catch {}
    (async () => {
      try {
        const r = await officerCommsAPI.channels();
        setChannels(r.channels || []);
        if (r.channels?.[0]) setActiveId(r.channels[0]._id);
      } catch (e: any) {
        setError(e.message || 'Failed to load channels.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await officerCommsAPI.channel(activeId);
        if (cancelled) return;
        setActive(r.channel);
        setMessages(r.messages || []);
        setCanPost(!!r.canPost);
        // Mark read in background
        officerCommsAPI.markRead(activeId).catch(() => {});
        // Scroll to bottom
        setTimeout(() => feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }), 50);
      } catch (e: any) {
        setError(e.message || 'Failed to load channel.');
      }
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  const send = async () => {
    if (!activeId || !body.trim()) return;
    setSending(true);
    setError('');
    try {
      const r = await officerCommsAPI.send(activeId, body.trim(), priority);
      setMessages((prev) => [...prev, r.message]);
      setBody('');
      setPriority('normal');
      setTimeout(() => feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (e: any) {
      setError(e.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const isExecutive = me?.role && ['ceo', 'coo', 'cto', 'cio', 'cfo', 'chro', 'admin'].includes(me.role);

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-br from-indigo-700 to-blue-700 text-white rounded-2xl p-5 mb-5 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1">Officer Communications</p>
              <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>Internal channels</h1>
              <p className="text-sm text-indigo-100 mt-1">
                Department chat and executive broadcast. Separate from buyer-seller messaging.
              </p>
            </div>
            <Link href="/admin/inbox" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white text-sm font-semibold px-4 py-2 rounded-lg border border-white/20">
              My Inbox &rarr;
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-center text-slate-400 py-16">Loading channels…</p>
        ) : channels.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <p className="text-slate-500 font-medium">No channels available for your role.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

            {/* Channel list */}
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Channels</p>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {channels.map((c) => (
                  <button
                    key={c._id}
                    onClick={() => setActiveId(c._id)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-indigo-50 transition-colors ${activeId === c._id ? 'bg-indigo-50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 text-sm truncate">{c.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide ${KIND_BADGE[c.kind] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {c.kind}
                      </span>
                    </div>
                    {c.lastMessagePreview && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{c.lastMessagePreview}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Active channel */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden" style={{ height: '70vh' }}>
              {active && (
                <>
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="font-bold text-slate-900">{active.name}</h2>
                      {active.description && <p className="text-xs text-slate-500 mt-0.5">{active.description}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase tracking-wide ${KIND_BADGE[active.kind] || ''}`}>
                      {active.kind}
                    </span>
                  </div>

                  <div ref={feedRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                    {messages.length === 0 ? (
                      <p className="text-center text-sm text-slate-400 py-10">No messages yet. Start the conversation.</p>
                    ) : messages.map((m) => (
                      <div key={m._id} className={`rounded-xl p-3 ${m.priority !== 'normal' ? 'border-l-4' : ''} ${m.priority === 'emergency' ? 'border-red-500 bg-red-50' : m.priority === 'urgent' ? 'border-orange-500 bg-orange-50' : 'bg-slate-50'}`}>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-slate-800 text-sm">{m.sender?.fullName || 'Officer'}</span>
                          <span className="text-xs text-slate-500 capitalize">{(m.senderRole || '').replace(/_/g, ' ')}</span>
                          {m.priority !== 'normal' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${PRIORITY_PILL[m.priority]}`}>
                              {m.priority}
                            </span>
                          )}
                          <span className="text-xs text-slate-400 ml-auto">{new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                  </div>

                  {/* Composer */}
                  <div className="border-t border-slate-100 p-4">
                    {!canPost ? (
                      <p className="text-xs text-slate-400 italic">This is a read-only channel for your role.</p>
                    ) : (
                      <>
                        <textarea
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                          placeholder="Write a message…  (Ctrl/Cmd + Enter to send)"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          rows={2}
                        />
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as any)}
                            className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
                          >
                            <option value="normal">Normal priority</option>
                            <option value="urgent">Urgent</option>
                            {isExecutive && <option value="emergency">Emergency broadcast</option>}
                          </select>
                          {priority === 'emergency' && (
                            <span className="text-xs text-red-700 font-semibold">
                              This will be recorded in the audit log.
                            </span>
                          )}
                          <button
                            onClick={send}
                            disabled={sending || !body.trim()}
                            className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                          >
                            {sending ? 'Sending…' : 'Send'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
