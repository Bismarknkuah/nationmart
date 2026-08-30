// ─── Human-readable, meaningful codes customers can search by ──────────────────

// Region abbreviations for Ghana's 16 regions.
const REGION_ABBR: Record<string, string> = {
  'greater accra': 'GA', 'ashanti': 'AS', 'western': 'WR', 'western north': 'WN',
  'central': 'CR', 'eastern': 'ER', 'volta': 'VR', 'oti': 'OT', 'northern': 'NR',
  'savannah': 'SV', 'north east': 'NE', 'upper east': 'UE', 'upper west': 'UW',
  'bono': 'BO', 'bono east': 'BE', 'ahafo': 'AH',
};

// Common country codes (extend as needed); fallback is first 2 letters.
const COUNTRY_ABBR: Record<string, string> = {
  'ghana': 'GH', 'nigeria': 'NG', 'kenya': 'KE', 'south africa': 'ZA',
  'united states': 'US', 'united kingdom': 'UK', 'canada': 'CA', 'germany': 'DE',
  'france': 'FR', 'china': 'CN', 'india': 'IN',
};

export function countryAbbr(country?: string): string {
  if (!country) return 'GH';
  const k = country.trim().toLowerCase();
  if (COUNTRY_ABBR[k]) return COUNTRY_ABBR[k];
  return country.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'GH';
}

export function regionAbbr(region?: string): string {
  if (!region) return 'GH';
  const key = region.trim().toLowerCase();
  if (REGION_ABBR[key]) return REGION_ABBR[key];
  return region.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'GH';
}

/** District abbreviation: initials for multi-word, else first 3 letters. */
export function districtAbbr(district?: string): string {
  if (!district || !district.trim()) return 'GEN';
  const words = district.trim().split(/\s+/);
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return district.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'GEN';
}

function typeAbbr(type?: string): string {
  return (type || 'general').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'GEN';
}

/** Short code from a store/business name: initials for multi-word, else first 4 letters. */
export function nameAbbr(name?: string): string {
  if (!name || !name.trim()) return 'STORE';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase();
  return name.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'STORE';
}

/**
 * Meaningful, searchable store code:
 *   COUNTRY-REGION-DISTRICT-TYPE-NAMESHORT
 * e.g. "GH-GA-ACM-PHA-WP" (Ghana, Greater Accra, Accra Metropolitan, pharmacy, Wellpoint Pharmacy)
 */
export function buildStoreCode(
  country: string | undefined,
  region: string | undefined,
  district: string | undefined,
  type: string | undefined,
  name: string | undefined,
): string {
  return [
    countryAbbr(country),
    regionAbbr(region),
    districtAbbr(district),
    typeAbbr(type),
    nameAbbr(name),
  ].join('-');
}

/**
 * Logistics partner (rider/driver) code:
 *   COUNTRY-REGION-DISTRICT-LICENSE
 * e.g. "GH-GA-ACM-GR1234X". Falls back to a role+sequence tag when no license is given.
 */
export function buildPartnerCode(
  country: string | undefined,
  region: string | undefined,
  district: string | undefined,
  license: string | undefined,
  role?: string,
  seq?: number,
): string {
  const base = [countryAbbr(country), regionAbbr(region), districtAbbr(district)];
  const lic = (license || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (lic) return [...base, lic].join('-');
  const roleAbbr = role === 'driver' ? 'DRV' : role === 'fleet_manager' ? 'FLT' : role === 'logistics_company' ? 'LGC' : 'RDR';
  return [...base, `${roleAbbr}${String(seq ?? 1).padStart(4, '0')}`].join('-');
}

/**
 * A short, catchy, easy-to-remember store number for customers, e.g. "NM-48210".
 */
export function buildStoreNumber(seed?: number): string {
  const n = seed != null ? (10000 + (seed % 90000)) : (10000 + Math.floor(Math.random() * 90000));
  return `NM-${n}`;
}
