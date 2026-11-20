import { useState } from 'preact/hooks';
import { MON, addDays, dayKey, fmtDate, parseDay, wdIndex } from './time';

// Alle Diagramme zeigen den genauen Wert in einer Zeile darunter, sobald man einen Balken antippt
// oder mit der Maus darüberfährt – auf dem Handy gibt es kein Hover.

export interface Col { label: string; tip: string; v: number; prev?: number; mark?: number; parts?: { v: number; color: string }[] }

export function Cols({ data, height = 110, hint, top }: { data: Col[]; height?: number; hint?: string; top?: (v: number) => string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.v, d.prev || 0, d.mark || 0))) * 1.1;
  const every = data.length <= 12 ? 1 : data.length <= 16 ? 2 : data.length <= 24 ? 3 : 5;
  const imax = data.reduce((m, d, i) => (d.v > data[m].v ? i : m), 0);
  return (
    <div class="chart">
      <div class="cols" style={{ height: height + 'px' }}>
        {data.map((d, i) => (
          <button key={i} class={'c' + (sel === i ? ' sel' : '')} onClick={() => setSel(sel === i ? null : i)} onMouseEnter={() => setSel(i)} aria-label={d.tip}>
            {d.prev != null && <i class="prev" style={{ height: (d.prev / max) * 100 + '%' }} />}
            {d.parts ? (
              <span class="stack" style={{ height: (d.v / max) * 100 + '%' }}>{d.parts.filter((p) => p.v > 0).map((p, j) => <i key={j} style={{ flex: p.v, background: p.color }} />)}</span>
            ) : (
              <i style={{ height: (d.v / max) * 100 + '%' }} />
            )}
            {d.mark != null && d.mark > 0 && <u style={{ bottom: (d.mark / max) * 100 + '%' }} />}
            {top && i === imax && d.v > 0 && sel == null && <em style={{ bottom: `calc(${(d.v / max) * 100}% + 2px)` }}>{top(d.v)}</em>}
          </button>
        ))}
      </div>
      <div class="xl">{data.map((d, i) => <span key={i}>{i % every === 0 ? d.label : ''}</span>)}</div>
      <div class="tip">{sel != null && data[sel] ? data[sel].tip : hint || 'Balken antippen für den genauen Wert'}</div>
    </div>
  );
}

export interface BarRow { key: string; name: string; sub?: string; v: number; color: string }
export function HBars({ rows, fmt, onPick, picked }: { rows: BarRow[]; fmt: (v: number) => string; onPick?: (key: string) => void; picked?: string | null }) {
  const max = Math.max(1, ...rows.map((r) => r.v)), total = rows.reduce((s, r) => s + r.v, 0) || 1;
  return (
    <div class="hb">
      {rows.map((r) => (
        <button key={r.key} class={'hbr' + (picked === r.key ? ' sel' : '')} onClick={() => onPick?.(r.key)} disabled={!onPick} title={`${r.name}: ${fmt(r.v)} (${Math.round((r.v / total) * 100)} %)`}>
          <span class="n ell">{r.name}{r.sub && <span class="sub"> · {r.sub}</span>}</span>
          <span class="t"><i style={{ width: (r.v / max) * 100 + '%', background: r.color }} /></span>
          <span class="v tn">{fmt(r.v)}</span>
          <span class="p tn">{Math.round((r.v / total) * 100)} %</span>
        </button>
      ))}
    </div>
  );
}

/** Ein Jahr als Kalender: eine Spalte je Woche, eine Zeile je Wochentag */
export function Heat({ year, map, fmt }: { year: number; map: Map<string, number>; fmt: (v: number) => string }) {
  const [sel, setSel] = useState<string | null>(null);
  const first = `${year}-01-01`, start = addDays(first, -wdIndex(first)), c = 5.4, g = 1.2;
  let maxV = 0;
  const cells: { k: string; w: number; d: number; v: number }[] = [];
  for (let w = 0; w < 54; w++) for (let d = 0; d < 7; d++) {
    const k = addDays(start, w * 7 + d);
    if (parseDay(k).getFullYear() !== year) continue;
    const v = map.get(k) || 0;
    if (v > maxV) maxV = v;
    cells.push({ k, w, d, v });
  }
  const scale = Math.max(1, Math.min(maxV, 9 * 3_600_000));
  const level = (v: number) => (v <= 0 ? 0 : v < scale / 3 ? 1 : v < (2 * scale) / 3 ? 2 : v < scale ? 3 : 4);
  const weeks = cells.length ? cells[cells.length - 1].w + 1 : 53;
  return (
    <div class="chart">
      <svg class="heat" viewBox={`0 0 ${weeks * (c + g)} ${7 * (c + g) + 10}`}>
        {MON.map((m, i) => {
          const w = Math.floor((parseDay(`${year}-${String(i + 1).padStart(2, '0')}-01`).getTime() - parseDay(start).getTime()) / 604_800_000 + 0.01);
          return <text key={m} x={w * (c + g)} y={7} class="axis">{m}</text>;
        })}
        {cells.map((x) => (
          <rect key={x.k} x={x.w * (c + g)} y={x.d * (c + g) + 10} width={c} height={c} rx={1.2} class={'h' + level(x.v) + (sel === x.k ? ' sel' : '')} onClick={() => setSel(x.k)} onMouseEnter={() => setSel(x.k)} />
        ))}
      </svg>
      <div class="row" style={{ marginTop: 4 }}>
        <div class="tip grow" style={{ margin: 0 }}>{sel ? `${fmtDate(sel)}: ${fmt(map.get(sel) || 0)}` : 'Tag antippen für den genauen Wert'}</div>
        <div class="heatleg sub">0 {[0, 1, 2, 3, 4].map((l) => <i key={l} class={'h' + l} />)} {fmt(scale)}+</div>
      </div>
    </div>
  );
}

