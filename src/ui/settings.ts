// Tiny persisted UI settings store (card art on/off), usable from any component.
import { useSyncExternalStore } from 'react';

const KEY = 'gcg-trainer-settings';
export type CardSize = 's' | 'm' | 'l';
interface Settings { art: boolean; cardSize: CardSize }
let settings: Settings = { art: true, cardSize: 'm' };
export const CARD_WIDTH: Record<CardSize, number> = { s: 110, m: 140, l: 176 };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* ignore */ }
const listeners = new Set<() => void>();

export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  settings = { ...settings, [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  listeners.forEach(l => l());
}
/** Re-render every subscriber: useSyncExternalStore only re-renders when the snapshot object changes. */
function invalidate() { settings = { ...settings }; listeners.forEach(l => l()); }
export function useSettings(): Settings {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => settings, () => settings);
}

/** Local path of a card's art (downloaded by scripts/fetch-card-images.ts). Respects the Vite base path (GitHub Pages subfolder). */
export function cardImage(defId: string): string { return `${import.meta.env.BASE_URL}cards/${defId}.webp`; }

/**
 * Whether card art exists in this deployment at all. The public build ships without Bandai's
 * images, so we probe one known card once and hide the art toggle if it is absent.
 */
let artAvailable: boolean | null = null;
export function useArtAvailable(): boolean | null {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => artAvailable, () => artAvailable);
}
if (typeof window !== 'undefined') {
  fetch(cardImage('ST01-001'), { method: 'HEAD', cache: 'no-store' })
    .then(r => { artAvailable = r.ok && (r.headers.get('content-type') ?? '').includes('image'); })
    .catch(() => { artAvailable = false; })
    .finally(() => { settings = { ...settings }; listeners.forEach(l => l()); });
}

/**
 * Track images that failed to load so we fall back to text cards without flicker.
 * A failure is not treated as permanent: the dev server may have been restarting, or the
 * network hiccuped. We re-probe with a HEAD request and only give up on a confirmed 404.
 */
const missing = new Set<string>();
const gaveUp = new Set<string>();
const probing = new Map<string, number>();
export function isMissing(defId: string) { return missing.has(defId); }
export function markMissing(defId: string) {
  if (gaveUp.has(defId) || missing.has(defId)) { if (!gaveUp.has(defId)) scheduleProbe(defId, 3000); return; }
  missing.add(defId);
  invalidate();
  scheduleProbe(defId, 2500);
}
function scheduleProbe(defId: string, delay: number) {
  if (probing.has(defId)) return;
  probing.set(defId, window.setTimeout(async () => {
    probing.delete(defId);
    try {
      const res = await fetch(cardImage(defId), { method: 'HEAD', cache: 'no-store' });
      const isImage = (res.headers.get('content-type') ?? '').includes('image');
      if (res.ok && isImage) { missing.delete(defId); invalidate(); return; }
      // A 404, or a dev/SPA server answering with index.html, means the file is really absent: stay on text cards.
      if (res.status === 404 || (res.ok && !isImage)) { gaveUp.add(defId); return; }
    } catch { /* server unreachable: try again later */ }
    scheduleProbe(defId, Math.min(30000, delay * 2));
  }, delay));
}
/** When the tab regains focus or the network returns, retry every image that is not a confirmed 404. */
if (typeof window !== 'undefined') {
  const retryAll = () => { for (const id of missing) if (!gaveUp.has(id)) scheduleProbe(id, 200); };
  window.addEventListener('focus', retryAll);
  window.addEventListener('online', retryAll);
}

/** Card currently hovered anywhere in the UI, for the large preview panel. */
export interface Peek { defId: string; uid?: number }
let peek: Peek | null = null;
const peekListeners = new Set<() => void>();
export function setPeek(defId: string | null, uid?: number) {
  if ((peek?.defId ?? null) === defId && peek?.uid === uid) return;
  peek = defId ? { defId, uid } : null;
  peekListeners.forEach(l => l());
}
export function usePeek(): Peek | null {
  return useSyncExternalStore(l => { peekListeners.add(l); return () => peekListeners.delete(l); }, () => peek, () => peek);
}
