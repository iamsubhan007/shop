-- ==============================================================================
-- HAQ BAHU NAAN SHOP - SUPABASE PRODUCTION DATABASE SCHEMA & RLS POLICIES
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. ENUMS & DOMAINS
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
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper security definer function to check if current user is admin
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
  updated_at timestamptz default now(),
  constraint product_or_deal_check check (
    (product_id is not null and deal_id is null) or
    (product_id is null and deal_id is not null)
  )
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

-- 12. SHOP SETTINGS TABLE (Configurable delivery radius, shop coords, bank details)
create table if not exists public.shop_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_available on public.products(is_available);
create index if not exists idx_orders_user on public.orders(user_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_wishlist_user on public.wishlist(user_id);
create index if not exists idx_cart_user on public.cart_items(user_id);
create index if not exists idx_payments_order on public.payment_submissions(order_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
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

-- PROFILES POLICIES
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- CATEGORIES POLICIES
create policy "Anyone can view categories"
  on public.categories for select
  using (true);

create policy "Only admin can modify categories"
  on public.categories for all
  using (public.is_admin());

-- PRODUCTS POLICIES
create policy "Anyone can view products"
  on public.products for select
  using (true);

create policy "Only admin can modify products"
  on public.products for all
  using (public.is_admin());

-- DEALS POLICIES
create policy "Anyone can view deals"
  on public.deals for select
  using (true);

create policy "Only admin can modify deals"
  on public.deals for all
  using (public.is_admin());

-- WISHLIST POLICIES
create policy "Users can view their own wishlist"
  on public.wishlist for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert into their own wishlist"
  on public.wishlist for insert
  with check (auth.uid() = user_id);

create policy "Users can delete from their own wishlist"
  on public.wishlist for delete
  using (auth.uid() = user_id or public.is_admin());

-- CART ITEMS POLICIES
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

-- ORDERS POLICIES
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

-- ORDER ITEMS POLICIES
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

-- PAYMENT SUBMISSIONS POLICIES
create policy "Users can view their own payment submissions"
  on public.payment_submissions for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Anyone can insert payment submissions"
  on public.payment_submissions for insert
  with check (true);

create policy "Only admins can update payment submissions"
  on public.payment_submissions for update
  using (public.is_admin());

-- SHOP SETTINGS POLICIES
create policy "Anyone can view shop settings"
  on public.shop_settings for select
  using (true);

create policy "Only admins can modify shop settings"
  on public.shop_settings for all
  using (public.is_admin());

-- ==============================================================================
-- STORAGE BUCKETS CONFIGURATION (Execute in Supabase SQL editor)
-- ==============================================================================
insert into storage.buckets (id, name, public)
values ('food-images', 'food-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do nothing;

-- Storage RLS
create policy "Public read food images"
  on storage.objects for select
  using (bucket_id = 'food-images');

create policy "Admin upload food images"
  on storage.objects for insert
  with check (bucket_id = 'food-images' and (auth.role() = 'authenticated'));

create policy "Admin delete food images"
  on storage.objects for delete
  using (bucket_id = 'food-images' and (auth.role() = 'authenticated'));

create policy "Public read payment proofs"
  on storage.objects for select
  using (bucket_id = 'payment-proofs');

create policy "Anyone upload payment proofs"
  on storage.objects for insert
  with check (bucket_id = 'payment-proofs');
