import { render } from 'preact';
import { App } from './App';
import { favorites } from './calc';
import { S, U, bump, load, replaceAll, startTimer, stopTimer, toast, type Tab } from './store';
import './styles.css';

render(<App />, document.getElementById('app')!);

load().then(async () => {
  const url = new URL(location.href), q = url.searchParams;

  // Nur in der Entwicklung: Backup direkt von einer Adresse laden, um mit echten Daten zu testen
  if (import.meta.env.DEV && q.get('devimport')) {
    const { importSwipeTimes } = await import('./importSwipe');
    await replaceAll(await importSwipeTimes(new Uint8Array(await (await fetch(q.get('devimport')!)).arrayBuffer())));
  }

  const tab = url.hash.slice(1);
  if (['today', 'history', 'stats', 'more'].includes(tab)) U.tab = tab as Tab;

  // Schnellzugriffe vom App-Symbol
  const action = q.get('action');
  if (action === 'stop') toast(stopTimer() ? 'Timer gestoppt' : 'Es läuft kein Timer');
  else if (action === 'new') U.sheet = { kind: 'pick' };
  else if (action === 'fav') {
    const f = favorites()[Number(q.get('i')) || 0];
    if (f) { startTimer(f); toast('▶ Timer läuft'); }
  }
  if (action) history.replaceState(null, '', url.pathname);
  bump();

  if (S.entries.length) navigator.storage?.persist?.();
}).catch((e) => {
  console.error(e);
  document.getElementById('app')!.textContent = 'Die Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : String(e));
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller, t0 = Date.now();
  navigator.serviceWorker.register('./sw.js').catch(console.error);
  // Neue Version: direkt nach dem Öffnen einmal neu laden, später nicht mehr (sonst ginge Getipptes verloren)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && Date.now() - t0 < 5000) location.reload(); });
}
