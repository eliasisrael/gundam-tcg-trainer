// Pit bot levels against each other with mirrored decks to confirm the stronger levels win more.
import { createGame, applyAction, whoseDecision } from '../src/game/engine';
import { aiNextAction } from '../src/game/ai';
import { DECKS } from '../src/game/cards';
import type { BotLevel, PlayerId } from '../src/game/types';

function play(a: BotLevel, b: BotLevel, games: number) {
  let wa = 0, wb = 0, errors = 0;
  const ids = Object.keys(DECKS);
  for (let g = 0; g < games; g++) {
    const deck = ids[g % ids.length];
    const first: PlayerId = g % 2 ? 'p1' : 'p2';
    const s = createGame({ p1Deck: deck, p2Deck: deck, humanId: 'p1', seed: 9000 + g, first });
    s.players.p1.isAI = true; s.players.p2.isAI = true;
    s.botLevelByPlayer = { p1: a, p2: b };
    let steps = 0;
    try {
      while (!s.winner && steps++ < 6000) { const who = s.pending ? s.pending.player : whoseDecision(s); if (!who) break; const d = aiNextAction(s, who); if (!d) break; applyAction(s, d.action); }
    } catch (e) { errors++; console.log('ERROR', (e as Error).stack?.split('\n').slice(0, 3).join(' | ')); }
    if (s.winner === 'p1') wa++; else if (s.winner === 'p2') wb++;
  }
  console.log(`${a} vs ${b}: ${wa}-${wb} (${(100 * wa / Math.max(1, wa + wb)).toFixed(0)}% for ${a}), errors ${errors}`);
  return errors;
}
const n = Number(process.argv[2] ?? 100);
let errs = 0;
errs += play('advanced', 'basic', n);
errs += play('ace', 'basic', n);
errs += play('ace', 'advanced', n);
errs += play('basic', 'basic', 40);
process.exit(errs ? 1 : 0);
