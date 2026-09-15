// Auto-build every color combination, validate it, and play bot-vs-bot games with it.
import { autoBuild, poolMax, validateDeck } from '../src/game/decks';
import { createGame, applyAction, whoseDecision } from '../src/game/engine';
import { aiNextAction } from '../src/game/ai';
import type { Color } from '../src/game/types';
import { CARDS, type DeckDef } from '../src/game/cards';
const COLORS: Color[] = ['Blue', 'Green', 'Red', 'White', 'Purple'];
let fails = 0;
const combos: Color[][] = [];
for (let i = 0; i < COLORS.length; i++) { combos.push([COLORS[i]]); for (let j = i + 1; j < COLORS.length; j++) combos.push([COLORS[i], COLORS[j]]); }
const decks: DeckDef[] = [];
for (const cs of combos) {
  const cards = autoBuild(cs);
  const v = validateDeck(cards);
  const units = cards.filter(([id]) => CARDS[id].type === 'UNIT').reduce((n, [, c]) => n + c, 0);
  const smallPool = poolMax(cs) < 50 && v.count === poolMax(cs);
  console.log(v.ok ? 'PASS' : smallPool ? 'SKIP (pool too small for a mono deck)' : 'FAIL', cs.join('/'), `${v.count} cards, ${units} units`, v.problems.join(' '));
  if (!v.ok && !smallPool) fails++;
  if (!v.ok) continue;
  decks.push({ id: cs.join('-'), name: cs.join('/'), colors: cs, description: '', cards });
}
let errors = 0, games = 0;
for (let g = 0; g < decks.length * 4; g++) {
  const d1 = decks[g % decks.length], d2 = decks[(g * 7 + 3) % decks.length];
  const s = createGame({ p1Deck: d1, p2Deck: d2, humanId: 'p1', seed: 5000 + g });
  s.players.p1.isAI = true; s.players.p2.isAI = true;
  let steps = 0;
  try {
    while (!s.winner && steps++ < 5000) { const who = s.pending ? s.pending.player : whoseDecision(s); if (!who) break; const a = aiNextAction(s, who); if (!a) break; applyAction(s, a.action); }
    if (!s.winner) { console.log('STUCK', d1.name, 'vs', d2.name, s.turn, s.phase, s.pending?.kind); errors++; }
  } catch (e) { errors++; console.log('ERROR', d1.name, 'vs', d2.name, (e as Error).stack?.split('\n').slice(0, 3).join(' | ')); }
  games++;
}
console.log(`${games} custom-deck games, ${errors} errors/stuck`);
console.log(fails || errors ? 'FAILURES' : 'ALL PASS');
process.exit(fails || errors ? 1 : 0);
