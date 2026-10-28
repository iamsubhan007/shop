import { NextResponse } from 'next/server';
import { initialProducts } from '@/lib/data/initialData';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const genre = searchParams.get('genre');
    const availableOnly = searchParams.get('available') === 'true';

    const supabase = createAdminClient();
    if (supabase) {
      let query = supabase.from('products').select('*');
      if (availableOnly) {
        query = query.eq('is_available', true);
      }
      if (genre && genre !== 'All') {
        query = query.eq('genre', genre);
      }

      const { data, error } = await query.order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        return NextResponse.json({ products: data, source: 'supabase' });
      }
    }

    // Fallback to initial local products
    let fallback = [...initialProducts];
    if (availableOnly) {
      fallback = fallback.filter((p) => p.is_available !== false);
    }
    if (genre && genre !== 'All') {
      fallback = fallback.filter((p) => p.genre === genre);
    }

    return NextResponse.json({ products: fallback, source: 'local' });
  } catch (err) {
    console.error('Error in /api/products GET:', err);
    return NextResponse.json({ products: initialProducts, source: 'local_fallback' });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    const { data, error } = await supabase.from('products').insert([body]).select().single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (err) {
    console.error('Error in /api/products POST:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: data });
  } catch (err) {
    console.error('Error in /api/products PATCH:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in /api/products DELETE:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
