# Backups and restore

The production database stays on its server. Backups are compressed JSON copies of all business data
(`hbt-backup-<timestamp>.json.gz`). Sessions, OTP codes and rate-limit counters are deliberately not included.

## Where backups come from
| Method | How |
|---|---|
| Automatic | Schedule in **Admin > Shop Settings > Automatic backups**. Triggered by `GET /api/cron/backup` (send `Authorization: Bearer $CRON_SECRET`) from any scheduler (Vercel Cron, cron-job.org). It only runs when a backup is *due*; an owner opening **Backups & Activity** also triggers a due backup. |
| Manual (admin) | **Admin > Backups & Activity > Back up now** |
| Command line | `node --env-file=.env.local scripts/backup.mjs [folder]` |

Files live in `STORAGE_DIR/backups` (default `./storage/backups`). **On Vercel use a persistent volume or run the
app on a VPS: serverless disks are wiped.** Retention: the newest *N* files are kept (Settings, default 14).
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
