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

/** Track which images failed to load so we fall back to text cards without flicker on re-render. */
const missing = new Set<string>();
export function markMissing(defId: string) { missing.add(defId); listeners.forEach(l => l()); }
export function isMissing(defId: string) { return missing.has(defId); }

/** Card currently hovered anywhere in the UI, for the large preview panel. */
let peek: string | null = null;
const peekListeners = new Set<() => void>();
export function setPeek(defId: string | null) { if (peek === defId) return; peek = defId; peekListeners.forEach(l => l()); }
export function usePeek(): string | null {
  return useSyncExternalStore(l => { peekListeners.add(l); return () => peekListeners.delete(l); }, () => peek, () => peek);
}
