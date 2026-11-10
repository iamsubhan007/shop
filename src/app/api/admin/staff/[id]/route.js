import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';
import { STAFF_ROLES } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const { profiles, sessions } = schema;
const idSchema = z.string().uuid();

/** Loads a staff member the owner is allowed to change (never the owner account itself). */
async function loadTarget(id, me) {
  if (!idSchema.safeParse(id).success) return { error: NextResponse.json({ error: 'Staff member not found.' }, { status: 404 }) };
  const [t] = await db.select().from(profiles).where(eq(profiles.id, id));
  if (!t || !STAFF_ROLES.includes(t.role)) return { error: NextResponse.json({ error: 'Staff member not found.' }, { status: 404 }) };
  if (t.role === 'owner' || t.id === me.id) return { error: NextResponse.json({ error: 'The owner account cannot be changed here.' }, { status: 400 }) };
  return { target: t };
}

/** Owner only: switch a staff member between Admin and Kitchen. Takes effect on their next request. */
export async function PATCH(request, { params }) {
  const g = await requireStaff(request, ['owner']);
  if (g.error) return g.error;
  const { id } = await params;
  const p = z.object({ role: z.enum(['admin', 'kitchen']) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Choose Admin or Kitchen.' }, { status: 400 });
  const t = await loadTarget(id, g.staff);
  if (t.error) return t.error;

  const [row] = await db.update(profiles).set({ role: p.data.role, updatedAt: new Date() }).where(eq(profiles.id, id))
    .returning({ id: profiles.id, email: profiles.email, fullName: profiles.fullName, role: profiles.role, isActive: profiles.isActive });
  await audit(g.staff, 'staff.role', 'profile', id, { role: t.target.role }, { email: row.email, role: row.role });
  return NextResponse.json({ staff: row });
}

/**
 * Owner only: take staff access away. The profile (and any orders it placed) is kept as a normal customer,
 * and their staff sessions are ended so they are signed out of /admin straight away.
 */
export async function DELETE(request, { params }) {
  const g = await requireStaff(request, ['owner']);
  if (g.error) return g.error;
  const { id } = await params;
  const t = await loadTarget(id, g.staff);
  if (t.error) return t.error;

  await db.update(profiles).set({ role: 'customer', updatedAt: new Date() }).where(eq(profiles.id, id));
  await db.delete(sessions).where(and(eq(sessions.profileId, id), eq(sessions.kind, 'staff')));
  await audit(g.staff, 'staff.remove', 'profile', id, { email: t.target.email, role: t.target.role }, { role: 'customer' });
  return NextResponse.json({ success: true });
}
