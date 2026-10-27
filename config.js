// Public values from Supabase → Project Settings → API. The publishable key is safe in the browser;
// row level security decides what it can reach. Never put the service_role / secret key here.
export const SUPABASE_URL = 'https://rgklhtdtidbjvfusgluv.supabase.co';
export const SUPABASE_KEY = 'sb_publishable__LjsMCBWRd8yHwAzMu5rZA_gZFQkYlW';
// The public address of the site. QR codes and customer links are always built from this, so a chart
// made on a local copy still points to the live site. Keep the trailing slash.
export const SITE_URL = 'https://ostwalfundhouse.github.io/family-tree/';
// Plan limits shown by the storage meter on the admin projects page (Supabase free plan). Change if the plan changes.
export const LIMITS_MB = { files: 1024, database: 500 };
