import { NextResponse } from 'next/server';
import { getFallbackOrder, updateFallbackOrderStatus } from '@/lib/orderStore';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const adminSupabase = createAdminClient();

    if (adminSupabase) {
      const { data, error } = await adminSupabase
        .from('orders')
        .select(`
          *,
          items:order_items(*),
          payments:payment_submissions(*)
        `)
        .or(`id.eq.${id},order_number.eq.${id}`)
        .single();

      if (!error && data) {
        return NextResponse.json({ order: data });
      }
    }

    const order = getFallbackOrder(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (err) {
    console.error('Error fetching order details:', err);
    return NextResponse.json({ error: 'Server error retrieving order' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, paymentStatus, paymentReference, paymentProofUrl, adminNotes } = body;

    const updates = {};
    if (status) updates.status = status;
    if (paymentStatus) updates.payment_status = paymentStatus;
    if (paymentReference) updates.payment_reference = paymentReference;
    if (paymentProofUrl) updates.payment_proof_url = paymentProofUrl;

    const adminSupabase = createAdminClient();
    if (adminSupabase) {
      const { data, error } = await adminSupabase
        .from('orders')
        .update(updates)
        .or(`id.eq.${id},order_number.eq.${id}`)
        .select()
        .single();

      if (!error && data) {
        // If payment submission exists, update it too
        if (paymentStatus) {
          await adminSupabase
            .from('payment_submissions')
            .update({
              status: paymentStatus,
              admin_notes: adminNotes || null,
              verified_at: paymentStatus === 'verified' ? new Date().toISOString() : null,
            })
            .eq('order_id', data.id);
        }

        return NextResponse.json({ success: true, order: data });
      }
    }

    // Fallback store update
    const updated = updateFallbackOrderStatus(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, order: updated });
  } catch (err) {
    console.error('Error updating order:', err);
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
  }
}
