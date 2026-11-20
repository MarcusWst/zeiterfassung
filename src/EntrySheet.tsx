import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { activityUse, dayItems, favorites, isPinned, projectsByUse } from './calc';
import { S, U, addEntry, colorOf, defaultTags, ix, label, newId, put, remove, setU, startTimer, stopTimer, toast, type SheetSpec } from './store';
import { MIN, addDays, at, dayKey, fmtDay, fmtDur, fmtTime, today } from './time';
import type { Entry, Fav } from './types';
import { Chips, Dot, PALETTE, Seg, Sheet, Tile } from './ui';

const close = () => setU({ sheet: null });

export function EntrySheet({ spec }: { spec: Extract<SheetSpec, { kind: 'pick' | 'entry' }> }) {
  const existing = spec.kind === 'entry' ? S.entries.find((e) => e.id === spec.id) : undefined;
  const [fav, setFav] = useState<Fav | null>(existing ? { projectId: existing.projectId, activityId: existing.activityId } : null);
  const [picking, setPicking] = useState(!existing);
  if (spec.kind === 'entry' && !existing) return null;

  if (picking || !fav) {
    return (
      <Sheet onClose={fav ? () => setPicking(false) : close} title={spec.kind === 'pick' && spec.preset ? `${fmtTime(spec.preset.start)} – ${fmtTime(spec.preset.end)} · ${fmtDur(spec.preset.end - spec.preset.start)}` : 'Projekt wählen'}>
        <Pick focus={spec.kind === 'pick' ? spec.focus : undefined} onPick={(f) => { setFav(f); setPicking(false); }} />
      </Sheet>
    );
  }
  return (
    <Sheet onClose={close}>
      <Form key={fav.projectId + '|' + fav.activityId} fav={fav} existing={existing} spec={spec} onChangeFav={() => setPicking(true)} />
    </Sheet>
  );
}

