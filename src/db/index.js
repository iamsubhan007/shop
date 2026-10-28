import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { supabase } from '@/lib/supabase/client';
import { createAdminClient } from '@/lib/supabase/admin';

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  try {
    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    dbInstance = drizzle(client, { schema });
    return dbInstance;
  } catch (err) {
    console.warn('Postgres connection failed, falling back to Supabase client:', err.message);
    return null;
  }
}

export const db = getDb();
export { schema };

// ========================================================
// DATA ACCESS LAYER: Drizzle with Supabase client fallback
// ========================================================

/**
 * Fetch all categories from Supabase / Drizzle
 */
export async function getDbCategories() {
  try {
    const client = createAdminClient() || supabase;
    const { data, error } = await client
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('Error fetching categories from DB:', err.message);
  }
  return null;
}

/**
 * Fetch products from Supabase / Drizzle
 */
export async function getDbProducts(filter = {}) {
  try {
    const client = createAdminClient() || supabase;
    let query = client.from('products').select('*, categories(name, slug)');

    if (filter.isAvailable !== undefined) {
      query = query.eq('is_available', filter.isAvailable);
    }
    if (filter.isFeatured !== undefined) {
      query = query.eq('is_featured', filter.isFeatured);
    }
    if (filter.genre && filter.genre !== 'All') {
      query = query.eq('genre', filter.genre);
    }

    const { data, error } = await query.order('name', { ascending: true });
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('Error fetching products from DB:', err.message);
  }
  return null;
}

/**
 * Fetch deals from Supabase / Drizzle
 */
export async function getDbDeals() {
  try {
    const client = createAdminClient() || supabase;
    const { data, error } = await client
      .from('deals')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('Error fetching deals from DB:', err.message);
  }
  return null;
}

/**
 * Fetch shop settings & bank details from Supabase / Drizzle
 */
export async function getDbShopSettings() {
  try {
    const client = createAdminClient() || supabase;
    const { data, error } = await client.from('shop_settings').select('*');

    if (!error && data && data.length > 0) {
      const settingsMap = {};
      data.forEach((row) => {
        settingsMap[row.key] = row.value;
      });
      return settingsMap;
    }
  } catch (err) {
    console.warn('Error fetching settings from DB:', err.message);
  }
  return null;
}
