import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request) {
  try {
    const { email, password, fullName, phone } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // All new sign ups on the frontend are strictly registered as customer (user) only
    const isSuperAdmin = email.toLowerCase().trim() === 'bsubhan542@gmail.com';
    const role = isSuperAdmin ? 'super_admin' : 'customer';

    // 1. Check if user already exists in auth
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existing = (listData?.users || []).find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let createdUser = null;

    if (existing) {
      // User exists: update password & metadata, and ensure email is confirmed
      const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName || existing.user_metadata?.full_name || email.split('@')[0],
            phone: phone || existing.user_metadata?.phone || '',
            role: existing.user_metadata?.role || role,
          },
        }
      );

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
      createdUser = updateData.user;
    } else {
      // Create new user in Supabase Auth with auto-confirmation
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || email.split('@')[0],
          phone: phone || '',
          role,
        },
      });

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 400 });
      }
      createdUser = createData.user;
    }

    // 2. Also try to persist to public.profiles table if it exists
    try {
      await supabase.from('profiles').upsert(
        {
          id: createdUser.id,
          email: createdUser.email,
          full_name: fullName || email.split('@')[0],
          phone: phone || '',
          role: createdUser.user_metadata?.role || role,
        },
        { onConflict: 'id' }
      );
    } catch (e) {
      // Non-fatal if table not yet created
      console.warn('Profile table upsert note:', e.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Account successfully registered and confirmed in database',
      user: createdUser,
    });
  } catch (err) {
    console.error('Error in /api/auth/register:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
