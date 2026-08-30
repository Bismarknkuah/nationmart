'use client';

import Link from 'next/link';
import { use } from 'react';

const mockPassport = {
  passportId: 'NM-1K3M9Z-AB12CD34',
  product: {
    name: 'Premium Odum Timber (Iroko)',
    species: 'Milicia excelsa',
    category: 'Timber',
    origin: 'Offinso North, Ashanti Region, Ghana',
    coordinates: '6.4°N, 1.9°W',
    harvestDate: '2024-11-03',
    seller: 'Ashanti Forest Products Ltd.',
    region: 'Ashanti',
  },
  certifications: {
    flegt: { status: true, number: 'FLEGT-GH-2024-00412', issuedBy: 'Ghana Forestry Commission' },
    fsc: { status: true, number: 'FSC-GH-2024-001' },
    laceyAct: { status: true },
    eudr: { status: true },
  },
  sustainabilityScore: 92,
  chainOfCustody: [
    { step: 1, event: 'Harvesting', date: '2024-11-03', location: 'Offinso North Forest Reserve', actor: 'Ashanti Forest Products Ltd.' },
    { step: 2, event: 'FLEGT Verification', date: '2024-11-10', location: 'Forestry Commission, Kumasi', actor: 'Ghana Forestry Commission' },
    { step: 3, event: 'Milling / Processing', date: '2024-11-18', location: 'Kumasi Industrial Area', actor: 'KumaSaw Processing Ltd.' },
    { step: 4, event: 'Quality Inspection', date: '2024-11-25', location: 'NationMart QC Centre, Accra', actor: 'NationMart QC Team' },
    { step: 5, event: 'Listed on NationMart', date: '2024-12-01', location: 'NationMart Platform', actor: 'NationMart' },
  ],
};

export default function ProductPassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const p = mockPassport;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 to-amber-50">
      {/* Header */}
      <div className="bg-indigo-600 text-white py-6 px-4">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-amber-400 text-sm font-semibold mb-1 uppercase tracking-widest">NationMart</div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            Digital Product Passport
          </h1>
          <div className="font-mono text-amber-200 text-sm mt-2">{p.passportId}</div>
          <div className="text-amber-300 text-xs mt-1 opacity-70">#{id}</div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Product Identity */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl">🪵</div>
            <div>
              <h2 className="font-bold text-stone-900 text-lg" style={{ fontFamily: 'Georgia, serif' }}>
                {p.product.name}
              </h2>
              <p className="text-stone-500 italic text-sm">{p.product.species}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Category', p.product.category],
              ['Origin', p.product.origin],
              ['Harvest Date', p.product.harvestDate],
              ['Supplier', p.product.seller],
            ].map(([k, v]) => (
              <div key={k} className="bg-stone-50 rounded-lg p-3">
                <div className="text-stone-400 text-xs font-medium mb-0.5">{k}</div>
                <div className="font-semibold text-stone-800 text-xs leading-tight">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sustainability Score */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200 text-center">
          <div className="text-5xl font-bold text-green-600 mb-1">{p.sustainabilityScore}</div>
          <div className="text-stone-500 font-medium">Sustainability Score</div>
          <div className="mt-3 h-3 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
              style={{ width: `${p.sustainabilityScore}%` }}
            />
          </div>
          <div className="text-xs text-stone-400 mt-1">Out of 100 — Excellent</div>
        </div>

        {/* Certifications */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200">
          <h3 className="font-bold text-stone-800 mb-4">Certifications & Compliance</h3>
          <div className="space-y-3">
            {[
              { label: '🇬🇭 FLEGT License', status: p.certifications.flegt.status, detail: `No. ${p.certifications.flegt.number}` },
              { label: '🌿 FSC Certified', status: p.certifications.fsc.status, detail: p.certifications.fsc.number },
              { label: '🇺🇸 Lacey Act Ready', status: p.certifications.laceyAct.status, detail: 'APHIS PPQ 505 compliant' },
              { label: '🇪🇺 EUDR Compliant', status: p.certifications.eudr.status, detail: 'EU Regulation 2023/1115' },
            ].map((cert) => (
              <div key={cert.label} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                <div>
                  <div className="font-semibold text-stone-800 text-sm">{cert.label}</div>
                  <div className="text-xs text-stone-500">{cert.detail}</div>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  cert.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {cert.status ? '✓ Verified' : '✗ Not Verified'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chain of Custody */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200">
          <h3 className="font-bold text-stone-800 mb-4">Chain of Custody</h3>
          <div className="space-y-4">
            {p.chainOfCustody.map((entry, i) => (
              <div key={entry.step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-xs font-bold text-amber-700">
                    {entry.step}
                  </div>
                  {i < p.chainOfCustody.length - 1 && (
                    <div className="w-0.5 flex-1 bg-amber-200 mt-1" style={{ minHeight: '16px' }} />
                  )}
                </div>
                <div className="flex-1 pb-3">
                  <div className="font-semibold text-stone-900 text-sm">{entry.event}</div>
                  <div className="text-xs text-stone-500">{entry.date} • {entry.location}</div>
                  <div className="text-xs text-stone-400 mt-0.5">{entry.actor}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Link */}
        <div className="text-center py-4">
          <p className="text-stone-400 text-xs mb-3">Verified by NationMart Compliance Engine</p>
          <Link
            href="/"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
          >
            Visit NationMart →
          </Link>
        </div>
      </div>
    </div>
  );
}