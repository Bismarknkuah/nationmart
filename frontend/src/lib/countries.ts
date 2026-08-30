// Ghana is always first; every other country follows in alphabetical order.
const OTHERS = [
  'Albania', 'Algeria', 'Angola', 'Argentina', 'Australia', 'Austria', 'Bahrain', 'Bangladesh',
  'Belgium', 'Benin', 'Botswana', 'Brazil', 'Bulgaria', 'Burkina Faso', 'Cameroon', 'Canada',
  'Chad', 'Chile', 'China', 'Colombia', 'Côte d’Ivoire', 'Croatia', 'Cyprus', 'Czechia',
  'Denmark', 'Egypt', 'Estonia', 'Ethiopia', 'Finland', 'France', 'Gabon', 'Gambia',
  'Germany', 'Greece', 'Guinea', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia',
  'Ireland', 'Israel', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Kuwait', 'Latvia',
  'Lebanon', 'Liberia', 'Libya', 'Lithuania', 'Luxembourg', 'Malaysia', 'Mali', 'Malta',
  'Mauritius', 'Mexico', 'Morocco', 'Mozambique', 'Namibia', 'Netherlands', 'New Zealand',
  'Niger', 'Nigeria', 'Norway', 'Oman', 'Pakistan', 'Philippines', 'Poland', 'Portugal',
  'Qatar', 'Romania', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Sierra Leone', 'Singapore',
  'Slovakia', 'Slovenia', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland',
  'Tanzania', 'Thailand', 'Togo', 'Tunisia', 'Turkey', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Vietnam', 'Zambia', 'Zimbabwe',
  'Other',
].sort((a, b) => a.localeCompare(b));

export const COUNTRIES: string[] = ['Ghana', ...OTHERS];
