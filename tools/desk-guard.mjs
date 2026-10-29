// Desktop guard: the phone app must never change the desktop. Opens two copies of the site (this one and
// a reference, usually main) at desktop sizes, on the home screen and in a race, and compares where every
// main element sits and how big it is. Any move over 1 px is printed; exit code 1 if there are any.
//   node tools/desk-guard.mjs http://localhost:8765 http://localhost:8766
// Needs Playwright (npm i -g playwright, or the browser that ships with it).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [A, B] = [process.argv[2] || 'http://localhost:8765', process.argv[3] || 'http://localhost:8766'];
const SIZES = [[2000, 1100], [1440, 900], [1280, 800], [1024, 768]];
const HOME = ['.lp', '.hero', '.rcol', '.hs', '.ag.out', '.lp-mini', '.mhero', '.ac-chip', '.lp-legal.pg'];
const RACE = ['#hud', '#camPill', '#tower', '#wall', '#tabs', '#boost', '#boxBtn', '#talkBtn', '#agentsBtn', '#drivers', '#stats', '.hud .speed', '#carCard', '#controls'];

async function boxes(browser, base, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('agp.lang', 'en'); } catch (e) { /* private mode */ } });
  await p.goto(base + '/', { waitUntil: 'load' }); await p.waitForTimeout(3500);
  const grab = (sels) => p.evaluate((sels) => Object.fromEntries(sels.map((s) => {
    const el = document.querySelector(s); if (!el) return [s, null];
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return [s, cs.display === 'none' || el.hidden ? 'hidden' : [r.x, r.y, r.width, r.height].map(Math.round)];
  })), sels);
  const home = await grab(HOME), mob = await p.evaluate(() => document.documentElement.classList.contains('mob'));
  await p.evaluate(() => { __agp.start('quick'); }); await p.waitForTimeout(1500);
  const race = await grab(RACE);
  await ctx.close();
  return { home, race, mob };
}

const browser = await chromium.launch();
let bad = 0;
for (const [w, h] of SIZES) {
  const [a, b] = [await boxes(browser, A, w, h), await boxes(browser, B, w, h)];
  if (a.mob) { console.log(`${w}x${h}: the phone app switched on at a desktop size`); bad++; }
  for (const part of ['home', 'race']) for (const s of Object.keys(a[part])) {
    const x = JSON.stringify(a[part][s]), y = JSON.stringify(b[part][s]);
    if (x === y) continue;
    const near = Array.isArray(a[part][s]) && Array.isArray(b[part][s]) && a[part][s].every((v, i) => Math.abs(v - b[part][s][i]) <= 1);
    if (!near) { console.log(`${w}x${h} ${part} ${s}: ${x} vs ${y}`); bad++; }
  }
  console.log(`${w}x${h} checked`);
}
await browser.close();
console.log(bad ? `${bad} difference(s)` : 'desktop unchanged');
process.exit(bad ? 1 : 0);
