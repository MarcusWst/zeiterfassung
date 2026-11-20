import { S, ix } from './store';
import { MIN, addDays, dayKey, dayRange, dayStart, eachDayPart, today, wdIndex } from './time';
import type { Entry, Fav, Filter, Project } from './types';

// Zwischenspeicher: gilt für einen Datenstand; läuft ein Timer, zusätzlich nur für die aktuelle Minute.
let mv = -1, mm = -1;
const cache = new Map<string, unknown>();
export function memo<T>(key: string, fn: () => T): T {
  const minute = ix().running ? Math.floor(Date.now() / MIN) : 0;
  if (S.version !== mv || minute !== mm) { cache.clear(); mv = S.version; mm = minute; }
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
}

/** Ende eines Eintrags; ein laufender Pomodoro zählt höchstens bis zu seiner geplanten Dauer */
export const endOf = (e: Entry) => e.end ?? Math.max(e.start, e.planned ? Math.min(Date.now(), e.start + e.planned) : Date.now());
export const durOf = (e: Entry) => endOf(e) - e.start;

/** profileId 0 = alle Profile */
export function inProfile(projectId: number, profileId: number): boolean {
  if (!profileId) return true;
  const p = ix().p.get(projectId);
  return !p || p.profileIds.length === 0 || p.profileIds.includes(profileId);
}
export function matchFilter(e: Entry, f: Filter | undefined): boolean {
  if (!f) return true;
  if (f.projectMode) {
    const has = f.projectIds.includes(e.projectId);
    if (f.projectMode === 1 ? !has : has) return false;
  }
  if (f.tagMode) {
    const has = e.tagIds.some((t) => f.tagIds.includes(t));
    if (f.tagMode === 1 ? !has : has) return false;
  }
  return true;
}
export const isBillable = (e: Entry) => S.settings.billableTagId != null && e.tagIds.includes(S.settings.billableTagId);

/** filterId: 0 = kein Filter, > 0 = gespeicherter Filter, < 0 = nur das Projekt mit dieser Nummer */
export interface Scope { profileId: number; filterId: number }
function resolveFilter(id: number): Filter | undefined {
  if (id < 0) return { id, name: '', projectMode: 1, projectIds: [-id], tagMode: 0, tagIds: [] };
  return id ? S.filters.find((f) => f.id === id) : undefined;
}
const scopeKey = (sc: Scope) => `${sc.profileId}|${sc.filterId}`;
export function inScope(e: Entry, sc: Scope): boolean {
  return inProfile(e.projectId, sc.profileId) && matchFilter(e, resolveFilter(sc.filterId));
}

/** Summen je Tag über die gesamte Zeit: gesamt und verrechenbar */
export function dayMaps(sc: Scope): { day: Map<string, number>; bill: Map<string, number> } {
  return memo('dm|' + scopeKey(sc), () => {
    const day = new Map<string, number>(), bill = new Map<string, number>();
    const f = resolveFilter(sc.filterId);
    for (const e of S.entries) {
      if (!inProfile(e.projectId, sc.profileId) || !matchFilter(e, f)) continue;
      const b = isBillable(e);
      eachDayPart(e.start, endOf(e), (k, ms) => {
        day.set(k, (day.get(k) || 0) + ms);
        if (b) bill.set(k, (bill.get(k) || 0) + ms);
      });
    }
    return { day, bill };
  });
}

export interface Part { e: Entry; day: string; ms: number; start: number }
/** Einträge im Zeitraum [from, to), an Tagesgrenzen zerlegt und auf den Zeitraum beschnitten */
export function parts(sc: Scope, from: number, to: number): Part[] {
  return memo(`parts|${scopeKey(sc)}|${from}|${to}`, () => {
    const out: Part[] = [];
    const f = resolveFilter(sc.filterId);
    for (const e of S.entries) {
      const end = endOf(e);
      if (end <= from || e.start >= to) continue;
      if (!inProfile(e.projectId, sc.profileId) || !matchFilter(e, f)) continue;
      eachDayPart(Math.max(e.start, from), Math.min(end, to), (day, ms, start) => out.push({ e, day, ms, start }));
    }
    return out;
  });
}

// ---------- Soll und Saldo ----------
function lookups() {
  return memo('lookups', () => {
    const target = new Map<string, number>(), absence = new Map<string, number>();
    for (const t of S.targets) target.set(t.profileId + '|' + t.date, t.ms);
    for (const a of S.absences) { const k = a.profileId + '|' + a.date; absence.set(k, Math.min(1, (absence.get(k) || 0) + a.fraction)); }
    return { target, absence };
  });
}
export function targetMs(profileId: number, day: string): number {
  const p = S.profiles.find((x) => x.id === profileId);
  if (!p) return 0;
  const l = lookups(), k = profileId + '|' + day;
  const base = l.target.get(k) ?? p.weekdayGoals[wdIndex(day)] ?? 0;
  return base * (1 - (l.absence.get(k) || 0));
}
export const absencesOn = (profileId: number, day: string) => S.absences.filter((a) => a.profileId === profileId && a.date === day);
export const targetSum = (profileId: number, from: string, to: string) => dayRange(from, to).reduce((s, d) => s + targetMs(profileId, d), 0);

