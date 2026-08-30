import { regionAbbr, buildStoreCode, buildPartnerCode, countryAbbr, districtAbbr, nameAbbr } from '../utils/codes';

describe('codes util', () => {
  test('regionAbbr maps known regions', () => {
    expect(regionAbbr('Greater Accra')).toBe('GA');
    expect(regionAbbr('Ashanti')).toBe('AS');
  });

  test('regionAbbr falls back to initials for unknown regions', () => {
    expect(regionAbbr('Some New Region')).toBe('SNR');
    expect(regionAbbr(undefined)).toBe('GH');
  });

  test('countryAbbr maps known countries and falls back', () => {
    expect(countryAbbr('Ghana')).toBe('GH');
    expect(countryAbbr('Nigeria')).toBe('NG');
    expect(countryAbbr(undefined)).toBe('GH');
  });

  test('districtAbbr and nameAbbr produce meaningful shortcuts', () => {
    expect(districtAbbr('Accra Metropolitan')).toBe('AM');
    expect(districtAbbr('Kumasi')).toBe('KUM');
    expect(nameAbbr('Wellpoint Pharmacy')).toBe('WP');
    expect(nameAbbr('KumaSaw')).toBe('KUMA');
  });

  test('buildStoreCode formats COUNTRY-REGION-DISTRICT-TYPE-NAME', () => {
    expect(buildStoreCode('Ghana', 'Greater Accra', 'Accra Metropolitan', 'pharmacy', 'Wellpoint Pharmacy'))
      .toBe('GH-GA-AM-PHA-WP');
  });

  test('buildPartnerCode uses the licence when provided', () => {
    expect(buildPartnerCode('Ghana', 'Greater Accra', 'Accra Metropolitan', 'GR-4471-X', 'rider'))
      .toBe('GH-GA-AM-GR4471X');
  });

  test('buildPartnerCode falls back to role+sequence without a licence', () => {
    expect(buildPartnerCode('Ghana', 'Ashanti', 'Kumasi', '', 'driver', 12))
      .toBe('GH-AS-KUM-DRV0012');
  });
});
