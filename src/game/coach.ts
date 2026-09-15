// The Coach: reads the game state and produces plain-language advice for the
// human player, plus an end-of-turn review and a persistent skill tracker.

import { CARDS } from './cards';
import {
  activateOptions, activeResources, attackTargets, canAttackThisTurn, canPlay, commandTargets, findUnit,
  isLinked, other, playerLevel, unitAp, unitHp, unitKeywords, unitLevel, unitName, wouldLink,
} from './engine';
import type { Color, GameState, PlayerId, UnitState } from './types';

export interface Tip {
  level: 'good' | 'info' | 'warn' | 'urgent';
  title: string;
  text: string;
  /** Rules concept this tip teaches, for the skill tracker */
  concept?: string;
}

function ruleTip(level: Tip['level'], title: string, text: string, concept?: string): Tip {
  return { level, title, text, concept };
}

export function coachTips(state: GameState, me: PlayerId): Tip[] {
  const tips: Tip[] = [];
  const ps = state.players[me], op = state.players[other(me)];
  if (state.winner) {
    if (state.winner === me) tips.push(ruleTip('good', 'Victory', `${state.loseReason ?? ''} Review the log to see which attacks connected.`));
    else tips.push(ruleTip('info', 'Defeat', `${state.loseReason ?? ''} Check the turn reviews below for the plays that cost you.`));
    return tips;
  }

  // ---- Pending decisions ----
  const pend = state.pending;
  if (pend && pend.player === me) {
    switch (pend.kind) {
      case 'mulligan': {
        const low = ps.hand.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level <= 3).length;
        const high = ps.hand.filter(c => CARDS[c.defId].level >= 5).length;
        if (low === 0) tips.push(ruleTip('warn', 'Consider redrawing', 'No Unit you can play in your first two turns. An opponent who curves out will chip your Shields while you wait. A redraw is usually right here.', 'mulligan'));
        else if (high >= 3) tips.push(ruleTip('info', 'Top-heavy hand', `You have ${low} early Unit(s) but ${high} cards at Lv.5+. Keepable, but you will be slow.`, 'mulligan'));
        else tips.push(ruleTip('good', 'Solid keep', `${low} early Unit(s) gives you plays on turns 1-3. Keep.`, 'mulligan'));
        break;
      }
      case 'block': {
        const atk = findUnit(state, state.battle!.attackerUid)!;
        const ap = unitAp(state, atk.unit, atk.owner), hp = unitHp(atk.unit);
        for (const o of pend.options) {
          if (!o.ref?.uid) continue;
          const b = findUnit(state, o.ref.uid)!.unit;
          const bAp = unitAp(state, b, me), bHp = unitHp(b);
          const kills = bAp >= hp, dies = ap >= bHp;
          tips.push(ruleTip(kills && !dies ? 'good' : kills ? 'info' : dies ? 'warn' : 'good', `${unitName(b)} blocks: ${kills ? 'kills the attacker' : 'attacker survives'}, ${dies ? 'blocker dies' : 'blocker survives'}`,
            `${unitName(b)} has ${bAp} AP / ${bHp} HP vs the attacker's ${ap} AP / ${hp} HP.`, 'blocker'));
        }
        const shieldsLeft = ps.shields.length + (ps.base ? 1 : 0);
        if (state.battle!.target === 'player') {
          if (shieldsLeft <= 2) tips.push(ruleTip('urgent', 'You are low on Shields', `Only ${ps.shields.length} Shield(s)${ps.base ? ' plus a Base' : ''} left. Blocking here buys a turn.`, 'blocker'));
          else tips.push(ruleTip('info', 'Shields are a resource', `You have ${ps.shields.length} Shields. Losing one early is fine, and it might reveal a 【Burst】. Save blockers for attacks that would kill something important.`, 'shields'));
        }
        break;
      }
      case 'burst': tips.push(ruleTip('good', 'Almost always activate', 'A Burst is free value: Pilots return to hand, Bases deploy and refund a card, Commands resolve at no cost. Decline only if the effect would hurt you.', 'burst')); break;
      case 'actionStep': {
        const atk = findUnit(state, state.battle!.attackerUid)!;
        tips.push(ruleTip('info', 'Action step', `Damage has not been dealt yet. ${atk.owner === me ? 'You are attacking' : 'You are defending'}: an AP-3 on the right Unit or Peaceful Timbre can flip this battle.`, 'actionStep'));
        break;
      }
      case 'pairTarget': {
        const link = pend.options.find(o => o.detail?.includes('✓ Link'));
        if (link) tips.push(ruleTip('good', 'Make a Link Unit', `${link.label} meets the link requirement. A Link Unit can attack the turn it is deployed, and a linked Unit keeps every Pilot bonus.`, 'link'));
        else tips.push(ruleTip('info', 'No link available', 'The Pilot still adds its AP/HP and effects. Put it on the Unit that will attack the most.', 'pairing'));
        break;
      }
    }
    return tips;
  }

  if (state.phase !== 'main' || state.active !== me || state.battle) {
    if (state.active !== me) tips.push(ruleTip('info', "Opponent's turn", 'Watch which Units they leave rested: those are your attack targets next turn. Units that attacked stay rested until their next Start Phase.', 'targets'));
    return tips;
  }

  // ---- Main phase advice ----
  const spare = activeResources(ps);
  const opShieldArea = (op.base ? 1 : 0) + op.shields.length;
  const attackers = ps.units.filter(u => canAttackThisTurn(state, u) && attackTargets(state, me, u).some(t => t.id === 'player'));

  // Lethal
  if (opShieldArea === 0 && attackers.length) tips.push(ruleTip('urgent', 'LETHAL: attack the player', `${op.name} has no Shields and no Base. Any battle damage to the player wins the game. Attack with ${unitName(attackers[0])}!`, 'win'));
  else if (op.base === null && attackers.length >= op.shields.length && op.shields.length > 0 && !op.units.some(u => unitKeywords(u).blocker && !u.rested)) {
    tips.push(ruleTip('good', 'Shields almost gone', `${op.shields.length} Shield(s) left and you have ${attackers.length} attackers. Each attack with 1+ AP removes exactly one Shield.`, 'shields'));
  }

  // Link opportunities
  for (const u of ps.units.filter(u => !u.pilot)) {
    const pilot = ps.hand.find(c => (CARDS[c.defId].type === 'PILOT' || CARDS[c.defId].pilotName) && wouldLink(u, c) && canPlay(state, me, c, CARDS[c.defId].type === 'COMMAND').ok);
    if (pilot) {
      const d = CARDS[pilot.defId];
      tips.push(ruleTip('good', `Link ${d.type === 'COMMAND' ? d.pilotName : d.name} to ${unitName(u)}`,
        `${unitName(u)} needs ${CARDS[u.card.defId].link?.join(' or ')}. ${d.type === 'COMMAND' ? `${d.name} has a 【Pilot】 effect, so it can be paired instead of cast.` : ''} ${u.deployedTurn === state.turn ? 'Because it was deployed this turn, linking lets it attack right now.' : ''}`, 'link'));
      break;
    }
  }

  // Suletta / effects ordering
  for (const u of ps.units) {
    if (u.pilot?.defId === 'ST01-011' && canAttackThisTurn(state, u) && ps.resources.some(r => r.rested)) {
      tips.push(ruleTip('info', 'Attack with Suletta first', 'Suletta Mercury reactivates a Resource when the Unit attacks. Attack before spending, then use the refunded Resource.', 'sequencing'));
      break;
    }
  }

  // Deploy-before-attack sequencing: Guntank / Amuro / Siege Ploy rest targets
  const activeEnemy = op.units.filter(u => !u.rested);
  if (activeEnemy.length && attackers.length) {
    const resters = ps.hand.filter(c => ['ST01-004', 'ST01-010', 'ST02-014'].includes(c.defId) && canPlay(state, me, c).ok);
    if (resters.length) tips.push(ruleTip('info', 'Rest a target before attacking', `${CARDS[resters[0].defId].name} can rest an enemy Unit. Units can only be attacked while rested, so play it before your attacks to open up a kill.`, 'sequencing'));
  }

  // Kill opportunities
  for (const a of ps.units.filter(u => canAttackThisTurn(state, u))) {
    const ap = unitAp(state, a, me), hp = unitHp(a);
    for (const t of attackTargets(state, me, a)) {
      if (t.id === 'player') continue;
      const tu = findUnit(state, t.id as number)!.unit;
      const tAp = unitAp(state, tu, other(me)), tHp = unitHp(tu);
      if (ap >= tHp && tAp < hp) { tips.push(ruleTip('good', `Free kill: ${unitName(a)} → ${unitName(tu)}`, `${ap} AP kills its ${tHp} HP, and its ${tAp} AP won't destroy your ${hp} HP. Removing Units beats hitting Shields when the trade is free.`, 'combat')); break; }
    }
  }

  // Bad attacks warning
  for (const a of ps.units.filter(u => canAttackThisTurn(state, u))) {
    const ap = unitAp(state, a, me), hp = unitHp(a);
    const blockers = op.units.filter(u => unitKeywords(u).blocker && !u.rested);
    const deadly = blockers.find(b => unitAp(state, b, other(me)) >= hp && ap < unitHp(b));
    if (deadly && !unitKeywords(a).highManeuver) { tips.push(ruleTip('warn', `Careful attacking with ${unitName(a)}`, `${unitName(deadly)} has <Blocker>: it can redirect the attack to itself, kill your ${hp} HP Unit, and survive your ${ap} AP.`, 'blocker')); break; }
  }

  // Unspent resources
  const playableCards = ps.hand.filter(c => canPlay(state, me, c).ok || canPlay(state, me, c, true).ok);
  if (spare > 0 && playableCards.length) {
    tips.push(ruleTip('info', `${spare} active Resource${spare > 1 ? 's' : ''} unspent`, `Playable now: ${playableCards.map(c => CARDS[c.defId].name).join(', ')}. Resources refresh every turn, so unspent ones are wasted.`, 'curve'));
  } else if (spare > 0 && !playableCards.length) {
    const acts = activateOptions(state, me).filter(o => o.ok);
    if (acts.length) tips.push(ruleTip('info', 'Spend on an effect', `${acts[0].label}.`, 'activate'));
  }

  // Level check
  const tooHigh = ps.hand.filter(c => CARDS[c.defId].level > playerLevel(ps));
  if (tooHigh.length === ps.hand.length && ps.hand.length) tips.push(ruleTip('warn', 'Hand is above your Level', `You are Lv.${playerLevel(ps)} (one Resource per turn). Every card in hand needs a higher Level. Consider lower-cost Units and Bases when redrawing next game.`, 'curve'));

  // Blocker held back
  const myBlockers = ps.units.filter(u => unitKeywords(u).blocker && !u.rested);
  if (myBlockers.length && op.units.length >= 2 && ps.shields.length <= 3) tips.push(ruleTip('info', 'Keep a Blocker active', `${unitName(myBlockers[0])} can only block while active. If it attacks, it is rested and cannot protect you next turn.`, 'blocker'));

  // Base
  const baseCard = ps.hand.find(c => CARDS[c.defId].type === 'BASE' && canPlay(state, me, c).ok);
  if (baseCard && (!ps.base || ps.base.isEx)) tips.push(ruleTip('good', `Play ${CARDS[baseCard.defId].name}`, 'A Base with 5 HP absorbs attacks before your Shields, and its 【Deploy】 adds a Shield to your hand: a free card.', 'base'));

  // Burst risk on offense
  if (attackers.length && op.shields.length > 0 && !op.base) tips.push(ruleTip('info', 'Shields may hold a Burst', 'Each Shield you break is revealed. Pilots return to their hand, Bases deploy for free. Attack anyway, but expect a swing.', 'burst'));

  tips.push(...colorTips(state, me));

  if (!tips.length) tips.push(ruleTip('info', 'Nothing urgent', 'Develop your board, attack when you can trade well, and end your turn.'));
  return tips.slice(0, 5);
}

