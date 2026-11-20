import { useRef, useState } from 'preact/hooks';
import { exportBackup, exportCsv, parseBackup } from '../backup';
import { favorites, isPinned, sameFav, usedCount } from '../calc';
import { Pick } from '../EntrySheet';
import { S, colorOf, emptyDump, ix, label, newId, put, remove, replaceAll, setSettings, setU, toast } from '../store';
import { HOUR, MIN, WD, dayRange, fmtDate, fmtDur, fmtNum, today } from '../time';
import type { AbsenceType, Dump, Filter, Profile, Project, Tag } from '../types';
import { Chips, Dot, PALETTE, Seg, Sheet } from '../ui';

// ---------- Datei-Import ----------
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] || null);
    i.click();
  });
}
const summary = (d: Dump) => `${fmtNum(d.entries.length)} Einträge, ${d.projects.length} Projekte, ${d.activities.length} Tätigkeiten`;
async function apply(d: Dump, what: string): Promise<void> {
  if (S.entries.length && !confirm(`${what} enthält ${summary(d)}.\n\nDie vorhandenen Daten in der App (${fmtNum(S.entries.length)} Einträge) werden dadurch vollständig ersetzt. Fortfahren?`)) return;
  await replaceAll(d);
  navigator.storage?.persist?.();
  toast(`Importiert: ${summary(d)}`);
}
export async function importSwipeFile(file?: File | null): Promise<void> {
  const f = file ?? (await pickFile('.zip,application/zip,application/octet-stream,*/*'));
  if (!f) return;
  try {
    toast('Backup wird gelesen …');
    const { importSwipeTimes } = await import('../importSwipe');
    await apply(await importSwipeTimes(new Uint8Array(await f.arrayBuffer())), 'Das SwipeTimes-Backup');
  } catch (e) {
    console.error(e);
    alert('Der Import hat nicht funktioniert:\n' + (e instanceof Error ? e.message : String(e)));
  }
}
async function importBackupFile(): Promise<void> {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try {
    await apply(parseBackup(await f.text()), 'Die Backup-Datei');
  } catch (e) {
    alert('Das Backup konnte nicht eingespielt werden:\n' + (e instanceof Error ? e.message : String(e)));
  }
}

export function Onboarding() {
  return (
    <div class="page onboarding">
      <h2>Willkommen</h2>
      <p class="sub">Deine Zeiten bleiben auf diesem Gerät gespeichert. Starte mit deinen bisherigen Daten oder mit einer leeren App.</p>
      <button class="btn" onClick={() => importSwipeFile()}>SwipeTimes-Backup importieren (.zip)</button>
      <button class="btn sec" onClick={importBackupFile}>Backup dieser App einspielen (.json)</button>
      <button class="btn sec" onClick={async () => { await replaceAll(emptyDump()); setU({ sheet: { kind: 'pick', focus: 'search' } }); }}>Leer starten und erstes Projekt anlegen</button>
      <p class="sub">In SwipeTimes erzeugst du das Backup über Einstellungen → Backup. Die Zip-Datei kannst du hier direkt auswählen.</p>
    </div>
  );
}

// ---------- Menü ----------
type PageId = 'projects' | 'tags' | 'profiles' | 'absences' | 'filters' | 'favs' | 'data';
const PAGES: [PageId, string, () => string][] = [
  ['favs', 'Favoriten', () => `${S.settings.pinned.length} angeheftet, Rest automatisch`],
  ['projects', 'Projekte und Tätigkeiten', () => `${S.projects.filter((p) => !p.archived).length} aktiv, ${S.projects.filter((p) => p.archived).length} archiviert`],
  ['tags', 'Tags', () => `${S.tags.length} Tags`],
  ['profiles', 'Profile und Soll-Zeiten', () => S.profiles.map((p) => p.name).join(', ')],
  ['absences', 'Urlaub, Feiertage, Krankheit', () => `${S.absences.filter((a) => a.date.startsWith(today().slice(0, 4))).length} Tage in diesem Jahr`],
  ['filters', 'Filter für die Statistik', () => `${S.filters.length} gespeichert`],
  ['data', 'Daten, Backup und Darstellung', () => `${fmtNum(S.entries.length)} Einträge auf diesem Gerät`],
];

