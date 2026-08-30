'use client';
// Simple per-browser cart for buyers: add/save items now, pay later.
// Persists in localStorage and broadcasts changes so the navbar badge + cart page stay in sync.

export type CartItem = {
  id: string;            // product id
  title: string;
  price: number;         // effective unit price (after any discount)
  unit?: string;
  currency?: string;
  image?: string;
  sellerName?: string;
  qty: number;
};

const KEY = 'nationmart_cart_v1';
const EVT = 'nationmart-cart-updated';

function read(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function write(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function getCart(): CartItem[] { return read(); }

export function cartCount(): number {
  return read().reduce((n, i) => n + (i.qty || 0), 0);
}

export function cartTotal(): number {
  return read().reduce((s, i) => s + i.price * i.qty, 0);
}

export function addToCart(item: Omit<CartItem, 'qty'>, qty = 1) {
  const items = read();
  const existing = items.find((i) => i.id === item.id);
  if (existing) existing.qty += qty;
  else items.push({ ...item, qty });
  write(items);
}

export function setQty(id: string, qty: number) {
  const items = read().map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i));
  write(items);
}

export function removeFromCart(id: string) {
  write(read().filter((i) => i.id !== id));
}

export function clearCart() { write([]); }

/** Subscribe to cart changes (returns an unsubscribe fn). */
export function onCartChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener('storage', handler);
  return () => { window.removeEventListener(EVT, handler); window.removeEventListener('storage', handler); };
}
