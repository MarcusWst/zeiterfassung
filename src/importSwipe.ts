import { unzipSync } from 'fflate';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { DEFAULT_SETTINGS, type Absence, type AbsenceType, type Activity, type Dump, type Entry, type Filter, type Profile, type Project, type Tag, type Target } from './types';

const SQLITE_MAGIC = 'SQLite format 3';
const isSqlite = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, 15)) === SQLITE_MAGIC;

/** Liest ein SwipeTimes-Backup (Zip oder die enthaltene Datenbank-Datei) und wandelt es in das App-Format um. */
export async function importSwipeTimes(bytes: Uint8Array): Promise<Dump> {
  let dbBytes = bytes;
  if (!isSqlite(bytes)) {
    const files = unzipSync(bytes);
    const found = Object.values(files).find(isSqlite);
    if (!found) throw new Error('In der Datei wurde keine SwipeTimes-Datenbank gefunden.');
    dbBytes = found;
  }
  const SQL = await initSqlJs({ locateFile: () => wasmUrl } as never);
  const sdb = new SQL.Database(dbBytes);
  const rows = (q: string): Record<string, any>[] => {
    try {
      const r = sdb.exec(q)[0];
      return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : [];
    } catch {
      return []; // Tabelle fehlt in dieser SwipeTimes-Version
    }
  };
  try {
    return convert(rows);
  } finally {
    sdb.close();
  }
}

const hex = (rgb: unknown) => '#' + ((Number(rgb) >>> 0) & 0xffffff).toString(16).padStart(6, '0');
/** 'YYYY-MM-DD HH:MM:SS' als Ortszeit */
function ts(s: unknown): number {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?)?/.exec(String(s ?? ''));
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
}
const group = (list: Record<string, any>[], key: string, val: string) => {
  const m = new Map<number, number[]>();
  for (const r of list) { const l = m.get(r[key]); if (l) l.push(r[val]); else m.set(r[key], [r[val]]); }
  return m;
};

