-- ==============================================================================
-- HAQ BAHU NAAN SHOP - COMPLETE ALL-IN-ONE SUPABASE DATABASE SETUP
-- Copy and paste this ENTIRE file into your Supabase Dashboard -> SQL Editor and click 'Run'.
-- This sets up all tables, security policies, storage buckets, and initial food data!
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. ENUMS
do $$ begin
  create type user_role as enum ('customer', 'admin', 'staff');
exception
  when duplicate_object then null;
end $$;

-- 3. PROFILES TABLE (Linked with auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin', 'staff')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger to automatically create a profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, profiles.full_name),
      updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper function to check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
declare
  current_role text;
begin
  select role into current_role from public.profiles where id = auth.uid();
  return current_role = 'admin';
end;
$$ language plpgsql security definer;

-- 4. CATEGORIES TABLE
create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 5. PRODUCTS TABLE
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  is_available boolean default true,
  is_featured boolean default false,
  image_url text,
  additional_images text[] default '{}',
  genre text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. DEALS / COMBOS TABLE
create table if not exists public.deals (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  items text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. WISHLIST TABLE
create table if not exists public.wishlist (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_id, product_id)
);

-- 8. CART ITEMS TABLE
create table if not exists public.cart_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 9. ORDERS TABLE
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text unique not null,
  user_id uuid references public.profiles(id) on delete set null,
  order_type text not null check (order_type in ('delivery', 'pickup')),
  status text not null default 'Payment Pending' check (
    status in ('Pending', 'Payment Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Completed', 'Cancelled')
  ),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_address text,
  delivery_lat numeric(10,7),
  delivery_lng numeric(10,7),
  distance_km numeric(6,2),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'verified', 'rejected')),
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer', 'easypaisa', 'jazzcash', 'cash')),
  payment_reference text,
  payment_proof_url text,
  special_instructions text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 10. ORDER ITEMS TABLE
create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  item_title text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  subtotal_price numeric(10,2) not null check (subtotal_price >= 0),
  notes text,
  created_at timestamptz default now()
);

-- 11. PAYMENT SUBMISSIONS TABLE
create table if not exists public.payment_submissions (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  payment_method text not null default 'bank_transfer',
  bank_name text,
  transaction_reference text not null,
  sender_account text,
  proof_image_url text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  admin_notes text,
  submitted_at timestamptz default now(),
  verified_at timestamptz
);

-- 12. SHOP SETTINGS TABLE
create table if not exists public.shop_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