// ---------- Schritt 1: Was? ----------
export function Pick({ onPick, focus }: { onPick: (f: Fav) => void; focus?: 'search' | 'all' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focus === 'search') input.current?.focus(); }, []);
  const projects = projectsByUse(), use = activityUse();
  const acts = (pid: number) => [...(ix().acts.get(pid) || [])].sort((a, b) => (use.get(b.id) || 0) - (use.get(a.id) || 0) || a.name.localeCompare(b.name, 'de'));

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = useMemo(() => {
    if (!words.length) return [];
    const out: Fav[] = [];
    for (const p of projects) {
      const pn = p.name.toLowerCase();
      if (words.every((w) => pn.includes(w))) out.push({ projectId: p.id, activityId: null });
      for (const a of acts(p.id)) if (words.every((w) => (pn + ' ' + a.name.toLowerCase()).includes(w))) out.push({ projectId: p.id, activityId: a.id });
      if (out.length > 40) break;
    }
    return out;
  }, [q, S.version]);

  const newProject = () => {
    const name = q.trim();
    if (!name) return;
    const p = { id: newId('projects'), name, color: PALETTE[S.projects.length % PALETTE.length], archived: false, tagIds: [], profileIds: [], goalMs: 0, goalRepeat: 'none' as const };
    put('projects', p);
    onPick({ projectId: p.id, activityId: null });
  };
  const newActivity = (projectId: number) => {
    const name = prompt('Name der neuen Tätigkeit')?.trim();
    if (!name) return;
    const a = { id: newId('activities'), projectId, name, tagIds: [] };
    put('activities', a);
    onPick({ projectId, activityId: a.id });
  };

  return (
    <div>
      <div class="inp">
        <span class="mu">⌕</span>
        <input ref={input} value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="Projekt oder Tätigkeit suchen" autocomplete="off" />
        {q && <button class="x" onClick={() => setQ('')}>✕</button>}
      </div>
      {words.length > 0 ? (
        <div class="list">
          {hits.map((f) => {
            const l = label(f);
            return (
              <button class="li" key={f.projectId + '|' + f.activityId} onClick={() => onPick(f)}>
                <Dot color={colorOf(f.projectId)} />
                <span class="grow ell"><b>{l.activity || l.project}</b>{l.activity && <span class="sub"> · {l.project}</span>}</span>
              </button>
            );
          })}
          {!hits.length && <div class="sub pad">Nichts gefunden.</div>}
          <button class="li accent" onClick={newProject}>＋ Projekt „{q.trim()}“ neu anlegen</button>
        </div>
      ) : (
        <>
          {focus !== 'all' && (
            <>
              <div class="lbl">Favoriten</div>
              <div class="favs c3">{favorites().map((f) => <Tile key={f.projectId + '|' + f.activityId} fav={f} pinned={isPinned(f)} onClick={() => onPick(f)} />)}</div>
            </>
          )}
          <div class="lbl">Alle Projekte</div>
          <div class="list">
            {projects.map((p) => (
              <div key={p.id}>
                <button class="li" onClick={() => ((ix().acts.get(p.id) || []).length ? setOpen(open === p.id ? null : p.id) : onPick({ projectId: p.id, activityId: null }))}>
                  <Dot color={p.color} />
                  <b class="grow ell">{p.name}</b>
                  {(ix().acts.get(p.id) || []).length > 0 && <span class="sub">{(ix().acts.get(p.id) || []).length} {open === p.id ? '▾' : '▸'}</span>}
                </button>
                {open === p.id && (
                  <div class="chipbox sublist">
                    {acts(p.id).map((a) => <button class="chip" key={a.id} onClick={() => onPick({ projectId: p.id, activityId: a.id })}>{a.name}</button>)}
                    <button class="chip ghost" onClick={() => onPick({ projectId: p.id, activityId: null })}>ohne Tätigkeit</button>
                    <button class="chip ghost" onClick={() => newActivity(p.id)}>＋ neu</button>
                  </div>
                )}
              </div>
            ))}
            {!projects.length && <div class="sub pad">Noch keine Projekte. Tippe oben einen Namen ein, um das erste anzulegen.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Schritt 2: Wann? ----------
const hm = (t: number) => fmtTime(t);
function shift(hmStr: string, min: number): string {
  const [h, m] = hmStr.split(':').map(Number);
  const v = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

function Form({ fav, existing, spec, onChangeFav }: { fav: Fav; existing?: Entry; spec: Extract<SheetSpec, { kind: 'pick' | 'entry' }>; onChangeFav: () => void }) {
  const preset = spec.kind === 'pick' ? spec.preset : undefined;
  const init = useMemo(() => {
    if (existing) return { day: dayKey(existing.start), s: hm(existing.start), t: existing.end == null ? '' : hm(existing.end) };
    if (preset) return { day: dayKey(preset.start), s: hm(preset.start), t: hm(preset.end) };
    const day = (spec.kind === 'pick' && spec.day) || today(), now = Math.floor(Date.now() / MIN) * MIN;
    const lastEnd = dayItems(day).reduce((m, it) => Math.max(m, it.t), 0);
    if (day === today()) {
      const start = lastEnd && lastEnd < now ? lastEnd : now - 60 * MIN;
      return { day, s: hm(start), t: hm(now - start > 240 * MIN ? start + 60 * MIN : now) };
    }
    const start = lastEnd || at(day, '09:00');
    return { day, s: hm(start), t: hm(start + 60 * MIN) };
  }, []);

  const running = !!existing && existing.end == null;
  const [mode, setMode] = useState<'timer' | 'log'>(existing || preset || (spec.kind === 'pick' && spec.day && spec.day !== today()) ? 'log' : 'timer');
  const [day, setDay] = useState(init.day);
  const [s, setS] = useState(init.s);
  const [t, setT] = useState(init.t);
  const [back, setBack] = useState(0);
  const sameFav = existing && existing.projectId === fav.projectId && existing.activityId === fav.activityId;
  const [tagIds, setTagIds] = useState<number[]>(sameFav ? existing!.tagIds : defaultTags(fav.projectId, fav.activityId));
  const [note, setNote] = useState(existing?.note || '');

  const start = at(day, s);
  let end = t ? at(day, t) : null;
  if (end != null && end <= start) end = at(addDays(day, 1), t);
  const dur = end != null ? end - start : 0;
  const l = label(fav);

  const save = () => {
    if (existing) {
      if (!running && end == null) return toast('Bitte eine Endzeit eintragen.');
      if (running && start > Date.now()) return toast('Der Start liegt in der Zukunft.');
      put('entries', { ...existing, ...fav, start, end: running ? null : end, tagIds, note: note.trim() });
      toast('Gespeichert');
    } else if (mode === 'timer') {
      const e = startTimer(fav, Date.now() - back * MIN);
      put('entries', { ...e, tagIds, note: note.trim() });
      toast('▶ Timer läuft: ' + (l.activity || l.project));
      U.day = null;
      U.tab = 'today';
    } else {
      if (end == null) return toast('Bitte eine Endzeit eintragen.');
      const e = addEntry(fav, start, end);
      put('entries', { ...e, tagIds, note: note.trim() });
      toast(`✓ Eingetragen: ${s}–${t} ${l.activity || l.project}`);
    }
    close();
  };
  const del = () => {
    if (!existing || !confirm('Diesen Eintrag löschen?')) return;
    const copy = { ...existing };
    remove('entries', existing.id);
    close();
    toast('Eintrag gelöscht', { label: 'Rückgängig', fn: () => put('entries', copy) });
  };

  return (
    <div>
      <button class="row favrow" onClick={onChangeFav}>
        <Dot color={colorOf(fav.projectId)} />
        <span class="grow ell" style={{ textAlign: 'left' }}><b>{l.project}</b><br /><span class="sub">{l.activity || 'ohne Tätigkeit'}</span></span>
        <span class="sub">ändern</span>
      </button>

      {!existing && <Seg options={[{ id: 'timer', label: 'Timer' }, { id: 'log', label: 'Nachtragen' }]} value={mode} onChange={setMode} />}

      {mode === 'timer' && !existing ? (
        <div class="timerbox">
          <div class="sub">Start</div>
          <div class="bigtime tn">{fmtTime(Date.now() - back * MIN)}</div>
          <div class="chipbox center">
            {[0, 5, 10, 15, 30].map((m) => <button key={m} class={'chip' + (back === m ? ' on' : '')} onClick={() => setBack(m)}>{m ? `vor ${m} min` : 'jetzt'}</button>)}
          </div>
        </div>
      ) : (
        <>
          <label class="field">
            <span class="sub">Tag</span>
            <input type="date" value={day} onInput={(e) => e.currentTarget.value && setDay(e.currentTarget.value)} />
            <span class="sub">{fmtDay(day)}</span>
          </label>
          <div class="time">
            <TimeBox label="Von" value={s} onChange={setS} />
            <span class="sub">–</span>
            {running ? <div class="tbox"><div class="sub">Bis</div><b>läuft …</b></div> : <TimeBox label="Bis" value={t} onChange={setT} />}
          </div>
          {!running && (
            <>
              <div class="sub" style={{ margin: '6px 2px 0' }}>Dauer <b class="ink">{fmtDur(dur)}</b>{end != null && dayKey(end) !== day && dayKey(end - 1) !== day ? ' · endet am Folgetag' : ''}</div>
              <div class="chipbox" style={{ marginTop: 8 }}>
                {[15, 30, 45, 60, 90, 120, 180].map((m) => <button key={m} class={'chip' + (dur === m * MIN ? ' on' : '')} onClick={() => setT(shift(s, m))}>{fmtDur(m * MIN)}</button>)}
              </div>
            </>
          )}
        </>
      )}

      {S.tags.length > 0 && (
        <>
          <div class="lbl">Tags</div>
          <Chips options={S.tags.map((x) => ({ id: x.id, label: x.name, color: x.color }))} value={tagIds} onChange={setTagIds} />
        </>
      )}
      <div class="inp" style={{ marginTop: 12 }}><input value={note} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Notiz (optional)" /></div>

      <div class="row" style={{ marginTop: 12 }}>
        {existing && <button class="btn sec danger" onClick={del}>Löschen</button>}
        {running && <button class="btn sec" onClick={() => { stopTimer(); close(); toast('Timer gestoppt'); }}>■ Stoppen</button>}
        <button class="btn grow" onClick={save}>{existing ? 'Speichern' : mode === 'timer' ? '▶ Timer starten' : `Eintragen · ${fmtDur(dur)}`}</button>
      </div>
    </div>
  );
}

function TimeBox({ label: lbl, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div class="tbox">
      <div class="sub">{lbl}</div>
      <div class="row" style={{ gap: 4 }}>
        <input type="time" value={value} onInput={(e) => onChange(e.currentTarget.value)} />
        <button class="step" onClick={() => onChange(shift(value || '00:00', -5))} aria-label={lbl + ' 5 Minuten früher'}>−</button>
        <button class="step" onClick={() => onChange(shift(value || '00:00', 5))} aria-label={lbl + ' 5 Minuten später'}>+</button>
      </div>
    </div>
  );
}
