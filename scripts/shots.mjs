// Entwickler-Werkzeug: steuert die App im vorhandenen Edge-Browser fern, um sie zu testen und Bildschirmfotos zu machen.
// Aufruf: node scripts/shots.mjs <Ausgabeordner> [Schrittname ...]
import puppeteer from 'puppeteer-core';
import { join } from 'node:path';

const out = process.argv[2], only = process.argv.slice(3);
const BASE = process.env.APP_URL || 'http://localhost:5199/';
const ZIP = '/swipetimes-backup-2026-11-20%2020-02-06.zip';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
const VIEW = { width: 412, height: 880, deviceScaleFactor: 1 };
await page.setViewport(VIEW);
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: process.env.SCHEME || 'dark' }]);
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
page.on('dialog', (d) => d.accept());
const shot = (name) => page.screenshot({ path: join(out, name + '.png') });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = async (i) => { await page.click(`.tabs button:nth-child(${i})`); await wait(250); };
const text = (sel) => page.$eval(sel, (e) => e.textContent);
const count = (sel) => page.$$eval(sel, (l) => l.length);
const closeSheet = async () => { await page.mouse.click(200, 12); await wait(250); };
const full = async (name) => {
  const h = await page.evaluate(() => document.querySelector('main').scrollHeight);
  await page.setViewport({ ...VIEW, height: h + 70 });
  await wait(300);
  await shot(name);
  await page.setViewport(VIEW);
  await wait(150);
};

const steps = {
  async import() {
    await page.goto(BASE + '?devimport=' + ZIP);
    await page.waitForSelector('.today .tile', { timeout: 60000 });
    await wait(400);
    console.log('kopf:', await text('.today .head'), '|', await text('.strip'));
    await shot('01-heute');
  },
  async gap() {
    const gaps = await page.$$('.tl .gap');
    console.log('luecken:', gaps.length);
    if (!gaps.length) return;
    await gaps[gaps.length - 1].click(); await wait(300);
    await shot('02-luecke-auswahl');
    await page.click('.sheet .tile'); await wait(300);
    await shot('03-luecke-formular');
    await closeSheet();
  },
  async drag() {
    const before = await count('.tl .ev');
    const tile = await page.$('.today .favs .tile:nth-child(2)'), tl = await page.$('.tl');
    const a = await tile.boundingBox(), b = await tl.boundingBox();
    const gap = await page.$('.tl .gap:not(.small)');
    const g = gap ? await gap.boundingBox() : { x: b.x + 40, y: b.y + b.height * 0.9, width: 100, height: 10 };
    console.log('ziel:', gap ? 'Luecke' : 'freie Stelle');
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y - 30, { steps: 5 });
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 10 });
    await wait(150);
    await shot('04-ziehen');
    await page.mouse.up();
    await wait(300);
    console.log('ziehen: eintraege', before, '->', await count('.tl .ev'), '| hinweis:', await text('.toast').catch(() => '-'));
    await shot('05-nach-ziehen');
    await page.click('.toast button').catch(() => {});
    await wait(200);
    console.log('rueckgaengig: eintraege ->', await count('.tl .ev'));
  },
  async timer() {
    await page.click('.today .favs .tile:nth-child(1)');
    await wait(1300);
    console.log('timer:', await text('.runbar').catch(() => 'KEINE LAUFLEISTE'));
    await shot('06-timer');
    await page.click('.runbar .stop');
    await wait(300);
    console.log('nach stopp: laufleiste', (await page.$('.runbar')) ? 'noch da' : 'weg');
    const evs = await page.$$('.tl .ev');
    await evs[evs.length - 1].click(); await wait(250);
    await shot('07-bearbeiten');
    await page.click('.sheet .btn.danger'); await wait(300);
    console.log('test-eintrag geloescht: eintraege ->', await count('.tl .ev'));
  },
  async search() {
    await page.click('.find .inp'); await wait(300);
    await page.type('.sheet .inp input', 'go');
    await wait(250);
    console.log('suche "go":', (await count('.sheet .list .li')) - 1, 'Treffer');
    await shot('08-suche');
    await closeSheet();
    await page.click('.find .all'); await wait(300);
    await page.click('.sheet .list .li'); await wait(250);
    await shot('09-alle-projekte');
    await closeSheet();
  },
  async history() {
    await tab(2);
    await shot('10-verlauf');
    await full('11-verlauf-ganz');
  },
  async stats() {
    await tab(3); await wait(300);
    await full('12-statistik-monat');
    for (const [i, n] of [[3, 'jahr'], [4, 'alles'], [1, 'woche']]) {
      await page.click(`.page > .seg button:nth-child(${i})`); await wait(400);
      await full('13-statistik-' + n);
      console.log(n + ':', (await page.$$eval('.stat', (l) => l.map((e) => e.textContent))).join(' | '));
    }
  },
  async more() {
    await tab(4);
    await shot('14-mehr');
    const n = await count('.card.list .li');
    for (let i = 1; i <= n; i++) {
      await page.click(`.card.list .li:nth-child(${i})`); await wait(250);
      await full('15-mehr-' + i);
      if (i === 2) { await page.click('.card.list .li'); await wait(250); await shot('15-mehr-2-projekt'); await closeSheet(); }
      await page.click('.head .nav'); await wait(200);
    }
  },
};
for (const [name, fn] of Object.entries(steps)) {
  if (only.length && !only.includes(name) && name !== 'import') continue;
  try { await fn(); } catch (e) { console.log('FEHLER in', name + ':', e.message); await shot('fehler-' + name).catch(() => {}); }
}
console.log(errors.length ? 'FEHLER IM BROWSER:\n' + [...new Set(errors)].join('\n') : 'keine Browser-Fehler');
await browser.close();