function convert(rows: (q: string) => Record<string, any>[]): Dump {
  // SwipeTimes führt das Standardprofil als -1 (früher 1 oder leer); hier wird daraus Profil 1.
  const pid = (v: unknown) => (v == null || Number(v) <= 1 ? 1 : Number(v));

  const tags: Tag[] = rows('select * from tag').map((r) => ({ id: r.id, name: String(r.name).trim(), color: hex(r.rgb) }));
  const tagIds = new Set(tags.map((t) => t.id));
  const clean = (l: number[] | undefined) => [...new Set((l || []).filter((t) => tagIds.has(t)))];

  const projectTags = group(rows('select * from project_tag'), 'project_id', 'tag_id');
  const projectProfiles = group(rows('select * from project_profile'), 'project_id', 'profile_id');
  const projects: Project[] = rows('select * from project').map((r) => ({
    id: r.id, name: String(r.name).trim(), color: hex(r.rgb), archived: r.archived === 1 || r.archived === 'true',
    tagIds: clean(projectTags.get(r.id)), profileIds: [...new Set((projectProfiles.get(r.id) || []).map(pid))],
    goalMs: Number(r.goal) || 0, goalRepeat: ['daily', 'weekly', 'monthly'].includes(r.goal_repetitions) ? r.goal_repetitions : 'none',
  }));
  const projectIds = new Set(projects.map((p) => p.id));

  const activityTags = group(rows('select * from activity_tag'), 'activity_id', 'tag_id');
  const activities: Activity[] = rows('select * from activity').filter((r) => projectIds.has(r.project))
    .map((r) => ({ id: r.id, projectId: r.project, name: String(r.name ?? '').trim(), tagIds: clean(activityTags.get(r.id)) }));
  const activityProject = new Map(activities.map((a) => [a.id, a.projectId]));

  const workTags = group(rows('select work_id, tag_id from work_tag'), 'work_id', 'tag_id');
  const entries: Entry[] = [];
  let skipped = 0;
  for (const r of rows('select id, project, activity, project_name, details, started, stopped, explicit_duration from work')) {
    const start = ts(r.started);
    let end = ts(r.stopped);
    if (Number(r.explicit_duration) > 0) end = start + Number(r.explicit_duration);
    if (isNaN(start) || isNaN(end) || end < start) { skipped++; continue; }
    let projectId: number = r.project;
    if (!projectIds.has(projectId)) {
      // Eintrag verweist auf ein gelöschtes Projekt: über den gespeicherten Namen wiederfinden oder neu anlegen
      const name = String(r.project_name || 'Ohne Projekt').trim();
      let p = projects.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!p) {
        p = { id: Math.max(0, ...projects.map((x) => x.id)) + 1, name, color: '#8a8983', archived: true, tagIds: [], profileIds: [], goalMs: 0, goalRepeat: 'none' };
        projects.push(p);
        projectIds.add(p.id);
      }
      projectId = p.id;
    }
    const activityId = activityProject.get(r.activity) === projectId ? r.activity : null;
    entries.push({ id: r.id, projectId, activityId, start, end, note: String(r.details ?? '').trim(), tagIds: clean(workTags.get(r.id)) });
  }
  if (skipped) console.warn(`${skipped} Einträge ohne gültige Zeiten übersprungen`);

  const vacation = new Map<number, number>();
  for (const r of rows('select * from holiday_settings order by year')) vacation.set(pid(r.profile), Number(r.days) || 30);
  const profiles: Profile[] = [];
  for (const r of rows('select * from profile')) {
    const id = pid(r.id);
    if (profiles.some((p) => p.id === id)) continue;
    const goals = String(r.weekday_goals || '').split(',').map(Number);
    profiles.push({
      id, name: id === 1 ? 'Standard' : String(r.name), weekdayGoals: Array.from({ length: 7 }, (_, i) => goals[i] || 0),
      balanceStart: String(r.balance_day_zero || '').slice(0, 10) || new Date().getFullYear() + '-01-01', vacationDays: vacation.get(id) ?? 30,
    });
  }
  if (!profiles.some((p) => p.id === 1)) profiles.unshift({ id: 1, name: 'Standard', weekdayGoals: [8, 8, 8, 8, 8, 0, 0].map((h) => h * 3_600_000), balanceStart: new Date().getFullYear() + '-01-01', vacationDays: 30 });

  const absences: Absence[] = [];
  const seen = new Set<string>();
  for (const r of rows('select * from holiday_or_hospital')) {
    const [kind, frac] = String(r.it_was).split('-');
    const type: AbsenceType | null = kind === 'vacation' ? 'vacation' : kind === 'holiday' ? 'holiday' : kind === 'illness' ? 'illness' : null;
    const date = String(r.the_date).slice(0, 10), profileId = pid(r.profile), key = `${date}|${type}|${profileId}`;
    if (!type || seen.has(key)) continue;
    seen.add(key);
    absences.push({ id: absences.length + 1, date, type, fraction: frac === '0.5' ? 0.5 : 1, profileId });
  }

  const targets: Target[] = [];
  for (const r of rows('select * from target_time')) {
    const date = String(r.the_date).slice(0, 10), profileId = pid(r.profile_id), id = profileId + '|' + date;
    if (!targets.some((t) => t.id === id)) targets.push({ id, date, profileId, ms: Number(r.the_time) || 0 });
  }

  const byName = new Map(projects.map((p) => [p.name.toLowerCase(), p.id]));
  const mode = (v: unknown): 0 | 1 | 2 => (v === 1 ? 1 : v === 2 ? 2 : 0);
  const filters: Filter[] = rows('select * from profile_filter').map((r) => {
    let pj: any = {}, tj: any = {};
    try { pj = JSON.parse(r.project_json || '{}'); tj = JSON.parse(r.tags_json || '{}'); } catch { /* unlesbarer Filter bleibt leer */ }
    const names: string[] = pj.c || pj.selectedProjectNames || [];
    const projectIdsF = names.map((n) => byName.get(String(n).toLowerCase())).filter((x): x is number => x != null);
    const tagIdsF = clean(tj.b || tj.selectedTagIds || []);
    return {
      id: r.id, name: String(r.filter_name),
      projectMode: projectIdsF.length ? mode(pj.d ?? pj.type) : 0, projectIds: projectIdsF,
      tagMode: tagIdsF.length ? mode(tj.d ?? tj.type) : 0, tagIds: tagIdsF,
    };
  });

  const billable = tags.find((t) => /^verrechenbar$/i.test(t.name));
  return { projects, activities, tags, entries, profiles, absences, targets, filters, settings: { ...DEFAULT_SETTINGS, billableTagId: billable?.id ?? null } };
}
