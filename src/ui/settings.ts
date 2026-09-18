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
export function useSettings(): Settings {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => settings, () => settings);
}

/** Local path of a card's art (downloaded by scripts/fetch-card-images.ts). */
export function cardImage(defId: string): string { return `/cards/${defId}.webp`; }

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
  listeners.forEach(l => l());
  scheduleProbe(defId, 2500);
}
function scheduleProbe(defId: string, delay: number) {
  if (probing.has(defId)) return;
  probing.set(defId, window.setTimeout(async () => {
    probing.delete(defId);
    try {
      const res = await fetch(cardImage(defId), { method: 'HEAD', cache: 'no-store' });
      if (res.ok) { missing.delete(defId); listeners.forEach(l => l()); return; }
      if (res.status === 404) { gaveUp.add(defId); return; } // really not downloaded: stay on text cards
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
let peek: string | null = null;
const peekListeners = new Set<() => void>();
export function setPeek(defId: string | null) { if (peek === defId) return; peek = defId; peekListeners.forEach(l => l()); }
export function usePeek(): string | null {
  return useSyncExternalStore(l => { peekListeners.add(l); return () => peekListeners.delete(l); }, () => peek, () => peek);
}