export function More() {
  const [page, setPage] = useState<PageId | null>(null);
  if (!page) {
    return (
      <div class="page">
        <h2>Mehr</h2>
        <div class="card list">
          {PAGES.map(([id, name, sub]) => (
            <button class="li" key={id} onClick={() => setPage(id)}><span class="grow"><b>{name}</b><br /><span class="sub">{sub()}</span></span><span class="sub">›</span></button>
          ))}
        </div>
      </div>
    );
  }
  const Body = { projects: Projects, tags: Tags, profiles: Profiles, absences: Absences, filters: Filters, favs: Favs, data: Data }[page];
  return (
    <div class="page">
      <div class="row head"><button class="nav" onClick={() => setPage(null)} aria-label="Zurück">‹</button><b class="grow" style={{ fontSize: '17px' }}>{PAGES.find((p) => p[0] === page)![1]}</b></div>
      <Body />
    </div>
  );
}

const Field = ({ l, children }: { l: string; children: any }) => <label class="fld"><span class="lbl">{l}</span>{children}</label>;
const Swatches = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
  <div class="swatches">
    {PALETTE.map((c) => <button key={c} class={c === value ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={'Farbe ' + c} />)}
    <input type="color" value={value} onInput={(e) => onChange(e.currentTarget.value)} aria-label="Eigene Farbe" />
  </div>
);

// ---------- Favoriten ----------
function Favs() {
  const [adding, setAdding] = useState(false);
  const toggle = (f: { projectId: number; activityId: number | null }) => {
    const pinned = S.settings.pinned;
    setSettings({ pinned: isPinned(f) ? pinned.filter((p) => !sameFav(p, f)) : [...pinned, { projectId: f.projectId, activityId: f.activityId }] });
  };
  return (
    <>
      <p class="sub">Der Startbildschirm zeigt zwölf Favoriten: zuerst die angehefteten in deiner Reihenfolge, dann die häufigsten der letzten 90 Tage.</p>
      <div class="card list">
        {favorites().map((f) => {
          const l = label(f), pin = isPinned(f);
          return (
            <button class="li" key={f.projectId + '|' + f.activityId} onClick={() => toggle(f)}>
              <Dot color={colorOf(f.projectId)} />
              <span class="grow ell"><b>{l.activity || l.project}</b>{l.activity && <span class="sub"> · {l.project}</span>}</span>
              <span class={pin ? 'accent' : 'sub'}>{pin ? '★ angeheftet' : '☆ anheften'}</span>
            </button>
          );
        })}
        <button class="li accent" onClick={() => setAdding(true)}>＋ Weiteren Favoriten anheften</button>
      </div>
      {adding && <Sheet onClose={() => setAdding(false)} title="Favorit anheften"><Pick focus="all" onPick={(f) => { if (!isPinned(f)) toggle(f); setAdding(false); }} /></Sheet>}
    </>
  );
}

