import { useEffect, useRef, useState } from 'preact/hooks';
import { absencesOn, balance, dayGaps, dayItems, dayMaps, favorites, isPinned, targetMs } from '../calc';
import { POMO, S, U, addEntry, clearPomoDone, colorOf, ix, label, remove, setPlanned, setU, startTimer, stopTimer, toast } from '../store';
import { HOUR, MIN, addDays, dayRange, dayStart, fmtClock, fmtDay, fmtDur, fmtTime, today, weekStart } from '../time';
import type { Fav } from '../types';
import { Dot, Tile, useSize } from '../ui';
import { Onboarding } from './More';

const ABSENCE = { vacation: 'Urlaub', holiday: 'Feiertag', illness: 'Krank' };

export function Today() {
  const day = U.day || today(), isToday = day === today();
  const [, setTick] = useState(0);
  const running = ix().running;
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), running || U.pomoDone ? 1000 : 30_000);
    return () => clearInterval(i);
  }, [!!running || !!U.pomoDone]);

  const [drag, setDrag] = useState<{ fav: Fav; x: number; y: number; hot: string | null } | null>(null);
  const dragged = useRef(false);
  // Favoriten-Bereich: eingeklappt eine Reihe, aufgeklappt alle zwölf
  const [open, setOpenState] = useState(localStorage.getItem('favsOpen') === '1');
  const setOpen = (v: boolean) => { localStorage.setItem('favsOpen', v ? '1' : '0'); setOpenState(v); };
  const onHeadDown = (ev: PointerEvent) => {
    const y0 = ev.clientY;
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const dy = e.clientY - y0;
      setOpen(dy < -15 ? true : dy > 15 ? false : !open); // nach oben wischen öffnet, nach unten schließt, Tippen wechselt
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const tl = useRef<{ el: HTMLElement | null; from: number; to: number }>({ el: null, from: 7, to: 19 });

  if (!S.projects.length && !S.entries.length) return <Onboarding />;

  const profileId = S.settings.profileId;
  const { day: map } = dayMaps({ profileId, filterId: 0 });
  const ist = map.get(day) || 0, soll = targetMs(profileId, day);
  const week = dayRange(weekStart(day), addDays(weekStart(day), 6));
  const weekIst = week.reduce((s, d) => s + (map.get(d) || 0), 0), weekSoll = week.reduce((s, d) => s + targetMs(profileId, d), 0);
  const abs = absencesOn(profileId, day);

  // Wohin zeigt der Finger: auf eine Lücke, auf eine freie Stelle der Zeitleiste oder daneben?
  const hit = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    const gap = el?.closest<HTMLElement>('[data-gap]');
    if (gap) return gap.dataset.gap!;
    const t = tl.current;
    if (t.el && el && t.el.contains(el)) {
      const r = t.el.getBoundingClientRect();
      const ms = dayStart(day) + (t.from + ((y - r.top) / r.height) * (t.to - t.from)) * HOUR;
      const a = Math.max(dayStart(day), Math.round(ms / (15 * MIN)) * 15 * MIN - 30 * MIN);
      return `${a}-${a + 60 * MIN}-free`;
    }
    return null;
  };
  const drop = (fav: Fav, target: string | null) => {
    if (!target) return toast('Kachel auf eine Lücke oder eine freie Stelle im Tag ziehen');
    const [a, b] = target.split('-').map(Number);
    const e = addEntry(fav, a, b), l = label(fav);
    toast(`✓ ${fmtTime(a)}–${fmtTime(b)} ${l.activity || l.project}`, { label: 'Rückgängig', fn: () => remove('entries', e.id) });
  };
  const onTileDown = (ev: PointerEvent, fav: Fav) => {
    if (ev.button > 0) return;
    const x0 = ev.clientX, y0 = ev.clientY, touch = ev.pointerType !== 'mouse';
    let active = false, timer: ReturnType<typeof setTimeout> | undefined;
    const begin = (x: number, y: number) => { active = true; navigator.vibrate?.(15); setDrag({ fav, x, y, hot: hit(x, y) }); };
    // Auf dem Handy hebt kurzes Halten die Kachel an; mit der Maus genügt Ziehen.
    if (touch) timer = setTimeout(() => begin(x0, y0), 280);
    const move = (e: PointerEvent) => {
      if (!active) {
        const d = Math.hypot(e.clientX - x0, e.clientY - y0);
        if (touch) { if (d > 12) clearTimeout(timer); return; }
        if (d < 8) return;
        begin(e.clientX, e.clientY);
      }
      setDrag({ fav, x: e.clientX, y: e.clientY, hot: hit(e.clientX, e.clientY) });
    };
    const end = (e: PointerEvent) => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!active) return;
      dragged.current = true;
      setTimeout(() => { dragged.current = false; }, 80);
      setDrag(null);
      if (e.type === 'pointerup') drop(fav, hit(e.clientX, e.clientY));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const onTileClick = (fav: Fav) => {
    if (dragged.current) return;
    const l = label(fav);
    startTimer(fav);
    U.day = null;
    toast('▶ Timer läuft: ' + (l.activity || l.project));
  };
  const plus = () => {
    const g = dayGaps(day).pop();
    setU({ sheet: g ? { kind: 'pick', preset: { start: g.a, end: g.b }, day } : { kind: 'pick', day } });
  };

  const rl = running ? label(running) : null, pd = U.pomoDone, elapsed = running ? Date.now() - running.start : 0;
  return (
    <div class="today">
      <div class="row head">
        <button class="nav" onClick={() => setU({ day: addDays(day, -1) })} aria-label="Vorheriger Tag">‹</button>
        <button class="date grow" onClick={() => setU({ day: null })}>
          <b>{isToday ? 'Heute' : fmtDay(day)}</b>
          <span class="sub">{isToday ? fmtDay(day) : 'zu heute'}{abs.length ? ' · ' + abs.map((a) => (a.fraction < 1 ? '½ ' : '') + ABSENCE[a.type]).join(', ') : ''}</span>
        </button>
        <button class="nav" onClick={() => setU({ day: addDays(day, 1) })} aria-label="Nächster Tag">›</button>
        <div class="istsoll tn"><b>{fmtDur(ist)}</b><span class="sub"> / {fmtDur(soll)}</span></div>
        <button class="plus" onClick={plus} aria-label="Neuer Eintrag">+</button>
      </div>
      <div class="strip sub tn">
        <span>Woche <b class="ink">{fmtDur(weekIst)}</b> / {fmtDur(weekSoll)}</span>
        <span>Saldo <b class={balance(profileId) >= 0 ? 'good' : 'bad'}>{fmtDur(balance(profileId), true)}</b></span>
      </div>

      {running && rl && (
        <div class="card runbar" onClick={() => setU({ sheet: { kind: 'entry', id: running.id } })}>
          <div class="row">
            <Dot color={colorOf(running.projectId)} />
            <span class="grow ell"><b>{rl.activity || rl.project}</b>{rl.activity && <span class="sub"> · {rl.project}</span>}</span>
            <b class="tn">{running.planned ? 'noch ' + fmtClock(Math.max(0, running.planned - elapsed)) : fmtClock(elapsed)}</b>
            <button class="stop" onClick={(e) => { e.stopPropagation(); stopTimer(); toast('Timer gestoppt'); }} aria-label="Timer stoppen">■</button>
          </div>
          {running.planned && <div class="pbar"><i style={{ width: Math.min(100, (elapsed / running.planned) * 100) + '%' }} /></div>}
          <div class="row pomo" onClick={(e) => e.stopPropagation()}>
            <span class="sub">Pomodoro</span>
            {POMO.map((m) => {
              const on = running.planned === m * MIN;
              return <button key={m} class={'chip' + (on ? ' on' : '')} disabled={!on && elapsed >= m * MIN} onClick={() => setPlanned(on ? null : m)}>{m} min</button>;
            })}
            {running.planned && <span class="sub">bis {fmtTime(running.start + running.planned)}</span>}
          </div>
        </div>
      )}
      {!running && pd && (
        <div class="card runbar">
          <div class="row">
            <span class="grow ell"><b>Pomodoro fertig</b><span class="sub"> · {label(pd).activity || label(pd).project} · Pause seit {fmtClock(Date.now() - pd.at)}</span></span>
            <button class="x" onClick={clearPomoDone} aria-label="Schließen">✕</button>
          </div>
          <div class="row pomo">
            <span class="sub">Nächste Runde</span>
            {POMO.map((m) => <button key={m} class="chip" onClick={() => { startTimer(pd, Date.now(), m * MIN); clearPomoDone(); toast(`▶ Pomodoro ${m} min: ${label(pd).activity || label(pd).project}`); }}>{m} min</button>)}
          </div>
        </div>
      )}

      <Timeline day={day} hot={drag?.hot || null} share={tl.current} />

      <div class="favhead" onPointerDown={onHeadDown} role="button" aria-label={open ? 'Favoriten einklappen' : 'Alle Favoriten zeigen'}>
        <div class="handle" />
        <div class="row"><b class="grow">Favoriten</b><span class="sub">{open ? 'weniger ▾' : 'alle zeigen ▴'}</span></div>
      </div>
      <div class="favs c3">
        {favorites().slice(0, open ? 12 : 3).map((f) => (
          <Tile key={f.projectId + '|' + f.activityId} fav={f} pinned={isPinned(f)} onPointerDown={(e: PointerEvent) => onTileDown(e, f)} onClick={() => onTileClick(f)} onContextMenu={(e: Event) => e.preventDefault()} />
        ))}
        {!favorites().length && <div class="sub pad" style={{ gridColumn: '1/-1' }}>Favoriten erscheinen hier, sobald du Einträge hast.</div>}
      </div>
      {open && <div class="sub" style={{ margin: '6px 2px 0' }}>Tippen = Timer · {matchMedia('(pointer:coarse)').matches ? 'Halten und ziehen' : 'Ziehen'} = Eintragen</div>}
      <div class="find">
        <button class="inp" onClick={() => setU({ sheet: { kind: 'pick', focus: 'search', day } })}><span class="mu">⌕</span><span class="mu">Suchen</span></button>
        <button class="all" onClick={() => setU({ sheet: { kind: 'pick', focus: 'all', day } })}>Alle Projekte</button>
      </div>

      {drag && (
        <div class="dragghost" style={{ left: drag.x + 'px', top: drag.y + 'px', '--c': colorOf(drag.fav.projectId) }}>
          <b class="ell">{label(drag.fav).activity || label(drag.fav).project}</b>
          <span class="ell">{label(drag.fav).activity ? label(drag.fav).project : 'ohne Tätigkeit'}</span>
        </div>
      )}
    </div>
  );
}

