// Prices are defined in Ugandan shillings and shown in the visitor's likely local currency.
// The visitor's country is inferred in the browser (language region, then time zone), so no location data is sent anywhere.
// Rates are fixed approximations (units of currency per 1 UGX) shown as an estimate. Billing, when added, must use the real rate.
const RATES = { UGX: 1, KES: 0.0355, TZS: 0.71, RWF: 0.39, USD: 0.00027, GBP: 0.00021, EUR: 0.00025, NGN: 0.41, GHS: 0.0042, ZAR: 0.0049, INR: 0.023, CAD: 0.00037, AUD: 0.00041, AED: 0.001, ETB: 0.043, ZMW: 0.0071 };
const REGION_CCY = { UG: 'UGX', KE: 'KES', TZ: 'TZS', RW: 'RWF', US: 'USD', GB: 'GBP', NG: 'NGN', GH: 'GHS', ZA: 'ZAR', IN: 'INR', CA: 'CAD', AU: 'AUD', NZ: 'AUD', AE: 'AED', ET: 'ETB', ZM: 'ZMW' };
const EU = 'DE FR ES IT NL BE PT IE AT FI GR LU SK SI EE LV LT MT CY HR'.split(' ');
const ZONE_REGION = { 'Africa/Kampala': 'UG', 'Africa/Nairobi': 'KE', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kigali': 'RW', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Johannesburg': 'ZA', 'Africa/Addis_Ababa': 'ET', 'Africa/Lusaka': 'ZM', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Europe/London': 'GB' };

export function localCurrency() {
  let region = '';
  try {
    for (const l of navigator.languages || [navigator.language]) {
      const r = new Intl.Locale(l).region;
      if (r) { region = r; break; }
    }
    const zoneRegion = ZONE_REGION[Intl.DateTimeFormat().resolvedOptions().timeZone];
    if (zoneRegion) region = zoneRegion; // the time zone is a better signal of where the person is than their language
  } catch { /* fall through to the default */ }
  if (EU.includes(region)) return 'EUR';
  return REGION_CCY[region] || 'UGX';
}

export function formatPrice(ugx, currency = localCurrency()) {
  const value = ugx * RATES[currency];
  const digits = value < 100 ? 2 : 0;
  if (currency === 'UGX') return `UGX ${value.toLocaleString('en-US')}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value).replace(/^UGX\s?/, 'UGX ');
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}
export const isApprox = (currency = localCurrency()) => currency !== 'UGX';
