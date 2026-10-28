import { NextResponse } from 'next/server';
import { fallbackOrders } from '@/lib/orderStore';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const admin = searchParams.get('admin');

    const adminSupabase = createAdminClient();

    if (adminSupabase) {
      let query = adminSupabase
        .from('orders')
        .select(`
          *,
          items:order_items(*)
        `)
        .order('created_at', { ascending: false });

      if (userId && !admin) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return NextResponse.json({ orders: data });
      }
    }

    // Fallback store
    let list = [...fallbackOrders];
    if (userId && !admin) {
      list = list.filter((o) => o.user_id === userId);
    }

    return NextResponse.json({ orders: list });
  } catch (err) {
    console.error('Error fetching orders:', err);
    return NextResponse.json({ error: 'Failed to retrieve orders' }, { status: 500 });
  }
}
