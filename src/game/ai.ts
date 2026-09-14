// A simple heuristic opponent. Returns one Action at a time so the UI can
// animate each step; call repeatedly until it returns null.

import { CARDS } from './cards';
import {
  activateOptions, activeResources, attackTargets, canAttackThisTurn, canPlay, commandTargets, findUnit,
  isLinked, other, playerLevel, unitAp, unitHp, unitKeywords, unitLevel, whoseDecision, wouldLink,
} from './engine';
import type { Action, CardInstance, GameState, PlayerId, UnitState } from './types';

export function aiNextAction(state: GameState, ai: PlayerId): Action | null {
  if (state.winner) return null;
  if (state.pending) {
    if (state.pending.player !== ai) return null;
    return { type: 'choose', player: ai, optionId: aiChoose(state, ai) };
  }
  if (whoseDecision(state) !== ai) return null;
  if (state.phase !== 'main' || state.battle) return null;
  return planMain(state, ai);
}

function aiChoose(state: GameState, ai: PlayerId): string | null {
  const c = state.pending!;
  const ps = state.players[ai];
  const opts = c.options;
  const unitOf = (id: string) => findUnit(state, Number(id.split(':')[1]));
  switch (c.kind) {
    case 'mulligan': {
      const good = ps.hand.some(h => CARDS[h.defId].type === 'UNIT' && CARDS[h.defId].level <= 3);
      return good ? 'keep' : 'redraw';
    }
    case 'pairTarget': {
      const link = opts.find(o => o.detail?.includes('✓ Link'));
      return (link ?? opts[0]).id;
    }
    case 'unitLimit': {
      return [...opts].sort((a, b) => score(unitOf(a.id)!.unit) - score(unitOf(b.id)!.unit))[0].id;
    }
    case 'discard': {
      return [...opts].map(o => ({ o, cost: CARDS[ps.hand.find(h => h.uid === Number(o.id.split(':')[1]))!.defId].cost })).sort((a, b) => b.cost - a.cost)[0].o.id;
    }
    case 'burst': return 'yes';
    case 'block': return 'pass';
    case 'actionStep': return 'pass';
    case 'saintGabriel': return opts[0].id;
    case 'target.rest': case 'target.apMinus3': {
      return [...opts].sort((a, b) => score(unitOf(b.id)!.unit) - score(unitOf(a.id)!.unit))[0].id;
    }
    case 'target.damage1': {
      const kill = opts.find(o => unitHp(unitOf(o.id)!.unit) === 1);
      return (kill ?? opts[0]).id;
    }
    case 'target.recover3': {
      return [...opts].sort((a, b) => unitOf(b.id)!.unit.damage - unitOf(a.id)!.unit.damage)[0].id;
    }
    case 'target.breach3': {
      const ready = opts.find(o => canAttackThisTurn(state, unitOf(o.id)!.unit));
      return (ready ?? opts[0]).id;
    }
    default: return opts[0]?.id ?? (c.optional ? null : opts[0].id);
  }
  function score(u: UnitState) { const o = findUnit(state, u.card.uid)!.owner; return unitAp(state, u, o) * 2 + unitHp(u) + (u.pilot ? 3 : 0); }
}

