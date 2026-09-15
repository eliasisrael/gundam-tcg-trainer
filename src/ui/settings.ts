// Tiny persisted UI settings store (card art on/off), usable from any component.
import { useSyncExternalStore } from 'react';

const KEY = 'gcg-trainer-settings';
interface Settings { art: boolean }
let settings: Settings = { art: true };
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
