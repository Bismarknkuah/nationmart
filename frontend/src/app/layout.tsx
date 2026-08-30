import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import Navbar from '../components/ui/Navbar';
import PanelBoundary from '../components/PanelBoundary';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Catchy, modern display face for headings. Bound to --font-playfair so all
// existing references pick it up automatically.
const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-playfair' });

export const metadata: Metadata = {
  title: 'NationMart — Intelligent Commerce for Ghana & Beyond',
  description: 'A digital marketplace where verified Ghanaian businesses build branded stores, sell locally and internationally, and trade with confidence. Pharmacy, electronics, vehicles, building materials, farm produce, fashion and more.',
  keywords: 'Ghana marketplace, NationMart, Mobile Money, MoMo, online stores Ghana, international trade, Ghana Card, multi-vendor',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'NationMart',
    description: 'Intelligent Commerce for Ghana & Beyond',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a6e43',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body
        className="text-slate-900 font-sans antialiased"
        suppressHydrationWarning
      >
        <Navbar />
        <main>
          <PanelBoundary name="page" variant="page">
            {children}
          </PanelBoundary>
        </main>

        <footer className="bg-slate-900 text-slate-300 pt-16 pb-8 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
              <div className="col-span-2">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-600 to-green-800 ring-1 ring-yellow-400/60 flex items-center justify-center text-white font-bold">N</span>
                  <span className="text-white font-bold text-lg">NationMart</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-400 max-w-sm">
                  Ghana&apos;s intelligent commerce platform. Build a branded digital store, reach buyers nationwide and globally, and run your business with the tools of a modern enterprise.
                </p>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-4 text-sm">Marketplace</h4>
                <ul className="space-y-2.5 text-sm">
                  <li><Link href="/stores" className="hover:text-white transition-colors">All Stores</Link></li>
                  <li><Link href="/catalog" className="hover:text-white transition-colors">Catalog</Link></li>
                  <li><Link href="/international" className="hover:text-white transition-colors">International</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-4 text-sm">For Sellers</h4>
                <ul className="space-y-2.5 text-sm">
                  <li><Link href="/auth/register" className="hover:text-white transition-colors">Become a Seller</Link></li>
                  <li><Link href="/sell" className="hover:text-white transition-colors">Add a Listing</Link></li>
                  <li><Link href="/stores/manage" className="hover:text-white transition-colors">Manage My Stores</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-4 text-sm">Company</h4>
                <ul className="space-y-2.5 text-sm">
                  <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                  <li><Link href="/help" className="hover:text-white transition-colors">Help Center</Link></li>
                  <li><Link href="/legal" className="hover:text-white transition-colors">Terms &amp; Privacy</Link></li>
                </ul>
              </div>
            </div>
            <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <span>© {new Date().getFullYear()} NationMart. All rights reserved.</span>
              <span>Designed by <span className="text-slate-300 font-semibold">Desward Technology</span> · Built for Ghana. Open to the world.</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
