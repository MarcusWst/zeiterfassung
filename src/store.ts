import Dexie from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, TABLES, type Activity, type Dump, type Entry, type Fav, type Project, type Settings, type Tables, type Tag } from './types';

// ---------- Datenbank (IndexedDB, bleibt auf dem Gerät) ----------
export const db = new Dexie('zeiterfassung');
db.version(1).stores({ projects: 'id', activities: 'id', tags: 'id', entries: 'id', profiles: 'id', absences: 'id', targets: 'id', filters: 'id', meta: 'key' });

// ---------- Zustand im Speicher ----------
export const S: Dump & { ready: boolean; version: number } = {
  projects: [], activities: [], tags: [], entries: [], profiles: [], absences: [], targets: [], filters: [],
  settings: { ...DEFAULT_SETTINGS }, ready: false, version: 0,
};

const listeners = new Set<() => void>();
export function bump(): void {
  S.version++;
  listeners.forEach((l) => l());
}
/** Rendert die Komponente bei jeder Datenänderung neu */
export function useStore(): number {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((v) => v + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return S.version;
}

function fail(e: unknown): void {
  console.error(e);
  toast('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
}

export async function load(): Promise<void> {
  const rows = await Promise.all(TABLES.map((t) => db.table(t).toArray()));
  TABLES.forEach((t, i) => { (S as any)[t] = rows[i]; });
  const meta = await db.table('meta').get('settings');
  S.settings = { ...DEFAULT_SETTINGS, ...(meta?.value || {}) };
  S.ready = true;
  bump();
}

export function put<K extends keyof Tables>(table: K, obj: Tables[K][number]): void {
  const arr = S[table] as { id: number | string }[];
  const i = arr.findIndex((x) => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  db.table(table).put(obj).catch(fail);
  bump();
}
export function remove<K extends keyof Tables>(table: K, id: number | string): void {
  const arr = S[table] as { id: number | string }[];
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) arr.splice(i, 1);
  db.table(table).delete(id).catch(fail);
  bump();
}
export function newId(table: Exclude<keyof Tables, 'targets'>): number {
  let m = 0;
  for (const x of S[table]) if (x.id > m) m = x.id;
  return m + 1;
}
export function setSettings(patch: Partial<Settings>): void {
  S.settings = { ...S.settings, ...patch };
  db.table('meta').put({ key: 'settings', value: S.settings }).catch(fail);
  bump();
}

/** Ersetzt den gesamten Datenbestand (Import, Backup einspielen, alles löschen) */
export async function replaceAll(d: Dump): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkPut(d[t]);
    }
    await db.table('meta').put({ key: 'settings', value: d.settings });
  });
  TABLES.forEach((t) => { (S as any)[t] = d[t]; });
  S.settings = { ...DEFAULT_SETTINGS, ...d.settings };
  bump();
}
export function dump(): Dump {
  const d: any = { settings: S.settings };
  TABLES.forEach((t) => { d[t] = S[t]; });
  return d;
}
export function emptyDump(): Dump {
  return {
    projects: [], activities: [], tags: [], entries: [], absences: [], targets: [], filters: [],
    profiles: [{ id: 1, name: 'Standard', weekdayGoals: [8, 8, 8, 8, 8, 0, 0].map((h) => h * 3_600_000), balanceStart: new Date().getFullYear() + '-01-01', vacationDays: 30 }],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ---------- Nachschlage-Index (pro Datenstand einmal aufgebaut) ----------
interface Index {
  p: Map<number, Project>;
  a: Map<number, Activity>;
  t: Map<number, Tag>;
  acts: Map<number, Activity[]>;
  running: Entry | null;
}
let cache: { v: number; ix: Index } | null = null;
export function ix(): Index {
  if (cache && cache.v === S.version) return cache.ix;
  const acts = new Map<number, Activity[]>();
  for (const a of S.activities) {
    const l = acts.get(a.projectId);
    if (l) l.push(a); else acts.set(a.projectId, [a]);
  }
  const index: Index = {
    p: new Map(S.projects.map((x) => [x.id, x])),
    a: new Map(S.activities.map((x) => [x.id, x])),
    t: new Map(S.tags.map((x) => [x.id, x])),
    acts,
    running: S.entries.find((e) => e.end === null) || null,
  };
  cache = { v: S.version, ix: index };
  return index;
}

export const OTHER = '#8a8983';
export const colorOf = (projectId: number) => ix().p.get(projectId)?.color || OTHER;
export function label(f: Fav): { project: string; activity: string; full: string } {
  const project = ix().p.get(f.projectId)?.name || '(gelöscht)';
  const activity = (f.activityId != null && ix().a.get(f.activityId)?.name) || '';
  return { project, activity, full: activity ? `${project} · ${activity}` : project };
}
export function defaultTags(projectId: number, activityId: number | null): number[] {
  const set = new Set<number>(ix().p.get(projectId)?.tagIds || []);
  if (activityId != null) for (const t of ix().a.get(activityId)?.tagIds || []) set.add(t);
  return [...set];
}

// ---------- Timer ----------
const sec = (t: number) => Math.floor(t / 1000) * 1000;
export function stopTimer(when = Date.now()): Entry | null {
  const r = ix().running;
  if (!r) return null;
  const stopped = { ...r, end: Math.max(sec(when), r.start + 1000) };
  put('entries', stopped);
  return stopped;
}
export function startTimer(f: Fav, when = Date.now()): Entry {
  stopTimer(when);
  const e: Entry = { id: newId('entries'), projectId: f.projectId, activityId: f.activityId, start: sec(when), end: null, note: '', tagIds: defaultTags(f.projectId, f.activityId) };
  put('entries', e);
  return e;
}
export function addEntry(f: Fav, start: number, end: number): Entry {
  const e: Entry = { id: newId('entries'), projectId: f.projectId, activityId: f.activityId, start, end, note: '', tagIds: defaultTags(f.projectId, f.activityId) };
  put('entries', e);
  return e;
}

// ---------- Oberflächen-Zustand ----------
export type Tab = 'today' | 'history' | 'stats' | 'more';
export type SheetSpec =
  | { kind: 'pick'; preset?: { start: number; end: number }; focus?: 'search' | 'all'; day?: string }
  | { kind: 'entry'; id: number }
  | { kind: 'day'; day: string };
export const U: { tab: Tab; day: string | null; sheet: SheetSpec | null; toast: { msg: string; action?: { label: string; fn: () => void } } | null } = {
  tab: 'today', day: null, sheet: null, toast: null,
};
export function setU(patch: Partial<typeof U>): void {
  Object.assign(U, patch);
  bump();
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, action?: { label: string; fn: () => void }): void {
  clearTimeout(toastTimer);
  U.toast = { msg, action };
  toastTimer = setTimeout(() => { U.toast = null; bump(); }, action ? 6000 : 2600);
  bump();
}
