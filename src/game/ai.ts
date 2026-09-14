// A simple heuristic opponent. Returns one Action at a time so the UI can
// animate each step; call repeatedly until it returns null.

import { CARDS } from './cards';
import {
  activateOptions, activeResources, attackTargets, canAttackThisTurn, canPlay, commandTargets, findUnit,
  isLinked, other, playerLevel, unitAp, unitHp, unitKeywords, unitLevel, unitName, whoseDecision, wouldLink,
} from './engine';
import type { Action, CardInstance, GameState, PlayerId, UnitState } from './types';

export interface AiDecision { action: Action; reason: string }

export function aiNextAction(state: GameState, ai: PlayerId): AiDecision | null {
  if (state.winner) return null;
  if (state.pending) {
    if (state.pending.player !== ai) return null;
    const c = aiChoose(state, ai);
    return { action: { type: 'choose', player: ai, optionId: c.id }, reason: c.reason };
  }
  if (whoseDecision(state) !== ai) return null;
  if (state.phase !== 'main' || state.battle) return null;
  return planMain(state, ai);
}

function aiChoose(state: GameState, ai: PlayerId): { id: string | null; reason: string } {
  const c = state.pending!;
  const ps = state.players[ai];
  const opts = c.options;
  const unitOf = (id: string) => findUnit(state, Number(id.split(':')[1]));
  switch (c.kind) {
    case 'mulligan': {
      const good = ps.hand.some(h => CARDS[h.defId].type === 'UNIT' && CARDS[h.defId].level <= 3);
      return good ? { id: 'keep', reason: 'My hand has a Unit I can play by turn 2, so I keep it.' } : { id: 'redraw', reason: 'No early Unit in hand: I would fall behind, so I redraw.' };
    }
    case 'pairTarget': {
      const link = opts.find(o => o.detail?.includes('✓ Link'));
      return link ? { id: link.id, reason: `${link.label} meets the link requirement, so it can attack right away.` } : { id: opts[0].id, reason: 'No link available; the Pilot still adds its stats.' };
    }
    case 'unitLimit': {
      const pick = [...opts].sort((a, b) => score(unitOf(a.id)!.unit) - score(unitOf(b.id)!.unit))[0];
      return { id: pick.id, reason: `${pick.label} is my weakest Unit, so it makes room.` };
    }
    case 'discard': {
      const pick = [...opts].map(o => ({ o, cost: CARDS[ps.hand.find(h => h.uid === Number(o.id.split(':')[1]))!.defId].cost })).sort((a, b) => b.cost - a.cost)[0].o;
      return { id: pick.id, reason: `Over the hand limit; ${pick.label} is the card I am least likely to play soon.` };
    }
    case 'burst': return { id: 'yes', reason: 'A Burst is free value, so I activate it.' };
    case 'block': return { id: 'pass', reason: 'No block.' };
    case 'actionStep': return { id: 'pass', reason: 'Nothing worth playing in this action step.' };
    case 'saintGabriel': return { id: opts[0].id, reason: 'Keeping the first card on top.' };
    case 'target.rest': case 'target.apMinus3': {
      const pick = [...opts].sort((a, b) => score(unitOf(b.id)!.unit) - score(unitOf(a.id)!.unit))[0];
      return { id: pick.id, reason: `${pick.label} is the biggest threat on your board.` };
    }
    case 'target.damage1': {
      const kill = opts.find(o => unitHp(unitOf(o.id)!.unit) === 1);
      return kill ? { id: kill.id, reason: `${kill.label} has 1 HP left, so 1 damage destroys it.` } : { id: opts[0].id, reason: 'Chipping the first available target.' };
    }
    case 'target.recover3': {
      const pick = [...opts].sort((a, b) => unitOf(b.id)!.unit.damage - unitOf(a.id)!.unit.damage)[0];
      return { id: pick.id, reason: `${pick.label} has the most damage to heal.` };
    }
    case 'target.breach3': {
      const ready = opts.find(o => canAttackThisTurn(state, unitOf(o.id)!.unit));
      return ready ? { id: ready.id, reason: `${ready.label} can still attack this turn, so Breach can trigger.` } : { id: opts[0].id, reason: 'First available Unit.' };
    }
    default: return { id: opts[0]?.id ?? null, reason: 'First option.' };
  }
  function score(u: UnitState) { const o = findUnit(state, u.card.uid)!.owner; return unitAp(state, u, o) * 2 + unitHp(u) + (u.pilot ? 3 : 0); }
}

