// Scripted human-path tests through the lesson sandboxes.
import { LESSONS } from '../src/learn/lessons';
import { applyAction, whoseDecision } from '../src/game/engine';
import { aiNextAction } from '../src/game/ai';
import type { GameState } from '../src/game/types';

function runAI(s: GameState) { let g = 0; while (!s.winner && g++ < 500) { const who = s.pending ? s.pending.player : whoseDecision(s); if (!who || !s.players[who].isAI) break; const a = aiNextAction(s, who); if (!a) break; applyAction(s, a.action); } }
function pick(s: GameState, match: (label: string) => boolean) {
  const o = s.pending!.options.find(o => match(o.label));
  if (!o) throw new Error(`no option matching; had: ${s.pending!.options.map(o => o.label).join(' | ')}`);
  applyAction(s, { type: 'choose', player: 'p1', optionId: o.id }); runAI(s);
}
let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) fails++; };

// Lesson 6: block with Zowort, play Unforeseen Incident on Sandrock in the action step.
{
  const s = LESSONS.find(l => l.id === 'defense')!.setup!(); runAI(s);
  check('L6 block prompt appears', s.pending?.kind === 'block', s.pending?.kind);
  pick(s, l => l.includes('Zowort'));
  check('L6 action step prompt', s.pending?.kind === 'actionStep', s.pending?.kind);
  pick(s, l => l.includes('Unforeseen'));
  check('L6 target prompt after action command', s.pending?.kind === 'target', s.pending?.kind);
  pick(s, l => l.includes('Sandrock'));
  const zowort = s.players.p1.units.find(u => u.card.defId === 'ST01-009');
  const sandrock = s.players.p2.units.find(u => u.card.defId === 'ST02-004');
  check('L6 Zowort survives with 1 damage', !!zowort && zowort.damage === 1, JSON.stringify(zowort?.damage));
  check('L6 Sandrock destroyed', !sandrock);
  check('L6 task satisfied', LESSONS.find(l => l.id === 'defense')!.steps[3].task!.check(s, 'p1'));
}
// Lesson 4: deploy Gundam, pair Amuro (When Paired rests Tragos), attack as a Link Unit.
{
  const s = LESSONS.find(l => l.id === 'pilots')!.setup!(); runAI(s);
  const gundam = s.players.p1.hand.find(c => c.defId === 'ST01-001')!;
  applyAction(s, { type: 'playCard', player: 'p1', uid: gundam.uid }); runAI(s);
  check('L4 Gundam deployed', s.players.p1.units.some(u => u.card.defId === 'ST01-001'));
  const amuro = s.players.p1.hand.find(c => c.defId === 'ST01-010')!;
  applyAction(s, { type: 'playCard', player: 'p1', uid: amuro.uid }); runAI(s);
  check('L4 Amuro When Paired prompt', s.pending?.kind === 'target', s.pending?.kind);
  pick(s, l => l.includes('Tragos'));
  const g = s.players.p1.units.find(u => u.card.defId === 'ST01-001')!;
  check('L4 linked', !!g.pilot, '');
  check('L4 Tragos rested', s.players.p2.units.find(u => u.card.defId === 'ST02-009')!.rested);
  applyAction(s, { type: 'attack', player: 'p1', attackerUid: g.card.uid, target: 'player' }); runAI(s);
  check('L4 link unit attacked same turn', s.stats.p1.attacksDeclared === 1 && (s.players.p2.base === null || s.players.p2.base.damage > 0 || s.players.p2.shields.length < 6), `base=${JSON.stringify(s.players.p2.base?.damage)} shields=${s.players.p2.shields.length}`);
}
// Lesson 7: White Base deploy + activate + Thoroughly Damaged on Leo.
{
  const s = LESSONS.find(l => l.id === 'commands-bases')!.setup!(); runAI(s);
  const wb = s.players.p1.hand.find(c => c.defId === 'ST01-015')!;
  const handBefore = s.players.p1.hand.length;
  applyAction(s, { type: 'playCard', player: 'p1', uid: wb.uid }); runAI(s);
  check('L7 White Base deployed and shield added to hand', s.players.p1.base?.card.defId === 'ST01-015' && s.players.p1.hand.length === handBefore && s.players.p1.shields.length === 5);
  applyAction(s, { type: 'activateMain', player: 'p1', uid: s.players.p1.base!.card.uid, effectKey: 'whiteBase' }); runAI(s);
  check('L7 Gundam token', s.players.p1.units.some(u => u.card.token?.id === 'T-001'));
  const td = s.players.p1.hand.find(c => c.defId === 'ST01-012')!;
  applyAction(s, { type: 'playCard', player: 'p1', uid: td.uid }); runAI(s);
  check('L7 Thoroughly Damaged target prompt', s.pending?.kind === 'target', s.pending?.kind);
  pick(s, l => l.includes('Leo'));
  check('L7 Leo damaged', s.players.p2.units.find(u => u.card.defId === 'ST02-007')!.damage === 1);
  check('L7 resources all spent', s.players.p1.resources.every(r => r.rested), `${s.players.p1.resources.filter(r => !r.rested).length} active`);
}
// Mulligan + full practice game start from the human side
{
  const { createGame } = await import('../src/game/engine');
  const s = createGame({ p1Deck: 'ST01', p2Deck: 'ST02', humanId: 'p1', first: 'p2', seed: 42 }); runAI(s);
  check('practice: human mulligan prompt when going second', s.pending?.kind === 'mulligan' && s.pending.player === 'p1', s.pending?.kind);
  pick(s, l => l.startsWith('Keep'));
  check('practice: bot took turn 1, human on turn 2 main', s.turn === 2 && s.active === 'p1' && s.phase === 'main', `${s.turn} ${s.active} ${s.phase}`);
  check('practice: human has EX resource + 1', s.players.p1.resources.length === 2 && s.players.p1.resources.some(r => r.isEx));
}
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
process.exit(fails ? 1 : 0);
