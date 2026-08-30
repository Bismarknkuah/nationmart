// Buyer "saved items" (wishlist), stored locally like the cart.
export type SavedItem = {
  id: string;
  title: string;
  price: number;
  unit?: string;
  currency?: string;
  image?: string;
  sellerName?: string;
};

const KEY = 'nationmart-saved';
const EVT = 'nationmart-saved-updated';

function read(): SavedItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(items: SavedItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVT));
}

export function getSaved(): SavedItem[] { return read(); }
export function isSaved(id: string): boolean { return read().some((i) => i.id === id); }
export function savedCount(): number { return read().length; }

export function saveItem(item: SavedItem) {
  const items = read();
  if (!items.some((i) => i.id === item.id)) write([item, ...items]);
}
export function removeSaved(id: string) { write(read().filter((i) => i.id !== id)); }

/** Toggle and return the new saved state. */
export function toggleSaved(item: SavedItem): boolean {
  if (isSaved(item.id)) { removeSaved(item.id); return false; }
  saveItem(item); return true;
}

export function onSavedChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = () => cb();
  window.addEventListener(EVT, h);
  window.addEventListener('storage', h);
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
}
