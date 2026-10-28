import { NextResponse } from 'next/server';
import { initialShopSettings, initialBankDetails } from '@/lib/data/initialData';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    if (supabase) {
      const { data, error } = await supabase.from('shop_settings').select('*');

      if (!error && data && data.length > 0) {
        const settingsMap = {};
        data.forEach((row) => {
          settingsMap[row.key] = row.value;
        });

        return NextResponse.json({
          shopSettings: settingsMap.delivery_config || initialShopSettings,
          bankSettings: settingsMap.bank_transfer_details || initialBankDetails,
          source: 'supabase',
        });
      }
    }

    return NextResponse.json({
      shopSettings: initialShopSettings,
      bankSettings: initialBankDetails,
      source: 'local',
    });
  } catch (err) {
    console.error('Error in /api/settings GET:', err);
    return NextResponse.json({
      shopSettings: initialShopSettings,
      bankSettings: initialBankDetails,
      source: 'local_fallback',
    });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { shopSettings, bankSettings } = body;

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    const updates = [];
    if (shopSettings) {
      updates.push({
        key: 'delivery_config',
        value: shopSettings,
        description: 'Shop geolocation and delivery radius configuration',
      });
    }
    if (bankSettings) {
      updates.push({
        key: 'bank_transfer_details',
        value: bankSettings,
        description: 'Bank transfer and mobile wallet payment instructions',
      });
    }

    for (const item of updates) {
      const { error } = await supabase.from('shop_settings').upsert(item, { onConflict: 'key' });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true, message: 'Settings saved to database' });
  } catch (err) {
    console.error('Error in /api/settings PUT:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