// ---------- Projekte ----------
function Projects() {
  const [edit, setEdit] = useState<number | null>(null);
  const list = [...S.projects].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'de'));
  const add = () => {
    const p: Project = { id: newId('projects'), name: 'Neues Projekt', color: PALETTE[S.projects.length % PALETTE.length], archived: false, tagIds: [], profileIds: [], goalMs: 0, goalRepeat: 'none' };
    put('projects', p);
    setEdit(p.id);
  };
  return (
    <>
      <div class="card list">
        {list.map((p) => (
          <button class="li" key={p.id} onClick={() => setEdit(p.id)} style={{ opacity: p.archived ? 0.55 : 1 }}>
            <Dot color={p.color} /><b class="grow ell">{p.name}</b>
            <span class="sub">{p.archived ? 'archiviert · ' : ''}{(ix().acts.get(p.id) || []).length} Tätigkeiten ›</span>
          </button>
        ))}
        <button class="li accent" onClick={add}>＋ Neues Projekt</button>
      </div>
      {edit != null && ix().p.get(edit) && <ProjectEdit p={ix().p.get(edit)!} onClose={() => setEdit(null)} />}
    </>
  );
}
function ProjectEdit({ p, onClose }: { p: Project; onClose: () => void }) {
  const [newAct, setNewAct] = useState('');
  const set = (patch: Partial<Project>) => put('projects', { ...p, ...patch });
  const acts = [...(ix().acts.get(p.id) || [])].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const n = usedCount((e) => e.projectId === p.id);
  const addAct = () => { const name = newAct.trim(); if (!name) return; put('activities', { id: newId('activities'), projectId: p.id, name, tagIds: [] }); setNewAct(''); };
  const delAct = (id: number) => {
    const used = usedCount((e) => e.activityId === id);
    if (used) return toast(`Wird in ${fmtNum(used)} Einträgen verwendet und kann deshalb nicht gelöscht werden.`);
    remove('activities', id);
  };
  const del = () => {
    if (n) return toast(`Das Projekt hat ${fmtNum(n)} Einträge. Archiviere es stattdessen.`);
    if (!confirm(`Projekt „${p.name}“ mit seinen Tätigkeiten löschen?`)) return;
    acts.forEach((a) => remove('activities', a.id));
    remove('projects', p.id);
    onClose();
  };
  return (
    <Sheet onClose={onClose} title="Projekt bearbeiten">
      <Field l="Name"><div class="inp"><input value={p.name} onChange={(e) => e.currentTarget.value.trim() && set({ name: e.currentTarget.value.trim() })} /></div></Field>
      <div class="lbl">Farbe</div>
      <Swatches value={p.color} onChange={(color) => set({ color })} />
      <div class="lbl">Tätigkeiten</div>
      <div class="list">
        {acts.map((a) => (
          <div class="li" key={a.id}>
            <input class="grow plain" value={a.name} onChange={(e) => e.currentTarget.value.trim() && put('activities', { ...a, name: e.currentTarget.value.trim() })} />
            <button class="x" onClick={() => delAct(a.id)} aria-label={`${a.name} löschen`}>✕</button>
          </div>
        ))}
      </div>
      <div class="row"><div class="inp grow"><input value={newAct} onInput={(e) => setNewAct(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && addAct()} placeholder="Neue Tätigkeit" /></div><button class="btn sec" onClick={addAct}>Hinzufügen</button></div>
      {S.tags.length > 0 && (<><div class="lbl">Tags, die neue Einträge automatisch bekommen</div><Chips options={S.tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))} value={p.tagIds} onChange={(tagIds) => set({ tagIds })} /></>)}
      <div class="lbl">Zählt für diese Profile (keins gewählt = alle)</div>
      <Chips options={S.profiles.map((x) => ({ id: x.id, label: x.name }))} value={p.profileIds} onChange={(profileIds) => set({ profileIds })} />
      <Field l="Tagesziel in Minuten (0 = kein Ziel)"><div class="inp"><input type="number" min="0" value={p.goalRepeat === 'daily' ? Math.round(p.goalMs / MIN) : 0} onChange={(e) => { const m = Math.max(0, Number(e.currentTarget.value) || 0); set({ goalMs: m * MIN, goalRepeat: m ? 'daily' : 'none' }); }} /></div></Field>
      <div class="row" style={{ marginTop: 14 }}>
        <button class="btn sec danger" onClick={del}>Löschen</button>
        <button class="btn sec grow" onClick={() => set({ archived: !p.archived })}>{p.archived ? 'Wieder aktivieren' : 'Archivieren'}</button>
        <button class="btn" onClick={onClose}>Fertig</button>
      </div>
      <div class="sub" style={{ marginTop: 8 }}>{fmtNum(n)} Einträge in diesem Projekt. Änderungen werden sofort gespeichert.</div>
    </Sheet>
  );
}

