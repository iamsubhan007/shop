const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Read environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Import seed data from initialData.js
// Since initialData.js is ES module, we can read or parse it, or define it directly
async function loadInitialData() {
  const filePath = path.resolve(__dirname, '../src/lib/data/initialData.js');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  // Dynamically import or evaluate
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(fileContent).toString('base64');
  const mod = await import(moduleUrl);
  return {
    initialShopSettings: mod.initialShopSettings,
    initialBankDetails: mod.initialBankDetails,
    initialCategories: mod.initialCategories,
    initialProducts: mod.initialProducts,
    initialDeals: mod.initialDeals,
  };
}

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

async function main() {
  console.log('🚀 Starting Data & Asset Shift to Supabase Database...');
  console.log(`📡 Connecting to Supabase: ${supabaseUrl}`);

  // 1. Ensure storage buckets exist
  console.log('\n📦 Step 1: Checking and creating Supabase Storage buckets...');
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const existing = (buckets || []).map((b) => b.id);

    if (!existing.includes('food-images')) {
      const { error } = await supabase.storage.createBucket('food-images', { public: true });
      if (error) console.warn('Could not create food-images bucket:', error.message);
      else console.log('✅ Created bucket: food-images (public)');
    } else {
      console.log('✅ Bucket food-images already exists');
    }

    if (!existing.includes('payment-proofs')) {
      const { error } = await supabase.storage.createBucket('payment-proofs', { public: true });
      if (error) console.warn('Could not create payment-proofs bucket:', error.message);
      else console.log('✅ Created bucket: payment-proofs (public)');
    } else {
      console.log('✅ Bucket payment-proofs already exists');
    }
  } catch (err) {
    console.warn('Storage check warning:', err.message);
  }

  // 2. Upload public files to food-images bucket
  console.log('\n🖼️ Step 2: Uploading images and assets from public/ to Supabase Storage...');
  const publicDir = path.resolve(__dirname, '../public');
  const files = fs.readdirSync(publicDir);
  const uploadedUrls = {};

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!MIME_TYPES[ext]) continue; // Skip non-image / non-asset files (e.g. mp4 videos or unknown)

    const filePath = path.join(publicDir, file);
    const stats = fs.statSync(filePath);
    // Skip very large files if any (e.g. > 10MB)
    if (stats.size > 10 * 1024 * 1024) continue;

    try {
      const fileBuffer = fs.readFileSync(filePath);
      // Clean filename for storage key if it has leading/trailing spaces
      const storageKey = file.trim();

      const { data, error } = await supabase.storage
        .from('food-images')
        .upload(storageKey, fileBuffer, {
          contentType: MIME_TYPES[ext],
          upsert: true,
        });

      if (error) {
        console.warn(`  ⚠️ Failed to upload ${file}: ${error.message}`);
      } else {
        const { data: pubData } = supabase.storage.from('food-images').getPublicUrl(storageKey);
        uploadedUrls[file] = pubData.publicUrl;
        uploadedUrls[`/${file}`] = pubData.publicUrl;
        console.log(`  ✅ Uploaded: ${file} -> ${pubData.publicUrl}`);
      }
    } catch (e) {
      console.warn(`  ⚠️ Exception uploading ${file}:`, e.message);
    }
  }

  // Helper to resolve an image url to Supabase Storage public URL
  function resolveImageUrl(localPath) {
    if (!localPath) return localPath;
    if (localPath.startsWith('http://') || localPath.startsWith('https://')) return localPath;
    const clean = localPath.startsWith('/') ? localPath.slice(1) : localPath;
    return (
      uploadedUrls[localPath] ||
      uploadedUrls[clean] ||
      uploadedUrls[`/${clean}`] ||
      `${supabaseUrl}/storage/v1/object/public/food-images/${encodeURIComponent(clean)}`
    );
  }

  // 3. Load initial local data
  console.log('\n📄 Step 3: Loading shop, menu, and deal data from src/lib/data/initialData.js...');
  const {
    initialShopSettings,
    initialBankDetails,
    initialCategories,
    initialProducts,
    initialDeals,
  } = await loadInitialData();

  console.log(`  Found: ${initialCategories.length} categories, ${initialProducts.length} products, ${initialDeals.length} deals.`);

  // 4. Test if tables exist in Supabase
  console.log('\n🔍 Step 4: Verifying database tables in Supabase...');
  const { error: testError } = await supabase.from('categories').select('id').limit(1);

  if (testError && testError.code === 'PGRST205') {
    console.log('\n⚠️ Notice: Database tables do not exist in Supabase public schema yet.');
    console.log('Generating updated supabase/full_setup.sql with Supabase Storage URLs...');
    
    // Generate full_setup.sql updated with public URLs
    updateFullSetupSql(initialCategories, initialProducts, initialDeals, initialShopSettings, initialBankDetails, resolveImageUrl);
    console.log('\n📌 ACTION REQUIRED:');
    console.log('1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/tnctpbrkpvjzplnstzsg');
    console.log('2. Go to "SQL Editor"');
    console.log('3. Copy and paste the contents of "supabase/full_setup.sql" and click "Run".');
    console.log('4. Once run, re-run "npm run db:shift" or start the app — your database will be 100% connected with live data!');
    return;
  }

  // 5. Shift Categories
  console.log('\n📂 Step 5: Shifting Categories to Supabase...');
  const categoryMap = {}; // slug -> id
  for (const cat of initialCategories) {
    const { data, error } = await supabase
      .from('categories')
      .upsert(
        {
          name: cat.name,
          slug: cat.slug,
          description: cat.name + ' from Haq Bahu Naan Shop authentic clay tandoor',
          sort_order: cat.sort_order,
          is_active: true,
        },
        { onConflict: 'slug' }
      )
      .select('id, slug')
      .single();

    if (error) {
      console.warn(`  ⚠️ Category ${cat.name} error:`, error.message);
    } else if (data) {
      categoryMap[cat.slug] = data.id;
      categoryMap[cat.id] = data.id;
      console.log(`  ✅ Category: ${cat.name} (${data.id})`);
    }
  }

  // Also query all categories in DB to make sure we have IDs
  const { data: allCats } = await supabase.from('categories').select('id, slug');
  if (allCats) {
    allCats.forEach((c) => {
      categoryMap[c.slug] = c.id;
    });
  }

  // 6. Shift Products
  console.log('\n🍔 Step 6: Shifting Products with Supabase Storage image URLs...');
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
      image_url: resolveImageUrl(prod.image_url),
      additional_images: (prod.additional_images || []).map((img) => resolveImageUrl(img)),
      genre: prod.genre || 'Regular',
    };

    const { error } = await supabase.from('products').upsert(prodPayload, { onConflict: 'name' });
    if (error) {
      console.warn(`  ⚠️ Product ${prod.name} error:`, error.message);
    } else {
      console.log(`  ✅ Product: ${prod.name} -> Price: Rs. ${prod.price}`);
    }
  }

  // 7. Shift Deals
  console.log('\n🎉 Step 7: Shifting Deals to Supabase...');
  for (const deal of initialDeals) {
    const dealPayload = {
      title: deal.title,
      description: deal.description,
      price: deal.price,
      image_url: resolveImageUrl(deal.image_url),
      items: deal.items || [],
      badge: deal.badge || null,
      is_active: deal.is_active !== false,
    };

    const { error } = await supabase.from('deals').upsert(dealPayload, { onConflict: 'title' });
    if (error) {
      console.warn(`  ⚠️ Deal ${deal.title} error:`, error.message);
    } else {
      console.log(`  ✅ Deal: ${deal.title} -> Price: Rs. ${deal.price}`);
    }
  }

  // 8. Shift Shop Settings & Bank Details
  console.log('\n⚙️ Step 8: Shifting Shop Settings and Bank Details to Supabase...');
  const settingsRows = [
    {
      key: 'delivery_config',
      value: initialShopSettings,
      description: 'Shop geolocation, operating hours, and delivery radius configuration',
    },
    {
      key: 'bank_transfer_details',
      value: initialBankDetails,
      description: 'Meezan Bank, Easypaisa, and JazzCash payment details',
    },
  ];

  for (const setting of settingsRows) {
    const { error } = await supabase.from('shop_settings').upsert(setting, { onConflict: 'key' });
    if (error) {
      console.warn(`  ⚠️ Setting ${setting.key} error:`, error.message);
    } else {
      console.log(`  ✅ Setting saved: ${setting.key}`);
    }
  }

  console.log('\n✨ ALL DATA AND ASSETS SUCCESSFULLY SHIFTED TO SUPABASE DATABASE!');
}

function updateFullSetupSql(categories, products, deals, shopSettings, bankDetails, resolveImageUrl) {
  const sqlPath = path.resolve(__dirname, '../supabase/full_setup.sql');
  if (!fs.existsSync(sqlPath)) return;

  let sql = fs.readFileSync(sqlPath, 'utf-8');

  // Replace local image paths in seed data with public Supabase Storage paths
  for (const prod of products) {
    const remoteUrl = resolveImageUrl(prod.image_url);
    if (prod.image_url && remoteUrl !== prod.image_url) {
      sql = sql.replaceAll(`'${prod.image_url}'`, `'${remoteUrl}'`);
    }
  }
  for (const deal of deals) {
    const remoteUrl = resolveImageUrl(deal.image_url);
    if (deal.image_url && remoteUrl !== deal.image_url) {
      sql = sql.replaceAll(`'${deal.image_url}'`, `'${remoteUrl}'`);
    }
  }

  fs.writeFileSync(sqlPath, sql, 'utf-8');
  console.log('  Updated supabase/full_setup.sql with live Supabase Storage URLs.');
}

main().catch((err) => {
  console.error('Fatal error shifting data:', err);
  process.exit(1);
});
