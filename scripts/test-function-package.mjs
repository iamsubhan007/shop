// Loads each menu PDF server function from ONLY the files the build says it ships, the way Vercel runs it. A file
// the packager missed shows up here instead of as a 500 on the live site. Run after `next build`:
//   node scripts/test-function-package.mjs
// It also prints a page with the shipped printing library, using an installed Chrome (the host's own Chromium is a
// Linux program and cannot run elsewhere).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const routes = ['api/menu/pdf', 'api/admin/menu-pdf', 'api/admin/menu-pdf/direct', 'api/admin/menu-pdf/files/[id]', 'api/admin/menu-pdf/preview'];
const PRINTS = new Set(['api/menu/pdf', 'api/admin/menu-pdf/preview']);
let failed = 0;

for (const route of routes) {
  const dir = path.join(root, '.next/server/app', route);
  const manifest = path.join(dir, 'route.js.nft.json');
  if (!fs.existsSync(manifest)) { console.log(`FAIL  ${route}: not built (run next build first)`); failed += 1; continue; }
  const files = [...JSON.parse(fs.readFileSync(manifest, 'utf8')).files.map((f) => path.resolve(dir, f)), path.join(dir, 'route.js')];

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-'));
  const links = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || rel.startsWith('.env')) continue;
    let stat;
    try { stat = fs.lstatSync(file); } catch { continue; }
    if (stat.isSymbolicLink()) { links.push([rel, path.relative(root, fs.realpathSync(file))]); continue; }
    if (stat.isDirectory()) continue;
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.copyFileSync(file, path.join(out, rel));
  }
  for (const [rel, target] of links) {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.mkdirSync(path.join(out, target), { recursive: true });
    fs.symlinkSync(path.resolve(out, target), path.join(out, rel), 'junction');
  }
  fs.writeFileSync(path.join(out, 'load.cjs'), `
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
process.chdir(__dirname);
(async () => {
  require(${JSON.stringify(`./.next/server/app/${route}/route.js`)});
  const aliases = fs.readdirSync('.next/node_modules');
  const library = aliases.find((a) => a.startsWith('playwright-core'));
  if (!library) throw new Error('the printing library is not shipped');
  const { chromium } = require(path.resolve('.next/node_modules', library));
  if (${PRINTS.has(route)}) {
    for (const bin of ['chromium.br', 'al2023.tar.br']) {
      if (!fs.existsSync(path.join('node_modules/@sparticuz/chromium/bin', bin))) throw new Error('missing ' + bin);
    }
    const name = fs.readdirSync('.next/node_modules/@sparticuz').find((n) => n.startsWith('chromium'));
    await import(pathToFileURL(path.resolve('.next/node_modules/@sparticuz', name, 'build/index.js')).href);
    const browser = await chromium.launch({ channel: 'chrome' });
    const page = await browser.newPage();
    await page.setContent('<h1>Menu</h1>');
    const pdf = await page.pdf({ format: 'A4' });
    await browser.close();
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('printing failed');
  }
  process.exit(0);
})().catch((e) => { console.log(String(e.message).split('\\n')[0].split(__dirname).join('.')); process.exit(1); });
`);
  try {
    execFileSync(process.execPath, [path.join(out, 'load.cjs')], { cwd: out, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NODE_PATH: '', NODE_ENV: 'production' }, timeout: 120000 });
    console.log(`PASS  ${route}${PRINTS.has(route) ? ' (loads and prints)' : ' (loads)'}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL  ${route}: ${String(e.stdout || e.stderr || e.message).trim().split('\n')[0]}`);
  }
  // Remove the junctions first so deleting the folder can never follow one out of it.
  for (const [rel] of links) { try { fs.rmdirSync(path.join(out, rel)); } catch {} }
  fs.rmSync(out, { recursive: true, force: true });
}
console.log(failed ? `${failed} function(s) would crash on the host` : 'all menu PDF functions are complete');
process.exit(failed ? 1 : 0);
