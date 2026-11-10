import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/server/auth';
import StaffManager from '@/components/admin/StaffManager';

export const dynamic = 'force-dynamic';

// Owner only. The API enforces this too; this keeps other roles from landing on a page that can't load.
export default async function StaffPage() {
  const owner = await getStaff(['owner']);
  if (!owner) {
    const anyStaff = await getStaff();
    redirect(anyStaff?.role === 'kitchen' ? '/admin/kitchen' : '/admin');
  }
  return <StaffManager />;
}
