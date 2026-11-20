import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Erzeugt nach dem Build einen Service Worker, der alle App-Dateien für den Offline-Betrieb vorhält.
function offline(): Plugin {
  let outDir = 'dist';
  return {
    name: 'offline-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(outDir, p).split(sep).join('/')); } };
      walk(outDir);
      const list = files.filter((f) => f !== 'sw.js').map((f) => (f === 'index.html' ? './' : './' + f));
      const version = createHash('sha1').update(list.join('|') + Date.now()).digest('hex').slice(0, 10);
      writeFileSync(join(outDir, 'sw.js'), `const CACHE = 'zeit-${version}';
const FILES = ${JSON.stringify(list)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || (e.request.mode === 'navigate' ? caches.match('./') : null)).then((r) => r || fetch(e.request)));
});
`);
    },
  };
}

export default defineConfig({ base: './', plugins: [preact(), offline()], build: { target: 'es2022' } });
