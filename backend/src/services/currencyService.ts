/**
 * Multi-currency service for NationMart's local <-> international dashboards.
 *
 * Base currency is GHS. Rates are static fallbacks that can be refreshed from a
 * live FX provider by setting FX_RATES_URL (returns { base:'GHS', rates:{...} }).
 * Conversions let a Ghanaian buyer see a Chinese seller's price in GHS, and an
 * international buyer see a Ghanaian price in their own currency.
 */

export type CurrencyCode = 'GHS' | 'USD' | 'EUR' | 'GBP' | 'CNY' | 'NGN' | 'ZAR';

// Units of <currency> per 1 GHS (fallback, ~2025 levels)
const RATES_PER_GHS: Record<CurrencyCode, number> = {
  GHS: 1,
  USD: 0.068,
  EUR: 0.063,
  GBP: 0.054,
  CNY: 0.49,
  NGN: 105,
  ZAR: 1.25,
};

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['GHS', 'USD', 'EUR', 'GBP', 'CNY', 'NGN', 'ZAR'];

const SYMBOLS: Record<CurrencyCode, string> = {
  GHS: '₵', USD: '$', EUR: '€', GBP: '£', CNY: '¥', NGN: '₦', ZAR: 'R',
};

let liveRates: Record<string, number> | null = null;

export async function refreshRates(): Promise<void> {
  const url = process.env.FX_RATES_URL;
  if (!url) return;
  try {
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data?.rates) liveRates = data.rates;
  } catch {
    // keep fallback
  }
}

function ratePerGhs(code: CurrencyCode): number {
  if (liveRates && typeof liveRates[code] === 'number') return liveRates[code];
  return RATES_PER_GHS[code] ?? 1;
}

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return round(amount);
  const amountInGhs = amount / ratePerGhs(from);
  return round(amountInGhs * ratePerGhs(to));
}

export function format(amount: number, code: CurrencyCode): string {
  const sym = SYMBOLS[code] || '';
  return `${sym}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
