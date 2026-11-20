import { endOf } from './calc';
import { S, dump, ix } from './store';
import { fmtDate, fmtTime, dayKey } from './time';
import { DEFAULT_SETTINGS, TABLES, type Dump } from './types';

export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const stamp = () => dayKey(Date.now());

export function exportBackup(): void {
  download(`backup-zeiterfassung-${stamp()}.json`, JSON.stringify({ app: 'zeiterfassung', format: 1, exported: new Date().toISOString(), ...dump() }), 'application/json');
  localStorage.setItem('lastBackup', String(Date.now()));
}

export function parseBackup(text: string): Dump {
  const j = JSON.parse(text);
  if (j?.app !== 'zeiterfassung') throw new Error('Das ist keine Backup-Datei dieser App.');
  const d: any = { settings: { ...DEFAULT_SETTINGS, ...(j.settings || {}) } };
  for (const t of TABLES) {
    if (!Array.isArray(j[t])) throw new Error(`Die Backup-Datei ist unvollständig (${t} fehlt).`);
    d[t] = j[t];
  }
  return d;
}

/** CSV für Excel: Semikolon-getrennt, Dezimalkomma, UTF-8 mit BOM */
export function exportCsv(from = 0, to = Infinity): void {
  const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';
  const lines = ['Datum;Start;Ende;Dauer (h);Projekt;Tätigkeit;Tags;Notiz'];
  for (const e of [...S.entries].sort((a, b) => a.start - b.start)) {
    if (e.start < from || e.start >= to) continue;
    const end = endOf(e);
    lines.push([
      fmtDate(dayKey(e.start)), fmtTime(e.start), fmtTime(end), ((end - e.start) / 3_600_000).toFixed(2).replace('.', ','),
      q(ix().p.get(e.projectId)?.name || ''), q((e.activityId != null && ix().a.get(e.activityId)?.name) || ''),
      q(e.tagIds.map((t) => ix().t.get(t)?.name).filter(Boolean).join(', ')), q(e.note),
    ].join(';'));
  }
  download(`zeiten-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}
