# Haq Bahu Tandoor (HBT) — ordering & management platform

Next.js 16 + Drizzle ORM + PostgreSQL. One branch, pickup and home delivery (within a configurable radius, default 1,000 m).
Everything operational (shop details, location, radius, fees, payment accounts, hours, maintenance mode, backups, loyalty) is stored in the database and edited in **/admin**.

## Setup
```bash
cp .env.example .env.local     # fill in values (see comments inside)
npm install
npm run db:migrate             # create tables
npm run db:seed                # existing menu + default settings + owner account (OWNER_EMAIL)
npm run dev                    # or: npm run build && npm start
```
No Postgres installed? `npm run db:local` runs a local one (dev only, port 54329) — use the `DATABASE_URL` printed by `scripts/dev-db.mjs`.

## Sign-in (no passwords)
Customers and staff both sign in with a 6-digit code emailed over **SMTP** (`SMTP_*` in `.env.local`; Gmail needs an App Password).
The owner row is created from `OWNER_EMAIL`; the owner can add more staff roles (`owner`, `admin`, `kitchen`) by inserting profiles with that role.
Staff area: **/admin** (separate login, role-checked on the server).

## Required configuration to go live
| What | Why |
|---|---|
| `DATABASE_URL`, `SESSION_SECRET` (32+ random chars) | database, session security |
| `SMTP_*`, `OWNER_EMAIL` | all sign-in codes |
| Admin > Shop Settings > Payment accounts | bank / JazzCash / EasyPaisa details are **not** pre-filled; prepaid methods stay hidden until you enter and enable them |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `OWNER_WHATSAPP` | automatic order notifications (PDF receipt, text fallback after 12 s). Without them the order still works; the admin sees the status and a copy-text/retry option |
| `STORAGE_DIR` on a persistent disk | uploaded images, payment proofs, backups (not for serverless disks) |
| `CRON_SECRET` (+ a scheduler hitting `/api/cron/backup`) | scheduled backups. See `docs/BACKUP.md` |
| `BACKUP_SYNC_TOKEN` (optional) | lets `scripts/sync-backups.mjs` copy backups to the owner's PC |

Verify the shop pin with the owner before launch (Admin > Shop Settings > Shop details). Distances are measured server-side from that pin.

## Tests (need the app running + local DB)
```bash
node --env-file=.env.local scripts/e2e-api.mjs        # auth, checkout rules, radius, workflow, roles, CSRF
node --env-file=.env.local scripts/e2e-phase2.mjs     # coupons, deals, exports, closing report, backups, audit, loyalty
node --env-file=.env.local scripts/e2e-whatsapp.mjs   # WhatsApp PDF/text/12 s fallback against a local mock API
node --env-file=.env.local scripts/verify-restore.mjs <backup.json.gz>   # restore into a scratch DB and compare every table
```
The suites expect `SMTP_HOST=127.0.0.1 SMTP_PORT=2525` (they run a local mail sink) and `CRON_SECRET`/`BACKUP_SYNC_TOKEN` set; the WhatsApp suite also needs the app started with
`WHATSAPP_TOKEN=test-token WHATSAPP_PHONE_NUMBER_ID=12345 WHATSAPP_API_BASE=http://127.0.0.1:2626 OWNER_WHATSAPP=923001234567`.

## Notes
- Stock: reserved when an order is placed, returned if it is cancelled/rejected. Overselling is blocked for tracked items.
- Money in reports: "collected" = verified prepaid + COD collected at completion. Pending, unverified and cancelled orders never count.
- Delivery radius, fee, free-delivery threshold and minimum order are enforced on the server at checkout.
- Maps use OpenStreetMap tiles (no API key). A Google Maps directions link is shown for pickup.
