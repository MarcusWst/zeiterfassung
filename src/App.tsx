import { useEffect } from 'preact/hooks';
import { EntrySheet } from './EntrySheet';
import { S, U, checkPomodoro, ix, setU, useStore, type Tab } from './store';
import { Toast } from './ui';
import { DaySheet, History } from './views/History';
import { More } from './views/More';
import { Stats } from './views/Stats';
import { Today } from './views/Today';

const TABS: [Tab, string, string][] = [['today', '◔', 'Heute'], ['history', '☰', 'Verlauf'], ['stats', '▥', 'Statistik'], ['more', '⋯', 'Mehr']];
const VIEWS = { today: Today, history: History, stats: Stats, more: More };

export function App() {
  useStore();
  useEffect(() => {
    const t = S.settings.theme;
    if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }, [S.settings.theme]);
  // Pomodoro: jede Sekunde und beim Zurückkehren in die App prüfen, ob die Zeit um ist
  useEffect(() => {
    const check = () => { if (S.ready) checkPomodoro(); };
    const i = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', check); };
  }, []);
  // Bildschirm anlassen, solange ein Pomodoro läuft
  const awake = S.ready && S.settings.keepAwake && !!ix().running?.planned;
  useEffect(() => {
    if (!awake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null, off = false;
    const get = () => { if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => { if (off) void l.release(); else lock = l; }).catch(() => {}); };
    get();
    document.addEventListener('visibilitychange', get);
    return () => { off = true; document.removeEventListener('visibilitychange', get); void lock?.release(); };
  }, [awake]);
  if (!S.ready) return <div class="loading">Lädt …</div>;
  const View = VIEWS[U.tab], sheet = U.sheet;
  return (
    <div class="app">
      <main><View /></main>
      <nav class="tabs">
        {TABS.map(([id, icon, name]) => (
          <button key={id} class={U.tab === id ? 'on' : ''} onClick={() => setU({ tab: id, day: id === 'today' && U.tab === 'today' ? null : U.day })}><b>{icon}</b>{name}</button>
        ))}
      </nav>
      {sheet && (sheet.kind === 'day' ? <DaySheet key={sheet.day} day={sheet.day} /> : <EntrySheet key={JSON.stringify(sheet)} spec={sheet} />)}
      <Toast />
    </div>
  );
}
