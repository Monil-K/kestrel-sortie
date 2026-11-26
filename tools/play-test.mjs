// Smoke test: start a sortie from the title screen, fly it with the keyboard, and report the
// aircraft state. Catches runtime errors and dead controls.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:8099/', { waitUntil: 'load' });
await page.waitForTimeout(1800);
await page.screenshot({ path: '/tmp/kes-shots/title.jpg', type: 'jpeg', quality: 80 });

await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
const t0 = await page.evaluate(() => {
  const { ac, G } = window.__kes;
  return { phase: G.phase, kt: +ac.airspeed.toFixed(1), alt: +ac.altitude.toFixed(0), view: G.views[G.view] };
});

// bank right and pull, then cycle views and drop the gear
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(1600);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowDown');
await page.keyboard.press('c');
await page.waitForTimeout(400);
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(900);
await page.keyboard.up('ArrowLeft');
await page.keyboard.press('c');
await page.keyboard.press('g');
await page.waitForTimeout(1200);
const t1 = await page.evaluate(() => {
  const { ac, G } = window.__kes;
  return {
    phase: G.phase, kt: +ac.airspeed.toFixed(1), alt: +ac.altitude.toFixed(0),
    bank: +ac.bank.toFixed(1), g: +ac.gLoad.toFixed(2), gearT: +ac.gearT.toFixed(2),
    view: G.views[G.view], crashed: ac.crashed, hud: !!document.getElementById('hud'),
  };
});
await page.screenshot({ path: '/tmp/kes-shots/play.jpg', type: 'jpeg', quality: 80 });
console.log(JSON.stringify({ t0, t1, errors: [...new Set(errors)].slice(0, 6) }, null, 1));
await browser.close();
