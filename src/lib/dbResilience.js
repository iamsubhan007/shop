// Keeping the database reachable from a serverless host. No imports, so scripts and tests can use it too.

/**
 * On Vercel every function instance keeps its own connections. Supabase's *session* pooler (port 5432) allows only
 * a handful in total, so busy moments failed with "max clients reached" and pages crashed. Its *transaction* pooler
 * (port 6543, same host, user and password) is made for this, so it is used there whatever port was configured.
 */
export function serverlessDatabaseUrl(url, env = process.env) {
  if (!url || !env.VERCEL) return url;
  return url.replace(/(@[^/@]+\.pooler\.supabase\.com):5432(?=[/?]|$)/, '$1:6543');
}

const TRANSIENT = /CONNECT_TIMEOUT|CONNECTION_(CLOSED|ENDED|DESTROYED)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|MaxClientsInSessionMode|max clients reached|too many (clients|connections)|remaining connection slots|terminating connection|\b(53300|57P01|57P03|08000|08003|08006)\b/i;

/** A failure to reach the database, as opposed to a query that is wrong and would fail again. */
export function isTransientDbError(error) {
  for (let e = error, depth = 0; e && depth < 4; e = e.cause, depth += 1) {
    if (TRANSIENT.test(`${e.code || ''} ${e.message || ''}`)) return true;
  }
  return false;
}

/** Runs a READ again after a short pause if the database could not be reached. Never use it around writes. */
export async function retryRead(read, { delays = [150, 600], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= delays.length || !isTransientDbError(error)) throw error;
      console.warn('database unreachable, trying again:', error.cause?.code || error.code || error.message);
      await sleep(delays[attempt]);
    }
  }
}