function Timeline({ day, hot, share }: { day: string; hot: string | null; share: { el: HTMLElement | null; from: number; to: number } }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const items = dayItems(day), gaps = dayGaps(day), base = dayStart(day), isToday = day === today(), now = Date.now();
  let from = 7, to = 19;
  for (const it of items) { from = Math.min(from, Math.floor((it.s - base) / HOUR)); to = Math.max(to, Math.ceil((it.t - base) / HOUR)); }
  if (isToday) to = Math.max(to, Math.min(24, Math.ceil((now - base) / HOUR + 0.25)));
  from = Math.max(0, from); to = Math.min(24, to);
  share.el = ref.current; share.from = from; share.to = to;
  const y = (t: number) => ((t - base) / HOUR - from) / (to - from) * size.h;
  const step = size.h / (to - from) >= 34 ? 1 : 2;
  const free = hot?.endsWith('-free') ? hot.split('-').map(Number) : null;

  return (
    <div class="tlwrap">
      <div class="tl" ref={ref}>
        {size.h > 0 && (
          <>
            {Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step).map((h) => (
              <div key={h} class="hr" style={{ top: y(base + h * HOUR) + 'px' }}><span>{h}:00</span></div>
            ))}
            {gaps.map((g) => {
              const h = y(g.b) - y(g.a) - 3, id = `${g.a}-${g.b}`;
              return (
                <button key={id} data-gap={id} class={'gap' + (h < 20 ? ' small' : '') + (hot === id ? ' hot' : '')} style={{ top: y(g.a) + 1.5 + 'px', height: Math.max(6, h) + 'px' }}
                  onClick={() => setU({ sheet: { kind: 'pick', preset: { start: g.a, end: g.b }, day } })}>
                  {h >= 20 ? `＋ ${fmtTime(g.a)}–${fmtTime(g.b)} · ${fmtDur(g.b - g.a)}` : h >= 11 ? fmtDur(g.b - g.a) : ''}
                </button>
              );
            })}
            {items.map((it) => {
              const h = Math.max(4, y(it.t) - y(it.s) - 1.5), l = label(it.e), run = it.e.end == null;
              return (
                <button key={it.e.id} class={'ev' + (run ? ' run' : '')} onClick={() => setU({ sheet: { kind: 'entry', id: it.e.id } })}
                  style={{ top: y(it.s) + 'px', height: h + 'px', '--c': colorOf(it.e.projectId), left: it.split && it.lane ? '52%' : undefined, right: it.split && !it.lane ? '50%' : undefined }}>
                  {h >= 13 && <b class="ell">{l.activity || l.project}{h < 28 && <span class="sub"> {fmtDur(it.t - it.s)}</span>}</b>}
                  {h >= 28 && <span class="sub ell">{fmtTime(it.s)}–{run ? 'läuft' : fmtTime(it.t)} · {l.activity ? l.project : fmtDur(it.t - it.s)}</span>}
                </button>
              );
            })}
            {free && <div class="gap hot ghostgap" style={{ top: y(free[0]) + 'px', height: y(free[1]) - y(free[0]) + 'px' }}>{fmtTime(free[0])}–{fmtTime(free[1])}</div>}
            {isToday && now - base < to * HOUR && <div class="now" style={{ top: y(now) + 'px' }} />}
            {!items.length && <div class="empty sub">Noch keine Einträge an diesem Tag.<br />Tippe auf einen Favoriten oder auf das Plus.</div>}
          </>
        )}
      </div>
    </div>
  );
}
