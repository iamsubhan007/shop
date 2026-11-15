import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/server/auth';
import RiderDeliveries from '@/components/admin/RiderDeliveries';

export const dynamic = 'force-dynamic';

// Riders only. (The API enforces this too; this just keeps other roles from landing on a page that cannot load.)
export default async function RiderPage() {
  const rider = await getStaff(['rider']);
  if (!rider) {
    const anyStaff = await getStaff();
    redirect(anyStaff?.role === 'kitchen' ? '/admin/kitchen' : '/admin');
  }
  return <RiderDeliveries />;
}
