// Gundam Card Game rules engine.
// Implements the comprehensive rules (v1.9.0) for two-player games with the
// ST01 and ST02 card pools. The engine mutates a GameState in place; the UI
// snapshots state (structuredClone) for undo.

import { CARDS, DECKS, TOKENS } from './cards';
import type {
  Action, BaseState, CardDef, CardInstance, ChoiceOption, GameState, Keywords, LogEntry,
  PendingChoice, PlayerId, PlayerState, PlayerStats, ResourceState, UnitState,
} from './types';

// ---------- small utilities ----------

export function other(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}

export function def(card: CardInstance): CardDef | undefined {
  return card.token ? undefined : CARDS[card.defId];
}

export function cardName(card: CardInstance): string {
  return card.token ? `${card.token.name} (token)` : CARDS[card.defId].name;
}

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

let rng = makeRng(Date.now());

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function log(state: GameState, text: string, kind: LogEntry['kind'] = 'info', player?: PlayerId) {
  state.log.push({ turn: state.turn, player, text, kind });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

function emptyStats(): PlayerStats {
  return {
    attacksDeclared: 0, shieldsBroken: 0, unitsDestroyed: 0, unitsLost: 0, linkUnitsMade: 0,
    pilotsPaired: 0, blocksUsed: 0, commandsPlayed: 0, resourcesLeftUnspent: [], turnsWithNoPlay: 0,
  };
}

// ---------- game creation ----------

export interface GameOptions {
  p1Deck: string;
  p2Deck: string;
  humanId: PlayerId;
  p1Name?: string;
  p2Name?: string;
  seed?: number;
  /** Which player goes first (default p1). */
  first?: PlayerId;
  /** Skip mulligan decisions (used by lessons). */
  skipMulligan?: boolean;
}

export function createGame(opts: GameOptions): GameState {
  rng = makeRng(opts.seed ?? Date.now());
  let uid = 1;
  const mkPlayer = (id: PlayerId, deckId: string, name: string, isAI: boolean): PlayerState => {
    const deckDef = DECKS[deckId];
    const deck: CardInstance[] = [];
    for (const [cid, n] of deckDef.cards) for (let i = 0; i < n; i++) deck.push({ uid: uid++, defId: cid, owner: id });
    shuffle(deck);
    return {
      id, name, deck, resourceDeck: 10, hand: [], shields: [], base: null, units: [], resources: [], trash: [],
      redrew: false, isAI,
    };
  };
  const first = opts.first ?? 'p1';
  const state: GameState = {
    turn: 0,
    active: first,
    phase: 'start',
    players: {
      p1: mkPlayer('p1', opts.p1Deck, opts.p1Name ?? (opts.humanId === 'p1' ? 'Player' : 'Opponent'), opts.humanId !== 'p1'),
      p2: mkPlayer('p2', opts.p2Deck, opts.p2Name ?? (opts.humanId === 'p2' ? 'Player' : 'Opponent'), opts.humanId !== 'p2'),
    },
    battle: null,
    pending: null,
    queue: [],
    log: [],
    winner: null,
    nextUid: uid,
    turnFlags: {},
    setupStage: 'mulligan',
    humanId: opts.humanId,
    stats: { p1: emptyStats(), p2: emptyStats() },
    holding: [],
  };
  // Starting hands (6-2-1-5)
  for (const p of ['p1', 'p2'] as PlayerId[]) draw(state, p, 5, true);
  log(state, `Both players draw 5. ${state.players[first].name} goes first.`, 'system');
  if (opts.skipMulligan) {
    finishSetup(state);
  } else {
    pushChoice(state, mulliganChoice(state, first));
  }
  return state;
}

function mulliganChoice(_state: GameState, p: PlayerId): PendingChoice {
  return {
    kind: 'mulligan', player: p, title: 'Keep or redraw?',
    description: 'You may return your whole hand to the bottom of the deck and draw 5 new cards, once. A good keep has a Lv.1-3 Unit for your first turns.',
    options: [
      { id: 'keep', label: 'Keep this hand' },
      { id: 'redraw', label: 'Redraw 5 new cards' },
    ],
    ctx: {},
  };
}

function finishSetup(state: GameState) {
  // 6-2-2: top six cards become shields (top of deck = bottom shield).
  for (const p of ['p1', 'p2'] as PlayerId[]) {
    const ps = state.players[p];
    for (let i = 0; i < 6; i++) {
      const c = ps.deck.shift()!;
      ps.shields.unshift(c); // first card drawn becomes bottom-most; later cards stack on top
    }
    // 6-2-3 EX Base
    ps.base = { card: { uid: state.nextUid++, defId: 'EX-BASE', owner: p, token: TOKENS['EX-BASE'] }, rested: false, damage: 0, isEx: true };
  }
  // 6-2-4 EX Resource for player two
  const second = other(state.active);
  state.players[second].resources.push({ uid: state.nextUid++, rested: false, isEx: true });
  log(state, `6 Shields and an EX Base for each player. ${state.players[second].name} gets an EX Resource for going second.`, 'system');
  state.setupStage = 'playing';
  startTurn(state, state.active, true);
}

// ---------- derived values ----------

export function findUnit(state: GameState, uid: number): { unit: UnitState; owner: PlayerId } | null {
  for (const p of ['p1', 'p2'] as PlayerId[]) {
    const u = state.players[p].units.find(u => u.card.uid === uid);
    if (u) return { unit: u, owner: p };
  }
  return null;
}

export function unitDef(u: UnitState): CardDef | undefined { return def(u.card); }

export function unitName(u: UnitState): string { return cardName(u.card); }

export function unitLevel(u: UnitState): number { return u.card.token ? 0 : CARDS[u.card.defId].level; }

export function pilotName(pilot: CardInstance): string {
  const d = CARDS[pilot.defId];
  return d.type === 'PILOT' ? d.name : (d.pilotName ?? d.name);
}

export function pilotTraits(pilot: CardInstance): string[] { return CARDS[pilot.defId].traits; }

export function isLinked(u: UnitState): boolean {
  if (!u.pilot) return false;
  const d = unitDef(u);
  if (!d?.link?.length) return false;
  const pname = pilotName(u.pilot);
  const ptraits = pilotTraits(u.pilot);
  return d.link.some(req => {
    const m = req.match(/^\((.+)\)$/);
    if (m) return ptraits.includes(m[1]);
    return pname.includes(req);
  });
}

export function unitKeywords(u: UnitState): Keywords {
  const base = unitDef(u)?.keywords ?? {};
  const t = u.tempKeywords;
  return {
    repair: (base.repair ?? 0) + (t.repair ?? 0) || undefined,
    breach: (base.breach ?? 0) + (t.breach ?? 0) || undefined,
    support: (base.support ?? 0) + (t.support ?? 0) || undefined,
    blocker: base.blocker || t.blocker,
    firstStrike: base.firstStrike || t.firstStrike,
    highManeuver: base.highManeuver || t.highManeuver,
  };
}

export function unitAp(state: GameState, u: UnitState, owner: PlayerId): number {
  let ap = u.card.token ? u.card.token.ap : (CARDS[u.card.defId].ap ?? 0);
  if (u.pilot) ap += CARDS[u.pilot.defId].ap ?? 0;
  ap += u.tempAp;
  // Heero Yuy: During Link AP+1
  if (u.pilot && u.pilot.defId === 'ST02-010' && isLinked(u)) ap += 1;
  // Gundam (ST01-001) During Pair: during your turn all your Units get AP+1
  if (state.active === owner) {
    for (const g of state.players[owner].units) {
      if (g.card.defId === 'ST01-001' && g.pilot) ap += 1;
    }
  }
  return Math.max(0, ap);
}

export function unitMaxHp(u: UnitState): number {
  let hp = u.card.token ? u.card.token.hp : (CARDS[u.card.defId].hp ?? 0);
  if (u.pilot) hp += CARDS[u.pilot.defId].hp ?? 0;
  hp += u.tempHp;
  if (u.pilot && u.pilot.defId === 'ST02-010' && isLinked(u)) hp += 1;
  return hp;
}

export function unitHp(u: UnitState): number { return unitMaxHp(u) - u.damage; }

export function baseMaxHp(b: BaseState): number { return b.card.token ? b.card.token.hp : (CARDS[b.card.defId].hp ?? 0); }
export function baseHp(b: BaseState): number { return baseMaxHp(b) - b.damage; }

export function playerLevel(ps: PlayerState): number { return ps.resources.length; }
export function activeResources(ps: PlayerState): number { return ps.resources.filter(r => !r.rested).length; }

export function canAttackThisTurn(state: GameState, u: UnitState): boolean {
  if (u.rested) return false;
  if (u.deployedTurn === state.turn && !isLinked(u)) return false;
  return true;
}

/** Whether a card in hand can be played right now (level + cost + targets). */
export function canPlay(state: GameState, p: PlayerId, card: CardInstance, asPilot = false): { ok: boolean; reason?: string } {
  const ps = state.players[p];
  const d = CARDS[card.defId];
  if (state.phase !== 'main' || state.active !== p || state.battle || state.pending) {
    // Action commands are handled in the action step separately
    return { ok: false, reason: 'Not your main phase' };
  }
  if (playerLevel(ps) < d.level) return { ok: false, reason: `Needs Lv.${d.level} (you have ${playerLevel(ps)} Resources)` };
  if (activeResources(ps) < d.cost) return { ok: false, reason: `Costs ${d.cost}, you have ${activeResources(ps)} active Resources` };
  if (d.type === 'PILOT' || (d.type === 'COMMAND' && asPilot)) {
    if (!ps.units.some(u => !u.pilot)) return { ok: false, reason: 'No Unit without a Pilot to pair with' };
    return { ok: true };
  }
  if (d.type === 'COMMAND') {
    if (!d.timing?.includes('Main')) return { ok: false, reason: 'Action timing only: play it during a battle' };
    const targets = commandTargets(state, p, d.id);
    if (targets !== null && targets.length === 0) return { ok: false, reason: 'No valid target' };
    return { ok: true };
  }
  return { ok: true };
}

/** Valid targets for a command's Main effect; null means no target needed. */
export function commandTargets(state: GameState, p: PlayerId, defId: string): UnitState[] | null {
  const me = state.players[p], op = state.players[other(p)];
  switch (defId) {
    case 'ST01-012': return op.units.filter(u => u.rested);
    case 'ST01-013': return me.units;
    case 'ST01-014': return op.units;
    case 'ST02-012': return me.units;
    case 'ST02-014': return op.units.filter(u => unitHp(u) <= 5);
    case 'ST02-013': return null;
    default: return null;
  }
}

// ---------- pending choices ----------

function pushChoice(state: GameState, c: PendingChoice) {
  if (state.pending) state.queue.push(c); else state.pending = c;
}

function nextPending(state: GameState) {
  state.pending = state.queue.shift() ?? null;
}

function unitOption(state: GameState, u: UnitState, owner: PlayerId): ChoiceOption {
  return {
    id: `unit:${u.card.uid}`,
    label: unitName(u),
    detail: `${unitAp(state, u, owner)} AP / ${unitHp(u)} HP${u.rested ? ' (rested)' : ''}${u.card.token ? '' : ' Lv.' + unitLevel(u)}`,
    ref: { kind: 'unit', uid: u.card.uid, owner },
  };
}

// ---------- drawing, resources, payment ----------

function draw(state: GameState, p: PlayerId, n: number, silent = false) {
  const ps = state.players[p];
  for (let i = 0; i < n; i++) {
    if (ps.deck.length === 0) { defeat(state, p, 'ran out of cards in their deck'); return; }
    ps.hand.push(ps.deck.shift()!);
    if (ps.deck.length === 0 && state.setupStage === 'playing') { defeat(state, p, 'drew the last card of their deck'); return; }
  }
  if (!silent) log(state, `${ps.name} draws ${n}.`, 'info', p);
}

function defeat(state: GameState, loser: PlayerId, reason: string) {
  if (state.winner) return;
  state.winner = other(loser);
  state.loseReason = `${state.players[loser].name} ${reason}.`;
  state.phase = 'gameover';
  state.pending = null; state.queue = [];
  log(state, `${state.players[state.winner].name} wins! ${state.loseReason}`, 'system');
}

/** Rest resources to pay a cost. Regular Resources first; EX Resources are removed when used. */
function payCost(state: GameState, p: PlayerId, cost: number) {
  const ps = state.players[p];
  let remaining = cost;
  for (const r of ps.resources) {
    if (remaining === 0) break;
    if (!r.rested && !r.isEx) { r.rested = true; remaining--; }
  }
  if (remaining > 0) {
    const ex = ps.resources.filter(r => !r.rested && r.isEx);
    for (const r of ex) {
      if (remaining === 0) break;
      ps.resources.splice(ps.resources.indexOf(r), 1);
      remaining--;
      log(state, `${ps.name} spends an EX Resource (it is removed from the game).`, 'effect', p);
    }
  }
}

export function addExResource(state: GameState, p: PlayerId) {
  const ps = state.players[p];
  if (ps.resources.filter(r => r.isEx).length >= 5) { log(state, `${ps.name} already has 5 EX Resources.`, 'effect', p); return; }
  ps.resources.push({ uid: state.nextUid++, rested: false, isEx: true } as ResourceState);
  log(state, `${ps.name} places an EX Resource (now Lv.${playerLevel(ps)}).`, 'effect', p);
}

// ---------- turn flow ----------

function startTurn(state: GameState, p: PlayerId, first = false) {
  if (state.winner) return;
  state.turn += 1;
  state.active = p;
  state.turnFlags = {};
  const ps = state.players[p];
  state.phase = 'start';
  log(state, `--- Turn ${state.turn}: ${ps.name} ---`, 'phase', p);
  // Active step
  for (const u of ps.units) { u.rested = false; u.usedThisTurn = []; }
  for (const r of ps.resources) r.rested = false;
  if (ps.base) ps.base.rested = false;
  // Draw phase
  state.phase = 'draw';
  draw(state, p, 1);
  if (state.winner) return;
  // Resource phase
  state.phase = 'resource';
  const regular = ps.resources.filter(r => !r.isEx).length;
  if (ps.resourceDeck > 0 && regular < 10) {
    ps.resourceDeck -= 1;
    ps.resources.push({ uid: state.nextUid++, rested: false, isEx: false });
    log(state, `${ps.name} places a Resource (Lv.${playerLevel(ps)}).`, 'info', p);
  }
  state.phase = 'main';
  void first;
}

function endTurn(state: GameState) {
  const p = state.active;
  const ps = state.players[p];
  state.phase = 'end';
  // (Action step skipped: no end-phase Action effects exist in these decks.)
  // End step: Repair
  for (const u of ps.units) {
    const kw = unitKeywords(u);
    if (kw.repair && u.damage > 0) {
      const before = u.damage;
      u.damage = Math.max(0, u.damage - kw.repair);
      log(state, `${unitName(u)} repairs ${before - u.damage} HP (<Repair ${kw.repair}>).`, 'effect', p);
    }
  }
  // Stats: unspent resources
  state.stats[p].resourcesLeftUnspent.push(activeResources(ps));
  // Hand step
  if (ps.hand.length > 10) {
    pushChoice(state, {
      kind: 'discard', player: p, title: `Discard down to 10 cards (${ps.hand.length - 10} more)`,
      options: ps.hand.map(c => ({ id: `hand:${c.uid}`, label: cardName(c), ref: { kind: 'hand', uid: c.uid, owner: p } })),
      ctx: {},
    });
    return; // resumes in resolveChoice -> finishEndTurn
  }
  finishEndTurn(state);
}

function finishEndTurn(state: GameState) {
  const p = state.active;
  // Cleanup: "during this turn" effects expire
  for (const q of ['p1', 'p2'] as PlayerId[]) {
    for (const u of state.players[q].units) { u.tempAp = 0; u.tempHp = 0; u.tempKeywords = {}; }
  }
  startTurn(state, other(p));
}

// ---------- deploying & pairing ----------

function newUnit(card: CardInstance, turn: number): UnitState {
  return { card, rested: false, damage: 0, deployedTurn: turn, tempAp: 0, tempHp: 0, tempKeywords: {}, usedThisTurn: [] };
}

function deployUnit(state: GameState, p: PlayerId, card: CardInstance, viaEffect = false) {
  const ps = state.players[p];
  if (ps.units.length >= 6) {
    // 11-4 battle area excess: choose a unit to trash (not destroyed)
    if (ps.isAI) {
      const weakest = [...ps.units].sort((a, b) => unitAp(state, a, p) + unitHp(a) - (unitAp(state, b, p) + unitHp(b)))[0];
      removeUnitToTrash(state, p, weakest);
    } else {
      pushChoice(state, {
        kind: 'unitLimit', player: p, title: 'Battle area is full (6 Units). Choose a Unit to place in the trash.',
        description: 'The removed Unit is not treated as destroyed.',
        options: ps.units.map(u => unitOption(state, u, p)),
        ctx: { card, viaEffect },
      });
      return;
    }
  }
  const u = newUnit(card, state.turn);
  ps.units.push(u);
  log(state, `${ps.name} deploys ${cardName(card)}.`, 'play', p);
  onDeploy(state, p, u);
}

function removeUnitToTrash(state: GameState, p: PlayerId, u: UnitState) {
  const ps = state.players[p];
  ps.units.splice(ps.units.indexOf(u), 1);
  if (!u.card.token) ps.trash.push(u.card);
  if (u.pilot) ps.trash.push(u.pilot);
  log(state, `${unitName(u)} is placed in the trash to make room.`, 'info', p);
}

export function deployToken(state: GameState, p: PlayerId, tokenId: string) {
  const t = TOKENS[tokenId];
  const card: CardInstance = { uid: state.nextUid++, defId: t.id, owner: p, token: t };
  deployUnit(state, p, card, true);
}

function onDeploy(state: GameState, p: PlayerId, u: UnitState) {
  const op = other(p);
  switch (u.card.defId) {
    case 'ST01-004': { // Guntank: rest enemy unit with <=2 HP
      const targets = state.players[op].units.filter(t => unitHp(t) <= 2 && !t.rested);
      if (targets.length) {
        pushChoice(state, {
          kind: 'target.rest', player: p, title: 'Guntank 【Deploy】: choose 1 enemy Unit with 2 or less HP to rest.',
          options: targets.map(t => unitOption(state, t, op)), ctx: { source: 'Guntank' },
        });
      } else log(state, 'Guntank 【Deploy】: no enemy Unit with 2 or less HP to rest.', 'effect', p);
      break;
    }
    case 'ST02-002': addExResource(state, p); break; // Wing (Bird Mode)
  }
}

function deployBase(state: GameState, p: PlayerId, card: CardInstance, fromBurst = false) {
  const ps = state.players[p];
  if (ps.base) {
    if (!ps.base.isEx) ps.trash.push(ps.base.card);
    log(state, `${cardName(ps.base.card)} is replaced (not destroyed).`, 'info', p);
  }
  ps.base = { card, rested: false, damage: 0 };
  log(state, `${ps.name} deploys Base ${cardName(card)}.`, 'play', p);
  // 【Deploy】Add 1 of your Shields to your hand (all four bases)
  if (ps.shields.length) {
    const s = ps.shields.shift()!;
    ps.hand.push(s);
    log(state, `${ps.name} adds a Shield to hand (${ps.shields.length} left).`, 'effect', p);
  }
  switch (card.defId) {
    case 'ST02-015': { // Saint Gabriel: look at top 2, one top one bottom
      if (ps.deck.length >= 2) {
        const [a, b] = ps.deck;
        if (ps.isAI) {
          const score = (c: CardInstance) => (CARDS[c.defId].level <= playerLevel(ps) + 1 ? 1 : 0);
          if (score(b) > score(a)) { ps.deck.shift(); ps.deck.push(a); } else { ps.deck.splice(1, 1); ps.deck.push(b); }
        } else {
          pushChoice(state, {
            kind: 'saintGabriel', player: p, title: 'Saint Gabriel Institute: look at the top 2 cards. Which one stays on top?',
            description: 'The other card goes to the bottom of your deck.',
            options: [a, b].map(c => ({ id: `deck:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].type}` })),
            ctx: {},
          });
        }
      }
      break;
    }
    case 'ST02-016': { // Corsica Base
      if (state.active === p && !fromBurst) {
        const corsicaInTrash = ps.trash.some(c => CARDS[c.defId]?.name.includes('Corsica Base'));
        if (corsicaInTrash) { deployToken(state, p, 'T-004'); deployToken(state, p, 'T-004'); }
        else deployToken(state, p, 'T-005');
      }
      break;
    }
  }
}

function pairPilot(state: GameState, p: PlayerId, pilot: CardInstance, u: UnitState) {
  const ps = state.players[p];
  u.pilot = pilot;
  const linked = isLinked(u);
  state.stats[p].pilotsPaired++;
  if (linked) state.stats[p].linkUnitsMade++;
  log(state, `${ps.name} pairs ${pilotName(pilot)} with ${unitName(u)}${linked ? ' — Link Unit!' : ''}.`, 'play', p);
  // When Paired effects (unit side)
  const op = other(p);
  switch (u.card.defId) {
    case 'ST01-002': // Gundam MA Form: When Paired (White Base Team pilot): draw 1
      if (pilotTraits(pilot).includes('White Base Team')) { log(state, 'Gundam (MA Form) 【When Paired】: draw 1.', 'effect', p); draw(state, p, 1); }
      break;
    case 'ST01-006': { // Aerial PS6: enemy unit Lv<=5 gets AP-3 this turn
      const targets = state.players[op].units.filter(t => unitLevel(t) <= 5);
      if (targets.length) pushChoice(state, {
        kind: 'target.apMinus3', player: p, title: 'Gundam Aerial 【When Paired】: choose 1 enemy Unit (Lv.5 or lower). It gets AP-3 this turn.',
        options: targets.map(t => unitOption(state, t, op)), ctx: { source: 'Gundam Aerial' },
      });
      break;
    }
  }
  // When Paired effects (pilot side)
  switch (pilot.defId) {
    case 'ST01-010': { // Amuro: rest enemy unit with <=5 HP
      const targets = state.players[op].units.filter(t => unitHp(t) <= 5 && !t.rested);
      if (targets.length) pushChoice(state, {
        kind: 'target.rest', player: p, title: 'Amuro Ray 【When Paired】: choose 1 enemy Unit with 5 or less HP to rest.',
        options: targets.map(t => unitOption(state, t, op)), ctx: { source: 'Amuro Ray' },
      });
      break;
    }
  }
}

// ---------- playing cards ----------

function playCard(state: GameState, p: PlayerId, uid: number, asPilot = false) {
  const ps = state.players[p];
  const card = ps.hand.find(c => c.uid === uid);
  if (!card) return;
  const chk = canPlay(state, p, card, asPilot);
  if (!chk.ok) { log(state, `Can't play ${cardName(card)}: ${chk.reason}`, 'system', p); return; }
  const d = CARDS[card.defId];
  ps.hand.splice(ps.hand.indexOf(card), 1);
  payCost(state, p, d.cost);
  state.turnFlags.playedSomething = true;
  if (d.type === 'UNIT') { deployUnit(state, p, card); return; }
  if (d.type === 'BASE') { deployBase(state, p, card); return; }
  if (d.type === 'PILOT' || (d.type === 'COMMAND' && asPilot)) {
    const targets = ps.units.filter(u => !u.pilot);
    if (targets.length === 1 || ps.isAI) {
      // AI chooses best pairing target (prefer link)
      const t = ps.isAI ? bestPairTarget(state, p, card, targets) : targets[0];
      pairPilot(state, p, card, t);
    } else {
      pushChoice(state, {
        kind: 'pairTarget', player: p, title: `Pair ${pilotName(card)} with which Unit?`,
        description: 'A Pilot adds its AP/HP to the Unit. If it meets the link requirement, the Unit becomes a Link Unit and may attack the turn it is deployed.',
        options: targets.map(u => {
          const o = unitOption(state, u, p);
          const linkOk = wouldLink(u, card);
          o.detail = `${o.detail}${linkOk ? ' · ✓ Link' : ''}`;
          return o;
        }),
        ctx: { pilotUid: card.uid },
      });
      state.holding.push(card); // held outside any zone while choosing
    }
    return;
  }
  if (d.type === 'COMMAND') {
    state.stats[p].commandsPlayed++;
    log(state, `${ps.name} plays ${d.name}.`, 'play', p);
    ps.trash.push(card);
    resolveCommand(state, p, d.id);
  }
}

export function wouldLink(u: UnitState, pilot: CardInstance): boolean {
  const tmp: UnitState = { ...u, pilot };
  return isLinked(tmp);
}

function bestPairTarget(state: GameState, p: PlayerId, pilot: CardInstance, targets: UnitState[]): UnitState {
  const scored = targets.map(u => ({ u, s: (wouldLink(u, pilot) ? 100 : 0) + unitAp(state, u, p) * 2 + unitHp(u) + (u.deployedTurn === state.turn ? 20 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].u;
}

/** Resolve a Command card's effect (Main or Action timing). */
function resolveCommand(state: GameState, p: PlayerId, defId: string) {
  const op = other(p);
  const targets = commandTargets(state, p, defId);
  const ask = (kind: string, title: string, owner: PlayerId) => {
    if (!targets || targets.length === 0) return;
    if (state.players[p].isAI) {
      const t = aiPickTarget(state, kind, targets, p);
      applyTargetEffect(state, kind, t, p, CARDS[defId].name);
    } else {
      pushChoice(state, { kind, player: p, title, options: targets.map(t => unitOption(state, t, owner)), ctx: { source: CARDS[defId].name } });
    }
  };
  switch (defId) {
    case 'ST01-012': ask('target.damage1', 'Thoroughly Damaged: choose 1 rested enemy Unit. Deal 1 damage to it.', op); break;
    case 'ST01-013': ask('target.recover3', "Kai's Resolve: choose 1 friendly Unit. It recovers 3 HP.", p); break;
    case 'ST01-014': ask('target.apMinus3', 'Unforeseen Incident: choose 1 enemy Unit. It gets AP-3 this turn.', op); break;
    case 'ST02-012': ask('target.breach3', 'Simultaneous Fire: choose 1 of your Units. It gains <Breach 3> this turn.', p); break;
    case 'ST02-014': ask('target.rest', 'Siege Ploy: choose 1 enemy Unit with 5 or less HP. Rest it.', op); break;
    case 'ST02-013':
      if (state.battle) { state.battle.shieldProtectLvMax = 4; log(state, "Peaceful Timbre: this battle, shield area cards can't be damaged by Units Lv.4 or lower.", 'effect', p); }
      break;
  }
}

function aiPickTarget(state: GameState, kind: string, targets: UnitState[], p: PlayerId): UnitState {
  const owner = kind === 'target.recover3' || kind === 'target.breach3' ? p : other(p);
  const score = (u: UnitState) => {
    const ap = unitAp(state, u, owner), hp = unitHp(u);
    switch (kind) {
      case 'target.damage1': return hp === 1 ? 100 + ap : ap;
      case 'target.recover3': return Math.min(3, u.damage) * 10 + ap;
      case 'target.apMinus3': return ap * 3 + (!u.rested ? 2 : 0);
      case 'target.breach3': return (!u.rested && canAttackThisTurn(state, u) ? 50 : 0) + ap;
      default: return ap * 2 + hp; // rest: biggest threat
    }
  };
  return [...targets].sort((a, b) => score(b) - score(a))[0];
}

function applyTargetEffect(state: GameState, kind: string, t: UnitState, p: PlayerId, source: string) {
  const owner = findUnit(state, t.card.uid)!.owner;
  switch (kind) {
    case 'target.rest': t.rested = true; log(state, `${source}: ${unitName(t)} is rested.`, 'effect', p); break;
    case 'target.damage1': log(state, `${source}: 1 damage to ${unitName(t)}.`, 'effect', p); dealEffectDamage(state, owner, t, 1); break;
    case 'target.recover3': { const before = t.damage; t.damage = Math.max(0, t.damage - 3); log(state, `${source}: ${unitName(t)} recovers ${before - t.damage} HP.`, 'effect', p); break; }
    case 'target.apMinus3': t.tempAp -= 3; log(state, `${source}: ${unitName(t)} gets AP-3 this turn (now ${unitAp(state, t, owner)} AP).`, 'effect', p); break;
    case 'target.breach3': t.tempKeywords.breach = (t.tempKeywords.breach ?? 0) + 3; log(state, `${source}: ${unitName(t)} gains <Breach 3> this turn.`, 'effect', p); break;
  }
}

// ---------- Activate·Main effects ----------

export interface ActivateOption { uid: number; effectKey: string; label: string; cost: number; ok: boolean; reason?: string }

export function activateOptions(state: GameState, p: PlayerId): ActivateOption[] {
  const ps = state.players[p];
  const out: ActivateOption[] = [];
  if (state.phase !== 'main' || state.active !== p || state.battle || state.pending) return out;
  if (ps.base && !ps.base.isEx) {
    if (ps.base.card.defId === 'ST01-015') {
      const used = !!state.turnFlags['whiteBase'];
      const ok = !used && activeResources(ps) >= 2;
      const n = ps.units.length;
      const token = n === 0 ? 'Gundam (3/3)' : n === 1 ? 'Guncannon (2/2)' : 'Guntank (1/1)';
      out.push({ uid: ps.base.card.uid, effectKey: 'whiteBase', label: `White Base ②: deploy a ${token} token`, cost: 2, ok, reason: used ? 'Once per turn' : 'Needs 2 active Resources' });
    }
    if (ps.base.card.defId === 'ST01-016') {
      const ok = !ps.base.rested && ps.units.some(isLinked);
      out.push({ uid: ps.base.card.uid, effectKey: 'asticassia', label: 'Asticassia: rest Base → Link Units get AP+1 this turn', cost: 0, ok, reason: ps.base.rested ? 'Base is rested' : 'No Link Units in play' });
    }
  }
  for (const u of ps.units) {
    if (u.card.defId === 'ST02-006') {
      const used = u.usedThisTurn.includes('tallgeese');
      const ok = !used && u.rested && activeResources(ps) >= 4;
      out.push({ uid: u.card.uid, effectKey: 'tallgeese', label: 'Tallgeese ④: set this Unit as active', cost: 4, ok, reason: used ? 'Once per turn' : !u.rested ? 'Already active' : 'Needs 4 active Resources' });
    }
  }
  return out;
}

function activateMain(state: GameState, p: PlayerId, uid: number, effectKey: string) {
  const ps = state.players[p];
  const opt = activateOptions(state, p).find(o => o.uid === uid && o.effectKey === effectKey);
  if (!opt?.ok) return;
  state.turnFlags.playedSomething = true;
  switch (effectKey) {
    case 'whiteBase': {
      payCost(state, p, 2); state.turnFlags['whiteBase'] = true;
      const n = ps.units.length;
      const tok = n === 0 ? 'T-001' : n === 1 ? 'T-002' : 'T-003';
      log(state, `${ps.name} activates White Base.`, 'effect', p);
      deployToken(state, p, tok);
      break;
    }
    case 'asticassia': {
      ps.base!.rested = true;
      for (const u of ps.units) if (isLinked(u)) u.tempAp += 1;
      log(state, `${ps.name} rests Asticassia: Link Units get AP+1 this turn.`, 'effect', p);
      break;
    }
    case 'tallgeese': {
      const u = ps.units.find(x => x.card.uid === uid)!;
      payCost(state, p, 4); u.rested = false; u.usedThisTurn.push('tallgeese');
      log(state, `${ps.name} pays 4: Tallgeese is set as active.`, 'effect', p);
      break;
    }
  }
}

// ---------- damage & destruction ----------

function dealEffectDamage(state: GameState, owner: PlayerId, u: UnitState, n: number) {
  u.damage += n;
  if (unitHp(u) <= 0) destroyUnit(state, owner, u);
}

function destroyUnit(state: GameState, owner: PlayerId, u: UnitState) {
  const ps = state.players[owner];
  const idx = ps.units.indexOf(u);
  if (idx < 0) return;
  ps.units.splice(idx, 1);
  if (!u.card.token) ps.trash.push(u.card);
  if (u.pilot) ps.trash.push(u.pilot);
  state.stats[owner].unitsLost++;
  state.stats[other(owner)].unitsDestroyed++;
  log(state, `${unitName(u)} is destroyed.`, 'damage', owner);
}

/** Damage to the first card in a player's shield area (Base, else top Shield). Returns true if something was hit. */
function damageShieldArea(state: GameState, target: PlayerId, amount: number, sourceLabel: string, isBattle: boolean, attackerLevel?: number): boolean {
  const ps = state.players[target];
  if (state.battle?.shieldProtectLvMax !== undefined && attackerLevel !== undefined && attackerLevel <= state.battle.shieldProtectLvMax) {
    log(state, `Peaceful Timbre: ${ps.name}'s shield area can't be damaged by a Lv.${attackerLevel} Unit.`, 'effect', target);
    return true;
  }
  if (ps.base) {
    ps.base.damage += amount;
    log(state, `${sourceLabel} deals ${amount} damage to ${cardName(ps.base.card)} (${Math.max(0, baseHp(ps.base))}/${baseMaxHp(ps.base)} HP).`, 'damage', target);
    if (baseHp(ps.base) <= 0) {
      if (!ps.base.isEx) ps.trash.push(ps.base.card);
      log(state, `${cardName(ps.base.card)} is destroyed!`, 'damage', target);
      ps.base = null;
    }
    return true;
  }
  if (ps.shields.length) {
    if (amount <= 0) { log(state, `${sourceLabel} has 0 AP: the Shield is not destroyed.`, 'damage', target); return true; }
    const s = ps.shields.shift()!;
    state.stats[other(target)].shieldsBroken++;
    const d = CARDS[s.defId];
    log(state, `${sourceLabel} destroys a Shield: it was ${d.name}. (${ps.shields.length} Shields left)`, 'damage', target);
    handleBurst(state, target, s);
    return true;
  }
  if (isBattle) {
    if (amount <= 0) { log(state, `${sourceLabel} has 0 AP and deals no damage.`, 'damage', target); return false; }
    defeat(state, target, 'took battle damage with no Shields or Base left');
    return true;
  }
  return false;
}

function handleBurst(state: GameState, owner: PlayerId, card: CardInstance) {
  const ps = state.players[owner];
  const d = CARDS[card.defId];
  const hasBurst = d.text.includes('【Burst】');
  if (!hasBurst) { ps.trash.push(card); return; }
  const desc = d.type === 'PILOT' ? 'Add this card to your hand.' : d.type === 'BASE' ? 'Deploy this card as your Base (replacing any current Base). Its 【Deploy】 then adds a Shield to your hand.' : `Activate its 【Main】 effect for free: ${d.text.split('\n').find(l => l.startsWith('【Main】')) ?? ''}`;
  if (ps.isAI) {
    resolveBurst(state, owner, card, true);
  } else {
    pushChoice(state, {
      kind: 'burst', player: owner, title: `【Burst】 ${d.name}`, description: desc,
      options: [{ id: 'yes', label: 'Activate Burst' }, { id: 'no', label: 'Decline (card goes to trash)' }],
      ctx: { cardUid: card.uid },
    });
    state.holding.push(card);
  }
}

function resolveBurst(state: GameState, owner: PlayerId, card: CardInstance, activate: boolean) {
  const ps = state.players[owner];
  const d = CARDS[card.defId];
  if (!activate) { ps.trash.push(card); log(state, `${ps.name} declines the Burst.`, 'effect', owner); return; }
  log(state, `${ps.name} activates 【Burst】 ${d.name}.`, 'effect', owner);
  if (d.type === 'PILOT') { ps.hand.push(card); log(state, `${d.name} is added to hand.`, 'effect', owner); return; }
  if (d.type === 'BASE') { deployBase(state, owner, card, true); return; }
  if (d.type === 'COMMAND') {
    const targets = commandTargets(state, owner, d.id);
    if (targets && targets.length === 0) { log(state, `No valid target for ${d.name}; it goes to the trash.`, 'effect', owner); ps.trash.push(card); return; }
    ps.trash.push(card);
    resolveCommand(state, owner, d.id);
  }
}

// ---------- attacking & battle ----------

export interface AttackTarget { id: 'player' | number; label: string; detail?: string }

export function attackTargets(state: GameState, p: PlayerId, u: UnitState): AttackTarget[] {
  const op = state.players[other(p)];
  const out: AttackTarget[] = [];
  if (u.card.defId !== 'ST01-009') { // Zowort can't target the player
    const shieldArea = op.base ? `Base ${cardName(op.base.card)} (${baseHp(op.base)} HP)` : op.shields.length ? `${op.shields.length} Shield${op.shields.length > 1 ? 's' : ''}` : 'NO SHIELDS — lethal!';
    out.push({ id: 'player', label: `Attack ${op.name}`, detail: shieldArea });
  }
  for (const t of op.units) {
    if (t.rested) out.push({ id: t.card.uid, label: `Attack ${unitName(t)} (rested)`, detail: `${unitAp(state, t, other(p))} AP / ${unitHp(t)} HP` });
    else if (u.card.defId === 'ST02-001' && unitLevel(t) <= 4) out.push({ id: t.card.uid, label: `Attack ${unitName(t)} (active, Lv.${unitLevel(t)})`, detail: `${unitAp(state, t, other(p))} AP / ${unitHp(t)} HP · Wing Gundam may target active Lv.4-or-lower Units` });
  }
  return out;
}

function declareAttack(state: GameState, p: PlayerId, attackerUid: number, target: 'player' | number) {
  if (state.phase !== 'main' || state.active !== p || state.battle || state.pending) return;
  const ps = state.players[p];
  const u = ps.units.find(x => x.card.uid === attackerUid);
  if (!u || !canAttackThisTurn(state, u)) return;
  if (!attackTargets(state, p, u).some(t => t.id === target)) return;
  // 8-2 Attack step
  u.rested = true;
  state.stats[p].attacksDeclared++;
  state.turnFlags.attacked = true;
  state.battle = { attackerUid, target, originalTarget: target, step: 'attack', blocked: false };
  const tLabel = target === 'player' ? state.players[other(p)].name : unitName(findUnit(state, target)!.unit);
  log(state, `${unitName(u)} (${unitAp(state, u, p)} AP) attacks ${tLabel}.`, 'attack', p);
  // 【Attack】 effects: Suletta Mercury pilot
  if (u.pilot?.defId === 'ST01-011' && !u.usedThisTurn.includes('suletta')) {
    const rested = ps.resources.filter(r => r.rested);
    if (rested.length) {
      u.usedThisTurn.push('suletta');
      const r = rested[0]; r.rested = false;
      log(state, `Suletta Mercury 【Attack】: 1 Resource is set as active.`, 'effect', p);
    }
  }
  continueBattle(state);
}

/** Advance the battle through its steps, pausing for pending choices. */
function continueBattle(state: GameState) {
  const b = state.battle;
  if (!b || state.winner) return;
  const atk = findUnit(state, b.attackerUid);
  const defender = state.active === 'p1' ? 'p2' : 'p1';
  if (!atk) { endBattle(state); return; }
  if (b.target !== 'player' && !findUnit(state, b.target)) { log(state, 'The attack target left the battle area; the battle ends.', 'attack'); endBattle(state); return; }

  if (b.step === 'attack') {
    b.step = 'block';
    const kw = unitKeywords(atk.unit);
    const blockers = state.players[defender].units.filter(t => unitKeywords(t).blocker && !t.rested && t.card.uid !== b.target);
    if (blockers.length && !kw.highManeuver) {
      if (state.players[defender].isAI) {
        const pick = aiBlockDecision(state, defender, atk.unit, blockers);
        log(state, pick.unit ? `Blocks with ${unitName(pick.unit)}: ${pick.reason}` : `Doesn't block: ${pick.reason}`, 'ai', defender);
        if (pick.unit) doBlock(state, defender, pick.unit);
      } else {
        const tgtLabel = b.target === 'player' ? 'you' : unitName(findUnit(state, b.target)!.unit);
        pushChoice(state, {
          kind: 'block', player: defender, title: `${unitName(atk.unit)} (${unitAp(state, atk.unit, state.active)} AP) is attacking ${tgtLabel}. Block?`,
          description: 'Resting a <Blocker> changes the attack target to it. The blocker takes the hit instead.',
          options: [...blockers.map(t => ({ ...unitOption(state, t, defender), label: `Block with ${unitName(t)}` })), { id: 'pass', label: "Don't block" }],
          optional: true, ctx: {},
        });
        return;
      }
    }
  }
  if (b.step === 'block') {
    b.step = 'action';
    (b as unknown as { passes: number }).passes = 0;
    (b as unknown as { actor: PlayerId }).actor = defender;
    if (runActionStep(state)) return;
  }
  if (b.step === 'action') {
    b.step = 'damage';
    damageStep(state);
    if (state.pending) return; // burst pending
  }
  if (b.step === 'damage') {
    endBattle(state);
  }
}

/** Returns true if waiting on a human decision. */
function runActionStep(state: GameState): boolean {
  const b = state.battle as (NonNullable<GameState['battle']> & { passes: number; actor: PlayerId });
  while (b.passes < 2) {
    const p = b.actor;
    const ps = state.players[p];
    const playable = actionCommands(state, p);
    if (playable.length === 0) { b.passes++; b.actor = other(p); continue; }
    if (ps.isAI) {
      const pick = aiActionDecision(state, p, playable);
      if (pick) { log(state, `Plays ${CARDS[pick.card.defId].name} in the action step: ${pick.reason}`, 'ai', p); playActionCommand(state, p, pick.card.uid); b.passes = 0; } else b.passes++;
      b.actor = other(p);
      continue;
    }
    pushChoice(state, {
      kind: 'actionStep', player: p, title: 'Action step: play an 【Action】 Command?',
      description: 'During a battle, the defender gets the first chance to act, then the attacker. Effects apply before damage is dealt.',
      options: [...playable.map(c => ({ id: `hand:${c.uid}`, label: `Play ${CARDS[c.defId].name}`, detail: CARDS[c.defId].text.split('\n').find(l => l.includes('【Action】')), ref: { kind: 'hand' as const, uid: c.uid, owner: p } })), { id: 'pass', label: 'Pass' }],
      optional: true, ctx: {},
    });
    return true;
  }
  return false;
}

/** Action-timing commands playable right now by player p (during a battle). */
export function actionCommands(state: GameState, p: PlayerId): CardInstance[] {
  const ps = state.players[p];
  if (!state.battle) return [];
  return ps.hand.filter(c => {
    const d = CARDS[c.defId];
    if (d.type !== 'COMMAND' || !d.timing?.includes('Action')) return false;
    if (playerLevel(ps) < d.level || activeResources(ps) < d.cost) return false;
    const t = commandTargets(state, p, d.id);
    if (t && t.length === 0) return false;
    if (d.id === 'ST02-013') {
      // Peaceful Timbre only matters when defending a player attack from a Lv<=4 unit
      const atk = findUnit(state, state.battle!.attackerUid);
      if (!atk || atk.owner === p || state.battle!.target !== 'player' || unitLevel(atk.unit) > 4) return false;
      if (state.battle!.shieldProtectLvMax !== undefined) return false;
    }
    return true;
  });
}

function playActionCommand(state: GameState, p: PlayerId, uid: number) {
  const ps = state.players[p];
  const card = ps.hand.find(c => c.uid === uid);
  if (!card) return;
  const d = CARDS[card.defId];
  ps.hand.splice(ps.hand.indexOf(card), 1);
  payCost(state, p, d.cost);
  ps.trash.push(card);
  state.stats[p].commandsPlayed++;
  log(state, `${ps.name} plays ${d.name} during the action step.`, 'play', p);
  resolveCommand(state, p, d.id);
}

function doBlock(state: GameState, defender: PlayerId, blocker: UnitState) {
  const b = state.battle!;
  blocker.rested = true;
  b.target = blocker.card.uid;
  b.blocked = true;
  state.stats[defender].blocksUsed++;
  log(state, `${state.players[defender].name} blocks with ${unitName(blocker)}!`, 'attack', defender);
}

function damageStep(state: GameState) {
  const b = state.battle!;
  const atk = findUnit(state, b.attackerUid)!;
  const p = atk.owner, op = other(p);
  const ap = unitAp(state, atk.unit, p);
  const kw = unitKeywords(atk.unit);
  if (b.target === 'player') {
    damageShieldArea(state, op, ap, unitName(atk.unit), true, unitLevel(atk.unit));
    return;
  }
  const tgt = findUnit(state, b.target)!;
  const tAp = unitAp(state, tgt.unit, op);
  const tName = unitName(tgt.unit), aName = unitName(atk.unit);
  let attackerDestroyed = false, targetDestroyed = false;
  if (kw.firstStrike) {
    tgt.unit.damage += ap;
    log(state, `<First Strike> ${aName} deals ${ap} to ${tName} first.`, 'damage', p);
    if (unitHp(tgt.unit) <= 0) { targetDestroyed = true; }
    else { atk.unit.damage += tAp; log(state, `${tName} deals ${tAp} back to ${aName}.`, 'damage', p); }
  } else {
    tgt.unit.damage += ap;
    atk.unit.damage += tAp;
    log(state, `${aName} deals ${ap} to ${tName}; ${tName} deals ${tAp} to ${aName}.`, 'damage', p);
    targetDestroyed = unitHp(tgt.unit) <= 0;
  }
  attackerDestroyed = unitHp(atk.unit) <= 0;
  if (targetDestroyed) destroyUnit(state, op, tgt.unit);
  if (attackerDestroyed) destroyUnit(state, p, atk.unit);
  if (targetDestroyed) {
    // Active player's triggered effects first: Breach, then Heavyarms / Zechs
    if (kw.breach) {
      if (state.players[op].base || state.players[op].shields.length) {
        log(state, `<Breach ${kw.breach}> triggers!`, 'effect', p);
        damageShieldArea(state, op, kw.breach, `<Breach ${kw.breach}>`, false);
      }
    }
    if (atk.unit.card.defId === 'ST02-003' && atk.unit.pilot && state.active === p) {
      log(state, 'Gundam Heavyarms 【During Pair】: 1 damage to all enemy Units Lv.3 or lower.', 'effect', p);
      for (const e of [...state.players[op].units]) if (unitLevel(e) <= 3) dealEffectDamage(state, op, e, 1);
    }
    if (atk.unit.pilot?.defId === 'ST02-011' && isLinked(atk.unit) && state.active === p) {
      log(state, 'Zechs Merquise 【During Link】: draw 1.', 'effect', p);
      draw(state, p, 1);
    }
  }
}

function endBattle(state: GameState) {
  state.battle = null;
  if (state.phase !== 'gameover') state.phase = 'main';
}

// ---------- AI micro-decisions used inside the engine ----------

function aiBlockDecision(state: GameState, defender: PlayerId, attacker: UnitState, blockers: UnitState[]): { unit: UnitState | null; reason: string } {
  const b = state.battle!;
  const ps = state.players[defender];
  const atkAp = unitAp(state, attacker, other(defender));
  const atkHp = unitHp(attacker);
  const aName = unitName(attacker);
  // Blockers that kill the attacker and survive: always
  const heroic = blockers.filter(bl => unitAp(state, bl, defender) >= atkHp && unitHp(bl) > atkAp);
  if (heroic.length) return { unit: heroic[0], reason: `it destroys ${aName} (${atkHp} HP) and survives its ${atkAp} AP.` };
  if (b.target === 'player') {
    const shieldsLeft = ps.shields.length + (ps.base ? 1 : 0);
    const trade = blockers.filter(bl => unitAp(state, bl, defender) >= atkHp);
    if (trade.length) return { unit: trade[0], reason: `it trades with ${aName}, and a Unit for a Unit is better than losing a Shield.` };
    if (shieldsLeft <= 2) return { unit: [...blockers].sort((a, b2) => unitHp(a) - unitHp(b2))[0], reason: `I only have ${shieldsLeft} card(s) left in my shield area, so I must buy time.` };
    return { unit: null, reason: `blocking would just lose the Blocker; with ${ps.shields.length} Shields I can afford to take this hit.` };
  }
  const tgt = findUnit(state, b.target)!.unit;
  if (unitHp(tgt) <= atkAp && (tgt.pilot || unitLevel(tgt) >= 4)) {
    return { unit: [...blockers].sort((a, b2) => unitLevel(a) - unitLevel(b2))[0], reason: `${unitName(tgt)} would die, and it is worth more than my cheapest Blocker.` };
  }
  return { unit: null, reason: unitHp(tgt) > atkAp ? `${unitName(tgt)} survives the hit anyway.` : `${unitName(tgt)} is not worth sacrificing a Blocker for.` };
}

function aiActionDecision(state: GameState, p: PlayerId, playable: CardInstance[]): { card: CardInstance; reason: string } | null {
  const b = state.battle!;
  const atk = findUnit(state, b.attackerUid);
  if (!atk) return null;
  const defending = atk.owner !== p;
  for (const c of playable) {
    const d = CARDS[c.defId];
    if (d.id === 'ST02-013' && defending) return { card: c, reason: `${unitName(atk.unit)} is Lv.${unitLevel(atk.unit)}, so Peaceful Timbre blanks this hit on my shield area.` };
    if (d.id === 'ST01-014') {
      if (defending && b.target !== 'player') {
        const t = findUnit(state, b.target)!.unit;
        if (unitHp(t) <= unitAp(state, atk.unit, atk.owner) && unitHp(t) > unitAp(state, atk.unit, atk.owner) - 3) return { card: c, reason: `AP-3 on ${unitName(atk.unit)} means ${unitName(t)} survives the battle.` };
      }
      if (!defending && b.target !== 'player') {
        const t = findUnit(state, b.target)!.unit;
        if (unitHp(atk.unit) <= unitAp(state, t, other(p)) && unitHp(atk.unit) > unitAp(state, t, other(p)) - 3) return { card: c, reason: `AP-3 on ${unitName(t)} keeps my attacker alive through the trade.` };
      }
    }
  }
  return null;
}

// ---------- choice resolution ----------

function resolveChoice(state: GameState, p: PlayerId, optionId: string | null) {
  const c = state.pending;
  if (!c || c.player !== p) return;
  if (optionId !== null && !c.options.some(o => o.id === optionId)) return;
  if (optionId === null && !c.optional && c.kind !== 'mulligan') return;
  state.pending = null;
  const takeHeld = (uid: number) => {
    const card = state.holding.find(x => x.uid === uid);
    if (card) state.holding = state.holding.filter(x => x !== card);
    return card;
  };
  const unitFrom = (id: string) => findUnit(state, Number(id.split(':')[1]));

  switch (c.kind) {
    case 'mulligan': {
      const ps = state.players[p];
      if (optionId === 'redraw') {
        ps.deck.push(...ps.hand); ps.hand = [];
        draw(state, p, 5, true); shuffle(ps.deck); ps.redrew = true;
        log(state, `${ps.name} redraws their hand.`, 'system', p);
      } else log(state, `${ps.name} keeps their hand.`, 'system', p);
      const second = other(state.active);
      if (p === state.active) {
        // second player's decision
        const ps2 = state.players[second];
        if (ps2.isAI) {
          const goodKeep = ps2.hand.some(h => CARDS[h.defId].type === 'UNIT' && CARDS[h.defId].level <= 3);
          if (!goodKeep) { ps2.deck.push(...ps2.hand); ps2.hand = []; draw(state, second, 5, true); shuffle(ps2.deck); log(state, `${ps2.name} redraws their hand.`, 'system', second); }
          else log(state, `${ps2.name} keeps their hand.`, 'system', second);
          finishSetup(state);
        } else pushChoice(state, mulliganChoice(state, second));
      } else finishSetup(state);
      break;
    }
    case 'pairTarget': {
      const pilot = takeHeld(c.ctx.pilotUid as number)!;
      const t = unitFrom(optionId!)!;
      pairPilot(state, p, pilot, t.unit);
      break;
    }
    case 'target.rest': case 'target.damage1': case 'target.recover3': case 'target.apMinus3': case 'target.breach3': {
      const t = unitFrom(optionId!);
      if (t) applyTargetEffect(state, c.kind, t.unit, p, String(c.ctx.source));
      break;
    }
    case 'unitLimit': {
      const t = unitFrom(optionId!)!;
      removeUnitToTrash(state, p, t.unit);
      const card = c.ctx.card as CardInstance;
      const u = newUnit(card, state.turn);
      state.players[p].units.push(u);
      log(state, `${state.players[p].name} deploys ${cardName(card)}.`, 'play', p);
      onDeploy(state, p, u);
      break;
    }
    case 'saintGabriel': {
      const ps = state.players[p];
      const keepUid = Number(optionId!.split(':')[1]);
      const [a, b] = ps.deck;
      if (a.uid === keepUid) { ps.deck.splice(1, 1); ps.deck.push(b); } else { ps.deck.shift(); ps.deck.push(a); }
      log(state, `${ps.name} keeps ${CARDS[ps.deck[0].defId].name} on top and puts the other on the bottom.`, 'effect', p);
      break;
    }
    case 'discard': {
      const ps = state.players[p];
      const uid = Number(optionId!.split(':')[1]);
      const card = ps.hand.find(x => x.uid === uid)!;
      ps.hand.splice(ps.hand.indexOf(card), 1); ps.trash.push(card);
      log(state, `${ps.name} discards ${cardName(card)}.`, 'info', p);
      if (ps.hand.length > 10) { pushChoice(state, { ...c, title: `Discard down to 10 cards (${ps.hand.length - 10} more)`, options: ps.hand.map(x => ({ id: `hand:${x.uid}`, label: cardName(x), ref: { kind: 'hand', uid: x.uid, owner: p } })) }); return; }
      finishEndTurn(state);
      return;
    }
    case 'burst': {
      const card = takeHeld(c.ctx.cardUid as number)!;
      resolveBurst(state, p, card, optionId === 'yes');
      break;
    }
    case 'block': {
      if (optionId && optionId !== 'pass') { const t = unitFrom(optionId)!; doBlock(state, p, t.unit); }
      else log(state, `${state.players[p].name} does not block.`, 'attack', p);
      break;
    }
    case 'actionStep': {
      const b = state.battle as (NonNullable<GameState['battle']> & { passes: number; actor: PlayerId });
      if (optionId && optionId !== 'pass') { playActionCommand(state, p, Number(optionId.split(':')[1])); b.passes = 0; }
      else b.passes++;
      b.actor = other(p);
      break;
    }
  }
  // A resolver may have pushed a new choice; only advance the queue if it did not.
  if (!state.pending) nextPending(state);
  // If nothing else is pending and a battle is in progress, keep it moving.
  if (!state.pending && state.battle && !state.winner) {
    if (state.battle.step === 'action') { if (runActionStep(state)) return; }
    continueBattle(state);
  }
}

// ---------- public dispatcher ----------

export function applyAction(state: GameState, a: Action) {
  if (state.winner) return;
  switch (a.type) {
    case 'mulligan': resolveChoice(state, a.player, a.redraw ? 'redraw' : 'keep'); break;
    case 'playCard': if (!state.pending) playCard(state, a.player, a.uid, a.asPilot); break;
    case 'activateMain': if (!state.pending) activateMain(state, a.player, a.uid, a.effectKey); break;
    case 'attack': declareAttack(state, a.player, a.attackerUid, a.target); break;
    case 'endMain':
      if (state.phase === 'main' && state.active === a.player && !state.battle && !state.pending) {
        if (!state.turnFlags.playedSomething && !state.turnFlags.attacked) state.stats[a.player].turnsWithNoPlay++;
        endTurn(state);
      }
      break;
    case 'choose': resolveChoice(state, a.player, a.optionId); break;
    case 'concede': defeat(state, a.player, 'conceded'); break;
  }
}

/** Is the given player expected to act right now? */
export function whoseDecision(state: GameState): PlayerId | null {
  if (state.winner) return null;
  if (state.pending) return state.pending.player;
  if (state.setupStage === 'mulligan') return null;
  if (state.phase === 'main' && !state.battle) return state.active;
  return null;
}
