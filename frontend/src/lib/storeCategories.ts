// Shared store category catalog used by Home, Stores browse, Sell, Manage.
// Keep this in sync with backend/src/models/Store.ts (STORE_TEMPLATES keys).
// Icons are inline SVG paths (no emoji) for a clean professional look.

export interface StoreCategory {
  value: string;
  label: string;
  tagline: string;
  // Tailwind color tokens for category chips
  swatch: { bg: string; text: string; border: string };
  // 24x24 SVG path data (stroke-based, currentColor)
  iconPath: string;
}

export const STORE_CATEGORIES: StoreCategory[] = [
  {
    value: 'general', label: 'General Store',
    tagline: 'Everyday goods, all in one place',
    swatch: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    iconPath: 'M3 9l9-6 9 6v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM9 22V12h6v10',
  },
  {
    value: 'provision', label: 'Provision Store',
    tagline: 'Groceries & household essentials',
    swatch: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
    iconPath: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2.293-2.293M7 13l-1.293 1.293A1 1 0 006.414 16H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    value: 'pharmacy', label: 'Pharmacy',
    tagline: 'Licensed medicines & health products',
    swatch: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    iconPath: 'M12 4v16m8-8H4',
  },
  {
    value: 'electronics', label: 'Electronics Shop',
    tagline: 'Phones, computers & accessories',
    swatch: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
    iconPath: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    value: 'vehicle', label: 'Vehicle Dealership',
    tagline: 'Cars, motorcycles & commercial vehicles',
    swatch: { bg: 'bg-zinc-100', text: 'text-zinc-800', border: 'border-zinc-300' },
    iconPath: 'M5 17a2 2 0 104 0m6 0a2 2 0 104 0M3 17h18M5 17V9l2-4h10l2 4v8',
  },
  {
    value: 'spare_parts', label: 'Spare Parts',
    tagline: 'Automotive & machinery parts',
    swatch: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    value: 'building_materials', label: 'Building Materials',
    tagline: 'Cement, blocks, steel & site supplies',
    swatch: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
    iconPath: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  {
    value: 'farm', label: 'Farm Produce',
    tagline: 'Fresh produce & livestock direct from farms',
    swatch: { bg: 'bg-lime-50', text: 'text-lime-800', border: 'border-lime-200' },
    iconPath: 'M3 12l2-2 4 4 8-8 4 4M3 17l2-2 4 4 8-8 4 4',
  },
  {
    value: 'agriculture_supplies', label: 'Agriculture Supplies',
    tagline: 'Seeds, fertilizers & farming equipment',
    swatch: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
    iconPath: 'M12 2v20m-7-7l7-7 7 7M5 22h14',
  },
  {
    value: 'restaurant', label: 'Restaurant',
    tagline: 'Local meals, takeaway & catering',
    swatch: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    iconPath: 'M3 3v18m18-18v18M3 12h18M7 3v18M17 3v18',
  },
  {
    value: 'boutique', label: 'Boutique & Fashion',
    tagline: 'Clothing, footwear & accessories',
    swatch: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    iconPath: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  },
  {
    value: 'timber', label: 'Timber & Wood',
    tagline: 'Lumber, planks & raw timber for industry',
    swatch: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
    iconPath: 'M4 6h16v12H4zM4 10h16M4 14h16',
  },
  {
    value: 'wholesale', label: 'Wholesale',
    tagline: 'Bulk supply for resellers & traders',
    swatch: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    iconPath: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  {
    value: 'manufacturer', label: 'Manufacturer',
    tagline: 'Direct from factory — bulk & B2B',
    swatch: { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
    iconPath: 'M3 21h18M3 21V7l6 4V7l6 4V3l6 4v14M9 21V11',
  },
  {
    value: 'services', label: 'Services',
    tagline: 'Skilled artisans & professional services',
    swatch: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    iconPath: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
  {
    value: 'beauty_cosmetics', label: 'Beauty & Cosmetics',
    tagline: 'Skincare, hair, makeup & salon supplies',
    swatch: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    iconPath: 'M9 12l2 2 4-4M7.835 4.697A3.42 3.42 0 0010.46 2.7c.495-1.144 2.142-1.144 2.637 0a3.42 3.42 0 002.625 1.997c1.21.21 1.736 1.66.93 2.585a3.42 3.42 0 00-.69 3.063c.31 1.218-.916 2.293-2.05 1.802a3.42 3.42 0 00-3.137 0c-1.134.49-2.36-.585-2.05-1.803a3.42 3.42 0 00-.69-3.063c-.805-.926-.279-2.375.93-2.584z',
  },
  {
    value: 'books_stationery', label: 'Books & Stationery',
    tagline: 'Books, school & office supplies',
    swatch: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
    iconPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  { value: 'supermarket', label: 'Supermarket', tagline: 'Groceries, fresh food & everyday needs', swatch: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' }, iconPath: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2.293-2.293M7 13l-1.293 1.293A1 1 0 006.414 16H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
  { value: 'bakery', label: 'Bakery & Confectionery', tagline: 'Bread, pastries, cakes & treats', swatch: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }, iconPath: 'M12 3v1m0 16v1m9-9h-1M4 12H3m3.5-5.5l.7.7m10.6-.7l-.7.7M7 18h10a4 4 0 000-8H7a4 4 0 000 8z' },
  { value: 'hardware', label: 'Hardware & Tools', tagline: 'Tools, fittings & DIY supplies', swatch: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' }, iconPath: 'M14.7 6.3a4 4 0 01-5 5L4 17v3h3l5.7-5.7a4 4 0 015-5l-2.5-2.5z' },
  { value: 'furniture', label: 'Furniture & Home', tagline: 'Furniture, décor & home essentials', swatch: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' }, iconPath: 'M4 10V7a2 2 0 012-2h12a2 2 0 012 2v3m-16 0a2 2 0 00-2 2v3h20v-3a2 2 0 00-2-2M4 10h16M5 18v2m14-2v2' },
  { value: 'jewelry', label: 'Jewelry & Accessories', tagline: 'Gold, watches & fine accessories', swatch: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' }, iconPath: 'M12 3l4 5-4 13L8 8l4-5zM4 8h16' },
  { value: 'mobile_gadgets', label: 'Mobile & Gadgets', tagline: 'Phones, accessories & smart devices', swatch: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' }, iconPath: 'M7 4h10a1 1 0 011 1v14a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1zm5 14h.01' },
  { value: 'salon_spa', label: 'Salon & Spa', tagline: 'Hair, beauty, grooming & wellness', swatch: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' }, iconPath: 'M6 9a3 3 0 100-6 3 3 0 000 6zm0 0v12m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v12' },
  { value: 'auto_repair', label: 'Auto Repair & Garage', tagline: 'Servicing, repairs & mechanics', swatch: { bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-300' }, iconPath: 'M3 13l2-5a2 2 0 012-1h10a2 2 0 012 1l2 5M5 13h14v4a1 1 0 01-1 1h-1a1 1 0 01-1-1v-1H8v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-4z' },
  { value: 'printing_branding', label: 'Printing & Branding', tagline: 'Printing, signage & branded items', swatch: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }, iconPath: 'M6 9V3h12v6m0 0a2 2 0 012 2v5h-4v4H8v-4H4v-5a2 2 0 012-2h12zM8 13h8' },
  { value: 'real_estate', label: 'Real Estate & Rentals', tagline: 'Land, houses, shops & rentals', swatch: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' }, iconPath: 'M3 12l9-9 9 9M5 10v10h14V10M9 20v-6h6v6' },
  { value: 'sports_fitness', label: 'Sports & Fitness', tagline: 'Gym, sportswear & equipment', swatch: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' }, iconPath: 'M6 7v10M18 7v10M4 9h2v6H4zM18 9h2v6h-2zM6 12h12' },
  { value: 'toys_games', label: 'Toys & Games', tagline: 'Toys, games & kids’ fun', swatch: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }, iconPath: 'M12 3a4 4 0 014 4v1h1a3 3 0 010 6h-1v3a4 4 0 01-8 0v-3H7a3 3 0 010-6h1V7a4 4 0 014-4z' },
  { value: 'pet_supplies', label: 'Pet Supplies', tagline: 'Pet food, care & accessories', swatch: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }, iconPath: 'M5 11a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4zM9 7a2 2 0 100-4 2 2 0 000 4zm6 0a2 2 0 100-4 2 2 0 000 4zM7 14c0 3 2 5 5 5s5-2 5-5a3 3 0 00-3-3h-4a3 3 0 00-3 3z' },
  { value: 'catering_events', label: 'Catering & Events', tagline: 'Catering, rentals & event planning', swatch: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' }, iconPath: 'M12 3v6m-7 12h14a0 0 0 000 0 7 7 0 00-14 0zM3 21h18' },
  { value: 'education_training', label: 'Education & Training', tagline: 'Schools, tutoring & skills training', swatch: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' }, iconPath: 'M12 14l9-5-9-5-9 5 9 5zm0 0v6m-5-3v-3.5' },
  { value: 'health_wellness', label: 'Health & Wellness', tagline: 'Clinics, fitness & wellness services', swatch: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' }, iconPath: 'M12 8v8m-4-4h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

// Themed photo for each store type (real pictures, not emoji). Stable per type.
const CATEGORY_KEYWORDS: Record<string, string> = {
  general: 'store', provision: 'grocery', pharmacy: 'pharmacy', electronics: 'electronics',
  vehicle: 'car,dealership', spare_parts: 'car,parts', building_materials: 'construction,cement',
  farm: 'farm,produce', agriculture_supplies: 'farming,seeds', restaurant: 'restaurant,food',
  boutique: 'fashion,boutique', timber: 'timber,wood', wholesale: 'warehouse', manufacturer: 'factory',
  services: 'workshop,tools', beauty_cosmetics: 'cosmetics,makeup', books_stationery: 'books,stationery',
  supermarket: 'supermarket', bakery: 'bakery,bread', hardware: 'hardware,tools', furniture: 'furniture',
  jewelry: 'jewelry,gold', mobile_gadgets: 'smartphone,gadgets', salon_spa: 'salon,spa',
  auto_repair: 'garage,mechanic', printing_branding: 'printing,press', real_estate: 'house,property',
  sports_fitness: 'gym,fitness', toys_games: 'toys', pet_supplies: 'pet,shop',
  catering_events: 'catering,event', education_training: 'classroom,school', health_wellness: 'clinic,wellness',
};

/** A real, themed photo URL for a store type (free keyword photo service). */
export function categoryImage(value?: string | null): string {
  // A category coming from the API may be missing its `value` field. Reading
  // `.length` / `.charCodeAt` on undefined here throws inside the caller's
  // `.map`, which used to take the whole home page down. Fall back safely.
  const safe = value || 'general';
  const kw = CATEGORY_KEYWORDS[safe] || 'shop';
  // `lock` pins a stable image per type so it doesn't change on each load.
  let lock = 0;
  for (let i = 0; i < safe.length; i++) lock = (lock * 31 + safe.charCodeAt(i)) % 1000;
  return `https://loremflickr.com/640/360/${encodeURIComponent(kw)}?lock=${lock}`;
}

export const STORE_CATEGORY_MAP: Record<string, StoreCategory> = Object.fromEntries(
  STORE_CATEGORIES.map(c => [c.value, c])
);

// Small reusable inline-SVG component data shape
export function categoryIcon(value?: string | null): string {
  return STORE_CATEGORY_MAP[value || '']?.iconPath
    || STORE_CATEGORY_MAP.general?.iconPath
    || '';
}
