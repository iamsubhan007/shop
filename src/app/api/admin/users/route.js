import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    // List all users from Supabase Auth
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 400 });
    }

    // Also get profiles if available
    const { data: profiles } = await supabase.from('profiles').select('*');
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const users = (listData?.users || []).map((u) => {
      const p = profileMap.get(u.id);
      const isSuper =
        u.email?.toLowerCase() === 'bsubhan542@gmail.com' ||
        u.user_metadata?.role === 'super_admin';
      const role = isSuper ? 'super_admin' : (p?.role || u.user_metadata?.role || 'customer');

      return {
        id: u.id,
        email: u.email,
        full_name: p?.full_name || u.user_metadata?.full_name || u.email?.split('@')[0],
        phone: p?.phone || u.user_metadata?.phone || '',
        role,
        is_super_admin: isSuper,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error('Error fetching admin users:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { email, password, fullName, phone, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const assignedRole = role === 'admin' ? 'admin' : 'customer';

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || email.split('@')[0],
        phone: phone || '',
        role: assignedRole,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Sync into profiles table
    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: data.user.email,
        full_name: fullName || email.split('@')[0],
        phone: phone || '',
        role: assignedRole,
      });
    } catch (e) {
      console.warn('Profile table sync note:', e.message);
    }

    return NextResponse.json({
      success: true,
      message: `User created successfully with role: ${assignedRole}`,
      user: data.user,
    });
  } catch (err) {
    console.error('Error creating admin user:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json({ error: 'User ID and new role are required' }, { status: 400 });
    }

    if (!['admin', 'customer'].includes(role)) {
      return NextResponse.json({ error: 'Role must be admin or customer' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    // Prevent demoting primary super admin
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (userData?.user?.email?.toLowerCase() === 'bsubhan542@gmail.com') {
      return NextResponse.json(
        { error: 'Cannot modify role of the primary Super Admin account.' },
        { status: 403 }
      );
    }

    // Update user_metadata in Auth
    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(userData?.user?.user_metadata || {}),
        role,
      },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Update profiles table
    try {
      await supabase.from('profiles').update({ role }).eq('id', userId);
    } catch (e) {
      console.warn('Profile update note:', e.message);
    }

    return NextResponse.json({
      success: true,
      message: `User role updated to ${role}`,
    });
  } catch (err) {
    console.error('Error updating user role:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id') || searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    // Prevent deleting primary super admin
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (userData?.user?.email?.toLowerCase() === 'bsubhan542@gmail.com') {
      return NextResponse.json(
        { error: 'Cannot delete the primary Super Admin account.' },
        { status: 403 }
      );
    }

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
