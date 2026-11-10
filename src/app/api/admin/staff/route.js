import { NextResponse } from 'next/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';
import { normalizeEmail, STAFF_ROLES } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const { profiles } = schema;

// The owner account is created by the seed (OWNER_EMAIL). Only these two roles can be granted here,
// so nobody can be promoted to owner from the panel.
const GRANTABLE_ROLES = ['admin', 'kitchen'];

const addSchema = z.object({
  email: z.string().trim().min(3).max(254),
  fullName: z.string().trim().max(80).optional(),
  role: z.enum(GRANTABLE_ROLES),
});

const publicFields = {
  id: profiles.id,
  email: profiles.email,
  fullName: profiles.fullName,
  role: profiles.role,
  isActive: profiles.isActive,
  lastLoginAt: profiles.lastLoginAt,
  createdAt: profiles.createdAt,
};

/** Owner only: everyone who can sign in to /admin. */
export async function GET(request) {
  const g = await requireStaff(request, ['owner']);
  if (g.error) return g.error;
  const rows = await db.select(publicFields).from(profiles).where(inArray(profiles.role, STAFF_ROLES)).orderBy(asc(profiles.createdAt));
  return NextResponse.json({ staff: rows, meId: g.staff.id });
}

/** Owner only: give an email staff access. They sign in at /admin/login with an emailed one-time code. */
export async function POST(request) {
  const g = await requireStaff(request, ['owner']);
  if (g.error) return g.error;

  const p = addSchema.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Enter a valid email and choose a role (Admin or Kitchen).' }, { status: 400 });
  const email = normalizeEmail(p.data.email);
  if (!email) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  const { role } = p.data;
  const fullName = p.data.fullName || null;

  const [existing] = await db.select().from(profiles).where(eq(profiles.email, email));
  if (existing) {
    if (STAFF_ROLES.includes(existing.role)) {
      return NextResponse.json({ error: `That email already has staff access (${existing.role}).` }, { status: 409 });
    }
    if (!existing.isActive) {
      return NextResponse.json({ error: 'That account is disabled, so it cannot be made staff.' }, { status: 409 });
    }
    // A customer who is joining the team: keep their account and history, add the role.
    const [row] = await db.update(profiles)
      .set({ role, fullName: existing.fullName || fullName, updatedAt: new Date() })
      .where(eq(profiles.id, existing.id))
      .returning(publicFields);
    await audit(g.staff, 'staff.add', 'profile', row.id, { role: existing.role }, { email, role });
    return NextResponse.json({ staff: row }, { status: 201 });
  }

  try {
    const [row] = await db.insert(profiles).values({ email, fullName, role }).returning(publicFields);
    await audit(g.staff, 'staff.add', 'profile', row.id, null, { email, role });
    return NextResponse.json({ staff: row }, { status: 201 });
  } catch {
    // Lost a race with another request for the same email (unique constraint).
    return NextResponse.json({ error: 'That email was just added. Refresh the list.' }, { status: 409 });
  }
}
