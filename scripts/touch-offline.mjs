// Entwickler-Werkzeug: prüft das Ziehen per Finger (Entwicklungsserver) und den Offline-Betrieb (gebaute Version).
// Aufruf: node scripts/touch-offline.mjs touch|offline
import puppeteer from 'puppeteer-core';

const mode = process.argv[2];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 880, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (sel) => page.$$eval(sel, (l) => l.length);

if (mode === 'touch') {
  await page.goto('http://localhost:5199/?devimport=/swipetimes-backup-2026-11-20%2020-02-06.zip');
  await page.waitForSelector('.today .tile', { timeout: 60000 });
  await wait(400);
  const before = await count('.tl .ev');
  const a = await (await page.$('.today .favs .tile:nth-child(3)')).boundingBox();
  const g = await (await page.$('.tl .gap:not(.small)')).boundingBox();
  // kurzes Halten hebt die Kachel an, dann ziehen
  await page.touchscreen.touchStart(a.x + a.width / 2, a.y + a.height / 2);
  await wait(400);
  console.log('angehoben:', (await count('.dragghost')) === 1);
  for (let i = 1; i <= 10; i++) { await page.touchscreen.touchMove(a.x + a.width / 2 + ((g.x + g.width / 2 - a.x - a.width / 2) * i) / 10, a.y + ((g.y + g.height / 2 - a.y) * i) / 10); await wait(20); }
  console.log('luecke markiert:', (await count('.tl .gap.hot')) === 1);
  await page.touchscreen.touchEnd();
  await wait(300);
  console.log('finger-ziehen: eintraege', before, '->', await count('.tl .ev'));
  await page.tap('.toast button');
  await wait(200);
  // kurzer Tipp startet den Timer und erzeugt keinen Eintrag per Ziehen
  await page.tap('.today .favs .tile:nth-child(3)');
  await wait(400);
  console.log('tipp startet timer:', (await count('.runbar')) === 1);
  await page.tap('.runbar .stop');
  await wait(200);
} else {
  const url = 'http://localhost:5198/';
  await page.goto(url);
  await page.waitForSelector('.app', { timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await wait(1500);
  console.log('service worker aktiv:', await page.evaluate(() => !!navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true)));
  console.log('zwischengespeicherte dateien:', await page.evaluate(async () => { const ks = await caches.keys(); return (await (await caches.open(ks[0])).keys()).length; }));
  await page.setOfflineMode(true);
  await page.reload();
  await page.waitForSelector('.app', { timeout: 15000 });
  console.log('offline neu geladen: app startet,', await page.$eval('.app', (e) => e.textContent.slice(0, 60)));
  console.log('manifest offline ladbar:', await page.evaluate(() => fetch('./manifest.webmanifest').then((r) => r.ok)));
}
console.log(errors.length ? 'FEHLER: ' + errors.join(' | ') : 'keine Browser-Fehler');
await browser.close();
