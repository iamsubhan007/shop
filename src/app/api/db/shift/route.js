import { NextResponse } from 'next/server';
import {
  initialShopSettings,
  initialBankDetails,
  initialCategories,
  initialProducts,
  initialDeals,
} from '@/lib/data/initialData';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    const report = {
      categories: 0,
      products: 0,
      deals: 0,
      settings: 0,
      errors: [],
    };

    // 1. Shift Categories
    const categoryMap = {};
    for (const cat of initialCategories) {
      const { data, error } = await supabase
        .from('categories')
        .upsert(
          {
            name: cat.name,
            slug: cat.slug,
            description: `${cat.name} from Haq Bahu Naan authentic clay tandoor`,
            sort_order: cat.sort_order,
            is_active: true,
          },
          { onConflict: 'slug' }
        )
        .select('id, slug')
        .single();

      if (error) {
        report.errors.push(`Category ${cat.name}: ${error.message}`);
      } else if (data) {
        categoryMap[cat.slug] = data.id;
        report.categories++;
      }
    }

    // Refresh category map
    const { data: allCats } = await supabase.from('categories').select('id, slug');
    if (allCats) {
      allCats.forEach((c) => {
        categoryMap[c.slug] = c.id;
      });
    }

    // 2. Helper to get Supabase Storage URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const getStorageUrl = (img) => {
      if (!img) return img;
      if (img.startsWith('http://') || img.startsWith('https://')) return img;
      const clean = img.startsWith('/') ? img.slice(1) : img;
      return `${supabaseUrl}/storage/v1/object/public/food-images/${encodeURIComponent(clean)}`;
    };

    // 3. Shift Products
    for (const prod of initialProducts) {
      const cat = initialCategories.find((c) => c.id === prod.category_id);
      const catSlug = cat ? cat.slug : 'regular-items';
      const catId = categoryMap[catSlug] || null;

      const prodPayload = {
        name: prod.name,
        category_id: catId,
        description: prod.description || '',
        price: prod.price,
        is_available: prod.is_available !== false,
        is_featured: prod.is_featured === true,
        image_url: getStorageUrl(prod.image_url),
        additional_images: (prod.additional_images || []).map(getStorageUrl),
        genre: prod.genre || 'Regular',
      };

      const { error } = await supabase.from('products').upsert(prodPayload, { onConflict: 'name' });
      if (error) {
        report.errors.push(`Product ${prod.name}: ${error.message}`);
      } else {
        report.products++;
      }
    }

    // 4. Shift Deals
    for (const deal of initialDeals) {
      const dealPayload = {
        title: deal.title,
        description: deal.description,
        price: deal.price,
        image_url: getStorageUrl(deal.image_url),
        items: deal.items || [],
        badge: deal.badge || null,
        is_active: deal.is_active !== false,
      };

      const { error } = await supabase.from('deals').upsert(dealPayload, { onConflict: 'title' });
      if (error) {
        report.errors.push(`Deal ${deal.title}: ${error.message}`);
      } else {
        report.deals++;
      }
    }

    // 5. Shift Settings
    const settings = [
      {
        key: 'delivery_config',
        value: initialShopSettings,
        description: 'Shop geolocation and delivery radius configuration',
      },
      {
        key: 'bank_transfer_details',
        value: initialBankDetails,
        description: 'Bank transfer and mobile wallet payment instructions',
      },
    ];

    for (const s of settings) {
      const { error } = await supabase.from('shop_settings').upsert(s, { onConflict: 'key' });
      if (error) {
        report.errors.push(`Setting ${s.key}: ${error.message}`);
      } else {
        report.settings++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Data successfully shifted to Supabase database!',
      report,
    });
  } catch (err) {
    console.error('Error shifting data:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
