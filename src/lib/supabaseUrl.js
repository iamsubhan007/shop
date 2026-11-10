// Works out the Supabase project URL from the Postgres connection string, so only the service-role key has to be
// added as a new secret. Pure function (no server-only import) so it can be tested.
//
//   pooler:  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
//   direct:  postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
// Both give https://<ref>.supabase.co. Returns null for anything else (e.g. a local Postgres).
export function deriveSupabaseUrl(databaseUrl) {
  try {
    const raw = String(databaseUrl || '').trim().replace(/^["']|["']$/g, '');
    if (!raw) return null;
    const u = new URL(raw.replace(/^postgres(ql)?:/, 'http:'));
    const user = decodeURIComponent(u.username || '');
    const fromUser = user.match(/^postgres\.([a-z0-9]{10,})$/i);
    if (fromUser && /supabase\.com$|supabase\.co$/i.test(u.hostname)) return `https://${fromUser[1].toLowerCase()}.supabase.co`;
    const fromHost = u.hostname.match(/^db\.([a-z0-9]{10,})\.supabase\.co$/i);
    if (fromHost) return `https://${fromHost[1].toLowerCase()}.supabase.co`;
    return null;
  } catch {
    return null;
  }
}
