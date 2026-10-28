import { NextResponse } from 'next/server';
import { initialDeals } from '@/lib/data/initialData';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return NextResponse.json({ deals: data, source: 'supabase' });
      }
    }

    return NextResponse.json({ deals: initialDeals, source: 'local' });
  } catch (err) {
    console.error('Error in /api/deals GET:', err);
    return NextResponse.json({ deals: initialDeals, source: 'local_fallback' });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    const { data, error } = await supabase.from('deals').insert([body]).select().single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ deal: data }, { status: 201 });
  } catch (err) {
    console.error('Error in /api/deals POST:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Deal ID is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    const { data, error } = await supabase.from('deals').update(updates).eq('id', id).select().single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ deal: data });
  } catch (err) {
    console.error('Error in /api/deals PATCH:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
