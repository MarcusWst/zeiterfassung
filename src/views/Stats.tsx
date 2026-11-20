import { useMemo, useState } from 'preact/hooks';
import { exportCsv } from '../backup';
import { balance, dayMaps, isBillable, parts, targetMs, targetSum, type Scope } from '../calc';
import { Cols, GoalCal, HBars, Heat, Line, SegBar, type BarRow, type Col } from '../charts';
import { OTHER, S, colorOf, ix, label } from '../store';
import { HOUR, MON, MON_LONG, WD, WD_LONG, addDays, addMonths, dayKey, dayRange, dayStart, fmtDate, fmtDur, fmtH, fmtNum, isoWeek, parseDay, today, wdIndex, weekStart } from '../time';
import { Seg } from '../ui';

type Mode = 'week' | 'month' | 'year' | 'all';
const hrs = (v: number) => fmtH(v, v < 10 * HOUR ? 1 : 0);

export function Stats() {
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(today());
  const [profileId, setProfileId] = useState(S.settings.profileId);
  const [filterId, setFilterId] = useState(0);
  const [drill, setDrill] = useState<string | null>(null);
  const td = today(), sc: Scope = { profileId, filterId };

  let from: string, to: string, title: string;
  const d = parseDay(anchor);
  if (mode === 'week') { from = weekStart(anchor); to = addDays(from, 6); title = `KW ${isoWeek(from)} · ${fmtDate(from).slice(0, 6)}–${fmtDate(to)}`; }
  else if (mode === 'month') { from = dayKey(new Date(d.getFullYear(), d.getMonth(), 1)); to = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)); title = `${MON_LONG[d.getMonth()]} ${d.getFullYear()}`; }
  else if (mode === 'year') { from = `${d.getFullYear()}-01-01`; to = `${d.getFullYear()}-12-31`; title = String(d.getFullYear()); }
  else { from = S.entries.length ? dayKey(S.entries.reduce((m, e) => Math.min(m, e.start), Infinity)) : td; to = td; title = `Alles seit ${fmtDate(from)}`; }
  const move = (n: number) => setAnchor(mode === 'week' ? addDays(anchor, 7 * n) : mode === 'month' ? addMonths(anchor, n) : addMonths(anchor, 12 * n));
  const upto = to < td ? to : td;

  const x = useMemo(() => {
    const P = parts(sc, dayStart(from), dayStart(addDays(to, 1)));
    let total = 0, bill = 0;
    const ids = new Set<number>(), byP = new Map<number, number>(), byA = new Map<string, { projectId: number; activityId: number | null; v: number; n: Set<number> }>();
    const hours = new Array<number>(24).fill(0), wdSum = new Array<number>(7).fill(0), wdDays = Array.from({ length: 7 }, () => new Set<string>());
    for (const p of P) {
      total += p.ms;
      if (isBillable(p.e)) bill += p.ms;
      ids.add(p.e.id);
      byP.set(p.e.projectId, (byP.get(p.e.projectId) || 0) + p.ms);
      const k = p.e.projectId + '|' + (p.e.activityId ?? ''), a = byA.get(k);
      if (a) { a.v += p.ms; a.n.add(p.e.id); } else byA.set(k, { projectId: p.e.projectId, activityId: p.e.activityId, v: p.ms, n: new Set([p.e.id]) });
      for (let s = p.start, end = p.start + p.ms; s < end;) {
        const h = new Date(s), next = new Date(s); next.setMinutes(60, 0, 0);
        const e = Math.min(end, next.getTime());
        hours[h.getHours()] += e - s; s = e;
      }
      const w = wdIndex(p.day); wdSum[w] += p.ms; wdDays[w].add(p.day);
    }
    const { day: dm, bill: bm } = dayMaps(sc);
    const months = new Map<string, number>(), years = new Map<string, { v: number; b: number }>();
    for (const [k, v] of dm) {
      months.set(k.slice(0, 7), (months.get(k.slice(0, 7)) || 0) + v);
      const y = years.get(k.slice(0, 4)) || { v: 0, b: 0 };
      y.v += v; y.b += bm.get(k) || 0; years.set(k.slice(0, 4), y);
    }
    const days = dayRange(from, to);
    let longest = { day: '', v: 0 }, workDays = 0;
    for (const k of days) { const v = dm.get(k) || 0; if (v > 0) workDays++; if (v > longest.v) longest = { day: k, v }; }
    return { total, bill, count: ids.size, byP, byA, hours, wdSum, wdDays, dm, months, years, days, longest, workDays };
  }, [S.version, mode, anchor, profileId, filterId]);

  const profile = S.profiles.find((p) => p.id === profileId);
  const year = parseDay(upto).getFullYear();
  const sollOk = !!profile && !filterId;
  const soll = sollOk ? targetSum(profileId, from, upto) : 0;

  // Projektanteile: die acht größten, der Rest als „Sonstige“
  const sortedP = [...x.byP].sort((a, b) => b[1] - a[1]);
  const projRows: BarRow[] = sortedP.slice(0, 8).map(([id, v]) => ({ key: String(id), name: ix().p.get(id)?.name || '(gelöscht)', v, color: colorOf(id) }));
  if (sortedP.length > 8) projRows.push({ key: 'rest', name: `Sonstige (${sortedP.length - 8})`, v: sortedP.slice(8).reduce((s, r) => s + r[1], 0), color: OTHER });
  const acts = [...x.byA.values()].sort((a, b) => b.v - a.v);
  const drillRows: BarRow[] = drill && drill !== 'rest' ? acts.filter((a) => String(a.projectId) === drill).map((a) => ({ key: a.projectId + '|' + a.activityId, name: label(a).activity || 'ohne Tätigkeit', v: a.v, color: colorOf(a.projectId) })) : [];

  // Verlauf im Zeitraum (Woche und Monat: je Tag)
  const dayCols: Col[] = mode === 'week' || mode === 'month' ? x.days.map((k) => {
    const v = x.dm.get(k) || 0, mark = sollOk ? targetMs(profileId, k) : undefined;
    return { label: mode === 'week' ? WD[wdIndex(k)] : String(parseDay(k).getDate()), v, mark, tip: `${fmtDate(k)}: ${fmtDur(v)}${mark != null ? ` · Soll ${fmtDur(mark)}` : ''}` };
  }) : [];

  const monthCols: Col[] = MON.map((m, i) => {
    const k = (y: number) => `${y}-${String(i + 1).padStart(2, '0')}`, v = x.months.get(k(year)) || 0, prev = x.months.get(k(year - 1)) || 0;
    return { label: m[0], v, prev, tip: `${m} ${year}: ${hrs(v)} · ${year - 1}: ${hrs(prev)}` };
  });
  const billable = S.settings.billableTagId != null;
  const yearCols: Col[] = [...x.years].sort().map(([y, r]) => ({
    label: y.slice(2), v: r.v, parts: billable ? [{ v: r.v - r.b, color: OTHER }, { v: r.b, color: 'var(--accent)' }] : undefined,
    tip: `${y}: ${hrs(r.v)}` + (billable ? ` · davon ${hrs(r.b)} verrechenbar (${r.v ? Math.round((r.b / r.v) * 100) : 0} %)` : ''),
  }));
  const wdCols: Col[] = WD.map((w, i) => {
    const v = x.wdDays[i].size ? x.wdSum[i] / x.wdDays[i].size : 0, mark = sollOk ? profile!.weekdayGoals[i] : undefined;
    return { label: w, v, mark, tip: `${WD_LONG[i]}: Ø ${fmtDur(v)} an ${x.wdDays[i].size} Tagen${mark != null ? ` · Soll ${fmtDur(mark)}` : ''}` };
  });
  const h0 = x.hours.findIndex((v) => v > 0), h1 = 23 - [...x.hours].reverse().findIndex((v) => v > 0);
  const hourCols: Col[] = h0 < 0 ? [] : x.hours.slice(h0, h1 + 1).map((v, i) => ({ label: String(h0 + i), v, tip: `${h0 + i}–${h0 + i + 1} Uhr: ${hrs(v)}` }));

  // Saldo-Verlauf: Ist minus Soll, aufsummiert
  const saldo = useMemo(() => {
    if (!sollOk) return [];
    const a = mode === 'all' ? profile!.balanceStart : from, b = addDays(td, -1) < to ? addDays(td, -1) : to;
    if (b < a) return [];
    let cum = 0;
    const all = dayRange(a, b).map((k) => { cum += (x.dm.get(k) || 0) - targetMs(profileId, k); return { day: k, v: cum }; });
    return all.length > 150 ? all.filter((_, i) => i % 7 === 0 || i === all.length - 1) : all;
  }, [x, sollOk]);

  const vacProfile = profileId || S.settings.profileId, vac = S.absences.filter((a) => a.profileId === vacProfile && a.type === 'vacation' && a.date.startsWith(String(year))).reduce((s, a) => s + a.fraction, 0);
  const vacTotal = S.profiles.find((p) => p.id === vacProfile)?.vacationDays ?? 30;
  const goals = S.projects.filter((p) => !p.archived && p.goalRepeat === 'daily' && p.goalMs > 0);

  return (
    <div class="page">
      <Seg options={[{ id: 'week', label: 'Woche' }, { id: 'month', label: 'Monat' }, { id: 'year', label: 'Jahr' }, { id: 'all', label: 'Alles' }]} value={mode} onChange={(m) => { setMode(m); setAnchor(td); }} />
      <div class="row head">
        <button class="nav" disabled={mode === 'all'} onClick={() => move(-1)} aria-label="Zurück">‹</button>
        <button class="date grow" onClick={() => setAnchor(td)}><b>{title}</b></button>
        <button class="nav" disabled={mode === 'all'} onClick={() => move(1)} aria-label="Weiter">›</button>
      </div>
      <div class="row selects">
        <select value={profileId} onChange={(e) => setProfileId(Number(e.currentTarget.value))} aria-label="Profil">
          <option value={0}>Alle Profile</option>
          {S.profiles.map((p) => <option key={p.id} value={p.id}>Profil: {p.name}</option>)}
        </select>
        <select value={filterId} onChange={(e) => setFilterId(Number(e.currentTarget.value))} aria-label="Filter">
          <option value={0}>Kein Filter</option>
          {S.filters.map((f) => <option key={f.id} value={f.id}>Filter: {f.name}</option>)}
        </select>
      </div>

      <div class="tiles">
        <Tile l="Summe" v={hrs(x.total)} s={sollOk ? <>Soll {hrs(soll)} · <b class={x.total - soll >= 0 ? 'good' : 'bad'}>{fmtDur(x.total - soll, true)}</b></> : `${x.workDays} Tage mit Einträgen`} />
        <Tile l="Ø je Arbeitstag" v={fmtDur(x.workDays ? x.total / x.workDays : 0)} s={`${x.workDays} Tage mit Einträgen`} />
        <Tile l="Einträge" v={fmtNum(x.count)} s={`Ø ${fmtNum(x.count ? x.total / x.count / 60_000 : 0)} min je Eintrag`} />
        {billable && <Tile l="Verrechenbar" v={`${x.total ? Math.round((x.bill / x.total) * 100) : 0} %`} s={`${hrs(x.bill)} von ${hrs(x.total)}`} />}
        {profile && <Tile l={`Saldo „${profile.name}“`} v={fmtDur(balance(profileId), true)} s={`seit ${fmtDate(profile.balanceStart)}, Stand gestern`} cls={balance(profileId) >= 0 ? 'good' : 'bad'} />}
        <Tile l="Längster Tag" v={fmtDur(x.longest.v)} s={x.longest.day ? fmtDate(x.longest.day) : '–'} />
        <Tile l={`Urlaub ${year}`} v={`${fmtNum(vac, vac % 1 ? 1 : 0)} Tage`} s={`von ${vacTotal} · ${fmtNum(vacTotal - vac, (vacTotal - vac) % 1 ? 1 : 0)} offen`} />
      </div>

      {dayCols.length > 0 && <Card t="Verlauf" q={sollOk ? 'Stunden je Tag, der Strich zeigt das Soll.' : 'Stunden je Tag.'}><Cols data={dayCols} top={(v) => fmtDur(v)} /></Card>}

      <Card t="Projektanteile" q="Wohin geht die Zeit? Projekt antippen für seine Tätigkeiten.">
        {projRows.length ? <HBars rows={projRows} fmt={hrs} picked={drill} onPick={(k) => setDrill(drill === k || k === 'rest' ? null : k)} /> : <div class="sub">Keine Zeiten im Zeitraum.</div>}
        {drillRows.length > 0 && (<><div class="lbl">Tätigkeiten in „{ix().p.get(Number(drill))?.name}“</div><HBars rows={drillRows} fmt={hrs} /></>)}
      </Card>

      {billable && <Card t="Verrechenbar-Quote" q="Anteil der Zeit mit dem Tag für verrechenbare Arbeit."><SegBar parts={[{ label: 'Verrechenbar', v: x.bill, color: 'var(--accent)', text: hrs(x.bill) }, { label: 'Nicht verrechenbar', v: x.total - x.bill, color: OTHER, text: hrs(x.total - x.bill) }]} /></Card>}

      <Card t="Top-Tätigkeiten" q="Welche einzelnen Tätigkeiten kosten am meisten Zeit?">
        <table class="tbl">
          <tbody>
            {acts.slice(0, 10).map((a) => {
              const l = label(a);
              return (
                <tr key={a.projectId + '|' + a.activityId}>
                  <td><i class="dot" style={{ background: colorOf(a.projectId) }} /> {l.activity || l.project}{l.activity && <div class="sub">{l.project}</div>}</td>
                  <td class="r tn">{a.n.size}×</td>
                  <td class="r tn">{hrs(a.v)}</td>
                  <td class="r tn sub">{x.total ? Math.round((a.v / x.total) * 100) : 0} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!acts.length && <div class="sub">Keine Zeiten im Zeitraum.</div>}
      </Card>

      <Card t="Wochentags-Profil" q={`Durchschnitt je Wochentag an Tagen mit Einträgen${sollOk ? ', der Strich zeigt das Soll' : ''}.`}><Cols data={wdCols} top={(v) => fmtDur(v)} /></Card>
      {hourCols.length > 0 && <Card t="Tageszeit-Profil" q="Zu welcher Uhrzeit wird gearbeitet? Stunden je Uhrzeit im Zeitraum."><Cols data={hourCols} top={hrs} /></Card>}

      <Card t={`Jahres-Heatmap ${year}`} q="An welchen Tagen wurde wie viel gearbeitet?"><Heat year={year} map={x.dm} fmt={(v) => fmtDur(v)} /></Card>

      {sollOk
        ? <Card t="Saldo-Verlauf" q={mode === 'all' ? `Über- und Minusstunden seit dem Stichtag ${fmtDate(profile!.balanceStart)}.` : 'Über- und Minusstunden im Zeitraum, beginnend bei null.'}><Line pts={saldo} fmt={(v) => fmtDur(v, true)} /></Card>
        : <Card t="Saldo-Verlauf" q="Der Saldo braucht ein Profil und funktioniert nur ohne Filter."><div class="sub">Wähle oben ein Profil und „Kein Filter“.</div></Card>}

      <Card t="Monate im Vorjahresvergleich" q={`${year} gegenüber ${year - 1}.`}>
        <Cols data={monthCols} />
        <div class="legend"><span><i class="sw" style={{ background: 'var(--accent)' }} />{year}</span><span><i class="sw" style={{ background: OTHER }} />{year - 1}</span></div>
      </Card>

      <Card t="Alle Jahre" q={billable ? 'Gesamtstunden je Jahr, unten der verrechenbare Anteil.' : 'Gesamtstunden je Jahr.'}>
        <Cols data={yearCols} top={hrs} />
        {billable && <div class="legend"><span><i class="sw" style={{ background: 'var(--accent)' }} />Verrechenbar</span><span><i class="sw" style={{ background: OTHER }} />Nicht verrechenbar</span></div>}
      </Card>

      {goals.map((p) => <Card key={p.id} t={`Ziel-Kalender: ${p.name}`} q={`Tagesziel ${fmtDur(p.goalMs)} – die letzten zwölf Wochen.`}><GoalCal map={dayMaps({ profileId: 0, filterId: -p.id }).day} goal={p.goalMs} fmt={(v) => fmtDur(v)} /></Card>)}

      <button class="btn sec" style={{ width: '100%' }} onClick={() => exportCsv(dayStart(from), dayStart(addDays(to, 1)))}>Einträge dieses Zeitraums als CSV exportieren</button>
    </div>
  );
}

const Tile = ({ l, v, s, cls }: { l: string; v: string; s: any; cls?: string }) => (
  <div class="stat"><div class="lbl">{l}</div><div class={'v ' + (cls || '')}>{v}</div><div class="sub">{s}</div></div>
);
const Card = ({ t, q, children }: { t: string; q: string; children: any }) => (
  <div class="card"><h3>{t}</h3><p class="q">{q}</p>{children}</div>
);