-- 13. INDEXES
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_available on public.products(is_available);
create index if not exists idx_orders_user on public.orders(user_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_wishlist_user on public.wishlist(user_id);
create index if not exists idx_cart_user on public.cart_items(user_id);
create index if not exists idx_payments_order on public.payment_submissions(order_id);

-- 14. ROW LEVEL SECURITY (RLS) POLICIES
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.deals enable row level security;
alter table public.wishlist enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.shop_settings enable row level security;

-- Drop existing policies if any to allow safe re-running
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Anyone can view categories" on public.categories;
drop policy if exists "Only admin can modify categories" on public.categories;
drop policy if exists "Anyone can view products" on public.products;
drop policy if exists "Only admin can modify products" on public.products;
drop policy if exists "Anyone can view deals" on public.deals;
drop policy if exists "Only admin can modify deals" on public.deals;
drop policy if exists "Users can view their own wishlist" on public.wishlist;
drop policy if exists "Users can insert into their own wishlist" on public.wishlist;
drop policy if exists "Users can delete from their own wishlist" on public.wishlist;
drop policy if exists "Users can view their own cart items" on public.cart_items;
drop policy if exists "Users can insert into their own cart" on public.cart_items;
drop policy if exists "Users can update their own cart items" on public.cart_items;
drop policy if exists "Users can delete from their own cart" on public.cart_items;
drop policy if exists "Users can view their own orders" on public.orders;
drop policy if exists "Anyone can insert orders" on public.orders;
drop policy if exists "Only admins can update orders" on public.orders;
drop policy if exists "Only admins can delete orders" on public.orders;
drop policy if exists "Users can view order items for their orders" on public.order_items;
drop policy if exists "Anyone can insert order items" on public.order_items;
drop policy if exists "Only admins can modify order items" on public.order_items;
drop policy if exists "Users can view their own payment submissions" on public.payment_submissions;
drop policy if exists "Anyone can insert payment submissions" on public.payment_submissions;
drop policy if exists "Only admins can update payment submissions" on public.payment_submissions;
drop policy if exists "Anyone can view shop settings" on public.shop_settings;
drop policy if exists "Only admins can modify shop settings" on public.shop_settings;

-- PROFILES
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- CATEGORIES
create policy "Anyone can view categories"
  on public.categories for select
  using (true);

create policy "Only admin can modify categories"
  on public.categories for all
  using (public.is_admin());

-- PRODUCTS
create policy "Anyone can view products"
  on public.products for select
  using (true);

create policy "Only admin can modify products"
  on public.products for all
  using (public.is_admin());

-- DEALS
create policy "Anyone can view deals"
  on public.deals for select
  using (true);

create policy "Only admin can modify deals"
  on public.deals for all
  using (public.is_admin());

-- WISHLIST
create policy "Users can view their own wishlist"
  on public.wishlist for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert into their own wishlist"
  on public.wishlist for insert
  with check (auth.uid() = user_id);

create policy "Users can delete from their own wishlist"
  on public.wishlist for delete
  using (auth.uid() = user_id or public.is_admin());

-- CART ITEMS
create policy "Users can view their own cart items"
  on public.cart_items for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert into their own cart"
  on public.cart_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cart items"
  on public.cart_items for update
  using (auth.uid() = user_id);

create policy "Users can delete from their own cart"
  on public.cart_items for delete
  using (auth.uid() = user_id or public.is_admin());

-- ORDERS
create policy "Users can view their own orders"
  on public.orders for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Anyone can insert orders"
  on public.orders for insert
  with check (true);

create policy "Only admins can update orders"
  on public.orders for update
  using (public.is_admin());

create policy "Only admins can delete orders"
  on public.orders for delete
  using (public.is_admin());

-- ORDER ITEMS
create policy "Users can view order items for their orders"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
      and (orders.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Anyone can insert order items"
  on public.order_items for insert
  with check (true);

create policy "Only admins can modify order items"
  on public.order_items for all
  using (public.is_admin());

-- PAYMENT SUBMISSIONS
create policy "Users can view their own payment submissions"
  on public.payment_submissions for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Anyone can insert payment submissions"
  on public.payment_submissions for insert
  with check (true);

create policy "Only admins can update payment submissions"
  on public.payment_submissions for update
  using (public.is_admin());

-- SHOP SETTINGS
create policy "Anyone can view shop settings"
  on public.shop_settings for select
  using (true);

create policy "Only admins can modify shop settings"
  on public.shop_settings for all
  using (public.is_admin());

-- 15. STORAGE BUCKETS
insert into storage.buckets (id, name, public)
values ('food-images', 'food-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do nothing;

-- 16. SEED DATA

-- Shop Settings
insert into public.shop_settings (key, value, description)
values
  ('delivery_config', '{
    "shop_name": "Haq Bahu Naan Shop",
    "shop_address": "Shop # 4, Model Town Link Rd, Model Town, Lahore, Pakistan",
    "latitude": 31.4828,
    "longitude": 74.3168,
    "max_delivery_radius_km": 3.0,
    "delivery_fee_rs": 100,
    "free_delivery_threshold_rs": 2500,
    "is_accepting_orders": true,
    "operating_hours": "11:00 AM - 12:00 AM (Midnight)"
  }'::jsonb, 'Shop geolocation and delivery radius configuration'),

  ('bank_transfer_details', '{
    "bank_name": "Meezan Bank Limited",
    "account_title": "HAQ BAHU NAAN SHOP",
    "account_number": "02010108923451",
    "iban": "PK36MEZN0002010108923451",
    "branch_name": "Model Town Branch, Lahore",
    "easypaisa_number": "03094130285",
    "easypaisa_title": "Haq Bahu Naan",
    "jazzcash_number": "03094130285",
    "jazzcash_title": "Haq Bahu Naan",
    "instructions": "Transfer the total order amount to our bank account or mobile wallet. After transferring, upload the screenshot of the payment receipt or enter the transaction reference ID (TRX ID). Your order will be confirmed immediately once verified."
  }'::jsonb, 'Bank transfer and mobile wallet payment instructions')
on conflict (key) do update
set value = excluded.value, updated_at = now();

-- Categories
insert into public.categories (name, slug, description, sort_order)
values
  ('Special Items', 'special-items', 'Our signature handcrafted tandoori and sweet naans', 1),
  ('Chicken Naan', 'chicken-naan', 'Tender shredded chicken stuffed inside piping hot naans', 2),
  ('Beef Qeema Naan', 'beef-qeema-naan', 'Minced spiced beef baked to perfection', 3),
  ('Mutton Naan', 'mutton-naan', 'Premium tender mutton qeema filled naans', 4),
  ('Rogni Naan', 'rogni-naan', 'Traditional sesame seed and butter enriched rogani naans', 5),
  ('Aloo Wala Naan', 'aloo-wala-naan', 'Spiced potato stuffed classical Punjabi naans', 6),
  ('Besaan Wala Naan', 'besaan-wala-naan', 'Gram flour coated spiced traditional naans', 7),
  ('Tikka Boti & Kababs', 'tikka-boti', 'Smoky grilled chicken tikka and juicy kababs', 8),
  ('Pratha', 'pratha', 'Crispy flaky tandoori and pan parathas', 9),
  ('Regular Items', 'regular-items', 'Daily fresh baked plain and khameeri naans', 10),
  ('Sides & Sauces', 'sides-and-sauces', 'Fresh raita, mint chutney, and accompaniments', 11)
on conflict (slug) do nothing;

-- Products
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Nutella Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked warm fluffy naan loaded with rich molten Nutella.', 500, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/Nutella.jpg', 'Special'),
  ('Tandoori Pizza Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked fusion naan stuffed with cheese, chicken chunks, and pizza sauce.', 500, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/pizza_naan.jpg', 'Special'),
  ('Tandoori Shawarma Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked naan filled with shawarma spiced chicken and garlic mayo.', 400, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/shawarma.jpg', 'Special'),
  ('Cheese Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked naan oozing with melted mozzarella and cheddar cheese.', 400, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/cheese.jpg', 'Special'),
  ('Special Chicken Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'chicken-naan'), 'Freshly baked with spiced chicken, loaded cheese, butter glaze, and sesame seeds.', 670, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/chicken%20naan.jpg', 'Chicken'),
  ('Special Chicken Achaari Makhan Rogni Naan', (select id from public.categories where slug = 'chicken-naan'), 'Tangy achar spices combined with tender chicken and buttery rogani naan.', 620, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/chicken%20naan.jpg', 'Chicken'),
  ('Special Chicken Makhan Rogni Naan', (select id from public.categories where slug = 'chicken-naan'), 'Butter-brushed chicken rogani naan baked in traditional clay tandoor.', 570, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/chicken%20naan.jpg', 'Chicken'),
  ('Chicken Cheese Makhan Naan', (select id from public.categories where slug = 'chicken-naan'), 'Melt-in-mouth chicken and cheese naan topped with fresh country butter.', 470, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/chicken%20naan.jpg', 'Chicken'),
  ('Chicken Achaari Naan', (select id from public.categories where slug = 'chicken-naan'), 'Spicy chicken with zesty pickling masala.', 300, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/chicken%20naan.jpg', 'Chicken'),
  ('Chicken Qeema Naan', (select id from public.categories where slug = 'chicken-naan'), 'Classic spiced chicken mince filling inside hot crispy naan.', 250, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/chicken%20naan.jpg', 'Chicken'),
  ('Special Beef Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Supreme spiced beef mince, rich mozzarella, fresh butter, and rogani sesame.', 670, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef2.jpg', 'Beef'),
  ('Special Beef Achaari Makhan Rogni Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Aromatic beef keema with pickle punch and melting butter.', 620, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef.jpg', 'Beef'),
  ('Special Beef Makhan Rogni Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Juicy beef mince with fresh butter on golden rogani naan.', 570, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef1.jpg', 'Beef'),
  ('Beef Cheese Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Savory beef mince enveloped with stringy cheese.', 370, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef2.jpg', 'Beef'),
  ('Beef Qeema Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Authentic Lahore-style seasoned beef mince stuffed naan.', 250, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef.jpg', 'Beef'),
  ('Special Mutton Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'mutton-naan'), 'Royal mutton qeema, cheese blend, pure butter, and roasted sesame seeds.', 1170, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef%20paratha%20naan%20.jpg', 'Mutton'),
  ('Special Mutton Achaari Makhan Rogni Naan', (select id from public.categories where slug = 'mutton-naan'), 'Premium tender mutton qeema with spicy pickles and butter glaze.', 1020, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef%20paratha%20naan%20.jpg', 'Mutton'),
  ('Special Mutton Makhan Rogni Naan', (select id from public.categories where slug = 'mutton-naan'), 'Authentic clay tandoor mutton rogani naan with generous butter.', 970, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef%20paratha%20naan%20.jpg', 'Mutton'),
  ('Special Mutton Achaari Naan', (select id from public.categories where slug = 'mutton-naan'), 'Pickled spiced mutton qeema naan.', 850, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef%20paratha%20naan%20.jpg', 'Mutton'),
  ('Special Mutton Qeema Naan', (select id from public.categories where slug = 'mutton-naan'), 'Original spiced minced mutton baked over hot charcoal.', 800, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/beef%20paratha%20naan%20.jpg', 'Mutton'),
  ('Special Aloo Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'Mashed spiced potatoes with cheese and melting butter in rogani crust.', 420, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/alooo%20nan.jpg', 'Aloo'),
  ('Special Aloo Makhan Rogni Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'Buttery potato naan sprinkled with black cumin and sesame seeds.', 320, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/alooo%20nan.jpg', 'Aloo'),
  ('Aloo Cheese Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'Traditional spiced aloo stuffing with molten cheese.', 270, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/alooo%20nan.jpg', 'Aloo'),
  ('Classic Aloo Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'The authentic street food style coriander and chili potato naan.', 150, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/alooo%20nan.jpg', 'Aloo'),
  ('Special Besaan Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'besaan-wala-naan'), 'Crispy golden gram flour batter with herbs, cheese, and butter.', 420, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/baisan%20naan%20.png', 'Besaan'),
  ('Besaan Makhan Naan', (select id from public.categories where slug = 'besaan-wala-naan'), 'Savory chickpea batter coated naan topped with fresh desi butter.', 270, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/baisan.jpg', 'Besaan'),
  ('Traditional Besaan Naan', (select id from public.categories where slug = 'besaan-wala-naan'), 'Lahore iconic crispy besan naan spiced with cumin and pomegranate seeds.', 150, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/baisan.jpg', 'Besaan'),
  ('Special Makhan Rogani Naan', (select id from public.categories where slug = 'rogni-naan'), 'Rich pillowy naan baked with egg wash, sesame seeds, and pure butter.', 200, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/Rogni.jpg', 'Rogni'),
  ('Rogani Garlic Naan', (select id from public.categories where slug = 'rogni-naan'), 'Infused with roasted garlic cloves, fresh herbs, and butter.', 220, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/rogni%20garlic%20naan.jpg', 'Rogni'),
  ('Plain Rogani Naan', (select id from public.categories where slug = 'rogni-naan'), 'Classical sesame seed crusted golden rogani naan.', 120, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/plain%20rogani%20naan.jpg', 'Rogni'),
  ('Special Lachha Tandoori Paratha', (select id from public.categories where slug = 'pratha'), 'Multi-layered flaky crispy paratha baked directly on tandoor walls.', 150, true, true, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/pratha.jpg', 'Pratha'),
  ('Desi Ghee Paratha', (select id from public.categories where slug = 'pratha'), 'Rich aromatic tandoori paratha roasted with pure Desi Ghee.', 200, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/pratha1.jpg', 'Pratha'),
  ('Meetha Paratha', (select id from public.categories where slug = 'pratha'), 'Sweet crispy layered paratha baked golden brown.', 150, true, false, '/pratha2.jpg', 'Pratha'),
  ('Khameeri Roti', (select id from public.categories where slug = 'regular-items'), 'Traditional fermented tandoori roti, soft and light.', 30, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/regular.jpg', 'Regular'),
  ('Sada Naan', (select id from public.categories where slug = 'regular-items'), 'Daily fresh baked fluffy plain tandoori naan.', 40, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/sada.jpg', 'Regular'),
  ('Kulcha', (select id from public.categories where slug = 'regular-items'), 'Lightly salted pillowy round tandoori kulcha.', 50, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/kulcha.jpg', 'Regular'),
  ('Kalwanji Naan', (select id from public.categories where slug = 'regular-items'), 'Naan studded with nigella seeds (kalonji) for earthy aroma.', 60, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/kalwanji.jpg', 'Regular'),
  ('Zeera Mint Raita', (select id from public.categories where slug = 'sides-and-sauces'), 'Chilled whisked yogurt with roasted cumin and fresh garden mint.', 60, true, false, 'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/raita.jpg', 'Side');

-- Deals
insert into public.deals (title, description, price, image_url, items, is_active)
values
  (
    'Crazy Deal 1',
    '2x Tandoori Pizza Naan + 1x 500ml Chilled Cola Next. Ultimate feast for two!',
    1050,
    'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/deal1.png',
    array['2 Tandoori Pizza Naan', '1 Chilled 500ml Cola Next'],
    true
  ),
  (
    'Crazy Deal 2',
    '5x Choice of Chicken or Beef Naan + 1x 500ml Chilled Cola Next. Family favorite!',
    1400,
    'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/deal2.png',
    array['5 Chicken / Beef Qeema Naan', '1 Chilled 500ml Cola Next'],
    true
  ),
  (
    'Crazy Deal 3',
    '5x Spiced Aloo Naan + 1x Fresh Zeera Raita + 1x 500ml Chilled Cola Next.',
    950,
    'https://tnctpbrkpvjzplnstzsg.supabase.co/storage/v1/object/public/food-images/deal3.png',
    array['5 Aloo Wala Naan', '1 Fresh Zeera Raita', '1 Chilled 500ml Cola Next'],
    true
  );