/** The colors a player is running, inferred from all their cards. */
export function playerColors(state: GameState, me: PlayerId): Color[] {
  const ps = state.players[me];
  const all = [...ps.deck, ...ps.hand, ...ps.trash, ...ps.shields, ...ps.units.map(u => u.card), ...ps.units.flatMap(u => u.pilot ? [u.pilot] : [])].filter(c => !c.token);
  return [...new Set(all.map(c => CARDS[c.defId].color))];
}

/** Color-pattern coaching: reminders specific to how each color wants to be played. */
function colorTips(state: GameState, me: PlayerId): Tip[] {
  const out: Tip[] = [];
  const ps = state.players[me], op = state.players[other(me)];
  const colors = playerColors(state, me);
  const attackers = ps.units.filter(u => canAttackThisTurn(state, u) && attackTargets(state, me, u).length);
  const acts = activateOptions(state, me).filter(o => o.ok);
  if (colors.includes('Red')) {
    const sup = acts.find(o => o.effectKey === 'support' || o.effectKey === 'vesalius');
    if (sup && attackers.length && !state.turnFlags.attacked) out.push(ruleTip('good', 'Red pattern: buff, then swing', `${sup.label}. Activate it before attacking so the AP bonus counts in the battle.`, 'color-red'));
    const dmg = ps.hand.find(c => c.defId === 'ST03-013' && canPlay(state, me, c).ok);
    const blocker = op.units.find(u => unitKeywords(u).blocker && !u.rested && unitHp(u) <= 2);
    if (dmg && blocker) out.push(ruleTip('info', 'Clear the Blocker first', `Close Combat kills ${unitName(blocker)} before your attacks, so nothing can redirect them.`, 'color-red'));
  }
  if (colors.includes('Purple')) {
    const engine = acts.find(o => o.effectKey === 'cgs' || o.effectKey === 'isaribi');
    const barb = ps.units.find(u => (u.card.defId === 'ST05-002' || u.card.defId === 'ST05-001') && u.damage === 0 && canAttackThisTurn(state, u));
    if (engine && barb) out.push(ruleTip('good', 'Purple pattern: hurt your own Unit', `${unitName(barb)} gets stronger while damaged. ${engine.label} turns that on before you attack.`, 'color-purple'));
    const fragile = ps.units.filter(u => unitHp(u) === 1);
    if (fragile.length && acts.some(o => o.effectKey === 'cgs')) out.push(ruleTip('warn', 'Do not ping a 1 HP Unit', `${fragile.map(unitName).join(', ')} would be destroyed by your own effect. Count HP before self-damage.`, 'color-purple'));
  }
  if (colors.includes('White')) {
    const actions = ps.hand.filter(c => CARDS[c.defId].timing?.includes('Action') && CARDS[c.defId].timing?.includes('Main') && canPlay(state, me, c).ok);
    if (actions.length && op.units.some(u => !u.rested) && state.active === me) out.push(ruleTip('info', 'White pattern: hold the trick', `${CARDS[actions[0].defId].name} also works in the action step. It is usually worth more during the opponent's attack than in your Main Phase.`, 'color-white'));
  }
  if (colors.includes('Green')) {
    const ex = ps.resources.filter(r => r.isEx).length;
    const big = ps.hand.filter(c => CARDS[c.defId].level >= 5 && canPlay(state, me, c).ok);
    if (ex && big.length) out.push(ruleTip('good', 'Green pattern: cash in the ramp', `Your EX Resource${ex > 1 ? 's' : ''} put${ex > 1 ? '' : 's'} you at Lv.${playerLevel(ps)} early. ${CARDS[big[0].defId].name} is playable now, ahead of schedule.`, 'color-green'));
    const breacher = attackers.find(u => unitKeywords(u).breach);
    const kill = breacher && op.units.find(t => t.rested && unitAp(state, breacher, me) >= unitHp(t));
    if (breacher && kill && (op.base || op.shields.length)) out.push(ruleTip('good', 'Breach for two-for-one', `${unitName(breacher)} kills ${unitName(kill)} and <Breach ${unitKeywords(breacher).breach}> then hits their ${op.base ? 'Base' : 'top Shield'}.`, 'color-green'));
  }
  if (colors.includes('Blue')) {
    const rester = ps.hand.find(c => ['ST01-004', 'ST01-010', 'ST02-014'].includes(c.defId) && canPlay(state, me, c).ok);
    const activeEnemy = op.units.filter(u => !u.rested);
    if (rester && activeEnemy.length && attackers.length) out.push(ruleTip('good', 'Blue pattern: rest, then kill', `${CARDS[rester.defId].name} can rest ${unitName(activeEnemy[0])}. Active Units are safe; rested ones are targets.`, 'color-blue'));
  }
  return out.slice(0, 2);
}