/** Saldo vom Stichtag des Profils bis einschließlich gestern */
export function balance(profileId: number): number {
  return memo('bal|' + profileId, () => {
    const p = S.profiles.find((x) => x.id === profileId);
    if (!p) return 0;
    const { day } = dayMaps({ profileId, filterId: 0 });
    let sum = 0;
    for (const d of dayRange(p.balanceStart, addDays(today(), -1))) sum += (day.get(d) || 0) - targetMs(profileId, d);
    return sum;
  });
}

// ---------- Tagesansicht ----------
export interface DayItem { e: Entry; s: number; t: number; lane: 0 | 1; split: boolean }
/** Einträge eines Tages, auf den Tag beschnitten; überlappende Einträge kommen in eine zweite Spur */
export function dayItems(day: string): DayItem[] {
  return memo('day|' + day, () => {
    const a = dayStart(day), b = dayStart(addDays(day, 1));
    const items: DayItem[] = S.entries
      .filter((e) => e.start < b && endOf(e) > a)
      .map((e) => ({ e, s: Math.max(e.start, a), t: Math.min(endOf(e), b), lane: 0 as 0 | 1, split: false }))
      .sort((x, y) => x.s - y.s);
    let end0 = 0, last0: DayItem | null = null;
    for (const it of items) {
      if (last0 && it.s < end0 - MIN) { it.lane = 1; it.split = true; last0.split = true; }
      else { last0 = it; end0 = it.t; }
    }
    return items;
  });
}
/** Lücken zwischen den Einträgen eines Tages; heute zusätzlich bis jetzt */
export function dayGaps(day: string, minMs = 15 * MIN): { a: number; b: number }[] {
  const items = dayItems(day), out: { a: number; b: number }[] = [];
  let end = 0;
  for (const it of items) {
    if (end && it.s - end >= minMs) out.push({ a: end, b: it.s });
    end = Math.max(end, it.t);
  }
  const now = Math.floor(Date.now() / MIN) * MIN;
  if (day === today() && end && !ix().running && now - end >= minMs) out.push({ a: end, b: now });
  return out;
}

// ---------- Favoriten ----------
const favKey = (f: Fav) => f.projectId + '|' + (f.activityId ?? '');
export const sameFav = (a: Fav, b: Fav) => favKey(a) === favKey(b);
export const isPinned = (f: Fav) => S.settings.pinned.some((p) => sameFav(p, f));
const valid = (f: Fav) => { const p = ix().p.get(f.projectId); return !!p && !p.archived && (f.activityId == null || ix().a.has(f.activityId)); };

/** Angeheftete zuerst, dann die häufigsten Kombinationen der letzten 90 Tage */
export function favorites(n = 12): Fav[] {
  return memo('fav|' + n, () => {
    const out: Fav[] = S.settings.pinned.filter(valid).slice(0, n);
    const since = Date.now() - 90 * 86_400_000, count = new Map<string, { f: Fav; n: number }>();
    for (const e of S.entries) {
      if (e.start < since) continue;
      const f = { projectId: e.projectId, activityId: e.activityId }, k = favKey(f);
      const c = count.get(k);
      if (c) c.n++; else count.set(k, { f, n: 1 });
    }
    for (const c of [...count.values()].sort((a, b) => b.n - a.n)) {
      if (out.length >= n) break;
      if (valid(c.f) && !out.some((o) => sameFav(o, c.f))) out.push(c.f);
    }
    return out;
  });
}
/** Aktive Projekte, die im letzten Jahr am häufigsten genutzten zuerst */
export function projectsByUse(): Project[] {
  return memo('pbu', () => {
    const since = Date.now() - 365 * 86_400_000, n = new Map<number, number>();
    for (const e of S.entries) if (e.start >= since) n.set(e.projectId, (n.get(e.projectId) || 0) + 1);
    return S.projects.filter((p) => !p.archived).sort((a, b) => (n.get(b.id) || 0) - (n.get(a.id) || 0) || a.name.localeCompare(b.name, 'de'));
  });
}
export function activityUse(): Map<number, number> {
  return memo('au', () => {
    const since = Date.now() - 365 * 86_400_000, n = new Map<number, number>();
    for (const e of S.entries) if (e.activityId != null && e.start >= since) n.set(e.activityId, (n.get(e.activityId) || 0) + 1);
    return n;
  });
}
export const usedCount = (pred: (e: Entry) => boolean) => S.entries.reduce((n, e) => n + (pred(e) ? 1 : 0), 0);
export { dayKey };