function planMain(state: GameState, ai: PlayerId): Action {
  const ps = state.players[ai];
  const op = state.players[other(ai)];
  const hand = ps.hand;
  const spare = activeResources(ps);
  const playable = (c: CardInstance, asPilot = false) => canPlay(state, ai, c, asPilot).ok;

  // 1. Base first if we have none (or only EX base): it also refunds a card.
  const base = hand.find(c => CARDS[c.defId].type === 'BASE' && playable(c));
  if (base && (!ps.base || ps.base.isEx || ps.base.damage > 0)) return { type: 'playCard', player: ai, uid: base.uid };

  // 2. Pair a pilot with an unpaired unit (prefer link; prefer units that can then attack).
  const unpaired = ps.units.filter(u => !u.pilot);
  if (unpaired.length) {
    const pilots = hand.filter(c => (CARDS[c.defId].type === 'PILOT' && playable(c)) || (CARDS[c.defId].type === 'COMMAND' && CARDS[c.defId].pilotName && playable(c, true)));
    const best = pilots.map(c => ({ c, link: unpaired.some(u => wouldLink(u, c)) })).sort((a, b) => Number(b.link) - Number(a.link))[0];
    if (best && (best.link || CARDS[best.c.defId].type === 'PILOT')) {
      // Don't burn a pilot-command as pilot unless it links, keep it as a spell otherwise
      return { type: 'playCard', player: ai, uid: best.c.uid, asPilot: CARDS[best.c.defId].type === 'COMMAND' };
    }
  }

  // 3. Deploy the biggest affordable unit, but keep 1 resource if a pilot in hand could link a unit we deploy.
  const units = hand.filter(c => CARDS[c.defId].type === 'UNIT' && playable(c));
  if (units.length && ps.units.length < 6) {
    const pilotsInHand = hand.filter(c => CARDS[c.defId].type === 'PILOT');
    const scored = units.map(c => {
      const d = CARDS[c.defId];
      let s = d.level * 2 + (d.ap ?? 0) + (d.hp ?? 0);
      const linkable = pilotsInHand.some(p => d.link?.some(req => CARDS[p.defId].name.includes(req) || (req.startsWith('(') && CARDS[p.defId].traits.includes(req.slice(1, -1)))));
      if (linkable && spare >= d.cost + 1 && playerLevel(ps) >= Math.max(...pilotsInHand.map(p => CARDS[p.defId].level))) s += 10;
      if (d.id === 'ST01-004' && op.units.some(u => unitHp(u) <= 2 && !u.rested)) s += 6; // Guntank rests a target
      return { c, s };
    }).sort((a, b) => b.s - a.s);
    return { type: 'playCard', player: ai, uid: scored[0].c.uid };
  }

  // 4. Useful commands.
  for (const c of hand) {
    const d = CARDS[c.defId];
    if (d.type !== 'COMMAND' || !playable(c)) continue;
    const t = commandTargets(state, ai, d.id) ?? [];
    if (d.id === 'ST01-012' && t.some(u => unitHp(u) === 1)) return { type: 'playCard', player: ai, uid: c.uid };
    if (d.id === 'ST01-013' && t.some(u => u.damage >= 2)) return { type: 'playCard', player: ai, uid: c.uid };
    if (d.id === 'ST02-014') {
      // rest an active enemy we can then kill
      const killable = t.filter(u => !u.rested && ps.units.some(a => canAttackThisTurn(state, a) && unitAp(state, a, ai) >= unitHp(u)));
      if (killable.length) return { type: 'playCard', player: ai, uid: c.uid };
    }
    if (d.id === 'ST02-012') {
      const ready = ps.units.some(a => canAttackThisTurn(state, a) && op.units.some(u => u.rested && unitAp(state, a, ai) >= unitHp(u)));
      if (ready && (op.base || op.shields.length)) return { type: 'playCard', player: ai, uid: c.uid };
    }
  }

  // 5. Activate·Main effects.
  for (const o of activateOptions(state, ai)) {
    if (!o.ok) continue;
    if (o.effectKey === 'whiteBase' && spare >= 2 && !units.length) return { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey };
    if (o.effectKey === 'asticassia' && ps.units.some(u => isLinked(u) && canAttackThisTurn(state, u))) return { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey };
    if (o.effectKey === 'tallgeese' && spare >= 4) return { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey };
  }

  // 6. Attacks.
  const attackers = ps.units.filter(u => canAttackThisTurn(state, u));
  const enemyBlockers = op.units.filter(u => unitKeywords(u).blocker && !u.rested);
  for (const a of attackers) {
    const targets = attackTargets(state, ai, a);
    const ap = unitAp(state, a, ai), hp = unitHp(a);
    // Kill a rested unit and survive
    const kills = targets.filter(t => t.id !== 'player').map(t => findUnit(state, t.id as number)!.unit)
      .filter(u => ap >= unitHp(u));
    const safeKill = kills.find(u => unitAp(state, u, other(ai)) < hp);
    if (safeKill) return { type: 'attack', player: ai, attackerUid: a.card.uid, target: safeKill.card.uid };
    const valuableTrade = kills.find(u => u.pilot || unitLevel(u) >= unitLevel(a));
    if (valuableTrade) return { type: 'attack', player: ai, attackerUid: a.card.uid, target: valuableTrade.card.uid };
    if (targets.some(t => t.id === 'player')) {
      // Avoid throwing a unit into a blocker that kills it for nothing when shields are plentiful
      const deadlyBlocker = enemyBlockers.some(b => unitAp(state, b, other(ai)) >= hp && ap < unitHp(b));
      if (!deadlyBlocker || op.shields.length <= 2 || a.card.token) return { type: 'attack', player: ai, attackerUid: a.card.uid, target: 'player' };
    }
  }

  // 7. Blocker-only units (Zowort) attack rested units if any kill exists — handled above. Otherwise end.
  return { type: 'endMain', player: ai };
}