// ---------- Tags ----------
function Tags() {
  const set = (t: Tag, patch: Partial<Tag>) => put('tags', { ...t, ...patch });
  const del = (t: Tag) => {
    const used = usedCount((e) => e.tagIds.includes(t.id));
    if (used) return toast(`„${t.name}“ wird in ${fmtNum(used)} Einträgen verwendet und kann deshalb nicht gelöscht werden.`);
    S.projects.filter((p) => p.tagIds.includes(t.id)).forEach((p) => put('projects', { ...p, tagIds: p.tagIds.filter((x) => x !== t.id) }));
    S.activities.filter((a) => a.tagIds.includes(t.id)).forEach((a) => put('activities', { ...a, tagIds: a.tagIds.filter((x) => x !== t.id) }));
    if (S.settings.billableTagId === t.id) setSettings({ billableTagId: null });
    remove('tags', t.id);
  };
  return (
    <>
      <p class="sub">Der als „verrechenbar“ markierte Tag bestimmt die Verrechenbar-Quote in der Statistik.</p>
      <div class="card list">
        {S.tags.map((t) => (
          <div class="li" key={t.id}>
            <input type="color" class="dotpick" value={t.color} onInput={(e) => set(t, { color: e.currentTarget.value })} aria-label={`Farbe von ${t.name}`} />
            <input class="grow plain" value={t.name} onChange={(e) => e.currentTarget.value.trim() && set(t, { name: e.currentTarget.value.trim() })} />
            <button class={'chip' + (S.settings.billableTagId === t.id ? ' on' : ' ghost')} onClick={() => setSettings({ billableTagId: S.settings.billableTagId === t.id ? null : t.id })}>verrechenbar</button>
            <button class="x" onClick={() => del(t)} aria-label={`${t.name} löschen`}>✕</button>
          </div>
        ))}
        <button class="li accent" onClick={() => put('tags', { id: newId('tags'), name: 'Neuer Tag', color: PALETTE[S.tags.length % PALETTE.length] })}>＋ Neuer Tag</button>
      </div>
    </>
  );
}

// ---------- Profile ----------
function Profiles() {
  const set = (p: Profile, patch: Partial<Profile>) => put('profiles', { ...p, ...patch });
  return (
    <>
      <p class="sub">Ein Profil legt das Soll je Wochentag fest. Der Startbildschirm und der Verlauf rechnen mit dem aktiven Profil.</p>
      {S.profiles.map((p) => (
        <div class="card" key={p.id}>
          <div class="row">
            <div class="inp grow"><input value={p.name} onChange={(e) => e.currentTarget.value.trim() && set(p, { name: e.currentTarget.value.trim() })} /></div>
            <button class={'chip' + (S.settings.profileId === p.id ? ' on' : '')} onClick={() => setSettings({ profileId: p.id })}>{S.settings.profileId === p.id ? '✓ aktiv' : 'aktivieren'}</button>
          </div>
          <div class="lbl">Soll in Stunden</div>
          <div class="wdgrid">
            {WD.map((w, i) => (
              <label key={w}><span class="sub">{w}</span>
                <input inputMode="decimal" value={String(p.weekdayGoals[i] / HOUR).replace('.', ',')} onChange={(e) => { const v = Number(e.currentTarget.value.replace(',', '.')); if (!isNaN(v) && v >= 0 && v <= 24) set(p, { weekdayGoals: p.weekdayGoals.map((g, j) => (j === i ? v * HOUR : g)) }); }} />
              </label>
            ))}
          </div>
          <div class="sub" style={{ marginTop: 4 }}>Summe {fmtDur(p.weekdayGoals.reduce((a, b) => a + b, 0))} je Woche</div>
          <div class="row" style={{ marginTop: 8 }}>
            <Field l="Saldo zählt ab"><div class="inp"><input type="date" value={p.balanceStart} onChange={(e) => e.currentTarget.value && set(p, { balanceStart: e.currentTarget.value })} /></div></Field>
            <Field l="Urlaubstage je Jahr"><div class="inp"><input type="number" min="0" value={p.vacationDays} onChange={(e) => set(p, { vacationDays: Math.max(0, Number(e.currentTarget.value) || 0) })} /></div></Field>
          </div>
        </div>
      ))}
      <button class="btn sec" style={{ width: '100%' }} onClick={() => put('profiles', { id: newId('profiles'), name: 'Neues Profil', weekdayGoals: [8, 8, 8, 8, 8, 0, 0].map((h) => h * HOUR), balanceStart: today().slice(0, 4) + '-01-01', vacationDays: 30 })}>＋ Neues Profil</button>
    </>
  );
}

