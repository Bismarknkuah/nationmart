'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export interface Notice {
  id: string;
  text: string;
  type: 'info' | 'promo' | 'alert' | 'announcement';
  link?: string;
  priority?: number;
}

const DEFAULT_NOTICES: Notice[] = [
  { id: '1', type: 'announcement', text: '🎉 Welcome to NationMart — Ghana\'s #1 verified wood marketplace! Browse 1,200+ suppliers across all 16 regions.', priority: 1 },
  { id: '2', type: 'promo', text: '🏷️ PROMO: First-time buyers get FREE compliance document generation on their first order! Use code: FIRSTBUY', link: '/catalog', priority: 2 },
  { id: '3', type: 'info', text: '📋 COMPLIANCE: All timber exports to USA now require updated Lacey Act APHIS PPQ 505 forms. NationMart generates these automatically.', priority: 3 },
  { id: '4', type: 'alert', text: '⚠️ SELLERS: Monthly platform dues of GHS 10 are due on the 1st of every month. Pay to MTN MoMo: 0240715156', link: '/seller/dues', priority: 4 },
  { id: '6', type: 'info', text: '🇪🇺 EUDR UPDATE: EU Deforestation Regulation enforcement begins. Ensure your products have GPS coordinates and due diligence statements.', priority: 6 },
  { id: '7', type: 'promo', text: '💰 DISCOUNT: Ashanti Region sellers get 20% off listing fees this month! Contact your Regional Admin to claim.', priority: 7 },
  { id: '8', type: 'info', text: '🌳 SUSTAINABILITY: NationMart is proud to support Ghana\'s reforestation initiative. 1% of all transaction fees go to tree planting.', priority: 8 },
  { id: '9', type: 'announcement', text: '📱 NEW FEATURE: Pay with MTN MoMo or Telecel Cash for instant order confirmation. Tap "Pay with MoMo" on any order.', priority: 9 },
  { id: '10', type: 'info', text: '🏛️ SYSTEM: NationMart is developed and maintained by a PhD candidate at the University of Ghana. Contact: baristernkuah@gmail.com | 0240715156', priority: 10 },
];

interface Props {
  notices?: Notice[];
  speed?: number; // pixels per second
  bgColor?: string;
}

const TYPE_STYLES: Record<string, string> = {
  info:         'bg-blue-900   border-blue-700',
  promo:        'bg-green-900  border-green-700',
  alert:        'bg-red-900    border-red-700',
  announcement: 'bg-[#3d2210] border-amber-800',
};

const TYPE_ICON: Record<string, string> = {
  info:         '📢',
  promo:        '🏷️',
  alert:        '🚨',
  announcement: '📣',
};

export default function NoticeTicker({ notices = DEFAULT_NOTICES, speed = 60 }: Props) {
  const [isPaused, setIsPaused] = useState(false);
  const [activeType, setActiveType] = useState<string>('all');

  const filtered = activeType === 'all'
    ? notices
    : notices.filter(n => n.type === activeType);

  const tickerText = filtered.map(n => `${TYPE_ICON[n.type]} ${n.text}`).join('     ◆     ');

  // Estimate duration based on text length
  const duration = Math.max(20, (tickerText.length / speed) * 10);

  return (
    <div className="w-full bg-[#2a1a0e] border-t border-amber-900/50 border-b border-amber-900/50">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-amber-900/30 overflow-x-auto">
        <span className="text-amber-600 text-xs font-bold mr-2 shrink-0">📋 NOTICES:</span>
        {['all', 'announcement', 'promo', 'alert', 'info'].map(type => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize transition-all shrink-0 ${
              activeType === type
                ? 'bg-amber-500 text-white'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            {type === 'all' ? 'All' : type === 'promo' ? '🏷️ Promos' : type === 'alert' ? '🚨 Alerts' : type === 'announcement' ? '📣 News' : '📢 Info'}
          </button>
        ))}
      </div>

      {/* Ticker strip */}
      <div
        className="relative overflow-hidden h-9 flex items-center cursor-pointer"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {isPaused && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-xs text-amber-400 font-semibold bg-[#2a1a0e] pr-3">
            ⏸ Paused
          </div>
        )}
        <div
          className="whitespace-nowrap text-xs text-amber-200 font-medium px-4"
          style={{
            display: 'inline-block',
            animation: `ticker ${duration}s linear infinite`,
            animationPlayState: isPaused ? 'paused' : 'running',
          }}
        >
          {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}
        </div>

        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#2a1a0e] to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#2a1a0e] to-transparent pointer-events-none z-10" />
      </div>

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
