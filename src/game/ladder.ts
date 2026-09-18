// Challenge levels and the player's record at each.
import type { BotLevel } from './types';
import type { CoachMode } from './coach';

export type LevelId = 'rookie' | 'pilot' | 'ace' | 'custom';
export interface LevelDef { id: LevelId; name: string; bot: BotLevel; coach: CoachMode; blurb: string }

export const LEVELS: LevelDef[] = [
  { id: 'rookie', name: 'Rookie', bot: 'basic', coach: 'full', blurb: 'The basic bot and a coach that points out free kills, links and lethal. Learn the patterns here.' },
  { id: 'pilot', name: 'Pilot', bot: 'advanced', coach: 'hints', blurb: 'The bot evaluates every attack, blocks smartly and sets up kills with buffs. The coach explains the situation but never names the best move.' },
  { id: 'ace', name: 'Ace', bot: 'ace', coach: 'review', blurb: 'The bot also plays around your Blockers, keeps its own defenders home and counts lethal races. No live coaching; your turns are reviewed afterwards.' },
  { id: 'custom', name: 'Custom', bot: 'advanced', coach: 'full', blurb: 'Pick the bot strength and the coach mode yourself.' },
];

export type Record = { [k in LevelId]?: { w: number; l: number } };
const KEY = 'gcg-trainer-ladder';
export function loadRecord(): Record { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } }
export function recordResult(level: LevelId, won: boolean) {
  const r = loadRecord();
  const e = r[level] ?? { w: 0, l: 0 };
  if (won) e.w++; else e.l++;
  r[level] = e;
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ignore */ }
}
/** Suggest the next level after a streak of wins. */
export function suggestion(level: LevelId): string | null {
  const r = loadRecord()[level];
  if (!r) return null;
  if (level === 'rookie' && r.w >= 3 && r.w >= r.l * 2) return 'You are winning comfortably here. Try Pilot: the bot gets sharper and the coach stops naming moves.';
  if (level === 'pilot' && r.w >= 3 && r.w >= r.l * 2) return 'Ready for Ace: the bot plays around your Blockers and there is no live coaching.';
  return null;
}
