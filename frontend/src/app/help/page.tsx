import Link from 'next/link';

export const metadata = { title: 'Help Center · NationMart' };

const FAQS = [
  {
    q: 'How do I open a store?',
    a: 'Create an account as a seller, then go to Manage Stores to set up your branded storefront — pick a category, upload a flyer, set your colours, and add products. Your store gets a unique code like GH-GA-AM-PHA-WP that customers can search.',
  },
  {
    q: 'How do customers find my store?',
    a: 'Customers browse by category on the marketplace, or search by your store name, store number (e.g. NM-10005), store code, region or district on the Stores page.',
  },
  {
    q: 'How do payments work?',
    a: 'Buyers pay with Mobile Money or card. Funds are held until the order is confirmed, then released to the seller. Sellers confirm payment received from their dashboard before arranging delivery.',
  },
  {
    q: 'How does delivery work?',
    a: 'Once an order is paid, a delivery can be arranged. The system finds an available rider or driver, who collects the items from the seller and delivers to the buyer. Buyers and sellers can see and contact the assigned rider directly.',
  },
  {
    q: 'Can I run discounts or promotions?',
    a: 'Yes. Sellers can open Promotions & Discounts from their dashboard to set a percentage discount or a promo label on any product. Buyers see the reduced price right away.',
  },
  {
    q: 'How do I become a rider or driver?',
    a: 'Register as a rider or driver with your vehicle licence. A logistics officer reviews and approves your application, then you receive a unique partner code and can set yourself available to receive delivery jobs.',
  },
];

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-20">
      <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: '#0a6e43' }}>Help Center</p>
      <h1 className="text-4xl font-bold text-slate-900 mb-8" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
        How can we help?
      </h1>
      <div className="space-y-4">
        {FAQS.map((f) => (
          <div key={f.q} className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="font-bold text-slate-900 mb-1.5">{f.q}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{f.a}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
        <p className="text-slate-700 font-semibold mb-1">Still need help?</p>
        <p className="text-sm text-slate-500 mb-4">Reach the NationMart support team and we&apos;ll get back to you.</p>
        <a href="mailto:support@nationmart.gh" className="btn-primary text-sm py-2.5 px-5 inline-block">Contact support</a>
      </div>
      <p className="text-center mt-6 text-sm">
        <Link href="/" className="text-slate-500 hover:text-slate-700">← Back home</Link>
      </p>
    </div>
  );
}
