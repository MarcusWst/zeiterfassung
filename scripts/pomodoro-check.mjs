// Entwickler-Werkzeug: prüft den Pomodoro-Ablauf am Entwicklungsserver.
// Aufruf: node scripts/pomodoro-check.mjs <Ausgabeordner>
import puppeteer from 'puppeteer-core';
import { join } from 'node:path';

const out = process.argv[2];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 880 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (sel) => page.$$eval(sel, (l) => l.length);
const text = (sel) => page.$eval(sel, (e) => e.textContent).catch(() => '(fehlt)');
const clickText = async (sel, t) => { for (const el of await page.$$(sel)) if ((await el.evaluate((e) => e.textContent)).trim() === t) return el.click(); throw new Error(`"${t}" nicht gefunden in ${sel}`); };

await page.goto('http://localhost:5199/?devimport=/swipetimes-backup-2026-11-20%2020-02-06.zip');
await page.waitForSelector('.today .tile', { timeout: 60000 });
await wait(400);
const before = await count('.tl .ev');

// 1. Pomodoro über das Formular starten: 20 min, Start vor 30 min -> ist sofort abgelaufen
await page.click('.find .all'); await wait(300);
await page.click('.sheet .list .li'); await wait(200);
await page.click('.sheet .sublist .chip'); await wait(300);
await clickText('.sheet .seg button', 'Pomodoro'); await wait(200);
console.log('vorauswahl:', await text('.sheet .timerbox .chipbox:nth-of-type(2) .chip.on, .sheet .btn.grow'));
await page.screenshot({ path: join(out, '20-pomodoro-formular.png') });
await clickText('.sheet .chip', 'vor 30 min');
await clickText('.sheet .chip', '20 min');
await page.click('.sheet .btn.grow');
await wait(1600);
console.log('abgelaufener pomodoro: laeuft noch =', (await count('.runbar .stop')) > 0, '| karte:', await text('.runbar'));
console.log('eintraege heute:', before, '->', await count('.tl .ev'));
await page.screenshot({ path: join(out, '21-pomodoro-fertig.png') });

// 2. Nächste Runde mit 40 min
await clickText('.runbar .pomo .chip', '40 min'); await wait(1200);
console.log('naechste runde:', await text('.runbar .row'), '|', await text('.runbar .pomo'));
await page.screenshot({ path: join(out, '22-pomodoro-laeuft.png') });

// 3. An der Laufleiste auf offenen Timer und wieder auf 60 min umschalten
await clickText('.runbar .pomo .chip', '40 min'); await wait(1200);
console.log('offen:', await text('.runbar .row'));
await clickText('.runbar .pomo .chip', '60 min'); await wait(300);
console.log('60 min:', await text('.runbar .row'), '|', await text('.runbar .pomo'));

// aufräumen: laufenden Timer stoppen und beide Test-Einträge löschen
await page.click('.runbar .stop'); await wait(300);
for (let i = 0; i < 2; i++) {
  const evs = await page.$$('.tl .ev');
  if (evs.length <= before) break;
  // den zuletzt angelegten Eintrag über den Verlauf löschen wäre aufwendiger; hier: letzter Block des Tages
  await evs[evs.length - 1].click(); await wait(250);
  await page.click('.sheet .btn.danger'); await wait(400);
  await page.mouse.click(200, 300); await wait(100);
}
console.log('aufgeraeumt: eintraege heute ->', await count('.tl .ev'));
console.log(errors.length ? 'FEHLER: ' + errors.join(' | ') : 'keine Browser-Fehler');
await browser.close();