/** End-of-turn review of what the human did (call before dispatching endMain). */
export function reviewTurn(state: GameState, me: PlayerId): Tip[] {
  const out: Tip[] = [];
  const ps = state.players[me];
  const spare = activeResources(ps);
  const playable = ps.hand.filter(c => canPlay(state, me, c).ok || canPlay(state, me, c, true).ok);
  if (spare > 0 && playable.length) out.push(ruleTip('warn', 'Resources left on the table', `You ended with ${spare} active Resource(s) while ${playable.map(c => CARDS[c.defId].name).join(', ')} was playable.`, 'curve'));
  const idle = ps.units.filter(u => canAttackThisTurn(state, u));
  for (const u of idle) {
    const targets = attackTargets(state, me, u);
    const opUnits = state.players[other(me)].units;
    const deadlyBlocker = opUnits.some(b => unitKeywords(b).blocker && !b.rested && unitAp(state, b, other(me)) >= unitHp(u));
    const safeKill = targets.some(t => t.id !== 'player' && unitAp(state, u, me) >= unitHp(findUnit(state, t.id as number)!.unit) && unitAp(state, findUnit(state, t.id as number)!.unit, other(me)) < unitHp(u));
    if (safeKill) out.push(ruleTip('warn', `${unitName(u)} skipped a free kill`, 'It could have destroyed a rested enemy Unit and survived.', 'combat'));
    else if (targets.some(t => t.id === 'player') && !deadlyBlocker && !unitKeywords(u).blocker) out.push(ruleTip('info', `${unitName(u)} did not attack`, 'No enemy Blocker could punish it. Pressure on Shields adds up, and the Unit re-activates next turn anyway.', 'combat'));
  }
  const unpaired = ps.units.filter(u => !u.pilot);
  const linkable = unpaired.some(u => ps.hand.some(c => wouldLink(u, c) && (CARDS[c.defId].type === 'PILOT' || CARDS[c.defId].pilotName) && CARDS[c.defId].level <= playerLevel(ps)));
  if (linkable && spare >= 1) out.push(ruleTip('warn', 'Missed a Link', 'A Pilot in hand could have linked one of your Units for 1 Resource.', 'link'));
  if (!out.length) out.push(ruleTip('good', 'Clean turn', 'Resources spent, attacks made where they were safe.'));
  return out;
}

