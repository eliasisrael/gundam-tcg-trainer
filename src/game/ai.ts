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
  return levelOf(state, ai) === 'basic' ? planBasic(state, ai) : planAdvanced(state, ai);
}

export function levelOf(state: GameState, p: PlayerId) { return state.botLevelByPlayer?.[p] ?? state.botLevel; }

/** Unit the planner wants the next 'target' choice to pick (e.g. the attacker it is about to buff). */
let preferredTarget: number | null = null;

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
    case 'target': {
      const e = c.ctx.e as { op: string; amount?: number };
      const units = opts.filter(o => o.id.startsWith('unit:'));
      if (!units.length) return { id: opts[0]?.id ?? null, reason: 'Nothing to target.' };
      const byScore = [...units].sort((a, b) => score(unitOf(b.id)!.unit) - score(unitOf(a.id)!.unit));
      switch (e.op) {
        case 'damage': { const kill = units.find(o => unitHp(unitOf(o.id)!.unit) <= (e.amount ?? 1)); return kill ? { id: kill.id, reason: `${kill.label} dies to ${e.amount} damage.` } : { id: byScore[0].id, reason: `${byScore[0].label} is the biggest threat.` }; }
        case 'recover': { const pick = [...units].sort((a, b) => unitOf(b.id)!.unit.damage - unitOf(a.id)!.unit.damage)[0]; return { id: pick.id, reason: `${pick.label} has the most damage to heal.` }; }
        case 'ap': case 'apBattle': case 'breach': case 'firstStrike': case 'selfDamageAp': {
          if ((e.amount ?? 0) < 0) return { id: byScore[0].id, reason: `Shrinking ${byScore[0].label}, the biggest threat.` };
          if (preferredTarget !== null) { const pref = units.find(o => o.id === `unit:${preferredTarget}`); if (pref) { preferredTarget = null; return { id: pref.id, reason: `${pref.label} is the Unit I am setting up to attack with.` }; } }
          const ready = units.filter(o => canAttackThisTurn(state, unitOf(o.id)!.unit) && (e.op !== 'selfDamageAp' || unitHp(unitOf(o.id)!.unit) > 1));
          const pick = ready.length ? [...ready].sort((a, b) => score(unitOf(b.id)!.unit) - score(unitOf(a.id)!.unit))[0] : units.find(o => e.op !== 'selfDamageAp' || unitHp(unitOf(o.id)!.unit) > 1) ?? units[0];
          return { id: pick.id, reason: ready.length ? `${pick.label} can still attack this turn.` : `${pick.label} is the best available Unit.` };
        }
        case 'reactivateNoAttack': return { id: byScore[0].id, reason: `${byScore[0].label} is my best defender.` };
        default: return { id: byScore[0].id, reason: `${byScore[0].label} is the biggest threat on your board.` };
      }
    }
    case 'freeDeploy': { const hand = opts.filter(o => o.id.startsWith('hand:')); const pick = [...hand].sort((a, b) => CARDS[ps.hand.find(h => h.uid === Number(b.id.split(':')[1]))!.defId].level - CARDS[ps.hand.find(h => h.uid === Number(a.id.split(':')[1]))!.defId].level)[0]; return pick ? { id: pick.id, reason: `Free deploy: ${pick.label} is my biggest eligible Unit.` } : { id: 'pass', reason: 'Nothing to deploy.' }; }
    case 'lookTop': { const pick = opts.find(o => o.id.startsWith('deck:')); return pick ? { id: pick.id, reason: `Adding ${pick.label} to hand.` } : { id: 'pass', reason: 'No Zeon Unit among the top cards.' }; }
    case 'tokenChoice': { const enemyKill = state.players[other(ai)].units.some(u => u.rested && unitHp(u) <= 4); return { id: enemyKill ? 'T-010' : 'T-009', reason: enemyKill ? 'Sword Strike can kill a rested enemy Unit.' : 'Launcher Strike is the sturdier Blocker.' }; }
    case 'fromTrash': return { id: opts[0].id, reason: `Recovering ${opts[0].label} from the trash.` };
    case 'targetMulti': {
      const units = opts.filter(o => o.id.startsWith('unit:'));
      if (!units.length) return { id: 'pass', reason: 'Done.' };
      const pick = [...units].sort((a, b) => score(unitOf(b.id)!.unit) - score(unitOf(a.id)!.unit))[0];
      return { id: pick.id, reason: `${pick.label} benefits most.` };
    }
    case 'topKeep': return { id: 'top', reason: 'Keeping the top card.' };
    case 'penelope': { const pick = opts.find(o => o.id.startsWith('hand:')); return pick && ps.hand.length >= 2 ? { id: pick.id, reason: `Cycling ${pick.label} for two fresh cards.` } : { id: 'pass', reason: 'Keeping my hand.' }; }
    case 'discardOne': { const pick = [...opts].sort((a, b) => CARDS[ps.hand.find(h => h.uid === Number(b.id.split(':')[1]))!.defId].level - CARDS[ps.hand.find(h => h.uid === Number(a.id.split(':')[1]))!.defId].level)[0]; return { id: pick.id, reason: `${pick.label} is the card I can least afford to play soon.` }; }
    default: return { id: opts[0]?.id ?? null, reason: 'First option.' };
  }
  function score(u: UnitState) { const o = findUnit(state, u.card.uid)!.owner; return unitAp(state, u, o) * 2 + unitHp(u) + (u.pilot ? 3 : 0); }
}

