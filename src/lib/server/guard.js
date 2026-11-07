import 'server-only';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getStaff } from './auth';

/**
 * Authorization gate for admin API routes. Checks the staff session + role on the server and,
 * for state-changing requests, that the Origin matches this site (CSRF defence in depth on top of SameSite cookies).
 */
export async function requireStaff(request, roles = ['owner', 'admin']) {
  const staff = await getStaff(roles);
  if (!staff) return { error: NextResponse.json({ error: 'Not authorised.' }, { status: 403 }) };
  if (!['GET', 'HEAD'].includes(request.method)) {
    const h = await headers();
    const origin = h.get('origin');
    const host = h.get('host');
    if (!origin || new URL(origin).host !== host) return { error: NextResponse.json({ error: 'Bad origin.' }, { status: 403 }) };
  }
  return { staff };
}
