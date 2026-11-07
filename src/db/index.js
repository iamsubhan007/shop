import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let dbInstance = null;

// Tolerates surrounding quotes and an unencoded '@' / special chars in the password.
function normalizeDatabaseUrl(raw) {
  if (!raw) return null;
  const v = raw.trim().replace(/^["']|["']$/g, '');
  const m = v.match(/^(postgres(?:ql)?):\/\/([^:]+):(.*)@([^@]+)$/);
  if (!m) return v;
  const [, scheme, user, pass, rest] = m;
  let decoded = pass;
  try { decoded = decodeURIComponent(pass); } catch {}
  return `${scheme}://${user}:${encodeURIComponent(decoded)}@${rest}`;
}

export function getDb() {
  if (dbInstance) return dbInstance;

  const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (!connectionString) {
    return null;
  }

  try {
    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    dbInstance = drizzle(client, { schema });
    return dbInstance;
  } catch (err) {
    console.warn('Postgres connection failed, falling back to Supabase client:', err.message);
    return null;
  }
}

export const db = getDb();
export { schema };

