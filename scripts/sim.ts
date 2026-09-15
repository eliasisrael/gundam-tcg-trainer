// AI vs AI smoke simulation: catches runtime errors and stuck states.
import { createGame, applyAction, whoseDecision } from '../src/game/engine';
import { aiNextAction } from '../src/game/ai';
import type { PlayerId } from '../src/game/types';
import { DECKS } from '../src/game/cards';
const DECK_IDS = Object.keys(DECKS);

const games = Number(process.argv[2] ?? 200);
let wins = { p1: 0, p2: 0 }, turns = 0, stuck = 0, errors = 0, maxTurn = 0, deckouts = 0;
const deckWins: Record<string, { w: number; g: number }> = {};
for (let g = 0; g < games; g++) {
  const d1 = DECK_IDS[g % DECK_IDS.length], d2 = DECK_IDS[Math.floor(g / DECK_IDS.length) % DECK_IDS.length];
  const s = createGame({ p1Deck: d1, p2Deck: d2, humanId: 'p1', seed: 1000 + g });
  s.players.p1.isAI = true; s.players.p2.isAI = true;
  let steps = 0;
  try {
    while (!s.winner && steps < 5000) {
      const who: PlayerId | null = s.pending ? s.pending.player : whoseDecision(s);
      if (!who) { stuck++; console.log('STUCK (no decision)', g, s.phase, s.turn, JSON.stringify(s.battle)); break; }
      const dec = aiNextAction(s, who);
      if (!dec) { stuck++; console.log('STUCK (no action)', g, s.phase, s.turn, s.pending?.kind); break; }
      const a = dec.action;
      const before = JSON.stringify([s.turn, s.phase, s.pending?.kind, s.battle?.step, s.players.p1.hand.length, s.players.p2.hand.length]);
      applyAction(s, a);
      steps++;
      if (a.type !== 'endMain' && JSON.stringify([s.turn, s.phase, s.pending?.kind, s.battle?.step, s.players.p1.hand.length, s.players.p2.hand.length]) === before && a.type !== 'attack' && a.type !== 'playCard' && a.type !== 'activateMain') {
        // no visible change from a choice: suspicious but allowed (e.g. pass)
      }
    }
    if (steps >= 5000) { stuck++; console.log('LOOP', g, s.turn, s.phase, s.pending?.kind, s.battle?.step); }
  } catch (e) { errors++; console.log('ERROR game', g, 'turn', s.turn, (e as Error).stack?.split('\n').slice(0, 4).join('\n')); }
  if (s.winner) { wins[s.winner]++; turns += s.turn; maxTurn = Math.max(maxTurn, s.turn); if (s.loseReason?.includes('deck')) deckouts++; for (const [d, p] of [[d1, 'p1'], [d2, 'p2']] as const) { deckWins[d] ??= { w: 0, g: 0 }; deckWins[d].g++; if (s.winner === p) deckWins[d].w++; } }
  // integrity: card conservation
  for (const p of ['p1', 'p2'] as PlayerId[]) {
    const ps = s.players[p];
    const total = ps.deck.length + ps.hand.length + ps.shields.length + ps.trash.length + ps.units.filter(u => !u.card.token).length + ps.units.filter(u => u.pilot).length + (ps.base && !ps.base.isEx ? 1 : 0) + s.holding.filter(c => c.owner === p).length;
    if (total !== 50 && !s.winner) console.log('CARD COUNT MISMATCH', g, p, total);
    if (total !== 50 && s.winner && total < 48) console.log('CARD COUNT LOW', g, p, total);
  }
}
console.log('deck win rates:', Object.fromEntries(Object.entries(deckWins).map(([d, v]) => [d, (100 * v.w / v.g).toFixed(0) + '%'])));
console.log({ games, wins, avgTurns: (turns / Math.max(1, wins.p1 + wins.p2)).toFixed(1), maxTurn, deckouts, stuck, errors });
