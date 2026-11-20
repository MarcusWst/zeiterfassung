import { useEffect } from 'preact/hooks';
import { EntrySheet } from './EntrySheet';
import { S, U, setU, useStore, type Tab } from './store';
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
