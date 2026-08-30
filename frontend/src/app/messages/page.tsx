'use client';
import { useEffect, useRef, useState } from 'react';
import { messagesAPI, authAPI } from '../../lib/api';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesAPI.conversations()
      .then(r => setConversations(r.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    authAPI.me().then((u: any) => setMeId(u?._id || u?.id || '')).catch(() => {});
  }, []);

  const openThread = async (c: any) => {
    setActive(c);
    try { const r = await messagesAPI.thread(c._id); setMessages(r.messages || []); } catch {}
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!text.trim() || !active) return;
    const body = text; setText('');
    try {
      const r = await messagesAPI.send(active._id, body);
      setMessages(m => [...m, r.message]);
    } catch {}
  };

  const otherParty = (c: any) => {
    const p = (c.participants || []).find((x: any) => x._id !== meId) || c.participants?.[0];
    return p?.company || p?.fullName || 'Conversation';
  };

  return (
    <div className="min-h-screen bg-stone-50 pt-20 pb-6 px-4">
      <div className="max-w-5xl mx-auto h-[calc(100vh-7rem)] bg-white rounded-2xl border border-stone-200 overflow-hidden flex">
        {/* Conversations */}
        <div className="w-72 border-r border-stone-100 flex flex-col">
          <div className="p-4 border-b border-stone-100">
            <h1 className="font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Messages</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <p className="p-4 text-sm text-stone-400">Loading…</p>
              : conversations.length === 0 ? <p className="p-4 text-sm text-stone-400">No conversations yet. Message a seller from a product or store page.</p>
              : conversations.map(c => (
                <button key={c._id} onClick={() => openThread(c)}
                  className={`w-full text-left px-4 py-3 border-b border-stone-50 hover:bg-stone-50 ${active?._id === c._id ? 'bg-amber-50' : ''}`}>
                  <p className="font-semibold text-stone-800 text-sm">{otherParty(c)}</p>
                  <p className="text-xs text-stone-400 truncate">{c.lastMessage || 'No messages'}</p>
                </button>
              ))}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">Select a conversation</div>
          ) : (
            <>
              <div className="p-4 border-b border-stone-100 font-semibold text-stone-800">{otherParty(active)}</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-stone-50">
                {messages.map(m => {
                  const mine = (m.sender?._id || m.sender) === meId;
                  return (
                    <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-white border border-stone-200 text-stone-800'}`}>
                        {m.body}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t border-stone-100 flex gap-2">
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Type a message…" className="flex-1 border border-stone-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <button onClick={send} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 rounded-xl">Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