// ---------- Skill tracker ----------

export interface Skill { id: string; name: string; how: string }

export const SKILLS: Skill[] = [
  { id: 'attack', name: 'Declare an attack', how: 'Attack the player or a rested Unit.' },
  { id: 'shield', name: 'Break a Shield', how: 'Land an attack on the player while they have no Base.' },
  { id: 'pair', name: 'Pair a Pilot', how: 'Play a Pilot onto a Unit.' },
  { id: 'link', name: 'Create a Link Unit', how: 'Pair a Pilot that meets the Unit\'s link requirement.' },
  { id: 'linkAttack', name: 'Attack with a Link Unit the turn it was deployed', how: 'Deploy, link, attack: all in one turn.' },
  { id: 'kill', name: 'Destroy an enemy Unit in battle', how: 'Attack a rested Unit with enough AP.' },
  { id: 'block', name: 'Use a Blocker', how: 'Rest a <Blocker> to redirect an enemy attack.' },
  { id: 'command', name: 'Play a Command', how: 'Cast a 【Main】 Command from hand.' },
  { id: 'action', name: 'Play an 【Action】 during a battle', how: 'Use Unforeseen Incident or Siege Ploy in an action step.' },
  { id: 'base', name: 'Deploy a Base', how: 'Play a Base card from hand.' },
  { id: 'activate', name: 'Use an 【Activate･Main】 effect', how: 'White Base, Asticassia, or Tallgeese.' },
  { id: 'cmdPilot', name: 'Pair a Command as a Pilot', how: 'Play a 【Pilot】 Command onto a Unit.' },
  { id: 'burst', name: 'Trigger a Burst', how: 'Have one of your Shields with 【Burst】 destroyed and activate it.' },
  { id: 'cleanTurn', name: 'End a turn with all Resources spent', how: 'Use every Resource before ending the turn.' },
  { id: 'win', name: 'Win a game', how: 'Deal battle damage with their shield area empty, or deck them out.' },
];

