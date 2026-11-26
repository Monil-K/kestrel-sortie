// Screenshot harness: opens the game in real Chrome, waits for it to settle, and writes the
// captures the entry ships. Not part of the game; the game itself is plain static files.
//
//   NODE_PATH=<playwright-core node_modules> node tools/shots.mjs [outDir] [shot ...]

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.argv[2] || 'screenshots');
const requested = process.argv.slice(3);
const shots = requested.length ? requested : ['cockpit', 'chase', 'runway', 'strike'];
const base = process.env.SHOT_BASE || 'http://127.0.0.1:8099/';

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

for (const name of shots) {
  const url = `${base}?shot=${encodeURIComponent(name)}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  const info = await page.evaluate(() => ({
    frames: window.__kes ? 1 : 0,
    fps: window.__kes ? 'ok' : 'missing hook',
  }));
  const file = `${outDir}/${name}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  console.log(`shot ${name} -> ${file} ${JSON.stringify(info)}`);
}

if (errors.length) {
  console.log('--- console output ---');
  for (const e of [...new Set(errors)]) console.log(e);
}
await browser.close();
