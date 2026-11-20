import { useState } from 'preact/hooks';
import { absencesOn, dayItems, dayMaps, targetMs } from '../calc';
import { HBars } from '../charts';
import { S, U, colorOf, ix, label, newId, put, remove, setU, toast } from '../store';
import { HOUR, MON, WD, addDays, dayRange, dayStart, fmtDay, fmtDur, fmtTime, isoWeek, parseDay, today, weekStart } from '../time';
import type { AbsenceType } from '../types';
import { Dot, Sheet } from '../ui';

const ABSENCE: Record<AbsenceType, string> = { vacation: 'Urlaub', holiday: 'Feiertag', illness: 'Krank' };

export function History() {
  const [anchor, setAnchor] = useState(weekStart(U.day || today()));
  const days = dayRange(anchor, addDays(anchor, 6)), profileId = S.settings.profileId;
  const { day: map } = dayMaps({ profileId, filterId: 0 });
  const ist = days.reduce((s, d) => s + (map.get(d) || 0), 0), soll = days.reduce((s, d) => s + targetMs(profileId, d), 0);
  const a = parseDay(days[0]), b = parseDay(days[6]);
  const range = a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${MON[b.getMonth()]}` : `${a.getDate()}. ${MON[a.getMonth()]} – ${b.getDate()}. ${MON[b.getMonth()]}`;

  // Wochenraster: gemeinsamer Stundenbereich für alle sieben Tage
  let from = 8, to = 18;
  const all = days.map((d) => dayItems(d));
  all.forEach((items, i) => items.forEach((it) => {
    from = Math.min(from, Math.floor((it.s - dayStart(days[i])) / HOUR));
    to = Math.max(to, Math.ceil((it.t - dayStart(days[i])) / HOUR));
  }));
  const pct = (t: number, d: string) => ((t - dayStart(d)) / HOUR - from) / (to - from) * 100;

  const byProject = new Map<number, number>();
  all.forEach((items) => items.forEach((it) => byProject.set(it.e.projectId, (byProject.get(it.e.projectId) || 0) + it.t - it.s)));
  const rows = [...byProject].sort((x, y) => y[1] - x[1]).map(([id, v]) => ({ key: String(id), name: ix().p.get(id)?.name || '(gelöscht)', v, color: colorOf(id) }));

  return (
    <div class="page">
      <div class="row head">
        <button class="nav" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Vorherige Woche">‹</button>
        <button class="date grow" onClick={() => setAnchor(weekStart(today()))}><b>KW {isoWeek(anchor)} · {range}</b><span class="sub">{a.getFullYear()}{anchor !== weekStart(today()) ? ' · zur aktuellen Woche' : ''}</span></button>
        <button class="nav" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Nächste Woche">›</button>
      </div>

      <div class="wk">
        {days.map((d, i) => (
          <button key={d} class={'wkd' + (d === today() ? ' on' : '')} onClick={() => setU({ tab: 'today', day: d === today() ? null : d })}>
            <span class="sub">{WD[i]} {parseDay(d).getDate()}.</span>
            <b class="tn">{map.get(d) ? fmtDur(map.get(d)!) : '–'}</b>
            <div class="wkcol">
              {all[i].map((it) => (
                <i key={it.e.id} style={{ top: pct(it.s, d) + '%', height: `max(2px, calc(${pct(it.t, d) - pct(it.s, d)}% - 1.5px))`, background: colorOf(it.e.projectId), left: it.split && it.lane ? '52%' : undefined, right: it.split && !it.lane ? '50%' : undefined }} />
              ))}
            </div>
          </button>
        ))}
      </div>

      <div class="card">
        <div class="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
          <b class="big tn grow">{fmtDur(ist)}</b>
          <span class="sub tn">Soll {fmtDur(soll)} · <b class={ist - soll >= 0 ? 'good' : 'bad'}>{fmtDur(ist - soll, true)}</b></span>
        </div>
        {rows.length ? <HBars rows={rows} fmt={(v) => fmtDur(v)} /> : <div class="sub">Keine Einträge in dieser Woche.</div>}
        <div class="sub" style={{ marginTop: 8 }}>Ist und Soll zählen für das Profil „{S.profiles.find((p) => p.id === profileId)?.name}“; die Balken zeigen alle Projekte.</div>
      </div>

      {[...days].reverse().filter((d) => d <= today() || all[days.indexOf(d)].length).map((d) => {
        const items = all[days.indexOf(d)], abs = absencesOn(profileId, d);
        return (
          <div class="card daycard" key={d}>
            <div class="row dayhead">
              <b class="grow">{fmtDay(d)}{abs.map((x) => <span class="badge" key={x.id}>{x.fraction < 1 ? '½ ' : ''}{ABSENCE[x.type]}</span>)}</b>
              <span class="sub tn"><b class="ink">{fmtDur(map.get(d) || 0)}</b> / {fmtDur(targetMs(profileId, d))}</span>
              <button class="x" onClick={() => setU({ sheet: { kind: 'day', day: d } })} aria-label="Tag bearbeiten">⋯</button>
            </div>
            {items.map((it) => {
              const l = label(it.e);
              return (
                <button class="li" key={it.e.id} onClick={() => setU({ sheet: { kind: 'entry', id: it.e.id } })}>
                  <span class="sub tn times">{fmtTime(it.s)}–{it.e.end == null ? '…' : fmtTime(it.t)}</span>
                  <Dot color={colorOf(it.e.projectId)} />
                  <span class="grow ell">{l.activity || l.project}{l.activity && <span class="sub"> · {l.project}</span>}{it.e.note && <span class="sub"> – {it.e.note}</span>}</span>
                  <span class="tn">{fmtDur(it.t - it.s)}</span>
                </button>
              );
            })}
            {!items.length && <div class="sub pad">Keine Einträge</div>}
            <button class="li accent" onClick={() => setU({ sheet: { kind: 'pick', day: d } })}>＋ Eintrag</button>
          </div>
        );
      })}
    </div>
  );
}

/** Abwesenheit und abweichendes Soll für einen Tag */
export function DaySheet({ day }: { day: string }) {
  const profileId = S.settings.profileId, profile = S.profiles.find((p) => p.id === profileId);
  const abs = absencesOn(profileId, day), cur = abs[0] ? `${abs[0].type}|${abs[0].fraction}` : '';
  const override = S.targets.find((t) => t.id === profileId + '|' + day);
  const [hours, setHours] = useState(override ? String(override.ms / HOUR).replace('.', ',') : '');
  const close = () => setU({ sheet: null });
  const setAbs = (v: string) => {
    abs.forEach((x) => remove('absences', x.id));
    if (v) { const [type, f] = v.split('|'); put('absences', { id: newId('absences'), date: day, type: type as AbsenceType, fraction: Number(f), profileId }); }
  };
  const saveTarget = () => {
    const id = profileId + '|' + day, v = hours.trim().replace(',', '.');
    if (v === '') { if (override) remove('targets', id); }
    else if (isNaN(Number(v)) || Number(v) < 0) return toast('Bitte Stunden als Zahl eingeben, z. B. 4 oder 6,5.');
    else put('targets', { id, date: day, profileId, ms: Number(v) * HOUR });
    close();
  };
  const opts = [['', 'Keine'], ['vacation|1', 'Urlaub'], ['vacation|0.5', '½ Urlaub'], ['holiday|1', 'Feiertag'], ['holiday|0.5', '½ Feiertag'], ['illness|1', 'Krank']];
  return (
    <Sheet onClose={close} title={fmtDay(day, true)}>
      <div class="sub">Gilt für das Profil „{profile?.name}“.</div>
      <div class="lbl">Abwesenheit</div>
      <div class="chipbox">{opts.map(([v, l]) => <button key={v} class={'chip' + (cur === v ? ' on' : '')} onClick={() => setAbs(v)}>{l}</button>)}</div>
      <div class="lbl">Abweichendes Soll in Stunden</div>
      <div class="inp"><input inputMode="decimal" value={hours} onInput={(e) => setHours(e.currentTarget.value)} placeholder={`Standard: ${fmtDur(profile?.weekdayGoals[(parseDay(day).getDay() + 6) % 7] || 0)}`} /></div>
      <div class="sub" style={{ marginTop: 6 }}>Leer lassen für das normale Soll des Wochentags. Eine Abwesenheit kürzt das Soll anteilig.</div>
      <button class="btn" style={{ marginTop: 12, width: '100%' }} onClick={saveTarget}>Fertig</button>
    </Sheet>
  );
}
