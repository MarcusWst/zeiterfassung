export const MIN = 60_000;
export const HOUR = 3_600_000;
export const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MON_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const pad = (n: number) => String(n).padStart(2, '0');

/** Tagesschlüssel YYYY-MM-DD in Ortszeit */
export function dayKey(t: number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDay(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const dayStart = (k: string) => parseDay(k).getTime();
export function addDays(k: string, n: number): string {
  const d = parseDay(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function addMonths(k: string, n: number): string {
  const d = parseDay(k);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return dayKey(d);
}
/** 0 = Montag … 6 = Sonntag */
export const wdIndex = (k: string) => (parseDay(k).getDay() + 6) % 7;
export const weekStart = (k: string) => addDays(k, -wdIndex(k));
export const today = () => dayKey(Date.now());

export function isoWeek(k: string): number {
  const d = parseDay(k);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86_400_000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

/** Alle Tage von a bis b (einschließlich) */
export function dayRange(a: string, b: string): string[] {
  const out: string[] = [];
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k);
  return out;
}

/** 7:51 bzw. −0:09 */
export function fmtDur(ms: number, sign = false): string {
  const neg = ms < 0;
  const m = Math.round(Math.abs(ms) / MIN);
  return (neg ? '−' : sign && m > 0 ? '+' : '') + Math.floor(m / 60) + ':' + pad(m % 60);
}
/** 1.620 h */
export function fmtH(ms: number, digits = 0): string {
  return (ms / HOUR).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' h';
}
export const fmtNum = (n: number, digits = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function fmtTime(t: number): string {
  const d = new Date(t);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
}
/** Fr., 20. Nov. */
export function fmtDay(k: string, long = false): string {
  const d = parseDay(k);
  const wd = (d.getDay() + 6) % 7;
  return long ? `${WD_LONG[wd]}, ${d.getDate()}. ${MON_LONG[d.getMonth()]} ${d.getFullYear()}` : `${WD[wd]}., ${d.getDate()}. ${MON[d.getMonth()]}`;
}
export const fmtDate = (k: string) => { const d = parseDay(k); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };

/** Zeitstempel aus Tag und HH:MM */
export function at(k: string, hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  const d = parseDay(k);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/** Zerlegt einen Zeitraum an den Tagesgrenzen */
export function eachDayPart(start: number, end: number, cb: (day: string, ms: number, segStart: number) => void): void {
  let s = start;
  while (s < end) {
    const k = dayKey(s);
    const e = Math.min(end, dayStart(addDays(k, 1)));
    cb(k, e - s, s);
    s = e;
  }
}
