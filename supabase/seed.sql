-- ==============================================================================
-- HAQ BAHU NAAN SHOP - SUPABASE SEED DATA
-- Run this in your Supabase SQL Editor after running schema.sql
-- ==============================================================================

-- 1. SHOP SETTINGS (Coordinates for Haq Bahu Naan Shop, Model Town Lahore)
insert into public.shop_settings (key, value, description)
values
  ('delivery_config', '{
    "shop_name": "Haq Bahu Naan Shop",
    "shop_address": "Shop # 4, Model Town Link Rd, near Model Town Metro / Model Town, Lahore, Pakistan",
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
    "instructions": "Please transfer the exact order amount to the bank account or mobile wallet above. After transferring, upload the screenshot of the payment receipt or enter the transaction reference ID (TRX ID). Your order will be confirmed immediately once verified."
  }'::jsonb, 'Bank transfer and mobile wallet payment instructions')
on conflict (key) do update
set value = excluded.value, updated_at = now();

-- 2. CATEGORIES
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

-- 3. PRODUCTS
-- Special Items
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Nutella Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked warm fluffy naan loaded with rich molten Nutella.', 500, true, true, '/Nutella.jpg', 'Special'),
  ('Tandoori Pizza Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked fusion naan stuffed with cheese, chicken chunks, and pizza sauce.', 500, true, true, '/pizza_naan.jpg', 'Special'),
  ('Tandoori Shawarma Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked naan filled with shawarma spiced chicken and garlic mayo.', 400, true, true, '/shawarma.jpg', 'Special'),
  ('Cheese Naan', (select id from public.categories where slug = 'special-items'), 'Freshly baked naan oozing with melted mozzarella and cheddar cheese.', 400, true, true, '/cheese.jpg', 'Special');

-- Chicken Naan
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Special Chicken Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'chicken-naan'), 'Freshly baked with spiced chicken, loaded cheese, butter glaze, and sesame seeds.', 670, true, true, '/chicken naan.jpg', 'Chicken'),
  ('Special Chicken Achaari Makhan Rogni Naan', (select id from public.categories where slug = 'chicken-naan'), 'Tangy achar spices combined with tender chicken and buttery rogani naan.', 620, true, false, '/chicken naan.jpg', 'Chicken'),
  ('Special Chicken Makhan Rogni Naan', (select id from public.categories where slug = 'chicken-naan'), 'Butter-brushed chicken rogani naan baked in traditional clay tandoor.', 570, true, false, '/chicken naan.jpg', 'Chicken'),
  ('Chicken Cheese Makhan Naan', (select id from public.categories where slug = 'chicken-naan'), 'Melt-in-mouth chicken and cheese naan topped with fresh country butter.', 470, true, true, '/chicken naan.jpg', 'Chicken'),
  ('Chicken Achaari Naan', (select id from public.categories where slug = 'chicken-naan'), 'Spicy chicken with zesty pickling masala.', 300, true, false, '/chicken naan.jpg', 'Chicken'),
  ('Chicken Qeema Naan', (select id from public.categories where slug = 'chicken-naan'), 'Classic spiced chicken mince filling inside hot crispy naan.', 250, true, false, '/chicken naan.jpg', 'Chicken');

-- Beef Qeema Naan
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Special Beef Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Supreme spiced beef mince, rich mozzarella, fresh butter, and rogani sesame.', 670, true, true, '/beef2.jpg', 'Beef'),
  ('Special Beef Achaari Makhan Rogni Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Aromatic beef keema with pickle punch and melting butter.', 620, true, false, '/beef.jpg', 'Beef'),
  ('Special Beef Makhan Rogni Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Juicy beef mince with fresh butter on golden rogani naan.', 570, true, false, '/beef1.jpg', 'Beef'),
  ('Beef Cheese Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Savory beef mince enveloped with stringy cheese.', 370, true, true, '/beef2.jpg', 'Beef'),
  ('Beef Qeema Naan', (select id from public.categories where slug = 'beef-qeema-naan'), 'Authentic Lahore-style seasoned beef mince stuffed naan.', 250, true, false, '/beef.jpg', 'Beef');

-- Mutton Naan
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Special Mutton Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'mutton-naan'), 'Royal mutton qeema, cheese blend, pure butter, and roasted sesame seeds.', 1170, true, true, '/beef paratha naan .jpg', 'Mutton'),
  ('Special Mutton Achaari Makhan Rogni Naan', (select id from public.categories where slug = 'mutton-naan'), 'Premium tender mutton qeema with spicy pickles and butter glaze.', 1020, true, false, '/beef paratha naan .jpg', 'Mutton'),
  ('Special Mutton Makhan Rogni Naan', (select id from public.categories where slug = 'mutton-naan'), 'Authentic clay tandoor mutton rogani naan with generous butter.', 970, true, false, '/beef paratha naan .jpg', 'Mutton'),
  ('Special Mutton Achaari Naan', (select id from public.categories where slug = 'mutton-naan'), 'Pickled spiced mutton qeema naan.', 850, true, false, '/beef paratha naan .jpg', 'Mutton'),
  ('Special Mutton Qeema Naan', (select id from public.categories where slug = 'mutton-naan'), 'Original spiced minced mutton baked over hot charcoal.', 800, true, false, '/beef paratha naan .jpg', 'Mutton');

