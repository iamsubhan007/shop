import { NextResponse } from 'next/server';
import { initialCategories } from '@/lib/data/initialData';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return NextResponse.json({ categories: data, source: 'supabase' });
      }
    }

    return NextResponse.json({ categories: initialCategories, source: 'local' });
  } catch (err) {
    console.error('Error in /api/categories GET:', err);
    return NextResponse.json({ categories: initialCategories, source: 'local_fallback' });
  }
}
