# Backups and restore

The production database stays on its server. Backups are compressed JSON copies of all business data
(`hbt-backup-<timestamp>.json.gz`). Sessions, OTP codes and rate-limit counters are deliberately not included.

## Where backups come from
| Method | How |
|---|---|
| Automatic | Schedule in **Admin > Shop Settings > Automatic backups**. Triggered by `GET /api/cron/backup` (send `Authorization: Bearer $CRON_SECRET`) from any scheduler (Vercel Cron, cron-job.org). It only runs when a backup is *due*; an owner opening **Backups & Activity** also triggers a due backup. |
| Manual (admin) | **Admin > Backups & Activity > Back up now** |
| Command line | `node --env-file=.env.local scripts/backup.mjs [folder]` |

Where the files are kept depends on the server (same rule as uploaded pictures):
- **Supabase Storage** (when `SUPABASE_SERVICE_ROLE_KEY` is set; this is what Vercel needs, because a serverless disk is read-only): a private bucket named `<bucket>-backups` (default `hbt-files-backups`, created automatically). Backups are only handed out through the admin panel.
- **Disk** (local development or a server with a persistent disk): `STORAGE_DIR/backups` (default `./storage/backups`).
Retention: the newest *N* files are kept (Settings, default 14).

### Storage & Backups page (owner and admin)
- Shows how full the database and the file storage are against the plan limits (Settings > Storage limits & alerts; defaults are the Supabase free plan: 500 MB database, 1 GB files).
- Owner and admin get an email, and a bar across the admin panel, when usage passes the warning percentage (default 80%), and again at 90% and 95%. While it stays high there is a weekly reminder. The check runs whenever someone has the admin panel open, and when the scheduled backup URL is called.
- **Download** a backup to a phone or computer, and later open it under *Report from a saved backup* to see sales for any day, week or month. The file is read in the browser only; nothing is uploaded and the live shop is not changed. (Needs a browser that can open .gz files: current Chrome, Edge, Firefox, Safari; on iPhone iOS 16.4+.)
- **Payment screenshots** can be deleted to free space: one at a time inside an order, or in bulk on this page. Screenshots of payments still waiting for review are never deleted. Screenshots are not part of backups.
Every attempt (success or failure) is listed in Backups & Activity.

## Download to the owner's PC (optional, automatic)
1. On the server set `BACKUP_SYNC_TOKEN` to a long random secret (32+ chars).
2. On the PC (Node 20+ installed), set `BACKUP_SITE_URL`, `BACKUP_SYNC_TOKEN`, `BACKUP_LOCAL_DIR` and run
   `node scripts/sync-backups.mjs`. Schedule it daily with Windows Task Scheduler.
   It only downloads backup files over HTTPS with the token; the database is never exposed. Browsers cannot write to a PC folder by themselves, so this utility is required for automatic copies.

## Restore (tested)
1. Create an **empty** Postgres database and set `DATABASE_URL` to it.
2. `npm run db:migrate` (creates the tables).
3. `node scripts/restore.mjs path/to/hbt-backup-....json.gz "<DATABASE_URL>"`
   The script refuses to run if the database already has orders/products/customers, and restores inside one transaction (all or nothing).
4. Start the app. Customers must sign in again (sessions are not restored).

Uploaded images (`STORAGE_DIR/products`, `STORAGE_DIR/proofs`) are files, not database rows: copy that folder too.
