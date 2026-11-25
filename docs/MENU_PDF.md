# Menu PDF

One published menu PDF for the website and the mobile app. Admin → **Menu PDF** chooses its source.

| Source | What customers get |
| --- | --- |
| Automatic (default) | Printed on each download from the live menu: the same data the website and app show |
| Your own PDF | The uploaded file, exactly as uploaded |

Managing **items and prices** stays in *Menu & Stock* and *Deals*. Uploading a PDF never changes menu records.

## How customers download it

`GET /api/menu/pdf` is the only place that decides which PDF is current. The website button (Menu page and footer)
and the app (Menu tab and More) both use it. It is never cached. The old address `/Haq-Bahu-MENU.pdf` redirects to
it, so old links and printed QR codes show the current menu. (To keep the old designed menu, upload that file and
publish it.)

## What the automatic menu contains

- Name, tagline, second name, phone, WhatsApp, address, opening hours (Shop Settings) and the website address
- Active deals that have started and not ended (featured first), with the original value when higher
- Published categories and available items, with descriptions, prices and original prices when higher
- Generation date and page numbers; A4 portrait; text only (no photos)

Left out: hidden or paused categories, unavailable, sold-out, out-of-stock and deleted items, and inactive, future or
expired deals. Prices are never recalculated.

## Publishing rules

- **Upload and publish** makes the file current at once. **Upload only** stores it for preview.
- A failed upload or replacement changes nothing.
- **Unpublish** / **Use automatic menu** goes back to the automatic PDF; uploads are kept.
- The published file cannot be deleted. The latest 5 uploads are kept.
- If the published file is ever missing from storage, customers get the automatic menu and the admin page says so.

## Rules and limits

- Owner and admin only; every change is in the activity log. Unpublished files are not public.
- PDF only, checked by content (not name), up to 10 MB.
- 40 downloads per 10 minutes per network address.

## Hosting

- **Vercel:** prints with `@sparticuz/chromium` (Node 24, set in `package.json` `engines`). The first download after
  a quiet spell takes several seconds.
- **Uploads on Vercel** need `SUPABASE_SERVICE_ROLE_KEY`. Files go to the private bucket `<bucket>-menu`. Files over
  4 MB go from the admin's browser straight to storage through a one-off link.
- **Elsewhere:** uses an installed Chrome or Edge, or set `CHROMIUM_PATH`.
- The website address printed comes from `NEXT_PUBLIC_SITE_URL`, else the Vercel production domain.
- Fonts are built into `src/lib/menuPdf/fonts.generated.js` (`npm run menu:fonts`).
- Uploaded PDFs are **not** part of the database backups (their list is).

**After the first deploy:** open Admin → Menu PDF → *Preview automatic menu*. Chromium on Vercel cannot be tested on
a Windows PC, so this is the check that it works there.

## Tests

```sh
node scripts/test-menu-pdf.mjs     # content, page layout, upload checks (no server)
# end to end, LOCAL database only, app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525:
MODE=disk BASE=http://localhost:3100 STORAGE_DIR=<app's dir> DATABASE_URL=<local> node scripts/e2e-menu-pdf.mjs
MODE=supabase ...                  # app started with SUPABASE_SERVICE_ROLE_KEY=test-key SUPABASE_URL=http://127.0.0.1:2727
```