export function Line({ pts, fmt }: { pts: { day: string; v: number }[]; fmt: (v: number) => string }) {
  const [sel, setSel] = useState<number | null>(null);
  if (pts.length < 2) return <div class="sub">Für diesen Zeitraum gibt es noch keinen Verlauf.</div>;
  const W = 320, H = 120, R = 46, pad = 10;
  const vals = pts.map((p) => p.v), mn = Math.min(0, ...vals), mx = Math.max(0, ...vals);
  const x = (i: number) => (i / (pts.length - 1)) * (W - R), y = (v: number) => pad + ((mx - v) / (mx - mn || 1)) * (H - 2 * pad);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const li = pts.length - 1, i = sel ?? li;
  const pick = (e: MouseEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    setSel(Math.max(0, Math.min(li, Math.round((((e.clientX - r.left) / r.width) * W) / (W - R) * li))));
  };
  const ticks = [0, 0.33, 0.66, 1].map((f) => Math.round(f * li));
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H + 16}`} class="line" onClick={pick} onMouseMove={pick}>
        <line x1={0} x2={W - R} y1={y(0)} y2={y(0)} class="base" />
        <path d={`${path} L${x(li)} ${y(0)} L0 ${y(0)} Z`} class="area" />
        <path d={path} class="stroke" />
        {sel != null && <line x1={x(i)} x2={x(i)} y1={pad / 2} y2={H} class="cross" />}
        <circle cx={x(i)} cy={y(pts[i].v)} r={4} class="pt" />
        <text x={Math.min(x(i) + 7, W - R + 4)} y={y(pts[i].v) + 4} class="val">{fmt(pts[i].v)}</text>
        {ticks.map((t, j) => <text key={j} x={x(t)} y={H + 13} class="axis" text-anchor={j === 0 ? 'start' : j === 3 ? 'end' : 'middle'}>{parseDay(pts[t].day).getDate()}. {MON[parseDay(pts[t].day).getMonth()]}</text>)}
      </svg>
      <div class="tip">{`${fmtDate(pts[i].day)}: ${fmt(pts[i].v)}`}{sel == null ? ' · Linie antippen für einen anderen Tag' : ''}</div>
    </div>
  );
}

export function SegBar({ parts }: { parts: { label: string; v: number; color: string; text: string }[] }) {
  const total = parts.reduce((s, p) => s + p.v, 0);
  if (!total) return <div class="sub">Keine Zeiten im Zeitraum.</div>;
  return (
    <div class="chart">
      <div class="segbar">
        {parts.filter((p) => p.v > 0).map((p) => <i key={p.label} style={{ flex: p.v, background: p.color }} title={`${p.label}: ${p.text}`}>{p.v / total > 0.14 ? Math.round((p.v / total) * 100) + ' %' : ''}</i>)}
      </div>
      <div class="legend">{parts.map((p) => <span key={p.label}><i class="sw" style={{ background: p.color }} />{p.label} · {p.text}</span>)}</div>
    </div>
  );
}

/** Ziel-Kalender: die letzten zwölf Wochen, ein Kästchen je Tag */
export function GoalCal({ map, goal, fmt }: { map: Map<string, number>; goal: number; fmt: (v: number) => string }) {
  const [sel, setSel] = useState<string | null>(null);
  const end = dayKey(Date.now()), start = addDays(addDays(end, -wdIndex(end)), -11 * 7), c = 14, g = 4;
  const cells: { k: string; w: number; d: number; v: number }[] = [];
  let hit = 0, streak = 0, run = 0;
  for (let w = 0; w < 12; w++) for (let d = 0; d < 7; d++) {
    const k = addDays(start, w * 7 + d);
    if (k > end) continue;
    const v = map.get(k) || 0;
    if (v >= goal) { hit++; run++; streak = Math.max(streak, run); } else run = 0;
    cells.push({ k, w, d, v });
  }
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${12 * (c + g)} ${7 * (c + g)}`} class="goal">
        {cells.map((x) => <rect key={x.k} x={x.w * (c + g)} y={x.d * (c + g)} width={c} height={c} rx={4} class={(x.v >= goal ? 'done' : x.v > 0 ? 'part' : 'none') + (sel === x.k ? ' sel' : '')} onClick={() => setSel(x.k)} onMouseEnter={() => setSel(x.k)} />)}
      </svg>
      <div class="legend"><span><i class="sw done" />Ziel erreicht ({hit} Tage)</span><span><i class="sw part" />angefangen</span><span>längste Serie: {streak} Tage</span></div>
      <div class="tip">{sel ? `${fmtDate(sel)}: ${fmt(map.get(sel) || 0)}` : 'Tag antippen für den genauen Wert'}</div>
    </div>
  );
}
