import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/server/auth';
import StoragePanel from '@/components/admin/StoragePanel';

export const dynamic = 'force-dynamic';

// Owner and admin only. (The APIs enforce this too; this keeps other roles from landing on a page that cannot load.)
export default async function StoragePage() {
  const staff = await getStaff(['owner', 'admin']);
  if (!staff) {
    const anyStaff = await getStaff();
    redirect(anyStaff?.role === 'kitchen' ? '/admin/kitchen' : anyStaff?.role === 'rider' ? '/admin/rider' : '/admin');
  }
  return <StoragePanel />;
}