export type SkillProgress = Record<string, number>; // id -> count

const KEY = 'gcg-trainer-skills';

export function loadSkills(): SkillProgress {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

export function saveSkills(p: SkillProgress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function bumpSkill(p: SkillProgress, id: string): SkillProgress {
  const n = { ...p, [id]: (p[id] ?? 0) + 1 };
  saveSkills(n);
  return n;
}

/** Detect skills demonstrated by comparing log deltas after a human action. */
export function detectSkills(before: GameState, after: GameState, me: PlayerId, progress: SkillProgress): SkillProgress {
  let p = progress;
  const b = before.stats[me], a = after.stats[me];
  const newLogs = after.log.slice(before.log.length).filter(l => l.player === me || l.kind === 'system');
  if (a.attacksDeclared > b.attacksDeclared) p = bumpSkill(p, 'attack');
  if (a.shieldsBroken > b.shieldsBroken) p = bumpSkill(p, 'shield');
  if (a.pilotsPaired > b.pilotsPaired) p = bumpSkill(p, 'pair');
  if (a.linkUnitsMade > b.linkUnitsMade) p = bumpSkill(p, 'link');
  if (a.unitsDestroyed > b.unitsDestroyed && after.battle === null && newLogs.some(l => l.kind === 'damage')) p = bumpSkill(p, 'kill');
  if (a.blocksUsed > b.blocksUsed) p = bumpSkill(p, 'block');
  if (a.commandsPlayed > b.commandsPlayed) p = bumpSkill(p, newLogs.some(l => l.text.includes('action step')) ? 'action' : 'command');
  if (newLogs.some(l => l.text.includes('deploys Base'))) p = bumpSkill(p, 'base');
  if (newLogs.some(l => l.text.includes('activates White Base') || l.text.includes('rests Asticassia') || l.text.includes('Tallgeese is set as active'))) p = bumpSkill(p, 'activate');
  if (newLogs.some(l => l.text.startsWith(after.players[me].name + ' pairs') && /pairs (Hayato|Kai|Trowa|Quatre)/.test(l.text))) p = bumpSkill(p, 'cmdPilot');
  if (newLogs.some(l => l.text.includes('activates 【Burst】'))) p = bumpSkill(p, 'burst');
  if (after.winner === me && before.winner !== me) p = bumpSkill(p, 'win');
  // link attack: an attack by a unit deployed this turn
  if (a.attacksDeclared > b.attacksDeclared) {
    const atkLog = newLogs.find(l => l.kind === 'attack' && l.text.includes('attacks'));
    if (atkLog) {
      const name = atkLog.text.split(' (')[0];
      const u = after.players[me].units.find(x => unitName(x) === name) as UnitState | undefined;
      if (u && u.deployedTurn === after.turn && isLinked(u)) p = bumpSkill(p, 'linkAttack');
    }
  }
  if (after.turn > before.turn && before.active === me && activeResources(before.players[me]) === 0 && before.players[me].resources.length > 0) p = bumpSkill(p, 'cleanTurn');
  return p;
}

export function levelLabel(u: UnitState): string { return u.card.token ? 'Token' : `Lv.${unitLevel(u)}`; }
export { commandTargets };
