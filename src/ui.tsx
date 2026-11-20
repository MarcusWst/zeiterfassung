import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { U, colorOf, label, setU } from './store';
import type { Fav } from './types';

export function Sheet({ onClose, title, children }: { onClose: () => void; title?: string; children: ComponentChildren }) {
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="handle" />
        {title && (
          <div class="row sheet-h">
            <b class="grow">{title}</b>
            <button class="x" onClick={onClose} aria-label="Schließen">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toast() {
  const t = U.toast;
  if (!t) return null;
  return (
    <div class="toast">
      <span class="grow">{t.msg}</span>
      {t.action && <button onClick={() => { t.action!.fn(); setU({ toast: null }); }}>{t.action.label}</button>}
    </div>
  );
}

export const Dot = ({ color }: { color: string }) => <i class="dot" style={{ background: color }} />;

/** Favoriten-Kachel: Tätigkeit fett, Projekt klein, Projektfarbe am Rand */
export function Tile({ fav, big, pinned, ...rest }: { fav: Fav; big?: boolean; pinned?: boolean } & Record<string, any>) {
  const l = label(fav);
  return (
    <button class={'tile' + (big ? ' big' : '')} style={{ '--c': colorOf(fav.projectId) }} {...rest}>
      <b class="ell">{l.activity || l.project}</b>
      <span class="ell">{pinned ? '★ ' : ''}{l.activity ? l.project : 'ohne Tätigkeit'}</span>
    </button>
  );
}

export function Chips<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string; color?: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div class="chipbox">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={o.id} class={'chip' + (on ? ' on' : '')} onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}>
            {o.color && <Dot color={o.color} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Seg<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="seg" style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map((o) => <button key={o.id} class={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, set] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => set({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767', '#2aa7b8', '#b0683c', '#7a8a2e', '#b65fc4', '#5c7cfa', '#e0913a', '#4f9d69', '#8a8983'];