// ---------- Abwesenheiten ----------
const ABS: Record<AbsenceType, string> = { vacation: 'Urlaub', holiday: 'Feiertag', illness: 'Krank' };
function Absences() {
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [type, setType] = useState<AbsenceType>('vacation');
  const [half, setHalf] = useState(false);
  const profileId = S.settings.profileId, profile = S.profiles.find((p) => p.id === profileId);
  const list = S.absences.filter((a) => a.profileId === profileId && a.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));
  const vac = list.filter((a) => a.type === 'vacation').reduce((s, a) => s + a.fraction, 0);
  const add = () => {
    if (to < from) return toast('Das Ende liegt vor dem Beginn.');
    const days = dayRange(from, to).filter((d) => type !== 'vacation' || (profile?.weekdayGoals[(new Date(d + 'T12:00').getDay() + 6) % 7] || 0) > 0);
    if (days.length > 60) return toast('Bitte höchstens 60 Tage auf einmal eintragen.');
    let id = newId('absences');
    for (const d of days) {
      S.absences.filter((a) => a.profileId === profileId && a.date === d).forEach((a) => remove('absences', a.id));
      put('absences', { id: id++, date: d, type, fraction: half ? 0.5 : 1, profileId });
    }
    toast(`${days.length} ${days.length === 1 ? 'Tag' : 'Tage'} eingetragen`);
    setYear(Number(from.slice(0, 4)));
  };
  return (
    <>
      <p class="sub">Gilt für das aktive Profil „{profile?.name}“. Abwesenheiten kürzen das Soll des Tages. Bei Urlaub werden Tage ohne Soll (z. B. Sonntage) übersprungen.</p>
      <div class="card">
        <div class="row"><Field l="Von"><div class="inp"><input type="date" value={from} onInput={(e) => { setFrom(e.currentTarget.value); if (e.currentTarget.value > to) setTo(e.currentTarget.value); }} /></div></Field><Field l="Bis"><div class="inp"><input type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} /></div></Field></div>
        <div class="chipbox" style={{ margin: '10px 0' }}>
          {(Object.keys(ABS) as AbsenceType[]).map((t) => <button key={t} class={'chip' + (type === t ? ' on' : '')} onClick={() => setType(t)}>{ABS[t]}</button>)}
          <button class={'chip' + (half ? ' on' : '')} onClick={() => setHalf(!half)}>halber Tag</button>
        </div>
        <button class="btn" style={{ width: '100%' }} onClick={add}>Eintragen</button>
      </div>
      <div class="row head">
        <button class="nav" onClick={() => setYear(year - 1)} aria-label="Vorheriges Jahr">‹</button>
        <div class="date grow"><b>{year}</b><span class="sub">Urlaub {fmtNum(vac, vac % 1 ? 1 : 0)} von {profile?.vacationDays ?? 30} Tagen</span></div>
        <button class="nav" onClick={() => setYear(year + 1)} aria-label="Nächstes Jahr">›</button>
      </div>
      <div class="card list">
        {list.map((a) => (
          <div class="li" key={a.id}><span class="grow">{fmtDate(a.date)} · {a.fraction < 1 ? '½ ' : ''}{ABS[a.type]}</span><button class="x" onClick={() => remove('absences', a.id)} aria-label="Löschen">✕</button></div>
        ))}
        {!list.length && <div class="sub pad">Keine Abwesenheiten in {year}.</div>}
      </div>
    </>
  );
}

