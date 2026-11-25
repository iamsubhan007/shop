import 'server-only';
import crypto from 'node:crypto';
import { chromium as playwright } from 'playwright-core';
import { cleanEnv } from '@/lib/env';
import { buildMenuHtml } from '@/lib/menuPdf/template';
import { FONT_CSS } from '@/lib/menuPdf/fonts.generated';

// Menu data -> PDF with Chromium.
//  - Vercel / Lambda: the compact Chromium from @sparticuz/chromium.
//  - Anywhere else: CHROMIUM_PATH if set, otherwise an installed Chrome, Edge or Playwright Chromium.

async function launch() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { default: chromium } = await import('@sparticuz/chromium');
    return playwright.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  const executablePath = cleanEnv(process.env.CHROMIUM_PATH);
  if (executablePath) return playwright.launch({ executablePath, headless: true });
  let last;
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try {
      return await playwright.launch({ channel, headless: true });
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`No Chromium browser found. Set CHROMIUM_PATH. ${last?.message || ''}`);
}

async function htmlToPdf(html) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    // The page is self-contained (fonts are inside it): nothing is ever fetched while printing.
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}

// Every request reads the database again; only the printing is skipped when the content is exactly what was last
// printed, so a stale menu can never be served and a burst of downloads does not start a burst of browsers.
let last = null;
const running = new Map();

export async function renderMenuPdf(data) {
  const key = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  if (last?.key === key) return last.pdf;
  if (!running.has(key)) {
    running.set(
      key,
      htmlToPdf(buildMenuHtml(data, { fontCss: FONT_CSS }))
        .then((pdf) => {
          last = { key, pdf };
          return pdf;
        })
        .finally(() => running.delete(key)),
    );
  }
  return running.get(key);
}