-- Aloo Wala Naan
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Special Aloo Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'Mashed spiced potatoes with cheese and melting butter in rogani crust.', 420, true, true, '/alooo nan.jpg', 'Aloo'),
  ('Special Aloo Makhan Rogni Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'Buttery potato naan sprinkled with black cumin and sesame seeds.', 320, true, false, '/alooo nan.jpg', 'Aloo'),
  ('Aloo Cheese Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'Traditional spiced aloo stuffing with molten cheese.', 270, true, false, '/alooo nan.jpg', 'Aloo'),
  ('Classic Aloo Naan', (select id from public.categories where slug = 'aloo-wala-naan'), 'The authentic street food style coriander and chili potato naan.', 150, true, false, '/alooo nan.jpg', 'Aloo');

-- Besaan Wala Naan
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Special Besaan Cheese Makhan Rogni Naan', (select id from public.categories where slug = 'besaan-wala-naan'), 'Crispy golden gram flour batter with herbs, cheese, and butter.', 420, true, true, '/baisan naan .png', 'Besaan'),
  ('Besaan Makhan Naan', (select id from public.categories where slug = 'besaan-wala-naan'), 'Savory chickpea batter coated naan topped with fresh desi butter.', 270, true, false, '/baisan.jpg', 'Besaan'),
  ('Traditional Besaan Naan', (select id from public.categories where slug = 'besaan-wala-naan'), 'Lahore iconic crispy besan naan spiced with cumin and pomegranate seeds.', 150, true, false, '/baisan.jpg', 'Besaan');

-- Rogni Naan
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Special Makhan Rogani Naan', (select id from public.categories where slug = 'rogni-naan'), 'Rich pillowy naan baked with egg wash, sesame seeds, and pure butter.', 200, true, true, '/Rogni.jpg', 'Rogni'),
  ('Rogani Garlic Naan', (select id from public.categories where slug = 'rogni-naan'), 'Infused with roasted garlic cloves, fresh herbs, and butter.', 220, true, true, '/rogni garlic naan.jpg', 'Rogni'),
  ('Plain Rogani Naan', (select id from public.categories where slug = 'rogni-naan'), 'Classical sesame seed crusted golden rogani naan.', 120, true, false, '/plain rogani naan.jpg', 'Rogni');

-- Pratha
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Special Lachha Tandoori Paratha', (select id from public.categories where slug = 'pratha'), 'Multi-layered flaky crispy paratha baked directly on tandoor walls.', 150, true, true, '/pratha.jpg', 'Pratha'),
  ('Desi Ghee Paratha', (select id from public.categories where slug = 'pratha'), 'Rich aromatic tandoori paratha roasted with pure Desi Ghee.', 200, true, false, '/pratha1.jpg', 'Pratha'),
  ('Meetha Paratha', (select id from public.categories where slug = 'pratha'), 'Sweet crispy layered paratha baked golden brown.', 150, true, false, '/pratha2.jpg', 'Pratha');

-- Regular Items
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Khameeri Roti', (select id from public.categories where slug = 'regular-items'), 'Traditional fermented tandoori roti, soft and light.', 30, true, false, '/regular.jpg', 'Regular'),
  ('Sada Naan', (select id from public.categories where slug = 'regular-items'), 'Daily fresh baked fluffy plain tandoori naan.', 40, true, false, '/sada.jpg', 'Regular'),
  ('Kulcha', (select id from public.categories where slug = 'regular-items'), 'Lightly salted pillowy round tandoori kulcha.', 50, true, false, '/kulcha.jpg', 'Regular'),
  ('Kalwanji Naan', (select id from public.categories where slug = 'regular-items'), 'Naan studded with nigella seeds (kalonji) for earthy aroma.', 60, true, false, '/kalwanji.jpg', 'Regular');

-- Sides
insert into public.products (name, category_id, description, price, is_available, is_featured, image_url, genre)
values
  ('Zeera Mint Raita', (select id from public.categories where slug = 'sides-and-sauces'), 'Chilled whisked yogurt with roasted cumin and fresh garden mint.', 60, true, false, '/raita.jpg', 'Side');

-- 4. DEALS / COMBOS
insert into public.deals (title, description, price, image_url, items, is_active)
values
  (
    'Crazy Deal 1',
    '2x Tandoori Pizza Naan + 1x 500ml Chilled Cola Next. Ultimate feast for two!',
    1050,
    '/deal1.png',
    array['2 Tandoori Pizza Naan', '1 Chilled 500ml Cola Next'],
    true
  ),
  (
    'Crazy Deal 2',
    '5x Choice of Chicken or Beef Naan + 1x 500ml Chilled Cola Next. Family favorite!',
    1400,
    '/deal2.png',
    array['5 Chicken / Beef Qeema Naan', '1 Chilled 500ml Cola Next'],
    true
  ),
  (
    'Crazy Deal 3',
    '5x Spiced Aloo Naan + 1x Fresh Zeera Raita + 1x 500ml Chilled Cola Next.',
    950,
    '/deal3.png',
    array['5 Aloo Wala Naan', '1 Fresh Zeera Raita', '1 Chilled 500ml Cola Next'],
    true
  );
