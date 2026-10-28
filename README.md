# Haq Bahu Naan Shop - Web Application

Online ordering and delivery platform for **Haq Bahu Naan Shop** (Model Town, Lahore, Pakistan).

## 🚀 Supabase & Drizzle Database Setup

The application is powered by **Supabase PostgreSQL** and **Drizzle ORM** (shifted from local files and static catalogs).

### Environment Variables (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://tnctpbrkpvjzplnstzsg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional: Direct PostgreSQL connection string for Drizzle Kit push/migrations
# DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.tnctpbrkpvjzplnstzsg.supabase.co:5432/postgres
```

### Initial Database Setup (One-Click)
1. Open your [Supabase Dashboard](https://supabase.com/dashboard/project/tnctpbrkpvjzplnstzsg)
2. Go to **SQL Editor** -> **New Query**
3. Open `supabase/full_setup.sql` in this repo, copy all, and click **Run**.
   - This sets up all 10 tables, indexes, RLS security policies, storage buckets (`food-images`, `payment-proofs`), and complete seed data with live Supabase Storage URLs!

### Shifting Data & Uploading Assets to Supabase
All images from `public/` and data from `src/lib/data/initialData.js` can be uploaded/synced to Supabase with:
```bash
npm run db:shift
```
Or click the **Sync DB** button inside the [Admin Dashboard](http://localhost:3000/admin).

### Drizzle ORM Commands
```bash
# Generate migrations
npm run db:generate

# Push schema directly to database (when DATABASE_URL is set in .env.local)
npm run db:push
```

## 🛠️ Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
