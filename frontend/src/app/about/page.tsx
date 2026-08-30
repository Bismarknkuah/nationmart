import Link from 'next/link';

export const metadata = { title: 'About · NationMart' };

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-20">
      <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: '#0a6e43' }}>About NationMart</p>
      <h1 className="text-4xl font-bold text-slate-900 mb-6" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
        Ghana&apos;s national marketplace.
      </h1>
      <div className="prose prose-slate max-w-none space-y-4 text-slate-700 leading-relaxed">
        <p>
          NationMart is a digital marketplace built for Ghanaian businesses. Any verified seller — a pharmacy, an
          electronics shop, a farm, a fashion boutique, a building-materials supplier — can open a branded online
          store, list products, and sell across the country and beyond.
        </p>
        <p>
          Buyers discover stores by category, region or store code, pay securely with Mobile Money or card, and have
          their items delivered by registered riders and drivers. Every seller is tied to a verified identity, so
          buyers can shop with confidence.
        </p>
        <p>
          Behind the scenes, NationMart runs on the foundations of a modern enterprise platform: role-based teams,
          verified identities, multi-currency support, escrow-protected payments, an AI-assisted delivery dispatcher,
          and full audit trails — all designed for Ghanaian conditions.
        </p>
        <p className="text-sm text-slate-500">
          Built for Ghana. Open to the world. Designed by Desward Technology.
        </p>
      </div>
      <div className="mt-10 flex gap-3">
        <Link href="/auth/register" className="btn-primary text-sm py-2.5 px-5">Open your store</Link>
        <Link href="/stores" className="btn-secondary text-sm py-2.5 px-5">Explore the marketplace</Link>
      </div>
    </div>
  );
}
