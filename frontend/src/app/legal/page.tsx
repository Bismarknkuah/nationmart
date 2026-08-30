import Link from 'next/link';

export const metadata = { title: 'Terms & Privacy · NationMart' };

export default function LegalPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-20">
      <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: '#0a6e43' }}>Legal</p>
      <h1 className="text-4xl font-bold text-slate-900 mb-8" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
        Terms &amp; Privacy
      </h1>

      <div className="space-y-8 text-slate-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Terms of Service</h2>
          <p className="text-sm">
            By using NationMart you agree to use the platform lawfully and honestly. Sellers are responsible for the
            accuracy of their listings, the quality of goods sold, and fulfilling orders they accept. Buyers agree to
            pay for orders they place. Riders and drivers agree to handle and deliver items responsibly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Verified identities</h2>
          <p className="text-sm">
            Sellers and logistics partners are tied to a verified identity (such as a Ghana Card). Misrepresentation,
            fraud, or abuse may result in suspension and reporting to the relevant authorities.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Payments &amp; escrow</h2>
          <p className="text-sm">
            Payments are processed via Mobile Money and card. Funds may be held in escrow until an order is confirmed,
            then released to the seller. Delivery fees are arranged between the buyer and the assigned rider.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Privacy</h2>
          <p className="text-sm">
            We collect only the information needed to operate the marketplace — your account details, store and order
            information, and delivery details. We do not sell your personal data. Contact information is shared between
            buyer, seller and rider only as needed to complete an order and its delivery.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Contact</h2>
          <p className="text-sm">
            Questions about these terms? Email <a href="mailto:legal@nationmart.gh" className="font-semibold" style={{ color: '#0a6e43' }}>legal@nationmart.gh</a>.
          </p>
        </section>

        <p className="text-xs text-slate-400">
          This summary is provided for general information and is not a substitute for formal legal advice.
        </p>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-slate-500 hover:text-slate-700">← Back home</Link>
      </p>
    </div>
  );
}
