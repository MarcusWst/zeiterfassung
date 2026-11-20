// Entwickler-Werkzeug: prüft in der gebauten Version den Import über den Datei-Dialog und das Backup hin und zurück.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 880 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5198/');
await page.waitForSelector('.onboarding');
const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('.onboarding .btn')]);
await chooser.accept(['swipetimes-backup-2026-11-20 20-02-06.zip']);
await page.waitForSelector('.today .tile', { timeout: 60000 });
console.log('import ueber datei-dialog:', await page.$eval('.toast', (e) => e.textContent).catch(() => '(hinweis schon weg)'));
console.log('kopf:', await page.$eval('.strip', (e) => e.textContent));

// Backup erzeugen, einlesen und vergleichen – ohne Datei-Download, direkt über die Datenbank
await page.reload();
await page.waitForSelector('.today .tile', { timeout: 30000 });
console.log('nach neuladen noch da:', await page.$$eval('.tl .ev', (l) => l.length), 'eintraege heute');
const counts = await page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('zeiterfassung');
  req.onsuccess = async () => {
    const db = req.result, out = {};
    for (const name of db.objectStoreNames) out[name] = await new Promise((r) => { const c = db.transaction(name).objectStore(name).count(); c.onsuccess = () => r(c.result); });
    resolve(out);
  };
}));
console.log('gespeichert:', JSON.stringify(counts));
console.log(errors.length ? 'FEHLER: ' + errors.join(' | ') : 'keine Browser-Fehler');
await browser.close();
