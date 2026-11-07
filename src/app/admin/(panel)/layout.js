import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/server/auth';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'HBT Admin', robots: { index: false, follow: false } };

// Server-side guard: nothing under /admin renders without a valid staff session.
export default async function PanelLayout({ children }) {
  const staff = await getStaff();
  if (!staff) redirect('/admin/login');
  return (
    <AdminShell user={{ name: staff.fullName || staff.email, email: staff.email, role: staff.role }}>
      {children}
    </AdminShell>
  );
}