// ---------- Filter ----------
function Filters() {
  const [edit, setEdit] = useState<number | null>(null);
  const f = S.filters.find((x) => x.id === edit);
  const set = (patch: Partial<Filter>) => f && put('filters', { ...f, ...patch });
  const modes = [{ id: 0, label: 'egal' }, { id: 1, label: 'nur diese' }, { id: 2, label: 'ohne diese' }];
  const describe = (x: Filter) => [x.projectMode ? `${x.projectMode === 1 ? 'nur' : 'ohne'} ${x.projectIds.length} Projekte` : '', x.tagMode ? `${x.tagMode === 1 ? 'nur' : 'ohne'} Tags: ${x.tagIds.map((t) => ix().t.get(t)?.name).join(', ')}` : ''].filter(Boolean).join(' · ') || 'keine Einschränkung';
  return (
    <>
      <p class="sub">Gespeicherte Filter kannst du in der Statistik auswählen, zusätzlich zum Profil.</p>
      <div class="card list">
        {S.filters.map((x) => <button class="li" key={x.id} onClick={() => setEdit(x.id)}><span class="grow"><b>{x.name}</b><br /><span class="sub">{describe(x)}</span></span><span class="sub">›</span></button>)}
        <button class="li accent" onClick={() => { const id = newId('filters'); put('filters', { id, name: 'Neuer Filter', projectMode: 0, projectIds: [], tagMode: 0, tagIds: [] }); setEdit(id); }}>＋ Neuer Filter</button>
      </div>
      {f && (
        <Sheet onClose={() => setEdit(null)} title="Filter bearbeiten">
          <Field l="Name"><div class="inp"><input value={f.name} onChange={(e) => e.currentTarget.value.trim() && set({ name: e.currentTarget.value.trim() })} /></div></Field>
          <div class="lbl">Projekte</div>
          <Seg options={modes} value={f.projectMode} onChange={(m) => set({ projectMode: m as 0 | 1 | 2 })} />
          {f.projectMode > 0 && <Chips options={S.projects.filter((p) => !p.archived || f.projectIds.includes(p.id)).map((p) => ({ id: p.id, label: p.name, color: p.color }))} value={f.projectIds} onChange={(projectIds) => set({ projectIds })} />}
          <div class="lbl">Tags</div>
          <Seg options={modes} value={f.tagMode} onChange={(m) => set({ tagMode: m as 0 | 1 | 2 })} />
          {f.tagMode > 0 && <Chips options={S.tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))} value={f.tagIds} onChange={(tagIds) => set({ tagIds })} />}
          <div class="row" style={{ marginTop: 14 }}>
            <button class="btn sec danger" onClick={() => { if (confirm(`Filter „${f.name}“ löschen?`)) { remove('filters', f.id); setEdit(null); } }}>Löschen</button>
            <button class="btn grow" onClick={() => setEdit(null)}>Fertig</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ---------- Daten ----------
function Data() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const asked = useRef(false);
  if (!asked.current) { asked.current = true; navigator.storage?.persisted?.().then(setPersisted); }
  const last = Number(localStorage.getItem('lastBackup') || 0);
  const wipe = async () => {
    if (!confirm('Wirklich alle Daten in der App löschen? Das lässt sich nur mit einer Backup-Datei rückgängig machen.')) return;
    if (!confirm('Letzte Rückfrage: Alle Einträge, Projekte und Einstellungen werden gelöscht.')) return;
    await replaceAll(emptyDump());
    toast('Alle Daten gelöscht');
  };
  return (
    <>
      <div class="card">
        <h3>Sicherung</h3>
        <p class="q">Die Daten liegen nur auf diesem Gerät. Speichere regelmäßig eine Backup-Datei, zum Beispiel in OneDrive. {last ? `Letztes Backup: ${fmtDate(new Date(last).toISOString().slice(0, 10))}.` : 'Bisher wurde kein Backup erstellt.'}</p>
        <div class="col">
          <button class="btn" onClick={() => { exportBackup(); toast('Backup-Datei wurde gespeichert'); }}>Backup-Datei speichern</button>
          <button class="btn sec" onClick={importBackupFile}>Backup einspielen</button>
          <button class="btn sec" onClick={() => exportCsv()}>Alle Einträge als CSV für Excel</button>
        </div>
      </div>
      <div class="card">
        <h3>SwipeTimes</h3>
        <p class="q">Liest ein Backup aus SwipeTimes (Zip-Datei) ein und ersetzt die Daten in dieser App.</p>
        <button class="btn sec" style={{ width: '100%' }} onClick={() => importSwipeFile()}>SwipeTimes-Backup importieren</button>
      </div>
      <div class="card">
        <h3>Darstellung</h3>
        <Seg options={[{ id: 'system', label: 'Wie das Handy' }, { id: 'light', label: 'Hell' }, { id: 'dark', label: 'Dunkel' }]} value={S.settings.theme} onChange={(theme) => setSettings({ theme })} />
      </div>
      <div class="card">
        <h3>Speicher</h3>
        <p class="q">{fmtNum(S.entries.length)} Einträge, {S.projects.length} Projekte, {S.activities.length} Tätigkeiten. {persisted == null ? '' : persisted ? 'Der Browser schützt die Daten vor automatischem Löschen.' : 'Der Browser könnte die Daten bei Speichermangel löschen.'}</p>
        {persisted === false && <button class="btn sec" style={{ width: '100%', marginBottom: 8 }} onClick={() => navigator.storage?.persist?.().then((ok) => { setPersisted(ok); toast(ok ? 'Daten sind jetzt geschützt' : 'Der Browser hat den Schutz nicht gewährt. Installiere die App auf dem Startbildschirm und versuche es erneut.'); })}>Daten vor automatischem Löschen schützen</button>}
        <button class="btn sec danger" style={{ width: '100%' }} onClick={wipe}>Alle Daten löschen</button>
      </div>
    </>
  );
}
