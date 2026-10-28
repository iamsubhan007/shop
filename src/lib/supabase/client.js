import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseAnonKey.includes('placeholder')
  );
};

let supabaseInstance = null;

export function getSupabaseClient() {
  if (!supabaseInstance) {
    if (isSupabaseConfigured()) {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    } else {
      // Mock/stub client that prevents crashing when env vars are not yet configured
      supabaseInstance = createClient(
        'https://placeholder-project.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder'
      );
    }
  }
  return supabaseInstance;
}

export const supabase = getSupabaseClient();