function planBasic(state: GameState, ai: PlayerId): AiDecision {
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
  const readyAttackers = ps.units.filter(u => canAttackThisTurn(state, u) && attackTargets(state, ai, u).length);
  for (const o of activateOptions(state, ai)) {
    if (!o.ok) continue;
    if (o.effectKey === 'support' && readyAttackers.some(u => u.card.uid !== o.uid) && !state.turnFlags.attacked) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Resting a Support Unit before I attack gives my attacker extra AP.');
    if (o.effectKey === 'vesalius' && readyAttackers.length) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Vesalius: a free +1 AP before my attacks.');
    if (o.effectKey === 'isaribi' && readyAttackers.some(u => u.damage > 0)) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Isaribi rewards my damaged Unit with +2 AP.');
    if (o.effectKey === 'cgs' && readyAttackers.some(u => unitHp(u) > 1 && u.card.defId !== 'ST05-003') && !state.turnFlags.attacked) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Purple wants its Units damaged: the Mobile Worker pings my attacker for +1 AP and turns on damage bonuses.');
    if (o.effectKey === 'archangel' && spare >= 2 && state.turnFlags.attacked) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Archangel stands my Blocker back up after it attacked, so it can defend next turn.');
    if (o.effectKey === 'whiteBase' && spare >= 2 && !units.length) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Nothing else to play, so White Base turns 2 spare Resources into a token Unit.');
    if (o.effectKey === 'asticassia' && ps.units.some(u => isLinked(u) && canAttackThisTurn(state, u))) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Resting Asticassia before I attack gives my Link Units +1 AP.');
    if (o.effectKey === 'tallgeese' && spare >= 4) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Paying 4 to reactivate Tallgeese lets it attack a second time.');
    if (o.effectKey === 'clanBattle' && readyAttackers.length && !state.turnFlags.attacked) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Clan Battle: a free +2 AP before my attacks.');
    if (o.effectKey === 'davao' && spare >= 2 && !ps.hand.some(c => CARDS[c.defId].type === 'UNIT' && playable(c))) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Davao heals a damaged Unit with spare Resources.');
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

// ---------------- Advanced / Ace planner ----------------

/** Rough worth of a unit on the board. */
function unitValue(state: GameState, u: UnitState, owner: PlayerId): number {
  return unitLevel(u) * 1.2 + unitAp(state, u, owner) + unitHp(u) + (u.pilot ? 3 : 0) + (isLinked(u) ? 2 : 0) + (unitKeywords(u).blocker ? 1 : 0);
}

interface AttackEval { attacker: UnitState; target: 'player' | number; value: number; kills: boolean; dies: boolean; why: string; almostKill?: number }

/** Outcome of A (with apA) hitting defender D. */
function duel(state: GameState, ai: PlayerId, A: UnitState, apA: number, D: UnitState) {
  const apD = unitAp(state, D, other(ai));
  const kw = unitKeywords(A);
  const kills = apA >= unitHp(D);
  const dies = apD >= unitHp(A) && !(kw.firstStrike && kills);
  return { kills, dies, apD };
}

/** Evaluate one attack for the bot, assuming a rational defender chooses whether to block. */
function evalAttack(state: GameState, ai: PlayerId, A: UnitState, target: 'player' | number, apBonus = 0): AttackEval {
  const op = state.players[other(ai)];
  const ace = levelOf(state, ai) === 'ace';
  const apA = unitAp(state, A, ai) + apBonus;
  const kw = unitKeywords(A) as ReturnType<typeof unitKeywords> & { suppression?: boolean };
  const shieldArea = op.shields.length + (op.base ? 1 : 0);
  const myValue = unitValue(state, A, ai);
  let value: number, kills = false, dies = false, why = '', almostKill: number | undefined;

  if (target === 'player') {
    if (shieldArea === 0) { value = 1000; why = 'your shield area is empty: this attack wins the game'; }
    else if (op.base) { const bhp = unitHp({ ...A, damage: 0 }) && (op.base.card.token ? op.base.card.token.hp : 5) - op.base.damage; kills = apA >= bhp; value = kills ? 4.5 : 1.2 + apA * 0.4; why = kills ? `${apA} AP destroys your Base` : `chips your Base for ${apA}`; }
    else { value = 2.6 + (6 - op.shields.length) * 0.9 + (kw.suppression && op.shields.length >= 2 ? 3 : 0); why = op.shields.length <= 2 ? `you are down to ${op.shields.length} Shield(s)` : 'pressure on your Shields'; }
  } else {
    const D = findUnit(state, target)!.unit;
    const d = duel(state, ai, A, apA, D);
    kills = d.kills; dies = d.dies;
    const targetValue = unitValue(state, D, other(ai));
    value = (kills ? targetValue + (kw.breach && shieldArea ? 2.5 : 0) : apA * 0.25) - (dies ? myValue : 0);
    if (kills && A.card.defId === 'ST02-003' && A.pilot) value += 1.5; // Heavyarms splash
    if (kills && A.pilot && ['ST02-011', 'ST05-011'].includes(A.pilot.defId) && isLinked(A)) value += 1.5; // draw / recursion
    if (!kills && apA < unitHp(D) && unitHp(D) - apA <= 3) almostKill = unitHp(D) - apA;
    why = kills && !dies ? `destroys ${unitName(D)} and survives` : kills ? `trades with ${unitName(D)}` : dies ? `would die to ${unitName(D)}` : `only chips ${unitName(D)}`;
  }

  // Rational blocker: the defender picks the block that is worst for me (if it is better for them than not blocking).
  if (!kw.highManeuver) {
    const blockers = op.units.filter(b => unitKeywords(b).blocker && !b.rested && b.card.uid !== target);
    for (const B of blockers) {
      const d = duel(state, ai, A, apA, B);
      const v = (d.kills ? unitValue(state, B, other(ai)) : 0) - (d.dies ? myValue : 0);
      if (v < value) { value = v; why += `, but ${unitName(B)} can block${d.dies ? ' and kill it' : ''}`; if (target !== 'player') { kills = d.kills; dies = d.dies; } }
    }
  }
  // Exposure: after attacking, A is rested and can be attacked next turn.
  if (ace && !dies && !kills && value < 900 && !A.card.token) {
    const remainingHp = unitHp(A) - (target !== 'player' ? unitAp(state, findUnit(state, target)!.unit, other(ai)) : 0);
    const punish = op.units.some(e => unitAp(state, e, other(ai)) >= remainingHp && !e.rested);
    if (punish) value -= Math.min(2, myValue * 0.15);
  }
  // Racing: when the opponent is low on shield-area cards, face damage is worth more.
  if (target === 'player' && shieldArea > 0 && shieldArea <= 2) value += 1.5;
  return { attacker: A, target, value, kills, dies, why, almostKill };
}

function bestAttacks(state: GameState, ai: PlayerId, apBonusFor?: (u: UnitState) => number): AttackEval[] {
  const ps = state.players[ai];
  const out: AttackEval[] = [];
  for (const a of ps.units) {
    if (!canAttackThisTurn(state, a)) continue;
    for (const t of attackTargets(state, ai, a)) out.push(evalAttack(state, ai, a, t.id, apBonusFor?.(a) ?? 0));
  }
  return out.sort((x, y) => y.value - x.value);
}

function planAdvanced(state: GameState, ai: PlayerId): AiDecision {
  const say = (action: Action, reason: string): AiDecision => ({ action, reason });
  const ps = state.players[ai];
  const op = state.players[other(ai)];
  const hand = ps.hand;
  const spare = activeResources(ps);
  const ace = levelOf(state, ai) === 'ace';
  const playable = (c: CardInstance, asPilot = false) => canPlay(state, ai, c, asPilot).ok;
  const lvl = playerLevel(ps);

  // 0. Lethal: enough attackers to punch through blockers, base and shields this turn.
  const swingers = ps.units.filter(u => canAttackThisTurn(state, u) && u.card.defId !== 'ST01-009');
  const blockers = op.units.filter(u => unitKeywords(u).blocker && !u.rested).length;
  const needed = op.shields.length + (op.base ? 1 : 0) + 1 + blockers;
  if (swingers.length >= needed && swingers.length) {
    const a = [...swingers].sort((x, y) => unitAp(state, y, ai) - unitAp(state, x, ai))[0];
    return say({ type: 'attack', player: ai, attackerUid: a.card.uid, target: 'player' }, `Lethal: I have ${swingers.length} attackers against ${op.shields.length} Shield(s)${op.base ? ', a Base' : ''} and ${blockers} Blocker(s). Everything goes face.`);
  }

  // 1. Base: wall + card. Replace a damaged base too.
  const base = hand.find(c => CARDS[c.defId].type === 'BASE' && playable(c));
  if (base && (!ps.base || ps.base.isEx || ps.base.damage > 0)) return say({ type: 'playCard', player: ai, uid: base.uid }, `${CARDS[base.defId].name}: a 5 HP wall and a Shield into my hand.`);

  // 2. Deploy + link in the same turn when affordable (tempo: the new Unit attacks immediately).
  const units = hand.filter(c => CARDS[c.defId].type === 'UNIT' && playable(c));
  const pilots = hand.filter(c => (CARDS[c.defId].type === 'PILOT' && lvl >= CARDS[c.defId].level) || (CARDS[c.defId].type === 'COMMAND' && CARDS[c.defId].pilotName && lvl >= CARDS[c.defId].level));
  const linkPlan = units.map(u => ({ u, p: pilots.find(p => wouldLink({ card: u, rested: false, damage: 0, deployedTurn: 0, tempAp: 0, tempHp: 0, tempKeywords: {}, usedThisTurn: [] }, p) && CARDS[u.defId].cost + CARDS[p.defId].cost <= spare) }))
    .filter(x => x.p).sort((a, b) => CARDS[b.u.defId].level - CARDS[a.u.defId].level)[0];
  if (linkPlan && ps.units.length < 6) return say({ type: 'playCard', player: ai, uid: linkPlan.u.uid }, `${CARDS[linkPlan.u.defId].name} now, then ${CARDS[linkPlan.p!.defId].pilotName ?? CARDS[linkPlan.p!.defId].name} links it: it attacks this turn.`);

  // 3. Pair pilots that link onto existing units (any pilot if nothing else to do with the resource).
  const unpaired = ps.units.filter(u => !u.pilot);
  if (unpaired.length) {
    const cands = hand.filter(c => (CARDS[c.defId].type === 'PILOT' && playable(c)) || (CARDS[c.defId].type === 'COMMAND' && CARDS[c.defId].pilotName && playable(c, true)));
    const link = cands.find(c => unpaired.some(u => wouldLink(u, c)));
    if (link) return say({ type: 'playCard', player: ai, uid: link.uid, asPilot: CARDS[link.defId].type === 'COMMAND' }, `${CARDS[link.defId].pilotName ?? CARDS[link.defId].name} links a Unit: stats now and an attack the turn it lands.`);
  }

  // 4. Deploy: strongest affordable, valuing blockers when I am under pressure and keeping a resource for a pilot.
  if (ace && units.length >= 2 && ps.units.length <= 4) {
    // Two-drop: if a pair of cheaper Units fits the budget and out-stats the best single Unit, start with the cheaper pair.
    const single = [...units].sort((a, b) => CARDS[b.defId].level - CARDS[a.defId].level)[0];
    const stat = (c: CardInstance) => (CARDS[c.defId].ap ?? 0) + (CARDS[c.defId].hp ?? 0);
    let bestPair: [CardInstance, CardInstance] | null = null, bestStat = stat(single);
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      if (CARDS[a.defId].cost + CARDS[b.defId].cost <= spare && stat(a) + stat(b) > bestStat + 1) { bestPair = [a, b]; bestStat = stat(a) + stat(b); }
    }
    if (bestPair) return say({ type: 'playCard', player: ai, uid: bestPair[0].uid }, `${CARDS[bestPair[0].defId].name} and ${CARDS[bestPair[1].defId].name} together give more board than ${CARDS[single.defId].name} alone.`);
  }
  if (units.length && ps.units.length < 6) {
    const enemyAttackers = op.units.filter(u => u.card.defId !== 'ST01-009').length;
    const myBlockers = ps.units.filter(u => unitKeywords(u).blocker).length;
    const underPressure = enemyAttackers > myBlockers && ps.shields.length + (ps.base ? 1 : 0) <= 4;
    const scored = units.map(c => {
      const d = CARDS[c.defId];
      let s = d.level * 2 + (d.ap ?? 0) + (d.hp ?? 0);
      if (underPressure && d.keywords?.blocker) s += 6;
      if (d.id === 'ST01-004' && op.units.some(u => unitHp(u) <= 2 && !u.rested)) s += 6;
      if (d.id === 'ST02-002' && lvl < 6) s += 4; // ramp early
      const pilotsLater = hand.some(p => CARDS[p.defId].type === 'PILOT' && d.link?.some(req => CARDS[p.defId].name.includes(req) || (req.startsWith('(') && CARDS[p.defId].traits.includes(req.slice(1, -1)))));
      if (pilotsLater) s += 3;
      return { c, s };
    }).sort((a, b) => b.s - a.s);
    const top = CARDS[scored[0].c.defId];
    return say({ type: 'playCard', player: ai, uid: scored[0].c.uid }, underPressure && top.keywords?.blocker ? `${top.name} is a Blocker, and you have more attackers than I can stop.` : `${top.name} is the best Unit I can afford at Lv.${lvl}.`);
  }

  // 5. Attacks, with buffs used to convert near-kills.
  const attacks = bestAttacks(state, ai);
  const best = attacks[0];
  // Buff sources: Support/Vesalius/Isaribi/CGS (activate) and Indignation / With Iron and Blood (commands).
  const buffs: { n: number; act: Action; label: string; uid: number | null }[] = [];
  for (const o of activateOptions(state, ai)) {
    if (!o.ok) continue;
    if (o.effectKey === 'support') buffs.push({ n: unitKeywords(ps.units.find(u => u.card.uid === o.uid)!).support ?? 0, act: { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, label: o.label, uid: o.uid });
    if (o.effectKey === 'vesalius') buffs.push({ n: 1, act: { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, label: 'Vesalius', uid: null });
    if (o.effectKey === 'isaribi') buffs.push({ n: 2, act: { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, label: 'Isaribi', uid: null });
    if (o.effectKey === 'cgs') buffs.push({ n: 1, act: { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, label: 'CGS Mobile Worker', uid: o.uid });
    if (o.effectKey === 'asticassia') buffs.push({ n: 1, act: { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, label: 'Asticassia', uid: null });
    if (o.effectKey === 'clanBattle') buffs.push({ n: 2, act: { type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, label: 'Clan Battle', uid: null });
  }
  for (const c of hand) {
    const d = CARDS[c.defId];
    if (d.id === 'ST03-012' && playable(c)) buffs.push({ n: 2, act: { type: 'playCard', player: ai, uid: c.uid }, label: 'Indignation', uid: null });
    if (d.id === 'ST05-013' && playable(c)) buffs.push({ n: 3, act: { type: 'playCard', player: ai, uid: c.uid }, label: 'With Iron and Blood', uid: null });
    if (d.id === 'ST06-011' && playable(c)) buffs.push({ n: 2, act: { type: 'playCard', player: ai, uid: c.uid }, label: 'Ruthless Tactics', uid: null });
  }
  if (buffs.length && !state.turnFlags.attacked) {
    for (const b of buffs) {
      const boosted = bestAttacks(state, ai, u => (b.uid === u.card.uid ? 0 : b.n)).filter(x => x.kills && x.value > (best?.value ?? 0) + 1.5 && (b.label !== 'Isaribi' || x.attacker.damage > 0) && (b.label !== 'Asticassia' || isLinked(x.attacker)) && !(b.label === 'With Iron and Blood' && unitHp(x.attacker) <= 1) && !(b.label === 'CGS Mobile Worker' && unitHp(x.attacker) <= 1));
      if (boosted.length) {
        preferredTarget = boosted[0].attacker.card.uid;
        return say(b.act, `${b.label} gives ${unitName(boosted[0].attacker)} +${b.n} AP, which turns its attack into a kill (${boosted[0].why}).`);
      }
    }
  }
  // Rest a target so a kill becomes available (Siege Ploy / Thoroughly Damaged finishing).
  for (const c of hand) {
    const d = CARDS[c.defId];
    if (!playable(c)) continue;
    if (d.id === 'ST02-014') {
      const t = (commandTargets(state, ai, d.id) ?? []).filter(u => !u.rested && ps.units.some(a => canAttackThisTurn(state, a) && unitAp(state, a, ai) >= unitHp(u) && unitAp(state, u, other(ai)) < unitHp(a)));
      if (t.length) return say({ type: 'playCard', player: ai, uid: c.uid }, 'Siege Ploy rests an active Unit so I can kill it for free this turn.');
    }
    if (d.id === 'ST01-012' && (commandTargets(state, ai, d.id) ?? []).some(u => unitHp(u) === 1)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'Thoroughly Damaged finishes a rested Unit with 1 HP.');
    if (d.id === 'ST03-013' && (commandTargets(state, ai, d.id) ?? []).some(u => unitHp(u) <= 2 && (u.pilot || unitKeywords(u).blocker || unitLevel(u) >= 3))) return say({ type: 'playCard', player: ai, uid: c.uid }, 'Close Combat removes a Blocker or a valuable Unit with 2 HP or less before I attack.');
    if (d.id === 'ST05-014' && (commandTargets(state, ai, d.id) ?? []).some(u => u.pilot || unitLevel(u) === 3)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'Fatal Strike destroys your best small Unit outright.');
    if (d.id === 'ST04-013' && (commandTargets(state, ai, d.id) ?? []).some(u => u.pilot)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'Hawk of Endymion bounces a paired Unit: you lose the tempo and the Pilot goes back to hand.');
    if (d.id === 'ST01-013' && (commandTargets(state, ai, d.id) ?? []).some(u => u.damage >= 2 && unitLevel(u) >= 4)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'Healing a damaged big Unit keeps it in the fight.');
    if (d.id === 'ST02-012' && attacks.some(x => x.kills && !x.dies && x.target !== 'player') && (op.base || op.shields.length)) return say({ type: 'playCard', player: ai, uid: c.uid }, 'A kill is lined up: Simultaneous Fire adds Breach 3 to hit your shield area as well.');
  }

  if (best && best.value > 0.6) {
    // Ace: bait the Blocker. If an active enemy Blocker would ruin my best attack, lead with a cheap attacker on the player first:
    // either they burn the block on it (and my real attack goes through) or they take a Shield.
    if (ace && !state.turnFlags.attacked && best.target !== 'player' && best.why.includes('can block')) {
      const cheapest = [...ps.units].filter(u => u !== best.attacker && canAttackThisTurn(state, u) && attackTargets(state, ai, u).some(t => t.id === 'player'))
        .sort((a, b) => unitValue(state, a, ai) - unitValue(state, b, ai))[0];
      if (cheapest && unitValue(state, cheapest, ai) < unitValue(state, best.attacker, ai) * 0.6) {
        return say({ type: 'attack', player: ai, attackerUid: cheapest.card.uid, target: 'player' }, `${unitName(cheapest)} attacks first to bait your Blocker: block it and ${unitName(best.attacker)} gets through unblocked; ignore it and you lose a Shield.`);
      }
    }
    // Ace keeps one Blocker home when the opponent could threaten lethal next turn.
    if (ace && unitKeywords(best.attacker).blocker && best.target === 'player') {
      const myArea = ps.shields.length + (ps.base ? 1 : 0);
      const theirAttackers = op.units.filter(u => u.card.defId !== 'ST01-009').length;
      const otherBlockers = ps.units.filter(u => u !== best.attacker && unitKeywords(u).blocker && !u.rested).length;
      if (theirAttackers > myArea && otherBlockers === 0 && myArea <= 3) {
        const alt = attacks.find(x => x.attacker !== best.attacker && x.value > 0.6);
        if (alt) return say({ type: 'attack', player: ai, attackerUid: alt.attacker.card.uid, target: alt.target }, `${unitName(alt.attacker)} attacks (${alt.why}); ${unitName(best.attacker)} stays home as a Blocker because you threaten lethal.`);
        return say({ type: 'endMain', player: ai }, `Keeping ${unitName(best.attacker)} active as a Blocker: you have ${theirAttackers} attackers against my ${myArea} shield-area cards.`);
      }
    }
    return say({ type: 'attack', player: ai, attackerUid: best.attacker.card.uid, target: best.target }, `${unitName(best.attacker)} → ${best.target === 'player' ? 'you' : unitName(findUnit(state, best.target)!.unit)}: ${best.why}.`);
  }

  // 6. Leftover resources: tokens, reactivation.
  for (const o of activateOptions(state, ai)) {
    if (!o.ok) continue;
    if (o.effectKey === 'whiteBase' && spare >= 2) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Spare Resources become a token Unit.');
    if (o.effectKey === 'tallgeese' && spare >= 4 && attacks.length === 0) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Reactivating Tallgeese for a second attack.');
    if (o.effectKey === 'archangel' && spare >= 2) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Archangel stands my Blocker back up to defend.');
    if (o.effectKey === 'davao' && spare >= 2) return say({ type: 'activateMain', player: ai, uid: o.uid, effectKey: o.effectKey }, 'Davao heals a damaged Unit with spare Resources.');
  }
  // Cheap selection commands when nothing else to do
  for (const c of hand) { const d = CARDS[c.defId]; if ((d.id === 'ST06-012' || d.id === 'ST07-014') && playable(c) && spare >= 1) return say({ type: 'playCard', player: ai, uid: c.uid }, `${d.name} digs for a Unit or Pilot.`); }
  const held = ps.units.filter(u => canAttackThisTurn(state, u));
  const worst = attacks[0];
  return say({ type: 'endMain', player: ai }, held.length && worst ? `Holding ${held.map(unitName).join(', ')}: the best attack available (${worst.why}) is not worth it. Ending my turn.` : spare > 0 ? `Nothing useful left for ${spare} Resource(s). Ending my turn.` : 'Ending my turn.');
}