function planMain(state: GameState, ai: PlayerId): AiDecision {
  const say = (action: Action, reason: string): AiDecision => ({ action, reason });
  const ps = state.players[ai];
  const op = state.players[other(ai)];
  const hand = ps.hand;
  const spare = activeResources(ps);
  const playable = (c: CardInstance, asPilot = false) => canPlay(state, ai, c, asPilot).ok;

  // 1. Base first if we have none (or only EX base): it also refunds a card.
  const base = hand.find(c => CARDS[c.defId].type === 'BASE' && playable(c));
  if (base && (!ps.base || ps.base.isEx || ps.base.damage > 0)) return say({ type: 'playCard', player: ai, uid: base.uid }, `${CARDS[base.defId].name} gives me a 5 HP wall and its Deploy effect adds a Shield to my hand: a free card.`);

  // 2. Pair a pilot with an unpaired unit (prefer link; prefer units that can then attack).
  const unpaired = ps.units.filter(u => !u.pilot);
  if (unpaired.length) {
    const pilots = hand.filter(c => (CARDS[c.defId].type === 'PILOT' && playable(c)) || (CARDS[c.defId].type === 'COMMAND' && CARDS[c.defId].pilotName && playable(c, true)));
    const best = pilots.map(c => ({ c, link: unpaired.some(u => wouldLink(u, c)) })).sort((a, b) => Number(b.link) - Number(a.link))[0];
    if (best && (best.link || CARDS[best.c.defId].type === 'PILOT')) {
      // Don't burn a pilot-command as pilot unless it links, keep it as a spell otherwise
      return say({ type: 'playCard', player: ai, uid: best.c.uid, asPilot: CARDS[best.c.defId].type === 'COMMAND' }, best.link ? `${CARDS[best.c.defId].pilotName ?? CARDS[best.c.defId].name} links with one of my Units, so it can attack immediately and keeps the stat bonus.` : `Pairing ${CARDS[best.c.defId].name} for its AP/HP bonus.`);
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
    const top = CARDS[scored[0].c.defId];
    const why = top.id === 'ST01-004' && op.units.some(u => unitHp(u) <= 2 && !u.rested) ? 'Guntank rests an enemy Unit on deploy so I can attack it this turn.' : `${top.name} is the strongest Unit I can afford at Lv.${playerLevel(ps)} (${spare} active Resources).`;
    return say({ type: 'playCard', player: ai, uid: scored[0].c.uid }, why);
  }

  // 4. Useful commands.
  for (const c of hand) {
    const d = CARDS[c.defId];
    if (d.type !== 'COMMAND' || !playable(c)) continue;
    const t = commandTargets(state, ai, d.id) ?? [];
    if (d.id === 'ST01-012' && t.some(u => unitHp(u) === 1)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'A rested enemy Unit has 1 HP: Thoroughly Damaged finishes it for 1 Resource.');
    if (d.id === 'ST01-013' && t.some(u => u.damage >= 2)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'One of my Units carries 2+ damage; healing it keeps it in the fight.');
    if (d.id === 'ST02-014') {
      // rest an active enemy we can then kill
      const killable = t.filter(u => !u.rested && ps.units.some(a => canAttackThisTurn(state, a) && unitAp(state, a, ai) >= unitHp(u)));
      if (killable.length) return say({ type: 'playCard', player: ai, uid: c.uid }, 'Siege Ploy rests an active enemy Unit so my attackers can kill it this turn.');
    }
    if (d.id === 'ST02-012') {
      const ready = ps.units.some(a => canAttackThisTurn(state, a) && op.units.some(u => u.rested && unitAp(state, a, ai) >= unitHp(u)));
      if (ready && (op.base || op.shields.length)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'I have a kill lined up: Breach 3 will also hit your Base or a Shield.');
    }
  }

  // 5. Activate·Main effects.
  for (const o of activateOptions(state, ai)) {
    if (!o.ok) continue;
    if (o.effectKey === 'whiteBase' && spare >= 2 && !units.length) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Nothing else to play, so White Base turns 2 spare Resources into a token Unit.');
    if (o.effectKey === 'asticassia' && ps.units.some(u => isLinked(u) && canAttackThisTurn(state, u))) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Resting Asticassia before I attack gives my Link Units +1 AP.');
    if (o.effectKey === 'tallgeese' && spare >= 4) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Paying 4 to reactivate Tallgeese lets it attack a second time.');
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
    if (safeKill) return say({ type: 'attack', player: ai, attackerUid: a.card.uid, target: safeKill.card.uid }, `${unitName(a)} (${ap} AP) destroys ${unitName(safeKill)} (${unitHp(safeKill)} HP) and survives the ${unitAp(state, safeKill, other(ai))} AP it deals back: a free kill beats a Shield.`);
    const valuableTrade = kills.find(u => u.pilot || unitLevel(u) >= unitLevel(a));
    if (valuableTrade) return say({ type: 'attack', player: ai, attackerUid: a.card.uid, target: valuableTrade.card.uid }, `${unitName(valuableTrade)} is worth more than ${unitName(a)}, so I take the trade.`);
    if (targets.some(t => t.id === 'player')) {
      // Avoid throwing a unit into a blocker that kills it for nothing when shields are plentiful
      const deadlyBlocker = enemyBlockers.some(b => unitAp(state, b, other(ai)) >= hp && ap < unitHp(b));
      if (!deadlyBlocker || op.shields.length <= 2 || a.card.token) {
        const why = op.base ? `No free kill available, so ${unitName(a)} attacks your Base.` : op.shields.length === 0 ? `Your shield area is empty: ${unitName(a)} attacks for the win!` : op.shields.length <= 2 ? `You are down to ${op.shields.length} Shield(s); I race even into a possible block.` : `No free kill available, so ${unitName(a)} pressures your Shields.`;
        return say({ type: 'attack', player: ai, attackerUid: a.card.uid, target: 'player' }, why);
      }
    }
  }

  // 7. Blocker-only units (Zowort) attack rested units if any kill exists — handled above. Otherwise end.
  const idle = attackers.filter(a => !enemyBlockers.every(b => unitAp(state, b, other(ai)) < unitHp(a) || unitAp(state, a, ai) >= unitHp(b)));
  return say({ type: 'endMain', player: ai }, idle.length ? `Holding ${idle.map(unitName).join(', ')} back: your Blocker would kill it for nothing. Ending my turn.` : spare > 0 ? `Nothing useful left to do with ${spare} Resource(s). Ending my turn.` : 'Resources spent and attacks made. Ending my turn.');
}
