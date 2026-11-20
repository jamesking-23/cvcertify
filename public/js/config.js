// Public client configuration. The publishable key is safe to ship: access is enforced by Row Level Security.
export const SUPABASE_URL = 'https://dgvaoswcbzzcyaentjwr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_tiOayGxwD3kqG_q-aqQ_TQ_p5Rs5hE1';

// Shown on the Terms, Privacy and Refund pages so customers can reach you. Set this to your real support address.
export const SUPPORT_EMAIL = 'cvcertify1@gmail.com';
// Name of the business that operates the site, as it should appear in the legal pages.
export const BUSINESS_NAME = 'CV-Certify';

// Manual mobile money. Customers send the plan price to the number below and submit the transaction ID, and you approve it
// in Admin > Payments. Leave a number empty to hide that network. Fill in 'name' with the name registered on the line,
// because customers see it on their confirmation screen and it reassures them they are paying the right person.
export const MANUAL_PAY = { name: '', mtn: '', airtel: '' };
