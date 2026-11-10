import 'server-only';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { cleanEnv } from '@/lib/env';

const { profiles, sessions, otpCodes, rateLimits } = schema;

export const COOKIE_CUSTOMER = 'hbt_session';
export const COOKIE_STAFF = 'hbt_staff';
const CUSTOMER_TTL_MS = 30 * 24 * 3600 * 1000;
const STAFF_TTL_MS = 12 * 3600 * 1000;

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_S = 60;
const OTP_MAX_ATTEMPTS = 5;

export const STAFF_ROLES = ['owner', 'admin', 'kitchen'];

// Key used to hash one-time codes. SESSION_SECRET is the documented name; OTP_SECRET is accepted too because
// it is what the example environment file calls it. The first one that is at least 16 characters is used.
function secret() {
  const s = [process.env.SESSION_SECRET, process.env.OTP_SECRET].map(cleanEnv).find((v) => v.length >= 16);
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET (or OTP_SECRET) must be set, 16+ chars');
    return 'dev-insecure-secret';
  }
  return s;
}

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const hmac = (v) => crypto.createHmac('sha256', secret()).update(v).digest('hex');

// ---------- request helpers ----------
export async function clientIp() {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

/** Fixed-window rate limit stored in Postgres. Returns { ok, retryAfterS }. */
export async function rateLimit(key, limit, windowS) {
  const now = new Date();
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} < now() - make_interval(secs => ${windowS}) THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} < now() - make_interval(secs => ${windowS}) THEN now() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning();
  if (row.count > limit) {
    const retryAfterS = Math.max(1, Math.ceil(windowS - (Date.now() - new Date(row.windowStart).getTime()) / 1000));
    return { ok: false, retryAfterS };
  }
  return { ok: true };
}

// ---------- sessions ----------
export async function createSession(profileId, kind) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttl = kind === 'staff' ? STAFF_TTL_MS : CUSTOMER_TTL_MS;
  const h = await headers();
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    profileId,
    kind,
    ip: await clientIp(),
    userAgent: (h.get('user-agent') || '').slice(0, 250),
    expiresAt: new Date(Date.now() + ttl),
  });
  const jar = await cookies();
  jar.set(kind === 'staff' ? COOKIE_STAFF : COOKIE_CUSTOMER, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(ttl / 1000),
  });
}

async function sessionProfile(cookieName, kind) {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ profile: profiles })
    .from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.profileId))
    .where(and(eq(sessions.tokenHash, sha256(token)), eq(sessions.kind, kind), gt(sessions.expiresAt, new Date())));
  if (!row || !row.profile.isActive) return null;
  const { passwordHash, ...safe } = row.profile;
  return safe;
}

export const getCustomer = () => sessionProfile(COOKIE_CUSTOMER, 'customer');

/** Staff session; optionally require one of `roles`. Returns null if not allowed. */
export async function getStaff(roles = STAFF_ROLES) {
  const p = await sessionProfile(COOKIE_STAFF, 'staff');
  if (!p || !roles.includes(p.role)) return null;
  return p;
}

export async function destroySession(cookieName) {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(cookieName);
}

// ---------- email OTP (customers) ----------
export async function issueOtp(email) {
  const [last] = await db
    .select()
    .from(otpCodes)
    .where(eq(otpCodes.email, email))
    .orderBy(sql`${otpCodes.createdAt} desc`)
    .limit(1);
  if (last) {
    const wait = OTP_RESEND_COOLDOWN_S - (Date.now() - new Date(last.createdAt).getTime()) / 1000;
    if (wait > 0) return { ok: false, retryAfterS: Math.ceil(wait) };
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.insert(otpCodes).values({
    email,
    codeHash: hmac(`${email}:${code}`),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  return { ok: true, code }; // caller emails it; never return to the browser
}

export async function checkOtp(email, code) {
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
    .orderBy(sql`${otpCodes.createdAt} desc`)
    .limit(1);
  if (!row) return { ok: false, reason: 'Code expired or not found. Please request a new one.' };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'Too many wrong attempts. Please request a new code.' };
  const expected = Buffer.from(row.codeHash, 'hex');
  const given = Buffer.from(hmac(`${email}:${code}`), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));
    return { ok: false, reason: 'Incorrect code. Please try again.' };
  }
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
  return { ok: true };
}

export async function findOrCreateCustomer(email) {
  const [existing] = await db.select().from(profiles).where(eq(profiles.email, email));
  if (existing) {
    if (!existing.isActive) return null;
    await db.update(profiles).set({ lastLoginAt: new Date() }).where(eq(profiles.id, existing.id));
    return existing;
  }
  const [created] = await db
    .insert(profiles)
    .values({ email, role: 'customer', lastLoginAt: new Date() })
    .returning();
  return created;
}

export function normalizeEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
}

/** Pakistani mobile: 03XXXXXXXXX or +923XXXXXXXXX -> 03XXXXXXXXX */
export function normalizePkPhone(v) {
  const d = String(v || '').replace(/[\s-]/g, '');
  const m = d.match(/^(?:\+?92|0)(3\d{9})$/);
  return m ? `0${m[1]}` : null;
}

// ---------- staff (owner / admin / kitchen): email OTP, no passwords ----------
export const staffKey = (email) => `staff:${email}`;

export async function findStaffByEmail(email) {
  const [u] = await db.select().from(profiles).where(eq(profiles.email, email));
  return u && u.isActive && STAFF_ROLES.includes(u.role) ? u : null;
}
