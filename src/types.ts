export interface Project {
  id: number;
  name: string;
  color: string;
  archived: boolean;
  /** Tags, die neue Einträge dieses Projekts automatisch bekommen */
  tagIds: number[];
  /** Profile, zu denen das Projekt zählt; leer = alle */
  profileIds: number[];
  goalMs: number;
  goalRepeat: 'none' | 'daily' | 'weekly' | 'monthly';
}
export interface Activity { id: number; projectId: number; name: string; tagIds: number[] }
export interface Tag { id: number; name: string; color: string }
export interface Entry {
  id: number;
  projectId: number;
  activityId: number | null;
  start: number;
  /** null = Timer läuft */
  end: number | null;
  note: string;
  tagIds: number[];
  /** Pomodoro: geplante Dauer in ms; der Timer endet dann von selbst */
  planned?: number;
}
export interface Profile {
  id: number;
  name: string;
  /** Soll je Wochentag in ms, Index 0 = Montag */
  weekdayGoals: number[];
  /** Ab diesem Tag wird der Saldo gezählt */
  balanceStart: string;
  vacationDays: number;
}
export type AbsenceType = 'vacation' | 'holiday' | 'illness';
export interface Absence { id: number; date: string; type: AbsenceType; fraction: number; profileId: number }
/** Abweichendes Soll für einen einzelnen Tag */
export interface Target { id: string; date: string; profileId: number; ms: number }
/** mode: 0 = egal, 1 = nur diese, 2 = ohne diese */
export interface Filter { id: number; name: string; projectMode: 0 | 1 | 2; projectIds: number[]; tagMode: 0 | 1 | 2; tagIds: number[] }
export interface Fav { projectId: number; activityId: number | null }
export interface Settings {
  pinned: Fav[];
  profileId: number;
  billableTagId: number | null;
  theme: 'system' | 'light' | 'dark';
  /** Bildschirm während eines Pomodoro anlassen, damit das Signal sicher kommt */
  keepAwake: boolean;
}
export interface Tables {
  projects: Project[];
  activities: Activity[];
  tags: Tag[];
  entries: Entry[];
  profiles: Profile[];
  absences: Absence[];
  targets: Target[];
  filters: Filter[];
}
export type Dump = Tables & { settings: Settings };
export const TABLES = ['projects', 'activities', 'tags', 'entries', 'profiles', 'absences', 'targets', 'filters'] as const;
export const DEFAULT_SETTINGS: Settings = { pinned: [], profileId: 1, billableTagId: null, theme: 'dark', keepAwake: true };
