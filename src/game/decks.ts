// Custom decks: storage and auto-building from the card pool.

import { CARDS, DECKS, type DeckDef } from './cards';
import type { CardDef, Color } from '../game/types';

const KEY = 'gcg-trainer-decks';

export function loadCustomDecks(): DeckDef[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function saveCustomDecks(decks: DeckDef[]) {
  try { localStorage.setItem(KEY, JSON.stringify(decks)); } catch { /* ignore */ }
}
export function allDecks(): DeckDef[] { return [...Object.values(DECKS), ...loadCustomDecks()]; }
export function findDeck(id: string): DeckDef | undefined { return allDecks().find(d => d.id === id); }

/** Cards legal for a color selection (1 or 2 colors). */
export function poolFor(colors: Color[]): CardDef[] {
  return Object.values(CARDS).filter(c => colors.includes(c.color)).sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level || a.id.localeCompare(b.id));
}

export interface Validation { ok: boolean; problems: string[]; count: number; colors: Color[] }

export function validateDeck(cards: [string, number][]): Validation {
  const problems: string[] = [];
  const count = cards.reduce((n, [, c]) => n + c, 0);
  const colors = [...new Set(cards.filter(([, c]) => c > 0).map(([id]) => CARDS[id].color))];
  if (count !== 50) problems.push(`Deck has ${count} cards; it must have exactly 50.`);
  if (colors.length > 2) problems.push(`Deck uses ${colors.length} colors; the maximum is 2.`);
  for (const [id, c] of cards) if (c > 4) problems.push(`${CARDS[id].name}: ${c} copies (max 4).`);
  return { ok: problems.length === 0, problems, count, colors };
}

/**
 * Build a reasonable 50-card deck for the chosen colors.
 * Targets: ~24 Units on a curve, ~8 Pilots, ~10 Commands, ~6 Bases, balanced across the two colors.
 */
export function autoBuild(colors: Color[]): [string, number][] {
  const pool = poolFor(colors);
  const counts = new Map<string, number>();
  const add = (c: CardDef, n: number) => counts.set(c.id, Math.min(4, (counts.get(c.id) ?? 0) + n));
  const total = () => [...counts.values()].reduce((a, b) => a + b, 0);
  const byType = (t: CardDef['type']) => pool.filter(c => c.type === t);

  // Units: cheap ones first (curve), then the expensive threats, alternating colors.
  const units = byType('UNIT');
  const cheap = units.filter(u => u.level <= 3), mid = units.filter(u => u.level === 4 || u.level === 5), big = units.filter(u => u.level >= 6);
  const roundRobin = (cards: CardDef[], per: number, cap: number) => {
    const groups = colors.map(col => cards.filter(c => c.color === col));
    let i = 0, guard = 0;
    while (total() < cap && guard++ < 200) {
      const g = groups[i % groups.length]; i++;
      const c = g[Math.floor((i - 1) / groups.length) % Math.max(1, g.length)];
      if (!c || (counts.get(c.id) ?? 0) >= per) { if (groups.every(gr => gr.every(x => (counts.get(x.id) ?? 0) >= per))) break; continue; }
      add(c, 1);
    }
  };
  roundRobin(cheap, 3, 12);
  roundRobin(mid, 3, 20);
  roundRobin(big, 2, 24);
  roundRobin(cheap, 4, 26);

  // Pilots: prefer those that link with units already in the deck.
  const pilots = byType('PILOT').sort((a, b) => linkScore(b, counts) - linkScore(a, counts));
  for (const p of pilots) { if (total() >= 34) break; add(p, Math.min(4, 34 - total())); }

  // Commands: pilot-commands that link first, then the rest.
  const cmds = byType('COMMAND').sort((a, b) => (b.pilotName ? linkScore(b, counts) : 0) - (a.pilotName ? linkScore(a, counts) : 0));
  for (const c of cmds) { if (total() >= 44) break; add(c, Math.min(3, 44 - total())); }

  // Bases
  for (const b of byType('BASE')) { if (total() >= 50) break; add(b, Math.min(3, 50 - total())); }

  // Top up with anything left in the pool (a single-color pool can be too small to reach 50).
  for (const c of [...units, ...cmds, ...pilots, ...byType('BASE')]) { if (total() >= 50) break; if ((counts.get(c.id) ?? 0) < 4) add(c, Math.min(4 - (counts.get(c.id) ?? 0), 50 - total())); }

  return [...counts.entries()].filter(([, n]) => n > 0);
}

function linkScore(pilot: CardDef, counts: Map<string, number>): number {
  const name = pilot.type === 'PILOT' ? pilot.name : (pilot.pilotName ?? '');
  let s = 0;
  for (const [id, n] of counts) {
    const u = CARDS[id];
    if (u.type !== 'UNIT' || !u.link) continue;
    if (u.link.some(req => (req.startsWith('(') ? pilot.traits.includes(req.slice(1, -1)) : name.includes(req)))) s += n;
  }
  return s;
}

/** Maximum legal deck size the pool for these colors can reach (4 copies of each card). */
export function poolMax(colors: Color[]): number { return poolFor(colors).length * 4; }

export function deckColors(d: DeckDef): Color[] {
  return [...new Set(d.cards.filter(([, c]) => c > 0).map(([id]) => CARDS[id].color))];
}
