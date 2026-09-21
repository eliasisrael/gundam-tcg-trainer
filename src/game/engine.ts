// Gundam Card Game rules engine.
// Implements the comprehensive rules (v1.9.0) for two-player games with the
// ST01–ST14 card pools. The engine mutates a GameState in place; the UI
// snapshots state (structuredClone) for undo.

import { CARDS, DECKS, TOKENS, type DeckDef } from './cards';
import type {
  Action, BaseState, BotLevel, CardDef, CardInstance, ChoiceOption, GameState, Keywords, LogEntry,
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
  p1Deck: string | DeckDef;
  p2Deck: string | DeckDef;
  humanId: PlayerId;
  p1Name?: string;
  p2Name?: string;
  seed?: number;
  first?: PlayerId;
  skipMulligan?: boolean;
  botLevel?: BotLevel;
}

export function resolveDeck(d: string | DeckDef): DeckDef {
  if (typeof d !== 'string') return d;
  const built = DECKS[d];
  if (built) return built;
  throw new Error(`Unknown deck ${d}`);
}

export function createGame(opts: GameOptions): GameState {
  rng = makeRng(opts.seed ?? Date.now());
  let uid = 1;
  const mkPlayer = (id: PlayerId, deckDef: DeckDef, name: string, isAI: boolean): PlayerState => {
    const deck: CardInstance[] = [];
    for (const [cid, n] of deckDef.cards) for (let i = 0; i < n; i++) deck.push({ uid: uid++, defId: cid, owner: id });
    shuffle(deck);
    return {
      id, name, deck, resourceDeck: 10, hand: [], shields: [], base: null, units: [], resources: [], trash: [], exile: [],
      redrew: false, isAI,
    };
  };
  const first = opts.first ?? 'p1';
  const state: GameState = {
    turn: 0,
    active: first,
    phase: 'start',
    players: {
      p1: mkPlayer('p1', resolveDeck(opts.p1Deck), opts.p1Name ?? (opts.humanId === 'p1' ? 'Player' : 'Opponent'), opts.humanId !== 'p1'),
      p2: mkPlayer('p2', resolveDeck(opts.p2Deck), opts.p2Name ?? (opts.humanId === 'p2' ? 'Player' : 'Opponent'), opts.humanId !== 'p2'),
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
    botLevel: opts.botLevel ?? 'basic',
    stats: { p1: emptyStats(), p2: emptyStats() },
    holding: [],
  };
  for (const p of ['p1', 'p2'] as PlayerId[]) draw(state, p, 5, true);
  log(state, `Both players draw 5. ${state.players[first].name} goes first.`, 'system');
  if (opts.skipMulligan) finishSetup(state);
  else pushChoice(state, mulliganChoice(first));
  return state;
}

function mulliganChoice(p: PlayerId): PendingChoice {
  return {
    kind: 'mulligan', player: p, title: 'Keep or redraw?',
    description: 'You may return your whole hand to the bottom of the deck and draw 5 new cards, once. A good keep has a Lv.1-3 Unit for your first turns.',
    options: [{ id: 'keep', label: 'Keep this hand' }, { id: 'redraw', label: 'Redraw 5 new cards' }],
    ctx: {},
  };
}

function finishSetup(state: GameState) {
  for (const p of ['p1', 'p2'] as PlayerId[]) {
    const ps = state.players[p];
    for (let i = 0; i < 6; i++) ps.shields.unshift(ps.deck.shift()!);
    ps.base = { card: { uid: state.nextUid++, defId: 'EX-BASE', owner: p, token: TOKENS['EX-BASE'] }, rested: false, damage: 0, isEx: true };
  }
  const second = other(state.active);
  state.players[second].resources.push({ uid: state.nextUid++, rested: false, isEx: true });
  log(state, `6 Shields and an EX Base for each player. ${state.players[second].name} gets an EX Resource for going second.`, 'system');
  state.setupStage = 'playing';
  startTurn(state, state.active);
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
export function unitTraits(u: UnitState): string[] { return u.card.token ? u.card.token.traits : CARDS[u.card.defId].traits; }
export function hasTrait(u: UnitState, ...traits: string[]): boolean { const t = unitTraits(u); return traits.some(x => t.includes(x)); }

export function pilotName(pilot: CardInstance): string {
  const d = CARDS[pilot.defId];
  return d.type === 'PILOT' ? d.name : (d.pilotName ?? d.name);
}
/** Every name a Pilot card answers to (Milliardo Peacecraft is also Zechs Merquise). */
export function pilotNames(d: CardDef): string[] {
  return [d.type === 'PILOT' ? d.name : (d.pilotName ?? d.name), ...(d.alsoNamed ?? [])];
}
export function pilotTraits(pilot: CardInstance): string[] { return CARDS[pilot.defId].traits; }
export function pilotLevel(pilot: CardInstance): number { return CARDS[pilot.defId].level; }

export function isLinked(u: UnitState): boolean {
  if (!u.pilot) return false;
  const d = unitDef(u);
  if (!d?.link?.length) return false;
  const pnames = pilotNames(CARDS[u.pilot.defId]);
  const ptraits = pilotTraits(u.pilot);
  return d.link.some(req => {
    const m = req.match(/^\((.+)\)$/);
    if (m) return ptraits.includes(m[1]);
    return pnames.some(n => n.includes(req));
  });
}

export function unitKeywords(u: UnitState, state?: GameState): Keywords {
  const base = u.card.token ? (u.card.token.keywords ?? {}) : (unitDef(u)?.keywords ?? {});
  const t = u.tempKeywords;
  let highManeuver = base.highManeuver || t.highManeuver;
  let suppression = !!base.suppression || !!t.suppression;
  let blocker = base.blocker || t.blocker;
  let extraBreach = 0;
  if (u.card.defId === 'ST03-001' && u.pilot) highManeuver = true;          // Sinanju: During Pair
  if (u.card.defId === 'ST05-001' && u.damage > 0) suppression = true;      // Barbatos 4th: while damaged
  if (state) {
    const f = findUnit(state, u.card.uid);
    if (f) {
      const mine = state.players[f.owner];
      if (u.card.defId === 'ST07-004' && mine.units.some(x => x.pilot && pilotTraits(x.pilot).includes('CB'))) blocker = true; // Virtue: while a CB Pilot is in play
      if (u.card.defId === 'ST08-008' && state.players[other(f.owner)].units.length >= 3) blocker = true;                    // Gustav Karl: while 3+ enemy Units
      if (u.card.defId === 'ST09-004' && mine.base) suppression = true;                                                       // Freedom: while a friendly Base is in play
      if (u.card.defId === 'GD01-054' && unitAp(state, u, f.owner) >= 5) extraBreach += 3;                                    // Duel Gundam: while 5+ AP
      if (u.card.defId === 'GD02-076' && unitAp(state, u, f.owner) >= 5) blocker = true;                                      // Buster Gundam: while 5+ AP
      if (u.card.defId === 'ST11-003' && mine.units.some(x => x !== u && hasTrait(x, 'Marine'))) blocker = true;             // Zock: while another Marine
      if (state.battle?.suppressionUids?.includes(u.card.uid)) suppression = true;                                            // Banshee: this battle
    }
  }
  return {
    repair: (base.repair ?? 0) + (t.repair ?? 0) || undefined,
    breach: (base.breach ?? 0) + (t.breach ?? 0) + extraBreach || undefined,
    support: (base.support ?? 0) + (t.support ?? 0) || undefined,
    blocker,
    firstStrike: base.firstStrike || t.firstStrike,
    highManeuver,
    ...(suppression ? { suppression: true } : {}),
  } as Keywords & { suppression?: boolean };
}

export function unitAp(state: GameState, u: UnitState, owner: PlayerId): number {
  let ap = u.card.token ? u.card.token.ap : (CARDS[u.card.defId].ap ?? 0);
  if (u.pilot) ap += CARDS[u.pilot.defId].ap ?? 0;
  ap += u.tempAp;
  if (u.pilot && u.pilot.defId === 'ST02-010' && isLinked(u)) ap += 1;       // Heero: During Link
  if (u.card.defId === 'ST05-002' && u.damage > 0) ap += 2;                  // Barbatos 2nd: while damaged
  if (u.card.defId === 'ST07-005' && isLinked(u)) ap += 2;                   // Dynames: During Link
  if (u.card.defId === 'ST07-007' && state.active === owner && state.players[owner].units.some(x => x.pilot && pilotTraits(x.pilot).includes('CB'))) ap += 2; // Kyrios
  if (state.active === owner) {
    for (const g of state.players[owner].units) if (g.card.defId === 'ST01-001' && g.pilot) ap += 1; // Gundam During Pair
  }
  if (state.battle?.apMods) for (const m of state.battle.apMods) if (m.uid === u.card.uid) ap += m.delta;
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
  if (u.card.token?.cantAttack) return false;
  if (u.flags?.cantAttackThisTurn) return false;
  if (u.deployedTurn === state.turn && !isLinked(u)) return false;
  return true;
}

/** Whether this Unit may choose the enemy player as its attack target (Zowort, Geara Doga Heavy Armed, Funnels, Zeta EX after a break can't). */
export function canAttackPlayer(u: UnitState): boolean {
  if (u.card.token?.cantAttack) return false;
  if (u.card.defId === 'ST01-009' || u.card.defId === 'ST14-004') return false;
  if (u.flags?.cantTargetPlayer) return false;
  return true;
}
/** Whether a Unit can be paired with a Pilot (Bit / Funnel tokens can't). */
export function canBePaired(u: UnitState): boolean { return !u.pilot && !u.card.token?.cantPair; }
/** Enemy Units can't choose this Unit as an attack target (Char's Z'Gok with 2+ other Marines, The Orca of Red Sea). */
export function isUntargetable(state: GameState, u: UnitState, owner: PlayerId): boolean {
  if (u.flags?.untargetable) return true;
  if (u.card.defId === 'ST11-001' && u.pilot && state.players[owner].units.filter(x => x !== u && hasTrait(x, 'Marine')).length >= 2) return true;
  return false;
}
/** Unlocking the Development Diagram: may be played for Lv.2 / cost 2 by discarding a (G Generation) Unit card. */
export function developmentDiscount(state: GameState, p: PlayerId, card: CardInstance): CardInstance | null {
  if (card.defId !== 'ST10-014') return null;
  const ps = state.players[p];
  const cands = ps.hand.filter(c => c !== card && CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].traits.includes('G Generation'));
  if (!cands.length) return null;
  if (playerLevel(ps) >= 4 && activeResources(ps) >= 4) return null; // full price is affordable: no need to discard
  return [...cands].sort((a, b) => CARDS[a.defId].level - CARDS[b.defId].level)[0];
}

/** A card's Level and cost as they apply right now (Ξ Gundam gets cheaper per enemy Unit). */
export function effectiveLevelCost(state: GameState, p: PlayerId, card: CardInstance): { level: number; cost: number } {
  const d = CARDS[card.defId];
  if (d.id === 'ST08-001' && !state.players[p].units.some(u => unitLevel(u) >= 6)) {
    const n = state.players[other(p)].units.length;
    return { level: Math.max(0, d.level - n), cost: Math.max(0, d.cost - n) };
  }
  if (d.id === 'ST10-014' && developmentDiscount(state, p, card)) return { level: 2, cost: 2 };
  return { level: d.level, cost: d.cost };
}

/** Whether a card in hand can be played right now (level + cost + targets). */
export function canPlay(state: GameState, p: PlayerId, card: CardInstance, asPilot = false): { ok: boolean; reason?: string } {
  const ps = state.players[p];
  const d = CARDS[card.defId];
  const { level, cost } = effectiveLevelCost(state, p, card);
  if (state.phase !== 'main' || state.active !== p || state.battle || state.pending) return { ok: false, reason: 'Not your main phase' };
  if (playerLevel(ps) < level) return { ok: false, reason: `Needs Lv.${level} (you have ${playerLevel(ps)} Resources)` };
  if (activeResources(ps) < cost) return { ok: false, reason: `Costs ${cost}, you have ${activeResources(ps)} active Resources` };
  if (d.type === 'PILOT' || (d.type === 'COMMAND' && asPilot)) {
    if (d.type === 'COMMAND' && !d.pilotName) return { ok: false, reason: 'Not a Pilot card' };
    if (!ps.units.some(canBePaired)) return { ok: false, reason: 'No Unit without a Pilot to pair with' };
    return { ok: true };
  }
  if (d.type === 'COMMAND') {
    if (!d.timing?.includes('Main')) return { ok: false, reason: 'Action timing only: play it during a battle' };
    if (d.id === 'ST04-012' && ps.units.some(u => u.card.token && u.card.token.traits.includes('Earth Alliance'))) return { ok: false, reason: 'You already have an Earth Alliance token' };
    if (d.id === 'GD02-110' && !trashDeployTargets(state, p, activeResources(ps) - cost).length) return { ok: false, reason: 'No Unit of Lv.5 or lower in your trash that you could pay for' };
    if (d.id === 'ST11-015' && !ps.trash.some(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level <= 4 && CARDS[c.defId].traits.includes('Marine'))) return { ok: false, reason: 'No (Marine) Unit of Lv.4 or lower in your trash' };
    if (d.id === 'ST13-013' || d.id === 'ST14-015' || d.id === 'GD01-118' || d.id === 'ST10-014') { /* no target needed */ }
    const targets = commandTargets(state, p, d.id);
    if (targets !== null && targets.length === 0) return { ok: false, reason: 'No valid target' };
    return { ok: true };
  }
  return { ok: true };
}

/** Valid targets for a command's Main/Action effect; null means no target needed. */
export function commandTargets(state: GameState, p: PlayerId, defId: string): UnitState[] | null {
  const me = state.players[p], op = state.players[other(p)];
  switch (defId) {
    case 'ST01-012': return op.units.filter(u => u.rested);
    case 'ST01-013': return me.units;
    case 'ST01-014': return op.units;
    case 'ST02-012': return me.units;
    case 'ST02-014': return op.units.filter(u => unitHp(u) <= 5);
    case 'ST03-012': return me.units;                                   // Indignation
    case 'ST03-013': return op.units;                                   // Close Combat
    case 'ST03-014': return state.battle ? me.units : [];               // The Blue Giant (battle only)
    case 'ST04-013': return op.units.filter(u => unitHp(u) <= 3);      // Hawk of Endymion
    case 'ST04-014': return me.units.filter(u => unitLevel(u) <= 2);   // Magic Bullet of Dusk
    case 'ST05-013': return me.units;                                   // With Iron and Blood
    case 'ST05-014': return op.units.filter(u => unitLevel(u) <= 3);   // Fatal Strike
    case 'ST06-011': return me.units.filter(u => hasTrait(u, 'Clan'));  // Ruthless Tactics
    case 'ST06-013': return state.battle || state.active === p ? me.units.filter(u => hasTrait(u, 'Clan')) : []; // Fierce Unity (Action)
    case 'ST07-013': return state.battle && findUnit(state, state.battle.attackerUid)?.owner !== p ? me.units.filter(u => u.rested && hasTrait(u, 'CB')) : []; // Armed Intervention
    case 'ST08-012': return me.units.filter(isLinked);                   // Words for Hathaway
    case 'ST08-013': return op.units;                                    // Lady Luck
    case 'ST09-009': return op.units.filter(u => !u.rested && unitAp(state, u, other(p)) <= 4); // Giant Killing
    case 'GD01-111': return op.units.filter(u => u.damage > 0);         // Battle of Aces
    case 'ST10-013': return me.units.filter(u => unitLevel(u) >= 5 && hasTrait(u, 'G Generation')); // Tactical Training
    case 'ST10-015': return state.battle && me.units.some(u => hasTrait(u, 'G Generation')) ? op.units : []; // Diffuse Beam Cannon
    case 'ST11-013': return op.units.filter(u => u.rested && unitHp(u) <= 3); // Poorly Planned Offensive
    case 'ST11-014': return state.battle ? me.units.filter(u => hasTrait(u, 'Marine')) : []; // The Orca of Red Sea
    case 'ST12-013': return me.units.length && op.units.length ? op.units : []; // The Final Victor
    case 'ST12-014': return state.battle ? me.units : [];               // Wise Leader's Pride
    case 'ST12-015': return state.battle ? [...op.units.filter(u => unitLevel(u) <= 2), ...(me.units.length ? op.units.filter(u => unitLevel(u) >= 5) : [])] : []; // Two Unicorns
    case 'ST13-014': return me.units;                                   // Final Duty
    case 'ST13-015': return me.trash.filter(c => CARDS[c.defId].type === 'UNIT').length >= 3 ? op.units : []; // Operation to Intercept Solomon
    case 'ST14-013': return op.units;                                   // Natural Talent
    case 'ST14-014': return me.trash.filter(c => CARDS[c.defId].type === 'COMMAND').length >= 4 ? op.units : op.units.filter(u => unitLevel(u) <= 5); // Blazing Mobile Suit Rider
    default: return null;
  }
}

// ---------- pending choices ----------

function pushChoice(state: GameState, c: PendingChoice) {
  if (state.pending) state.queue.push(c); else state.pending = c;
}
function nextPending(state: GameState) { state.pending = state.queue.shift() ?? null; }

function unitOption(state: GameState, u: UnitState, owner: PlayerId): ChoiceOption {
  return {
    id: `unit:${u.card.uid}`,
    label: unitName(u),
    detail: `${unitAp(state, u, owner)} AP / ${unitHp(u)} HP${u.rested ? ' (rested)' : ''}${u.card.token ? '' : ' Lv.' + unitLevel(u)}`,
    ref: { kind: 'unit', uid: u.card.uid, owner },
  };
}

// ---------- generic unit effects ----------

export type UnitOp = 'rest' | 'damage' | 'recover' | 'ap' | 'apBattle' | 'breach' | 'firstStrike' | 'bounce' | 'destroy' | 'selfDamageAp' | 'immuneBattle' | 'reactivateNoAttack' | 'targetActiveLv' | 'targetActiveAp' | 'targetDamagedActive' | 'skipActivate' | 'immuneLvTurn' | 'redirect'
  | 'toDeckBottom' | 'bounceDraw' | 'recoverAp' | 'untargetable' | 'reduceBattleDmg' | 'restAp' | 'wiseLeader';
export interface UnitEffect { op: UnitOp; amount?: number }

export function describeEffect(e: UnitEffect): string {
  switch (e.op) {
    case 'rest': return 'Rest it';
    case 'damage': return `Deal ${e.amount} damage to it`;
    case 'recover': return `It recovers ${e.amount} HP`;
    case 'ap': return `It gets AP${(e.amount ?? 0) >= 0 ? '+' : ''}${e.amount} this turn`;
    case 'apBattle': return `It gets AP${(e.amount ?? 0) >= 0 ? '+' : ''}${e.amount} this battle`;
    case 'breach': return `It gains <Breach ${e.amount}> this turn`;
    case 'firstStrike': return 'It gains <First Strike> this turn';
    case 'bounce': return "Return it to its owner's hand";
    case 'destroy': return 'Destroy it';
    case 'selfDamageAp': return `Deal 1 damage to it; it gets AP+${e.amount} this turn`;
    case 'immuneBattle': return `It can't receive battle damage from Units with ${e.amount} or less AP this battle`;
    case 'reactivateNoAttack': return "Set it as active; it can't attack this turn";
    case 'targetActiveLv': return `This turn it may attack active enemy Units of Lv.${e.amount} or lower`;
    case 'targetActiveAp': return `This turn it may attack active enemy Units with ${e.amount} or less AP`;
    case 'targetDamagedActive': return 'This turn it may attack damaged active enemy Units';
    case 'skipActivate': return "It won't be set active during its owner's next start phase";
    case 'immuneLvTurn': return `It can't receive battle damage from enemy Units of Lv.${e.amount} or lower this turn`;
    case 'redirect': return 'The attacking Unit now targets it';
    case 'toDeckBottom': return "Return it to the bottom of its owner's deck";
    case 'bounceDraw': return "Return it to its owner's hand, then draw 1";
    case 'recoverAp': return `It recovers ${e.amount} HP and gets AP+${e.amount} this turn`;
    case 'untargetable': return "Enemy Units can't choose it as their attack target this turn";
    case 'reduceBattleDmg': return `Battle damage it receives from enemy Units is reduced by ${e.amount} this turn`;
    case 'restAp': return e.amount ? `Rest it; it gets AP${e.amount} this turn` : 'Rest it';
    case 'wiseLeader': return 'This battle, when it destroys an enemy Unit with battle damage, it also destroys an enemy Unit with 2 or less AP';
  }
}

/** Unit whose effect is currently dealing damage (for "when this Unit destroys an enemy Unit with damage" triggers). */
let effectSrc: number | null = null;

function applyUnitEffect(state: GameState, actor: PlayerId, t: UnitState, e: UnitEffect, source: string) {
  const found = findUnit(state, t.card.uid);
  if (!found) return;
  const owner = found.owner;
  const name = unitName(t);
  switch (e.op) {
    case 'rest': t.rested = true; log(state, `${source}: ${name} is rested.`, 'effect', actor); break;
    case 'damage': log(state, `${source}: ${e.amount} damage to ${name}.`, 'effect', actor); dealEffectDamage(state, owner, t, e.amount ?? 1, actor, effectSrc); break;
    case 'recover': { const before = t.damage; t.damage = Math.max(0, t.damage - (e.amount ?? 0)); log(state, `${source}: ${name} recovers ${before - t.damage} HP.`, 'effect', actor); break; }
    case 'ap': t.tempAp += e.amount ?? 0; log(state, `${source}: ${name} gets AP${(e.amount ?? 0) >= 0 ? '+' : ''}${e.amount} this turn (now ${unitAp(state, t, owner)} AP).`, 'effect', actor); break;
    case 'apBattle': if (state.battle) { (state.battle.apMods ??= []).push({ uid: t.card.uid, delta: e.amount ?? 0 }); log(state, `${source}: ${name} gets AP${(e.amount ?? 0) >= 0 ? '+' : ''}${e.amount} this battle (now ${unitAp(state, t, owner)} AP).`, 'effect', actor); } break;
    case 'breach': t.tempKeywords.breach = (t.tempKeywords.breach ?? 0) + (e.amount ?? 0); log(state, `${source}: ${name} gains <Breach ${e.amount}> this turn.`, 'effect', actor); break;
    case 'firstStrike': t.tempKeywords.firstStrike = true; log(state, `${source}: ${name} gains <First Strike> this turn.`, 'effect', actor); break;
    case 'bounce': bounceUnit(state, owner, t, source); break;
    case 'destroy': log(state, `${source}: ${name} is destroyed.`, 'effect', actor); destroyUnit(state, owner, t, false); break;
    case 'selfDamageAp': t.tempAp += e.amount ?? 0; log(state, `${source}: ${name} takes 1 damage and gets AP+${e.amount} this turn.`, 'effect', actor); dealEffectDamage(state, owner, t, 1, owner); break;
    case 'immuneBattle': if (state.battle) { (state.battle.immune ??= []).push({ uid: t.card.uid, apMax: e.amount ?? 0 }); log(state, `${source}: ${name} can't be damaged by Units with ${e.amount} or less AP this battle.`, 'effect', actor); } break;
    case 'reactivateNoAttack': t.rested = false; (t.flags ??= {}).cantAttackThisTurn = true; log(state, `${source}: ${name} is set as active (it can't attack this turn).`, 'effect', actor); break;
    case 'targetActiveLv': (t.flags ??= {}).canTargetActive = { maxLv: e.amount }; log(state, `${source}: ${name} may attack active enemy Units of Lv.${e.amount} or lower this turn.`, 'effect', actor); break;
    case 'targetActiveAp': (t.flags ??= {}).canTargetActive = { maxAp: e.amount }; log(state, `${source}: ${name} may attack active enemy Units with ${e.amount} or less AP this turn.`, 'effect', actor); break;
    case 'targetDamagedActive': (t.flags ??= {}).canTargetActive = { damagedOnly: true }; log(state, `${source}: ${name} may attack damaged active enemy Units this turn.`, 'effect', actor); break;
    case 'skipActivate': t.skipNextActivate = true; log(state, `${source}: ${name} won't be set active next start phase.`, 'effect', actor); break;
    case 'immuneLvTurn': (t.flags ??= {}).immuneFromLvMax = e.amount; log(state, `${source}: ${name} can't be damaged in battle by Units of Lv.${e.amount} or lower this turn.`, 'effect', actor); break;
    case 'redirect': if (state.battle) { state.battle.target = t.card.uid; state.battle.blocked = true; log(state, `${source}: the attack is redirected to ${name}.`, 'effect', actor); } break;
    case 'toDeckBottom': { const ps = state.players[owner]; const i = ps.units.indexOf(t); if (i >= 0) { ps.units.splice(i, 1); if (!t.card.token) ps.deck.push(t.card); if (t.pilot) ps.trash.push(t.pilot); log(state, `${source}: ${name} is returned to the bottom of ${ps.name}'s deck.`, 'effect', actor); } break; }
    case 'bounceDraw': bounceUnit(state, owner, t, source); effectDraw(state, actor, 1); break;
    case 'recoverAp': { const before = t.damage; t.damage = Math.max(0, t.damage - (e.amount ?? 0)); t.tempAp += e.amount ?? 0; log(state, `${source}: ${name} recovers ${before - t.damage} HP and gets AP+${e.amount} this turn.`, 'effect', actor); break; }
    case 'untargetable': (t.flags ??= {}).untargetable = true; log(state, `${source}: enemy Units can't attack ${name} this turn.`, 'effect', actor); break;
    case 'reduceBattleDmg': (t.flags ??= {}).battleDamageReduce = ((t.flags.battleDamageReduce ?? 0) + (e.amount ?? 0)); log(state, `${source}: battle damage to ${name} is reduced by ${e.amount} this turn.`, 'effect', actor); break;
    case 'restAp': t.rested = true; if (e.amount) t.tempAp += e.amount; log(state, `${source}: ${name} is rested${e.amount ? ` and gets AP${e.amount} this turn` : ''}.`, 'effect', actor); break;
    case 'wiseLeader': if (state.battle) { state.battle.wiseLeaderUid = t.card.uid; log(state, `${source}: ${name} will destroy a 2-or-less-AP enemy Unit if it kills in this battle.`, 'effect', actor); } break;
  }
}

/** Choose up to `max` distinct Units (first is required, the rest optional). */
function chooseUnits(state: GameState, actor: PlayerId, title: string, targets: UnitState[], e: UnitEffect, source: string, max: number) {
  if (!targets.length) { log(state, `${source}: no valid target.`, 'effect', actor); return; }
  if (state.players[actor].isAI) {
    const picked = [...targets].sort((a, b) => unitAp(state, b, actor) - unitAp(state, a, actor)).slice(0, max);
    for (const t of picked) applyUnitEffect(state, actor, t, e, source);
    return;
  }
  pushChoice(state, { kind: 'targetMulti', player: actor, title, description: `${describeEffect(e)}. Choose up to ${max}.`, options: targets.map(t => unitOption(state, t, findUnit(state, t.card.uid)!.owner)), ctx: { e, source, remaining: max, chosen: [] as number[], pool: targets.map(t => t.card.uid) } });
}

/** Draw caused by a card effect (not the draw phase). Lane Aim reacts to it. */
function effectDraw(state: GameState, p: PlayerId, n: number) {
  draw(state, p, n);
  for (const u of state.players[p].units) {
    if (u.pilot?.defId === 'ST08-011' && !u.card.token && CARDS[u.card.defId].color === 'Blue' && !u.tempKeywords.highManeuver) {
      u.tempKeywords.highManeuver = true;
      log(state, `Lane Aim: ${unitName(u)} gains <High-Maneuver> this turn.`, 'effect', p);
    }
  }
}

/** Look at the top N cards; the player may add one matching card to hand, the rest go randomly to the bottom. */
function lookTopPick(state: GameState, p: PlayerId, n: number, filter: (c: CardInstance) => boolean, source: string, mode: 'hand' | 'deploy' = 'hand') {
  const ps = state.players[p];
  const top = ps.deck.slice(0, n);
  if (!top.length) return;
  const cands = top.filter(filter);
  log(state, `${source}: ${ps.name} looks at the top ${top.length} card(s).`, 'effect', p);
  if (ps.isAI) { const pick = [...cands].sort((a, b) => CARDS[b.defId].level - CARDS[a.defId].level)[0] ?? null; lookTopResolve(state, p, top, pick, mode); return; }
  pushChoice(state, { kind: 'lookTop', player: p, title: `${source}: top ${top.length} card(s). ${mode === 'deploy' ? 'Deploy one?' : 'Add one to your hand?'}`, description: `Top cards: ${top.map(c => CARDS[c.defId].name).join(', ')}. The rest go to the bottom of your deck in random order.`, options: [...cands.map(c => ({ id: `deck:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].type}` })), { id: 'pass', label: 'Take none' }], optional: true, ctx: { uids: top.map(c => c.uid), mode } });
}

/** Ask the acting player to choose a Unit for an effect; the bot decides immediately. */
function chooseUnit(state: GameState, actor: PlayerId, title: string, targets: UnitState[], e: UnitEffect, source: string, optional = false, srcUid: number | null = null) {
  if (!targets.length) { log(state, `${source}: no valid target.`, 'effect', actor); return; }
  if (state.players[actor].isAI) {
    const t = aiPickTarget(state, e, targets, actor);
    if (t) { effectSrc = srcUid; applyUnitEffect(state, actor, t, e, source); effectSrc = null; }
    return;
  }
  const options = targets.map(t => unitOption(state, t, findUnit(state, t.card.uid)!.owner));
  if (optional) options.push({ id: 'pass', label: 'Skip' });
  pushChoice(state, { kind: 'target', player: actor, title, description: describeEffect(e) + '.', options, optional, ctx: { e, source, srcUid } });
}

function trashOption(c: CardInstance): ChoiceOption {
  const d = CARDS[c.defId];
  return { id: `trash:${c.uid}`, label: d.name, detail: `Lv.${d.level} · ${d.type}${d.type === 'UNIT' ? ` · ${d.ap} AP / ${d.hp} HP` : ''}` };
}

/**
 * Choose `n` cards from a player's trash (Development costs, Banshee, Pharact...). When done, `afterTrashPick` runs the continuation `cont`.
 * If `optional`, the player may decline (nothing happens). The bot decides immediately.
 */
function chooseTrashCards(state: GameState, actor: PlayerId, title: string, pool: CardInstance[], n: number, cont: string, args: Record<string, unknown>, optional: boolean) {
  const ps = state.players[actor];
  if (pool.length < n) { if (pool.length === 0 || !args.allowFewer) { log(state, `${args.source ?? cont}: not enough cards in the trash.`, 'effect', actor); return; } n = pool.length; }
  if (ps.isAI) {
    if (optional && !aiWantsTrashCost(state, actor, cont)) return;
    const picked = [...pool].sort((a, b) => aiTrashValue(a) - aiTrashValue(b)).slice(0, n);
    afterTrashPick(state, actor, cont, picked.map(c => c.uid), args);
    return;
  }
  pushChoice(state, { kind: 'trashPick', player: actor, title, description: `Choose ${n} card(s)${optional ? ', or skip' : ''}.`, options: [...pool.map(trashOption), ...(optional ? [{ id: 'pass', label: 'Skip' }] : [])], optional, ctx: { pool: pool.map(c => c.uid), need: n, chosen: [] as number[], cont, args } });
}
/** How much the bot minds losing this trash card (lower = exile first). */
function aiTrashValue(c: CardInstance): number { const d = CARDS[c.defId]; return d.level + (d.type === 'UNIT' ? 2 : 0) + (d.type === 'COMMAND' ? 1 : 0); }
function aiWantsTrashCost(state: GameState, p: PlayerId, cont: string): boolean {
  const ps = state.players[p], op = state.players[other(p)];
  switch (cont) {
    case 'zetaRest': return op.units.some(u => unitHp(u) <= 4 && !u.rested);
    case 'barbatos4Cmd': return ps.trash.some(c => CARDS[c.defId].type === 'COMMAND' && CARDS[c.defId].level <= 4);
    case 'barbatos1Draw': return ps.deck.length > 5;
    default: return true;
  }
}
function exileCards(state: GameState, p: PlayerId, uids: number[], source: string) {
  const ps = state.players[p];
  const cards = uids.map(u => ps.trash.find(c => c.uid === u)).filter(Boolean) as CardInstance[];
  for (const c of cards) { ps.trash.splice(ps.trash.indexOf(c), 1); ps.exile.push(c); }
  if (cards.length) log(state, `${source}: ${ps.name} exiles ${cards.map(cardName).join(', ')} from the game.`, 'effect', p);
  return cards;
}
function afterTrashPick(state: GameState, p: PlayerId, cont: string, uids: number[], args: Record<string, unknown>) {
  const ps = state.players[p], op = other(p);
  const source = String(args.source ?? cont);
  exileCards(state, p, uids, source);
  switch (cont) {
    case 'exileOnly': break;
    case 'zetaRest': chooseUnit(state, p, 'Zeta Gundam 【Deploy･Development 2】: choose 1 enemy Unit with 4 or less HP to rest.', state.players[op].units.filter(u => unitHp(u) <= 4 && !u.rested), { op: 'rest' }, 'Zeta Gundam'); break;
    case 'barbatos4Cmd': { const cands = ps.trash.filter(c => CARDS[c.defId].type === 'COMMAND' && CARDS[c.defId].level <= 4); fromTrashToHand(state, p, 'Gundam Barbatos 4th Form 【When Linked･Development 2】: choose 1 Command card of Lv.4 or lower in your trash to add to your hand.', cands, 'Gundam Barbatos 4th Form'); break; }
    case 'barbatos1Draw': log(state, 'Gundam Barbatos 1st Form 【Deploy･Development 2】: draw 1, then discard 1.', 'effect', p); effectDraw(state, p, 1); askDiscardOne(state, p, 'Gundam Barbatos 1st Form: discard 1 card.'); break;
    case 'bansheeFS': { const u = findUnit(state, args.uid as number); if (u) applyUnitEffect(state, p, u.unit, { op: 'firstStrike' }, 'Banshee (Destroy Mode)'); break; }
    case 'bansheeSupp': { if (state.battle) { (state.battle.suppressionUids ??= []).push(args.uid as number); log(state, 'Banshee (Destroy Mode) gains <Suppression> this battle.', 'effect', p); } break; }
    case 'solomon': chooseUnit(state, p, 'Operation to Intercept Solomon: choose 1 enemy Unit. Deal 3 damage to it.', state.players[op].units, { op: 'damage', amount: 3 }, 'Operation to Intercept Solomon'); break;
  }
}
/** Add one card from a list of trash cards to hand (the bot takes the highest Level). */
function fromTrashToHand(state: GameState, p: PlayerId, title: string, cands: CardInstance[], source: string, thenDiscard = false) {
  const ps = state.players[p];
  if (!cands.length) { log(state, `${source}: nothing suitable in the trash.`, 'effect', p); return; }
  if (ps.isAI) { const c = [...cands].sort((a, b) => CARDS[b.defId].level - CARDS[a.defId].level)[0]; ps.trash.splice(ps.trash.indexOf(c), 1); ps.hand.push(c); log(state, `${source}: ${cardName(c)} returns from the trash to hand.`, 'effect', p); if (thenDiscard) askDiscardOne(state, p, `${source}: discard 1 card.`); return; }
  pushChoice(state, { kind: 'fromTrash', player: p, title, options: cands.map(trashOption), ctx: { source, thenDiscard } });
}
/** Trash Units the player could deploy right now with `budget` active Resources (Awakened Power). */
export function trashDeployTargets(state: GameState, p: PlayerId, budget: number): CardInstance[] {
  return state.players[p].trash.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level <= 5 && CARDS[c.defId].cost <= budget);
}
/** Deploy one Unit card from the trash (Impulse swap, Awakened Power, A Twinkle from the Abyss). */
function chooseDeployFromTrash(state: GameState, p: PlayerId, title: string, cands: CardInstance[], source: string, opts: { pay: boolean; rested: boolean }) {
  const ps = state.players[p];
  if (!cands.length) { log(state, `${source}: nothing suitable in the trash.`, 'effect', p); return; }
  if (ps.isAI) { const c = [...cands].sort((a, b) => (CARDS[b.defId].ap ?? 0) + (CARDS[b.defId].hp ?? 0) - (CARDS[a.defId].ap ?? 0) - (CARDS[a.defId].hp ?? 0))[0]; deployFromTrash(state, p, c, source, opts); return; }
  pushChoice(state, { kind: 'deployFromTrash', player: p, title, options: cands.map(trashOption), ctx: { source, ...opts } });
}
function deployFromTrash(state: GameState, p: PlayerId, c: CardInstance, source: string, opts: { pay: boolean; rested: boolean }) {
  const ps = state.players[p];
  ps.trash.splice(ps.trash.indexOf(c), 1);
  if (opts.pay) payCost(state, p, CARDS[c.defId].cost);
  log(state, `${source}: ${ps.name} deploys ${cardName(c)} from the trash${opts.pay ? ` (paying ${CARDS[c.defId].cost})` : ''}.`, 'effect', p);
  deployUnit(state, p, c, opts.rested, true);
}
/** Deploy Bit / Funnel tokens ("1 to 2": as many as fit, at least 1). */
function deployFunnels(state: GameState, p: PlayerId, max: number, source: string) {
  const n = Math.max(1, Math.min(max, 6 - state.players[p].units.length));
  log(state, `${source}: ${n} Bit / Funnel token${n > 1 ? 's' : ''}.`, 'effect', p);
  for (let i = 0; i < n; i++) deployToken(state, p, 'T-029');
}
/** Look at the top card; keep it on top or put it on the bottom. */
function askTopKeep(state: GameState, p: PlayerId, source: string) {
  const ps = state.players[p];
  const top = ps.deck[0];
  if (!top) return;
  if (ps.isAI) { const playable = CARDS[top.defId].level <= playerLevel(ps) + 1; if (!playable) { ps.deck.shift(); ps.deck.push(top); } log(state, `${source}: looks at the top card and ${playable ? 'keeps it on top' : 'puts it on the bottom'}.`, 'effect', p); return; }
  pushChoice(state, { kind: 'topKeep', player: p, title: `${source}: the top card of your deck is ${CARDS[top.defId].name}. Keep it on top or put it on the bottom?`, options: [{ id: 'top', label: `Keep ${CARDS[top.defId].name} on top` }, { id: 'bottom', label: 'Put it on the bottom' }], ctx: {} });
}
/** Look at the top 2 cards, return 1 to the top; the other goes to `other` (bottom / trash / hand). */
function askTop2(state: GameState, p: PlayerId, source: string, otherDest: 'bottom' | 'trash' | 'hand') {
  const ps = state.players[p];
  if (ps.deck.length < 2) return;
  const [a, b] = ps.deck;
  const where = otherDest === 'bottom' ? 'the bottom of your deck' : otherDest === 'trash' ? 'your trash' : 'your hand';
  if (ps.isAI) {
    const score = (c: CardInstance) => (CARDS[c.defId].level <= playerLevel(ps) + 1 ? 1 : 0);
    const keep = otherDest === 'hand' ? (score(a) >= score(b) ? b : a) : (score(a) >= score(b) ? a : b);
    resolveTop2(state, p, keep.uid, otherDest);
    return;
  }
  pushChoice(state, { kind: 'top2', player: p, title: `${source}: look at the top 2 cards. Which one stays on top?`, description: `The other card goes to ${where}.`, options: [a, b].map(c => ({ id: `deck:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].type}` })), ctx: { other: otherDest } });
}
function resolveTop2(state: GameState, p: PlayerId, keepUid: number, otherDest: 'bottom' | 'trash' | 'hand') {
  const ps = state.players[p];
  const [a, b] = ps.deck;
  const moved = a.uid === keepUid ? b : a;
  ps.deck.splice(ps.deck.indexOf(moved), 1);
  if (otherDest === 'bottom') ps.deck.push(moved); else if (otherDest === 'trash') ps.trash.push(moved); else ps.hand.push(moved);
  log(state, `${ps.name} keeps ${CARDS[ps.deck[0].defId].name} on top; ${otherDest === 'hand' ? `${cardName(moved)} goes to hand` : otherDest === 'trash' ? `${cardName(moved)} goes to the trash` : 'the other card goes to the bottom'}.`, 'effect', p);
}
/** Damage-step-only battle between two Units (Qubeley's Funnels, The Final Victor). */
function clash(state: GameState, actor: PlayerId, aUid: number, bUid: number, source: string) {
  const A = findUnit(state, aUid), B = findUnit(state, bUid);
  if (!A || !B) return;
  const apA = unitAp(state, A.unit, A.owner), apB = unitAp(state, B.unit, B.owner);
  const dA = incomingBattleDamage(state, B.unit, B.owner, A.unit, apA), dB = incomingBattleDamage(state, A.unit, A.owner, B.unit, apB);
  B.unit.damage += dA; A.unit.damage += dB;
  log(state, `${source}: ${unitName(A.unit)} (${apA} AP) and ${unitName(B.unit)} (${apB} AP) battle. ${unitName(A.unit)} deals ${dA}, ${unitName(B.unit)} deals ${dB}.`, 'damage', actor);
  const bDead = unitHp(B.unit) <= 0, aDead = unitHp(A.unit) <= 0;
  if (bDead) destroyUnit(state, B.owner, B.unit, true);
  if (aDead) destroyUnit(state, A.owner, A.unit, true);
  if (bDead && A.owner !== B.owner) onKillByUnit(state, A.unit, A.owner, true);
  if (aDead && A.owner !== B.owner) onKillByUnit(state, B.unit, B.owner, true);
}
/** Battle damage `amount` from `from` to `target`, after immunities and reductions. */
function incomingBattleDamage(state: GameState, target: UnitState, targetOwner: PlayerId, from: UnitState, amount: number): number {
  if (isImmune(state, target, amount, from)) { log(state, `${unitName(target)} can't receive battle damage from ${unitName(from)} (${amount} AP).`, 'effect', targetOwner); return 0; }
  // Full Armor Unicorn (Destroy Mode): During Pair, once per turn, no damage from a Unit with AP <= its own
  if (target.card.defId === 'ST14-006' && target.pilot && !target.usedThisTurn.includes('faUnicorn') && amount <= unitAp(state, target, targetOwner)) { target.usedThisTurn.push('faUnicorn'); log(state, `Full Armor Unicorn Gundam ignores the ${amount} damage from ${unitName(from)} (its AP is not higher).`, 'effect', targetOwner); return 0; }
  const red = target.flags?.battleDamageReduce ?? 0;
  if (red > 0 && amount > 0) { const n = Math.max(0, amount - red); log(state, `Battle damage to ${unitName(target)} is reduced by ${red} (${amount} → ${n}).`, 'effect', targetOwner); return n; }
  return amount;
}
/** "When this Unit destroys an enemy Unit with (battle) damage" triggers, for the killer's owner during their turn. */
function onKillByUnit(state: GameState, killer: UnitState, owner: PlayerId, byBattle: boolean) {
  const op = other(owner);
  const ps = state.players[owner];
  if (state.active !== owner) return;
  const alive = !!findUnit(state, killer.card.uid);
  if (killer.card.defId === 'ST12-001' && killer.pilot && pilotLevel(killer.pilot) >= 5) { // Epyon: 2 damage to all enemy Units with 5 or less AP (kills chain)
    const victims = state.players[op].units.filter(e => unitAp(state, e, op) <= 5);
    if (victims.length) { log(state, 'Gundam Epyon 【During Pair】: 2 damage to all enemy Units with 5 or less AP.', 'effect', owner); for (const e of [...victims]) dealEffectDamage(state, op, e, 2, owner, killer.card.uid); }
  }
  if (killer.card.defId === 'ST12-003' && alive && !killer.usedThisTurn.includes('tallgeese3')) { // Tallgeese III: once per turn, 1 damage to all enemy Units with 3 or less AP
    killer.usedThisTurn.push('tallgeese3');
    const victims = state.players[op].units.filter(e => unitAp(state, e, op) <= 3);
    if (victims.length) { log(state, 'Tallgeese Ⅲ: 1 damage to all enemy Units with 3 or less AP.', 'effect', owner); for (const e of [...victims]) dealEffectDamage(state, op, e, 1, owner, killer.card.uid); }
  }
  if (!byBattle) return;
  if (killer.card.defId === 'ST10-006' && killer.pilot) chooseUnit(state, owner, "Phoenix Gundam 【During Pair】: choose 1 enemy Unit with 3 or less HP. Return it to its owner's hand.", state.players[op].units.filter(e => unitHp(e) <= 3), { op: 'bounce' }, 'Phoenix Gundam');
  if (killer.pilot) state.turnFlags['pairedKill:' + owner] = true; // Libra
  if (state.battle?.wiseLeaderUid === killer.card.uid) chooseUnit(state, owner, "Wise Leader's Pride: choose 1 enemy Unit with 2 or less AP. Destroy it.", state.players[op].units.filter(e => unitAp(state, e, op) <= 2), { op: 'destroy' }, "Wise Leader's Pride");
  void ps;
}

function aiPickTarget(state: GameState, e: UnitEffect, targets: UnitState[], _actor: PlayerId): UnitState | null {
  const owner = (u: UnitState) => findUnit(state, u.card.uid)!.owner;
  const score = (u: UnitState) => {
    const ap = unitAp(state, u, owner(u)), hp = unitHp(u);
    switch (e.op) {
      case 'damage': return hp <= (e.amount ?? 1) ? 100 + ap : ap;
      case 'destroy': case 'bounce': return ap * 2 + hp + (u.pilot ? 5 : 0);
      case 'recover': return Math.min(e.amount ?? 0, u.damage) * 10 + ap;
      case 'ap': case 'apBattle':
        if ((e.amount ?? 0) < 0) return ap * 3 + (!u.rested ? 2 : 0);
        return (canAttackThisTurn(state, u) ? 50 : 0) + ap;
      case 'breach': case 'firstStrike': return (canAttackThisTurn(state, u) ? 50 : 0) + ap;
      case 'selfDamageAp': return (canAttackThisTurn(state, u) ? 50 : 0) + hp * 2 + (u.card.defId.startsWith('ST05-00') ? 10 : 0);
      case 'immuneBattle': return ap + hp;
      case 'reactivateNoAttack': return hp;
      case 'targetActiveLv': return ap;
      case 'recoverAp': return Math.min(e.amount ?? 0, u.damage) * 5 + (canAttackThisTurn(state, u) ? 50 : 0) + ap;
      case 'toDeckBottom': return ap * 2 + hp + (u.pilot ? 8 : 0);
      case 'bounceDraw': return ap * 2 + hp + (u.pilot ? 5 : 0);
      case 'untargetable': case 'reduceBattleDmg': return ap * 2 + hp + (u.pilot ? 5 : 0) + (u.damage > 0 ? 3 : 0);
      case 'wiseLeader': return (canAttackThisTurn(state, u) || state.battle?.attackerUid === u.card.uid ? 50 : 0) + ap;
      case 'restAp': return ap * 2 + hp + (!u.rested ? 5 : 0);
      default: return ap * 2 + hp; // rest
    }
  };
  const sorted = [...targets].sort((a, b) => score(b) - score(a));
  // self-damage should never kill our own unit
  if (e.op === 'selfDamageAp') { const safe = sorted.filter(u => unitHp(u) > 1); return safe[0] ?? null; }
  return sorted[0] ?? null;
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

function payCost(state: GameState, p: PlayerId, cost: number) {
  const ps = state.players[p];
  let remaining = cost;
  for (const r of ps.resources) { if (remaining === 0) break; if (!r.rested && !r.isEx) { r.rested = true; remaining--; } }
  if (remaining > 0) {
    for (const r of ps.resources.filter(r => !r.rested && r.isEx)) {
      if (remaining === 0) break;
      ps.resources.splice(ps.resources.indexOf(r), 1); remaining--;
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

function startTurn(state: GameState, p: PlayerId) {
  if (state.winner) return;
  state.turn += 1;
  state.active = p;
  state.turnFlags = {};
  const ps = state.players[p];
  state.phase = 'start';
  log(state, `--- Turn ${state.turn}: ${ps.name} ---`, 'phase', p);
  const theO = state.players[other(p)].units.some(u => u.card.defId === 'ST14-001');
  const lockedLv = theO && ps.units.some(u => u.rested) ? Math.min(...ps.units.filter(u => u.rested).map(unitLevel)) : -1;
  for (const u of ps.units) {
    u.usedThisTurn = [];
    if (u.skipNextActivate) { u.skipNextActivate = false; log(state, `${unitName(u)} stays rested (Man Hunter).`, 'effect', p); continue; }
    if (u.rested && lockedLv >= 0 && unitLevel(u) === lockedLv) { log(state, `${unitName(u)} stays rested (The-O locks your lowest-Lv. rested Units).`, 'effect', p); continue; }
    u.rested = false;
  }
  for (const u of state.players[other(p)].units) u.usedThisTurn = u.usedThisTurn.filter(k => k !== 'faUnicorn');
  // Shamblo: at the start of the opponent's turn, with another Marine out, effect damage to the shield area is reduced by 5 this turn
  const opp = state.players[other(p)];
  if (opp.units.some(u => u.card.defId === 'ST11-006') && opp.units.some(u => hasTrait(u, 'Marine') && u.card.defId !== 'ST11-006')) { state.turnFlags['shambloShield:' + other(p)] = true; log(state, `Shamblo: effect damage to ${opp.name}'s shield area is reduced by 5 this turn.`, 'effect', other(p)); }
  for (const r of ps.resources) r.rested = false;
  if (ps.base) ps.base.rested = false;
  state.phase = 'draw';
  draw(state, p, 1);
  if (state.winner) return;
  state.phase = 'resource';
  if (ps.resourceDeck > 0 && ps.resources.filter(r => !r.isEx).length < 10) {
    ps.resourceDeck -= 1;
    ps.resources.push({ uid: state.nextUid++, rested: false, isEx: false });
    log(state, `${ps.name} places a Resource (Lv.${playerLevel(ps)}).`, 'info', p);
  }
  state.phase = 'main';
}

function endTurn(state: GameState) {
  const p = state.active;
  const ps = state.players[p];
  state.phase = 'end';
  for (const u of ps.units) {
    const kw = unitKeywords(u);
    if (kw.repair && u.damage > 0) {
      const before = u.damage;
      u.damage = Math.max(0, u.damage - kw.repair);
      log(state, `${unitName(u)} repairs ${before - u.damage} HP (<Repair ${kw.repair}>).`, 'effect', p);
    }
  }
  for (const u of ps.units) {
    if (u.card.defId === 'ST07-001' && ps.trash.filter(c => CARDS[c.defId].traits.includes('CB')).length >= 7) {
      const r = ps.resources.find(r => r.rested);
      if (r) { r.rested = false; log(state, 'Gundam Exia: 7+ (CB) cards in the trash, 1 Resource is set as active.', 'effect', p); }
    }
  }
  state.stats[p].resourcesLeftUnspent.push(activeResources(ps));
  if (ps.hand.length > 10) {
    if (ps.isAI) {
      while (ps.hand.length > 10) { const c = [...ps.hand].sort((a, b) => CARDS[b.defId].cost - CARDS[a.defId].cost)[0]; ps.hand.splice(ps.hand.indexOf(c), 1); ps.trash.push(c); log(state, `${ps.name} discards ${cardName(c)}.`, 'info', p); }
    } else {
      pushChoice(state, {
        kind: 'discard', player: p, title: `Discard down to 10 cards (${ps.hand.length - 10} more)`,
        options: ps.hand.map(c => ({ id: `hand:${c.uid}`, label: cardName(c), ref: { kind: 'hand', uid: c.uid, owner: p } })),
        ctx: {},
      });
      return;
    }
  }
  finishEndTurn(state);
}

function finishEndTurn(state: GameState) {
  const p = state.active;
  for (const q of ['p1', 'p2'] as PlayerId[]) {
    for (const u of state.players[q].units) { u.tempAp = 0; u.tempHp = 0; u.tempKeywords = {}; u.flags = undefined; }
  }
  startTurn(state, other(p));
}

// ---------- deploying & pairing ----------

function newUnit(card: CardInstance, turn: number, rested = false): UnitState {
  return { card, rested, damage: 0, deployedTurn: turn, tempAp: 0, tempHp: 0, tempKeywords: {}, usedThisTurn: [] };
}

function deployUnit(state: GameState, p: PlayerId, card: CardInstance, rested = false, fromTrash = false) {
  const ps = state.players[p];
  if (ps.units.length >= 6) {
    if (ps.isAI) {
      const weakest = [...ps.units].sort((a, b) => unitAp(state, a, p) + unitHp(a) - (unitAp(state, b, p) + unitHp(b)))[0];
      removeUnitToTrash(state, p, weakest);
    } else {
      pushChoice(state, {
        kind: 'unitLimit', player: p, title: 'Battle area is full (6 Units). Choose a Unit to place in the trash.',
        description: 'The removed Unit is not treated as destroyed.',
        options: ps.units.map(u => unitOption(state, u, p)),
        ctx: { card, rested, fromTrash },
      });
      return;
    }
  }
  const u = newUnit(card, state.turn, rested);
  ps.units.push(u);
  log(state, `${ps.name} deploys ${cardName(card)}${rested ? ' (rested)' : ''}.`, 'play', p);
  onDeploy(state, p, u, fromTrash);
}

function removeUnitToTrash(state: GameState, p: PlayerId, u: UnitState) {
  const ps = state.players[p];
  ps.units.splice(ps.units.indexOf(u), 1);
  if (!u.card.token) ps.trash.push(u.card);
  if (u.pilot) ps.trash.push(u.pilot);
  log(state, `${unitName(u)} is placed in the trash to make room.`, 'info', p);
}

export function deployToken(state: GameState, p: PlayerId, tokenId: string, rested = false) {
  const t = TOKENS[tokenId];
  deployUnit(state, p, { uid: state.nextUid++, defId: t.id, owner: p, token: t }, rested);
}

/** Pharact / Palace Athene: the enemy chooses `n` Unit cards from their trash and exiles them. */
function enemyExilesFromTrash(state: GameState, p: PlayerId, n: number, source: string) {
  const op = other(p);
  const pool = state.players[op].trash.filter(c => CARDS[c.defId].type === 'UNIT');
  if (!pool.length) { log(state, `${source}: ${state.players[op].name} has no Unit cards in the trash.`, 'effect', p); return; }
  chooseTrashCards(state, op, `${source}: choose ${Math.min(n, pool.length)} Unit card(s) from your trash to exile from the game.`, pool, n, 'exileOnly', { source, allowFewer: true }, false);
}

function bounceUnit(state: GameState, owner: PlayerId, u: UnitState, source: string) {
  const ps = state.players[owner];
  const idx = ps.units.indexOf(u);
  if (idx < 0) return;
  ps.units.splice(idx, 1);
  if (!u.card.token) ps.hand.push(u.card);
  if (u.pilot) ps.hand.push(u.pilot);
  log(state, `${source}: ${unitName(u)} is returned to ${ps.name}'s hand${u.pilot ? ' with its Pilot' : ''}.`, 'effect', owner);
}

function onDeploy(state: GameState, p: PlayerId, u: UnitState, fromTrash = false) {
  const op = other(p);
  const ps = state.players[p];
  const enemies = state.players[op].units;
  switch (u.card.defId) {
    case 'ST09-006': if (fromTrash) chooseUnit(state, p, 'Sword Impulse Gundam 【Deploy】(from the trash): choose 1 enemy Unit of Lv.3 or lower. Destroy it.', enemies.filter(t => unitLevel(t) <= 3), { op: 'destroy' }, 'Sword Impulse Gundam'); break;
    case 'GD01-049': chooseUnit(state, p, 'Blitz Gundam 【Deploy】: choose 1 of your (ZAFT) Units with 5 or more AP. It gains <First Strike> this turn.', ps.units.filter(t => hasTrait(t, 'ZAFT') && unitAp(state, t, p) >= 5), { op: 'firstStrike' }, 'Blitz Gundam'); break;
    case 'ST10-002': chooseTrashCards(state, p, 'Zeta Gundam 【Deploy･Development 2】: exile 2 (G Generation) cards from your trash to rest an enemy Unit with 4 or less HP?', ps.trash.filter(c => CARDS[c.defId].traits.includes('G Generation')), 2, 'zetaRest', { source: 'Zeta Gundam' }, true); break;
    case 'ST10-008': chooseTrashCards(state, p, 'Gundam Barbatos 1st Form 【Deploy･Development 2】: exile 2 (G Generation) cards from your trash to draw 1 and discard 1?', ps.trash.filter(c => CARDS[c.defId].traits.includes('G Generation')), 2, 'barbatos1Draw', { source: 'Gundam Barbatos 1st Form' }, true); break;
    case 'ST11-001': if (ps.units.some(t => t !== u && hasTrait(t, 'Marine'))) chooseUnit(state, p, "Char's Z'Gok 【Deploy】: choose 1 enemy Unit of Lv.2 or lower. Return it to the bottom of its owner's deck.", enemies.filter(t => unitLevel(t) <= 2), { op: 'toDeckBottom' }, "Char's Z'Gok"); break;
    case 'ST11-004': log(state, 'ZnO 【Deploy】: a rested GOOhN token.', 'effect', p); deployToken(state, p, 'T-028', true); break;
    case 'ST11-006': fromTrashToHand(state, p, 'Shamblo 【Deploy】: choose 1 (Marine) Unit card in your trash to add to your hand.', ps.trash.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].traits.includes('Marine')), 'Shamblo'); break;
    case 'ST12-001': { const b = state.players[op].base; if (b) { b.damage += 5; log(state, `Gundam Epyon 【Deploy】: 5 damage to ${cardName(b.card)} (${Math.max(0, baseHp(b))}/${baseMaxHp(b)} HP).`, 'damage', p); if (baseHp(b) <= 0) { if (!b.isEx) state.players[op].trash.push(b.card); log(state, `${cardName(b.card)} is destroyed!`, 'damage', op); state.players[op].base = null; } } else log(state, 'Gundam Epyon 【Deploy】: no enemy Base.', 'effect', p); break; }
    case 'ST12-002': chooseUnit(state, p, 'Shining Gundam 【Deploy】: choose 1 friendly Unit with 5 or more AP. It gains <Breach 3> this turn.', ps.units.filter(t => unitAp(state, t, p) >= 5), { op: 'breach', amount: 3 }, 'Shining Gundam'); break;
    case 'ST13-002': deployFunnels(state, p, 1, 'Elmeth 【Deploy】'); break;
    case 'ST13-004': askTopKeep(state, p, 'GX-Bit 【Deploy】'); break;
    case 'ST13-005': if (enemies.length >= 4) lookTopPick(state, p, 5, c => CARDS[c.defId].type === 'PILOT', 'GFreD 【Deploy】'); break;
    case 'ST14-003': enemyExilesFromTrash(state, p, 2, 'Palace Athene 【Deploy】'); break;
    case 'ST14-005': chooseUnit(state, p, `G-Falcon DX 【Deploy】: choose 1 enemy Unit of Lv.6 or lower. Rest it${ps.trash.length >= 7 ? '; it gets AP-2 this turn' : ''}.`, enemies.filter(t => unitLevel(t) <= 6), { op: 'restAp', amount: ps.trash.length >= 7 ? -2 : 0 }, 'G-Falcon DX'); break;
    case 'ST14-006': lookTopPick(state, p, 3, () => true, 'Full Armor Unicorn Gundam 【Deploy】'); break;
    case 'ST01-004': chooseUnit(state, p, 'Guntank 【Deploy】: choose 1 enemy Unit with 2 or less HP to rest.', enemies.filter(t => unitHp(t) <= 2 && !t.rested), { op: 'rest' }, 'Guntank'); break;
    case 'ST02-002': addExResource(state, p); break;
    case 'ST03-009': log(state, 'Gouf 【Deploy】: a rested Zaku Ⅱ token.', 'effect', p); deployToken(state, p, 'T-007', true); break;
    case 'ST04-002': { // Strike Gundam: draw 1 then discard 1
      log(state, 'Strike Gundam 【Deploy】: draw 1, then discard 1.', 'effect', p);
      draw(state, p, 1);
      askDiscardOne(state, p, 'Strike Gundam: discard 1 card.');
      break;
    }
    case 'ST05-001': chooseUnit(state, p, 'Barbatos 4th Form 【Deploy】: choose 1 of your other Units. 1 damage to it; it gets AP+1 this turn.', state.players[p].units.filter(t => t !== u), { op: 'selfDamageAp', amount: 1 }, 'Barbatos 4th Form'); break;
    case 'ST06-002': if (state.players[p].units.some(t => t !== u && hasTrait(t, 'Clan'))) chooseUnit(state, p, 'GQuuuuuuX 【Deploy】: choose 1 enemy Unit. Deal 1 damage to it.', enemies, { op: 'damage', amount: 1 }, 'GQuuuuuuX'); break;
    case 'ST06-007': chooseUnit(state, p, "Ortega's Rick Dom 【Deploy】: choose 1 of your other (Clan) Units. This turn it may attack active enemy Units with 3 or less AP.", state.players[p].units.filter(t => t !== u && hasTrait(t, 'Clan')), { op: 'targetActiveAp', amount: 3 }, "Ortega's Rick Dom"); break;
    case 'ST08-002': chooseUnit(state, p, 'Ξ Gundam 【Deploy】: choose 1 enemy Unit. Deal 1 damage to it.', enemies, { op: 'damage', amount: 1 }, 'Ξ Gundam'); break;
    case 'ST08-009': chooseUnit(state, p, "Jegan (Man Hunter) 【Deploy】: choose 1 rested enemy Unit of Lv.2 or lower. It won't be set active next start phase.", enemies.filter(t => t.rested && unitLevel(t) <= 2), { op: 'skipActivate' }, 'Man Hunter'); break;
  }
}

function askDiscardOne(state: GameState, p: PlayerId, title: string) {
  const ps = state.players[p];
  if (!ps.hand.length) return;
  if (ps.isAI) {
    const c = [...ps.hand].sort((a, b) => (CARDS[b.defId].level - playerLevel(ps)) - (CARDS[a.defId].level - playerLevel(ps)))[0];
    ps.hand.splice(ps.hand.indexOf(c), 1); ps.trash.push(c);
    log(state, `${ps.name} discards ${cardName(c)}.`, 'info', p);
    return;
  }
  pushChoice(state, { kind: 'discardOne', player: p, title, options: ps.hand.map(c => ({ id: `hand:${c.uid}`, label: cardName(c), detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].type}`, ref: { kind: 'hand', uid: c.uid, owner: p } })), ctx: {} });
}

function deployBase(state: GameState, p: PlayerId, card: CardInstance, fromBurst = false) {
  const ps = state.players[p];
  const op = other(p);
  if (ps.base) {
    if (!ps.base.isEx) ps.trash.push(ps.base.card);
    log(state, `${cardName(ps.base.card)} is replaced (not destroyed).`, 'info', p);
  }
  ps.base = { card, rested: false, damage: 0 };
  log(state, `${ps.name} deploys Base ${cardName(card)}.`, 'play', p);
  if (ps.shields.length) {
    const s = ps.shields.shift()!;
    ps.hand.push(s);
    log(state, `${ps.name} adds a Shield to hand (${ps.shields.length} left).`, 'effect', p);
  }
  switch (card.defId) {
    case 'ST02-015': { // Saint Gabriel: look at top 2
      if (ps.deck.length >= 2) {
        const [a, b] = ps.deck;
        if (ps.isAI) {
          const score = (c: CardInstance) => (CARDS[c.defId].level <= playerLevel(ps) + 1 ? 1 : 0);
          if (score(b) > score(a)) { ps.deck.shift(); ps.deck.push(a); } else { ps.deck.splice(1, 1); ps.deck.push(b); }
        } else {
          pushChoice(state, {
            kind: 'saintGabriel', player: p, title: 'Saint Gabriel Institute: look at the top 2 cards. Which one stays on top?',
            description: 'The other card goes to the bottom of your deck.',
            options: [a, b].map(c => ({ id: `deck:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].type}` })), ctx: {},
          });
        }
      }
      break;
    }
    case 'ST02-016': { // Corsica Base
      if (state.active === p && !fromBurst) {
        const corsicaInTrash = ps.trash.some(c => CARDS[c.defId]?.name.includes('Corsica Base'));
        if (corsicaInTrash) { deployToken(state, p, 'T-004'); deployToken(state, p, 'T-004'); } else deployToken(state, p, 'T-005');
      }
      break;
    }
    case 'ST03-015': chooseUnit(state, p, 'Rewloola 【Deploy】: choose 1 enemy Unit with 5 or less AP. Deal 1 damage to it.', state.players[op].units.filter(u => unitAp(state, u, op) <= 5), { op: 'damage', amount: 1 }, 'Rewloola'); break;
    case 'ST03-016': if (state.active === p && !fromBurst) { log(state, "Falmel 【Deploy】: a rested Char's Zaku Ⅱ token.", 'effect', p); deployToken(state, p, 'T-006', true); } break;
    case 'ST08-014': chooseUnit(state, p, 'Valiant 【Deploy】: choose 1 of your Units. It gets AP+2 this turn.', ps.units, { op: 'ap', amount: 2 }, 'Valiant'); break;
    case 'ST09-010': if (state.active === p) askTop2(state, p, 'Minerva 【Deploy】', 'trash'); break;
    case 'ST10-016': { let n = 0; for (const u of ps.units) if (hasTrait(u, 'G Generation') && u.damage > 0) { u.damage -= 1; n++; } log(state, `Luna Mana & Carry Base 【Deploy】: ${n} (G Generation) Unit(s) recover 1 HP.`, 'effect', p); break; }
    case 'ST11-016': if (state.players[op].units.length >= 4) chooseUnit(state, p, 'Mad Angler 【Deploy】: choose 1 rested enemy Unit. Deal 2 damage to it.', state.players[op].units.filter(u => u.rested), { op: 'damage', amount: 2 }, 'Mad Angler'); break;
    case 'ST13-016': deployFunnels(state, p, 1, 'Sodon 【Deploy】'); break;
  }
}

function pairPilot(state: GameState, p: PlayerId, pilot: CardInstance, u: UnitState) {
  const ps = state.players[p];
  const op = other(p);
  u.pilot = pilot;
  const linked = isLinked(u);
  state.stats[p].pilotsPaired++;
  if (linked) state.stats[p].linkUnitsMade++;
  log(state, `${ps.name} pairs ${pilotName(pilot)} with ${unitName(u)}${linked ? ' — Link Unit!' : ''}.`, 'play', p);
  const enemies = state.players[op].units;
  // Unit-side When Paired
  switch (u.card.defId) {
    case 'ST01-002': if (pilotTraits(pilot).includes('White Base Team')) { log(state, 'Gundam (MA Form) 【When Paired】: draw 1.', 'effect', p); effectDraw(state, p, 1); } break;
    case 'ST01-006': chooseUnit(state, p, 'Gundam Aerial 【When Paired】: choose 1 enemy Unit (Lv.5 or lower). It gets AP-3 this turn.', enemies.filter(t => unitLevel(t) <= 5), { op: 'ap', amount: -3 }, 'Gundam Aerial'); break;
    case 'ST04-001': if (pilotLevel(pilot) >= 4) chooseUnit(state, p, "Aile Strike Gundam 【When Paired】: choose 1 enemy Unit with 4 or less HP. Return it to its owner's hand.", enemies.filter(t => unitHp(t) <= 4), { op: 'bounce' }, 'Aile Strike Gundam'); break;
    case 'ST05-007': chooseUnit(state, p, "McGillis' Schwalbe Graze 【When Paired】: choose 1 enemy Unit (Lv.3 or lower). It gets AP-2 this turn.", enemies.filter(t => unitLevel(t) <= 3), { op: 'ap', amount: -2 }, "McGillis' Schwalbe Graze"); break;
    case 'ST07-001': { // Exia: mill 2, draw 1 if a CB card was milled
      const milled = ps.deck.splice(0, 2); ps.trash.push(...milled);
      log(state, `Gundam Exia 【When Paired】: ${milled.map(c => CARDS[c.defId].name).join(', ') || 'nothing'} placed into the trash.`, 'effect', p);
      if (milled.some(c => CARDS[c.defId].traits.includes('CB'))) effectDraw(state, p, 1);
      break;
    }
    case 'ST08-001': { const maxLv = Math.max(0, ...enemies.map(unitLevel)); chooseUnit(state, p, 'Ξ Gundam 【When Paired】: choose 1 enemy Unit with the highest Lv. Deal 3 damage to it.', enemies.filter(t => unitLevel(t) === maxLv), { op: 'damage', amount: 3 }, 'Ξ Gundam'); break; }
    case 'ST06-001': if (linked && ps.units.some(t => t !== u && hasTrait(t, 'Clan'))) { u.tempKeywords.firstStrike = true; log(state, 'GQuuuuuuX 【When Linked】: gains <First Strike> this turn.', 'effect', p); } break;
    case 'ST09-003': if (linked && ps.trash.filter(c => CARDS[c.defId].color === 'Purple').length >= 5) { // Saviour: 2 damage to ALL Units with 5 or less AP
      log(state, 'Saviour Gundam 【When Linked】: 5+ purple cards in the trash. 2 damage to all Units with 5 or less AP.', 'effect', p);
      for (const q of ['p1', 'p2'] as PlayerId[]) for (const t of [...state.players[q].units]) if (unitAp(state, t, q) <= 5) dealEffectDamage(state, q, t, 2, p, u.card.uid);
    } break;
    case 'ST10-007': if (linked) chooseTrashCards(state, p, 'Gundam Barbatos 4th Form 【When Linked･Development 2】: exile 2 (G Generation) cards from your trash to return a Command of Lv.4 or lower to your hand?', ps.trash.filter(c => CARDS[c.defId].traits.includes('G Generation')), 2, 'barbatos4Cmd', { source: 'Gundam Barbatos 4th Form' }, true); break;
    case 'ST12-007': if (linked) applyUnitEffect(state, p, u, { op: 'firstStrike' }, 'Gyan 【When Linked】'); break;
  }
  // Pilot-side When Paired / When Linked
  switch (pilot.defId) {
    case 'ST01-010': chooseUnit(state, p, 'Amuro Ray 【When Paired】: choose 1 enemy Unit with 5 or less HP to rest.', enemies.filter(t => unitHp(t) <= 5 && !t.rested), { op: 'rest' }, 'Amuro Ray'); break;
    case 'ST03-010': { // Full Frontal: may deploy a (Neo Zeon)/(Zeon) Unit Lv<=4 from hand
      const cands = ps.hand.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level <= 4 && CARDS[c.defId].traits.some(t => t === 'Neo Zeon' || t === 'Zeon'));
      if (cands.length) {
        if (ps.isAI) { const c = [...cands].sort((a, b) => CARDS[b.defId].level - CARDS[a.defId].level)[0]; ps.hand.splice(ps.hand.indexOf(c), 1); log(state, `Full Frontal 【When Paired】: ${ps.name} deploys ${cardName(c)} for free.`, 'effect', p); deployUnit(state, p, c); }
        else pushChoice(state, { kind: 'freeDeploy', player: p, title: 'Full Frontal 【When Paired】: you may deploy 1 (Neo Zeon)/(Zeon) Unit of Lv.4 or lower from your hand for free.', options: [...cands.map(c => ({ id: `hand:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].ap} AP / ${CARDS[c.defId].hp} HP`, ref: { kind: 'hand' as const, uid: c.uid, owner: p } })), { id: 'pass', label: 'Skip' }], optional: true, ctx: {} });
      }
      break;
    }
    case 'ST04-011': if (linked) applyUnitEffect(state, p, u, { op: 'targetActiveLv', amount: 5 }, 'Athrun Zala 【When Linked】'); break;
    case 'ST05-010': // Mikazuki: 1 damage to one of your Units and one enemy Unit
      chooseUnit(state, p, 'Mikazuki Augus 【When Paired】: choose 1 of your Units. Deal 1 damage to it.', ps.units, { op: 'damage', amount: 1 }, 'Mikazuki Augus');
      chooseUnit(state, p, 'Mikazuki Augus 【When Paired】: choose 1 enemy Unit. Deal 1 damage to it.', enemies, { op: 'damage', amount: 1 }, 'Mikazuki Augus');
      break;
    case 'ST05-012': if (ps.units.filter(t => t !== u && hasTrait(t, 'Gjallarhorn', 'Tekkadan')).length >= 2) chooseUnit(state, p, 'McGillis Fareed 【When Paired】: choose 1 enemy Unit with 3 or less HP to rest.', enemies.filter(t => unitHp(t) <= 3 && !t.rested), { op: 'rest' }, 'McGillis Fareed'); else log(state, 'McGillis Fareed 【When Paired】: fewer than 2 other Gjallarhorn/Tekkadan Units, no effect.', 'effect', p); break;
    case 'ST06-009': if (linked) { // Amate: look at the top card; a (Clan) card may go to hand, otherwise to the bottom
      const top = ps.deck[0];
      if (top) {
        const isClan = CARDS[top.defId].traits.includes('Clan');
        if (!isClan) { ps.deck.shift(); ps.deck.push(top); log(state, `Amate 【When Linked】: the top card is not a (Clan) card; it goes to the bottom.`, 'effect', p); }
        else lookTopPick(state, p, 1, () => true, 'Amate 【When Linked】');
      }
    } break;
    case 'ST07-011': if (hasTrait(u, 'CB')) applyUnitEffect(state, p, u, { op: 'targetActiveLv', amount: unitLevel(u) }, 'Lockon Stratos 【When Paired】'); break;
    case 'ST08-010': if (hasTrait(u, 'Mafty')) chooseUnit(state, p, 'Hathaway Noa 【When Paired】: choose 1 of your (Mafty) Units. This turn it may attack damaged active enemy Units.', ps.units.filter(t => hasTrait(t, 'Mafty')), { op: 'targetDamagedActive' }, 'Hathaway Noa'); break;
    case 'ST10-011': if (linked && ps.units.filter(t => t.rested).length + enemies.filter(t => t.rested).length >= 2) chooseUnit(state, p, `Kamille Bidan 【When Linked】: choose 1 enemy Unit of Lv.${unitLevel(u)} or lower to rest.`, enemies.filter(t => unitLevel(t) <= unitLevel(u) && !t.rested), { op: 'rest' }, 'Kamille Bidan'); break;
    case 'ST10-012': chooseUnit(state, p, 'Mark Guilder 【When Paired】: choose 1 enemy Unit of Lv.5 or lower. It gets AP-2 this turn.', enemies.filter(t => unitLevel(t) <= 5), { op: 'ap', amount: -2 }, 'Mark Guilder'); break;
    case 'ST11-011': { let n = 0; for (const t of ps.units) if (hasTrait(t, 'Marine')) { t.tempAp += 1; n++; } log(state, `Char Aznable 【When Paired】: ${n} (Marine) Unit(s) get AP+1 this turn.`, 'effect', p); break; }
    case 'ST11-012': chooseUnit(state, p, 'Loni Garvey 【When Paired】: choose 1 friendly (Marine) Unit. Battle damage to it is reduced by 2 this turn.', ps.units.filter(t => hasTrait(t, 'Marine')), { op: 'reduceBattleDmg', amount: 2 }, 'Loni Garvey'); break;
    case 'ST12-012': if (linked) askTop2(state, p, 'Ple-Twelve 【When Linked】', (state.players.p1.shields.length <= 3 || state.players.p2.shields.length <= 3) ? 'hand' : 'trash'); break;
    case 'ST13-011': lookTopPick(state, p, 5, c => CARDS[c.defId].type === 'PILOT' && CARDS[c.defId].level <= unitLevel(u), 'Haman Karn 【When Paired】'); break;
    case 'ST14-012': chooseUnit(state, p, 'Banagher Links 【When Paired】: choose 1 friendly Unit of Lv.5 or higher. This turn it may attack active enemy Units with 5 or less AP.', ps.units.filter(t => unitLevel(t) >= 5), { op: 'targetActiveAp', amount: 5 }, 'Banagher Links'); break;
  }
  // Qubeley: once per turn, when you pair a Pilot with one of your Units, deploy 1 to 2 Funnels
  if (state.active === p) for (const q of ps.units) if (q.card.defId === 'ST13-001' && !q.usedThisTurn.includes('qubeleyFunnels')) { q.usedThisTurn.push('qubeleyFunnels'); deployFunnels(state, p, 2, 'Qubeley'); }
  // Gryphios 2: once per turn, when a friendly Unit links, an enemy Unit of Lv.5 or lower gets AP-1
  if (linked && state.active === p && ps.base?.card.defId === 'ST14-016' && !state.turnFlags['gryphios']) { state.turnFlags['gryphios'] = true; chooseUnit(state, p, 'Gryphios 2: choose 1 enemy Unit of Lv.5 or lower. It gets AP-1 this turn.', enemies.filter(t => unitLevel(t) <= 5), { op: 'ap', amount: -1 }, 'Gryphios 2'); }
  // Kaneban Co., Ltd.: once per turn, a friendly (Clan) Unit that links gains <Breach 3>
  if (linked && hasTrait(u, 'Clan') && ps.base?.card.defId === 'ST06-015' && !state.turnFlags['kaneban']) {
    state.turnFlags['kaneban'] = true;
    applyUnitEffect(state, p, u, { op: 'breach', amount: 3 }, 'Kaneban Co., Ltd.');
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
  const { cost } = effectiveLevelCost(state, p, card);
  const discountCard = developmentDiscount(state, p, card);
  ps.hand.splice(ps.hand.indexOf(card), 1);
  payCost(state, p, cost);
  state.turnFlags.playedSomething = true;
  if (discountCard) { ps.hand.splice(ps.hand.indexOf(discountCard), 1); ps.trash.push(discountCard); log(state, `${ps.name} discards ${cardName(discountCard)} to play ${d.name} as a Lv.2, cost 2 card.`, 'effect', p); }
  if (d.type === 'UNIT') { deployUnit(state, p, card); return; }
  if (d.type === 'BASE') { deployBase(state, p, card); return; }
  if (d.type === 'PILOT' || (d.type === 'COMMAND' && asPilot)) {
    const targets = ps.units.filter(canBePaired);
    if (targets.length === 1 || ps.isAI) {
      pairPilot(state, p, card, ps.isAI ? bestPairTarget(state, p, card, targets) : targets[0]);
    } else {
      pushChoice(state, {
        kind: 'pairTarget', player: p, title: `Pair ${pilotName(card)} with which Unit?`,
        description: 'A Pilot adds its AP/HP to the Unit. If it meets the link requirement, the Unit becomes a Link Unit and may attack the turn it is deployed.',
        options: targets.map(u => { const o = unitOption(state, u, p); if (wouldLink(u, card)) o.detail = `${o.detail} · ✓ Link`; return o; }),
        ctx: { pilotUid: card.uid },
      });
      state.holding.push(card);
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
  return isLinked({ ...u, pilot });
}

function bestPairTarget(state: GameState, p: PlayerId, pilot: CardInstance, targets: UnitState[]): UnitState {
  const scored = targets.map(u => ({ u, s: (wouldLink(u, pilot) ? 100 : 0) + unitAp(state, u, p) * 2 + unitHp(u) + (u.deployedTurn === state.turn ? 20 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].u;
}

/** Resolve a Command card's effect (Main or Action timing). */
function resolveCommand(state: GameState, p: PlayerId, defId: string) {
  const ps = state.players[p];
  const targets = commandTargets(state, p, defId) ?? [];
  const name = CARDS[defId].name;
  const ask = (title: string, e: UnitEffect) => chooseUnit(state, p, `${name}: ${title}`, targets, e, name);
  switch (defId) {
    case 'ST01-012': ask('choose 1 rested enemy Unit.', { op: 'damage', amount: 1 }); break;
    case 'ST01-013': ask('choose 1 friendly Unit.', { op: 'recover', amount: 3 }); break;
    case 'ST01-014': ask('choose 1 enemy Unit.', { op: 'ap', amount: -3 }); break;
    case 'ST02-012': ask('choose 1 of your Units.', { op: 'breach', amount: 3 }); break;
    case 'ST02-014': ask('choose 1 enemy Unit with 5 or less HP.', { op: 'rest' }); break;
    case 'ST02-013': if (state.battle) { state.battle.shieldProtectLvMax = 4; log(state, "Peaceful Timbre: this battle, shield area cards can't be damaged by Units Lv.4 or lower.", 'effect', p); } break;
    case 'ST03-012': ask('choose 1 friendly Unit.', { op: 'ap', amount: 2 }); break;
    case 'ST03-013': ask('choose 1 enemy Unit.', { op: 'damage', amount: 2 }); break;
    case 'ST03-014': ask('choose 1 friendly Unit.', { op: 'immuneBattle', amount: 2 }); break;
    case 'ST04-012': { // Striker Pack: Sword or Launcher token
      if (ps.isAI) { const op = other(p); const sword = state.players[op].units.some(u => u.rested && unitHp(u) <= 4); deployToken(state, p, sword ? 'T-010' : 'T-009'); }
      else pushChoice(state, { kind: 'tokenChoice', player: p, title: 'Striker Pack: deploy which token?', options: [{ id: 'T-010', label: 'Sword Strike Gundam', detail: '4 AP / 2 HP · <Blocker>' }, { id: 'T-009', label: 'Launcher Strike Gundam', detail: '2 AP / 4 HP · <Blocker>' }], ctx: {} });
      break;
    }
    case 'ST04-013': ask('choose 1 enemy Unit with 3 or less HP.', { op: 'bounce' }); break;
    case 'ST04-014': ask('choose 1 friendly Unit of Lv.2 or lower.', { op: 'firstStrike' }); break;
    case 'ST05-013': ask('choose 1 of your Units.', { op: 'selfDamageAp', amount: 3 }); break;
    case 'ST05-014': ask('choose 1 enemy Unit of Lv.3 or lower.', { op: 'destroy' }); break;
    case 'ST06-011': chooseUnits(state, p, 'Ruthless Tactics: choose 1 to 2 friendly (Clan) Units.', targets, { op: 'ap', amount: 2 }, name, 2); break;
    case 'ST06-012': lookTopPick(state, p, 3, c => (CARDS[c.defId].type === 'UNIT' || CARDS[c.defId].type === 'PILOT') && CARDS[c.defId].traits.includes('Clan'), name); break;
    case 'ST06-013': chooseUnits(state, p, 'Fierce Unity: choose 1 to 2 friendly (Clan) Units.', targets, { op: 'immuneLvTurn', amount: 2 }, name, 2); break;
    case 'ST07-013': ask('choose 1 rested friendly (CB) Unit to take the attack.', { op: 'redirect' }); break;
    case 'ST07-014': lookTopPick(state, p, 3, c => (CARDS[c.defId].type === 'UNIT' || CARDS[c.defId].type === 'PILOT') && CARDS[c.defId].traits.includes('CB'), name); break;
    case 'ST08-012': ask('choose 1 friendly Link Unit.', { op: 'breach', amount: 1 }); break;
    case 'ST08-013': ask('choose 1 enemy Unit.', { op: 'damage', amount: ps.units.some(u => isLinked(u) && hasTrait(u, 'Mafty')) ? 2 : 1 }); break;
    case 'ST09-009': ask('choose 1 active enemy Unit with 4 or less AP.', { op: 'destroy' }); break;
    case 'GD01-111': ask('choose 1 damaged enemy Unit.', { op: 'damage', amount: 3 }); break;
    case 'GD01-118': effectDraw(state, p, 2); askDiscardOne(state, p, 'Overflowing Affection: discard 1 card.'); break;
    case 'GD02-110': chooseDeployFromTrash(state, p, 'Awakened Power: choose 1 Unit card of Lv.5 or lower in your trash. Pay its cost to deploy it.', trashDeployTargets(state, p, activeResources(ps)), name, { pay: true, rested: false }); break;
    case 'ST10-013': ask('choose 1 (G Generation) Unit of Lv.5 or higher.', { op: 'recoverAp', amount: 2 }); break;
    case 'ST10-014': effectDraw(state, p, 2); break;
    case 'ST10-015': ask('choose 1 enemy Unit.', { op: 'apBattle', amount: -3 }); break;
    case 'ST11-013': ask('choose 1 rested enemy Unit with 3 or less HP.', { op: 'bounceDraw' }); break;
    case 'ST11-014': ask('choose 1 friendly (Marine) Unit.', { op: 'untargetable' }); break;
    case 'ST11-015': chooseDeployFromTrash(state, p, 'A Twinkle from the Abyss: choose 1 (Marine) Unit card of Lv.4 or lower in your trash. Deploy it rested.', ps.trash.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level <= 4 && CARDS[c.defId].traits.includes('Marine')), name, { pay: false, rested: true }); break;
    case 'ST12-013': chooseClashUnit(state, p, p, 'The Final Victor: choose 1 of your Units to battle. Your opponent then chooses theirs.', { source: name, step: 'mine' }); break;
    case 'ST12-014': ask('choose 1 friendly Unit.', { op: 'wiseLeader' }); break;
    case 'ST12-015': chooseMode(state, p, defId, [
      { id: 'destroy', label: 'Destroy 1 enemy Unit of Lv.2 or lower', ok: state.players[other(p)].units.some(u => unitLevel(u) <= 2) },
      { id: 'ping', label: 'Deal 2 damage to 1 friendly Unit and 1 enemy Unit of Lv.5 or higher', ok: ps.units.length > 0 && state.players[other(p)].units.some(u => unitLevel(u) >= 5) },
    ]); break;
    case 'ST13-013': deployFunnels(state, p, 2, "I'm a Newtype"); break;
    case 'ST13-014': chooseFinalDuty(state, p); break;
    case 'ST13-015': chooseTrashCards(state, p, 'Operation to Intercept Solomon: choose 3 Unit cards from your trash to exile.', ps.trash.filter(c => CARDS[c.defId].type === 'UNIT'), 3, 'solomon', { source: name }, false); break;
    case 'ST14-013': chooseMode(state, p, defId, [
      { id: 'rest', label: 'Rest 1 to 2 enemy Units with 3 or less HP', ok: state.players[other(p)].units.some(u => unitHp(u) <= 3 && !u.rested) },
      { id: 'ap', label: '1 enemy Unit gets AP-3 this turn', ok: state.players[other(p)].units.length > 0 },
    ]); break;
    case 'ST14-014': ask(targets.length && targets.length === state.players[other(p)].units.length && ps.trash.filter(c => CARDS[c.defId].type === 'COMMAND').length >= 4 ? 'choose 1 enemy Unit (4+ Commands in your trash).' : 'choose 1 enemy Unit of Lv.5 or lower.', { op: 'ap', amount: -3 }); break;
    case 'ST14-015': {
      if (ps.resourceDeck > 0) { ps.resourceDeck -= 1; ps.resources.push({ uid: state.nextUid++, rested: true, isEx: false }); log(state, `Battlefield Emotions: ${ps.name} places a rested Resource (Lv.${playerLevel(ps)}).`, 'effect', p); }
      if (!state.turnFlags['resActivated:' + p]) { const r = ps.resources.find(r => r.rested); if (r) { r.rested = false; state.turnFlags['resActivated:' + p] = true; log(state, 'Battlefield Emotions: 1 Resource is set as active.', 'effect', p); } }
      break;
    }
  }
}

/** Two Unicorns / Natural Talent: pick one of two effects. */
function chooseMode(state: GameState, p: PlayerId, defId: string, modes: { id: string; label: string; ok: boolean }[]) {
  const ok = modes.filter(m => m.ok);
  if (!ok.length) { log(state, `${CARDS[defId].name}: no valid effect.`, 'effect', p); return; }
  if (state.players[p].isAI) { resolveMode(state, p, defId, aiPickMode(state, p, defId, ok).id); return; }
  pushChoice(state, { kind: 'mode', player: p, title: `${CARDS[defId].name}: choose one effect.`, options: ok.map(m => ({ id: m.id, label: m.label })), ctx: { defId } });
}
function aiPickMode(state: GameState, p: PlayerId, defId: string, modes: { id: string; label: string; ok: boolean }[]) {
  const op = state.players[other(p)];
  if (defId === 'ST12-015') { const small = op.units.filter(u => unitLevel(u) <= 2); if (modes.some(m => m.id === 'destroy') && small.some(u => u.pilot || unitAp(state, u, other(p)) >= 3 || state.battle?.attackerUid === u.card.uid)) return modes.find(m => m.id === 'destroy')!; return modes.find(m => m.id === 'ping') ?? modes[0]; }
  if (defId === 'ST14-013') { if (state.battle && modes.some(m => m.id === 'ap')) return modes.find(m => m.id === 'ap')!; return modes.find(m => m.id === 'rest') ?? modes[0]; }
  return modes[0];
}
function resolveMode(state: GameState, p: PlayerId, defId: string, mode: string) {
  const ps = state.players[p], op = other(p), enemies = state.players[op].units;
  const name = CARDS[defId].name;
  if (defId === 'ST12-015') {
    if (mode === 'destroy') chooseUnit(state, p, 'Two Unicorns: choose 1 enemy Unit of Lv.2 or lower. Destroy it.', enemies.filter(u => unitLevel(u) <= 2), { op: 'destroy' }, name);
    else { chooseUnit(state, p, 'Two Unicorns: choose 1 friendly Unit. Deal 2 damage to it.', ps.units, { op: 'damage', amount: 2 }, name); chooseUnit(state, p, 'Two Unicorns: choose 1 enemy Unit of Lv.5 or higher. Deal 2 damage to it.', enemies.filter(u => unitLevel(u) >= 5), { op: 'damage', amount: 2 }, name); }
  }
  if (defId === 'ST14-013') {
    if (mode === 'rest') chooseUnits(state, p, 'Natural Talent: choose 1 to 2 enemy Units with 3 or less HP. Rest them.', enemies.filter(u => unitHp(u) <= 3 && !u.rested), { op: 'rest' }, name, 2);
    else chooseUnit(state, p, 'Natural Talent: choose 1 enemy Unit. It gets AP-3 this turn.', enemies, { op: 'ap', amount: -3 }, name);
  }
}

/** The Final Victor / Qubeley: choose the two Units for a damage-step-only battle. */
function chooseClashUnit(state: GameState, actor: PlayerId, chooser: PlayerId, title: string, ctx: { source: string; step: 'mine' | 'theirs' | 'token' | 'enemy'; firstUid?: number }) {
  const cs = state.players[chooser];
  const pool = ctx.step === 'mine' ? state.players[actor].units : ctx.step === 'theirs' ? state.players[other(actor)].units : ctx.step === 'token' ? state.players[actor].units.filter(u => u.card.token) : state.players[other(actor)].units;
  if (!pool.length) { log(state, `${ctx.source}: no Unit to choose.`, 'effect', chooser); return; }
  if (cs.isAI) {
    let pick: UnitState;
    if (ctx.step === 'theirs' || ctx.step === 'enemy') {
      const first = findUnit(state, ctx.firstUid!)!;
      const fAp = unitAp(state, first.unit, first.owner), fHp = unitHp(first.unit);
      // Defender: a Unit that kills the attacker and survives; else the least valuable Unit. Attacker (Qubeley): a Unit the token kills, else the most valuable it can chip.
      if (ctx.step === 'theirs') pick = pool.find(u => unitAp(state, u, chooser) >= fHp && unitHp(u) > fAp) ?? [...pool].sort((a, b) => unitLevel(a) + unitHp(a) - unitLevel(b) - unitHp(b))[0];
      else pick = pool.filter(u => unitHp(u) <= fAp).sort((a, b) => unitLevel(b) - unitLevel(a))[0] ?? [...pool].sort((a, b) => unitAp(state, b, other(actor)) - unitAp(state, a, other(actor)))[0];
    } else pick = [...pool].sort((a, b) => unitAp(state, b, actor) + unitHp(b) - unitAp(state, a, actor) - unitHp(a))[0];
    resolveClashPick(state, actor, chooser, pick.card.uid, ctx);
    return;
  }
  pushChoice(state, { kind: 'clashPick', player: chooser, title, options: pool.map(u => unitOption(state, u, findUnit(state, u.card.uid)!.owner)), ctx: { ...ctx, actor } });
}
function resolveClashPick(state: GameState, actor: PlayerId, chooser: PlayerId, uid: number, ctx: { source: string; step: string; firstUid?: number }) {
  void chooser;
  if (ctx.step === 'mine') { log(state, `${ctx.source}: ${state.players[actor].name} chooses ${unitName(findUnit(state, uid)!.unit)}.`, 'effect', actor); chooseClashUnit(state, actor, other(actor), `${ctx.source}: ${unitName(findUnit(state, uid)!.unit)} challenges you. Choose 1 of your Units to battle it.`, { source: ctx.source, step: 'theirs', firstUid: uid }); return; }
  if (ctx.step === 'token') { chooseClashUnit(state, actor, actor, `${ctx.source}: choose 1 enemy Unit for ${unitName(findUnit(state, uid)!.unit)} to battle.`, { source: ctx.source, step: 'enemy', firstUid: uid }); return; }
  clash(state, actor, ctx.firstUid!, uid, ctx.source);
}

/** Final Duty: destroy one of your Units, then deploy a Unit of Lv.4 or lower from the top 4. */
function chooseFinalDuty(state: GameState, p: PlayerId) {
  const ps = state.players[p];
  if (!ps.units.length) return;
  if (ps.isAI) { const u = [...ps.units].sort((a, b) => unitAp(state, a, p) + unitHp(a) + (a.pilot ? 10 : 0) - unitAp(state, b, p) - unitHp(b) - (b.pilot ? 10 : 0))[0]; resolveFinalDuty(state, p, u.card.uid); return; }
  pushChoice(state, { kind: 'finalDuty', player: p, title: 'Final Duty: choose 1 of your Units to destroy. Then look at the top 4 cards and deploy a Unit of Lv.4 or lower.', options: ps.units.map(u => unitOption(state, u, p)), ctx: {} });
}
function resolveFinalDuty(state: GameState, p: PlayerId, uid: number) {
  const f = findUnit(state, uid);
  if (!f) return;
  log(state, `Final Duty: ${unitName(f.unit)} is destroyed.`, 'effect', p);
  destroyUnit(state, p, f.unit, false);
  lookTopPick(state, p, 4, c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level <= 4, 'Final Duty', 'deploy');
}

// ---------- Activate·Main effects ----------

export interface ActivateOption { uid: number; effectKey: string; label: string; cost: number; ok: boolean; reason?: string }

export function activateOptions(state: GameState, p: PlayerId): ActivateOption[] {
  const ps = state.players[p];
  const out: ActivateOption[] = [];
  if (state.phase !== 'main' || state.active !== p || state.battle || state.pending) return out;
  const spare = activeResources(ps);
  if (ps.base && !ps.base.isEx) {
    const b = ps.base, id = b.card.defId, uid = b.card.uid;
    if (id === 'ST01-015') {
      const used = !!state.turnFlags['whiteBase'];
      const n = ps.units.length;
      const token = n === 0 ? 'Gundam (3/3)' : n === 1 ? 'Guncannon (2/2)' : 'Guntank (1/1)';
      out.push({ uid, effectKey: 'whiteBase', label: `White Base ②: deploy a ${token} token`, cost: 2, ok: !used && spare >= 2, reason: used ? 'Once per turn' : 'Needs 2 active Resources' });
    }
    if (id === 'ST01-016') out.push({ uid, effectKey: 'asticassia', label: 'Asticassia: rest Base → Link Units get AP+1 this turn', cost: 0, ok: !b.rested && ps.units.some(isLinked), reason: b.rested ? 'Base is rested' : 'No Link Units in play' });
    if (id === 'ST04-015') { const used = !!state.turnFlags['archangel']; const has = ps.units.some(u => unitKeywords(u).blocker && u.rested); out.push({ uid, effectKey: 'archangel', label: 'Archangel ②: set a rested Blocker active (it can\'t attack this turn)', cost: 2, ok: !used && spare >= 2 && has, reason: used ? 'Once per turn' : !has ? 'No rested Blocker' : 'Needs 2 active Resources' }); }
    if (id === 'ST04-016') out.push({ uid, effectKey: 'vesalius', label: 'Vesalius: rest Base → a friendly Unit gets AP+1 this turn', cost: 0, ok: !b.rested && ps.units.length > 0, reason: b.rested ? 'Base is rested' : 'No Units' });
    if (id === 'ST05-015') { const has = ps.units.some(u => u.damage > 0); out.push({ uid, effectKey: 'isaribi', label: 'Isaribi: rest Base → a damaged Unit of yours gets AP+2 this turn', cost: 0, ok: !b.rested && has, reason: b.rested ? 'Base is rested' : 'No damaged Units' }); }
    if (id === 'ST06-014') { const has = ps.units.some(u => isLinked(u) && hasTrait(u, 'Clan')); out.push({ uid, effectKey: 'clanBattle', label: 'Clan Battle: rest Base → a friendly Unit gets AP+2 this turn', cost: 0, ok: !b.rested && has && ps.units.length > 0, reason: b.rested ? 'Base is rested' : 'Needs a (Clan) Link Unit in play' }); }
    if (id === 'ST08-015') { const used = !!state.turnFlags['davao']; const has = ps.units.some(u => u.damage > 0); out.push({ uid, effectKey: 'davao', label: 'Davao ②: a Unit of yours recovers 2 HP', cost: 2, ok: !used && spare >= 2 && has, reason: used ? 'Once per turn' : !has ? 'No damaged Units' : 'Needs 2 active Resources' }); }
    if (id === 'ST12-016') { const killed = !!state.turnFlags['pairedKill:' + p]; const has = state.players[other(p)].units.some(u => unitLevel(u) <= 4); out.push({ uid, effectKey: 'libra', label: 'Libra: rest Base → 1 damage to an enemy Unit of Lv.4 or lower', cost: 0, ok: !b.rested && killed && has, reason: b.rested ? 'Base is rested' : !killed ? 'A paired Unit of yours must destroy an enemy Unit in battle first this turn' : 'No enemy Unit of Lv.4 or lower' }); }
  }
  for (const u of ps.units) {
    const kw = unitKeywords(u);
    if (u.card.defId === 'ST02-006') {
      const used = u.usedThisTurn.includes('tallgeese');
      out.push({ uid: u.card.uid, effectKey: 'tallgeese', label: 'Tallgeese ④: set this Unit as active', cost: 4, ok: !used && u.rested && spare >= 4, reason: used ? 'Once per turn' : !u.rested ? 'Already active' : 'Needs 4 active Resources' });
    }
    if (kw.support) out.push({ uid: u.card.uid, effectKey: 'support', label: `${unitName(u)} <Support ${kw.support}>: rest it → another Unit gets AP+${kw.support}`, cost: 0, ok: !u.rested && ps.units.length > 1, reason: u.rested ? 'Already rested' : 'No other Unit' });
    if (u.card.defId === 'ST05-003') out.push({ uid: u.card.uid, effectKey: 'cgs', label: 'CGS Mobile Worker: rest it → 1 damage to a Unit of yours, it gets AP+1', cost: 0, ok: !u.rested && ps.units.some(t => unitHp(t) > 1 || t === u), reason: 'Already rested' });
    if (u.card.defId === 'ST09-001') { const has = ps.trash.some(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].name.includes('Impulse Gundam') && CARDS[c.defId].level >= 4); out.push({ uid: u.card.uid, effectKey: 'impulse', label: 'Impulse Gundam ②: return it to your deck → deploy an Impulse of Lv.4+ from your trash', cost: 2, ok: spare >= 2 && has, reason: !has ? 'No Impulse Gundam of Lv.4 or higher in your trash' : 'Needs 2 active Resources' }); }
    if (u.card.defId === 'ST12-006') { const fs = !!unitKeywords(u, state).firstStrike; out.push({ uid: u.card.uid, effectKey: 'bansheeFS', label: 'Banshee: exile 4 cards from your trash → <First Strike> this turn', cost: 0, ok: !!u.pilot && ps.trash.length >= 4 && !fs, reason: !u.pilot ? 'Needs a Pilot (During Pair)' : fs ? 'Already has First Strike' : 'Needs 4 cards in your trash' }); }
    if (u.card.defId === 'ST13-001') { const used = u.usedThisTurn.includes('qubeleyClash'); const tok = ps.units.some(t => t.card.token); const en = state.players[other(p)].units.length > 0; out.push({ uid: u.card.uid, effectKey: 'qubeley', label: 'Qubeley ①: one of your Unit tokens battles an enemy Unit (damage step only)', cost: 1, ok: !used && spare >= 1 && tok && en, reason: used ? 'Once per turn' : !tok ? 'No Unit token' : !en ? 'No enemy Unit' : 'Needs 1 active Resource' }); }
    if (u.card.defId === 'ST13-010') { const used = u.usedThisTurn.includes('redGundam79'); const tok = ps.units.some(t => t.card.token); out.push({ uid: u.card.uid, effectKey: 'redGundam79', label: 'Red Gundam (0079): destroy a friendly Unit token → <Breach 3> this turn', cost: 0, ok: !used && tok, reason: used ? 'Once per turn' : 'No Unit token to destroy' }); }
  }
  return out;
}

/** 【Activate･Action】 abilities usable by player p in the current action step. */
export interface ActionActivation { uid: number; effectKey: string; label: string }
export function actionActivations(state: GameState, p: PlayerId): ActionActivation[] {
  const out: ActionActivation[] = [];
  const b = state.battle;
  if (!b) return out;
  const ps = state.players[p], op = other(p);
  const atk = findUnit(state, b.attackerUid);
  const tgt = b.target !== 'player' ? findUnit(state, b.target) : null;
  for (const u of ps.units) {
    const battling = atk?.unit === u || tgt?.unit === u;
    const enemyBattling = atk && atk.owner !== p ? atk.unit : tgt && tgt.owner !== p ? tgt.unit : null;
    if (u.card.defId === 'ST12-006' && u.pilot && atk?.unit === u && b.target === 'player' && ps.trash.length >= 4 && !b.suppressionUids?.includes(u.card.uid)) out.push({ uid: u.card.uid, effectKey: 'bansheeSupp', label: 'Banshee: exile 4 cards from your trash → <Suppression> this battle' });
    if (u.pilot?.defId === 'ST12-011' && battling && enemyBattling && enemyBattling.damage > 0 && !u.usedThisTurn.includes('milliardo')) out.push({ uid: u.card.uid, effectKey: 'milliardo', label: `Milliardo Peacecraft: 2 damage to ${unitName(enemyBattling)}` });
    if (u.card.defId === 'ST13-006' && !u.usedThisTurn.includes('aerialAction') && ps.units.some(t => !t.rested) && state.players[op].units.some(t => unitLevel(t) <= 4)) out.push({ uid: u.card.uid, effectKey: 'aerialAction', label: 'Gundam Aerial: rest 1 friendly Unit → 1 damage to an enemy Unit of Lv.4 or lower' });
  }
  return out;
}
function activateAction(state: GameState, p: PlayerId, uid: number, effectKey: string) {
  const ps = state.players[p];
  const u = ps.units.find(x => x.card.uid === uid);
  if (!u) return;
  switch (effectKey) {
    case 'bansheeSupp': chooseTrashCards(state, p, 'Banshee 【Activate･Action】: exile 4 cards from your trash for <Suppression> this battle.', [...ps.trash], 4, 'bansheeSupp', { source: 'Banshee (Destroy Mode)', uid }, false); break;
    case 'milliardo': { u.usedThisTurn.push('milliardo'); const b = state.battle!; const atk = findUnit(state, b.attackerUid); const tgt = b.target !== 'player' ? findUnit(state, b.target) : null; const enemy = atk && atk.owner !== p ? atk : tgt && tgt.owner !== p ? tgt : null; if (enemy) { log(state, `Milliardo Peacecraft 【Activate･Action】: 2 damage to ${unitName(enemy.unit)}.`, 'effect', p); dealEffectDamage(state, enemy.owner, enemy.unit, 2, p, u.card.uid); } break; }
    case 'aerialAction': {
      u.usedThisTurn.push('aerialAction');
      const cands = ps.units.filter(t => !t.rested);
      if (ps.isAI) { const t = [...cands].sort((a, b) => (a.card.token ? 0 : 10) + unitAp(state, a, p) - (b.card.token ? 0 : 10) - unitAp(state, b, p))[0]; t.rested = true; log(state, `Gundam Aerial: ${ps.name} rests ${unitName(t)}.`, 'effect', p); chooseUnit(state, p, 'Gundam Aerial: choose 1 enemy Unit of Lv.4 or lower. Deal 1 damage to it.', state.players[other(p)].units.filter(e => unitLevel(e) <= 4), { op: 'damage', amount: 1 }, 'Gundam Aerial', false, u.card.uid); }
      else pushChoice(state, { kind: 'aerialRest', player: p, title: 'Gundam Aerial 【Activate･Action】: choose 1 friendly Unit to rest.', options: cands.map(t => unitOption(state, t, p)), ctx: { aerialUid: u.card.uid } });
      break;
    }
  }
}

function activateMain(state: GameState, p: PlayerId, uid: number, effectKey: string) {
  const ps = state.players[p];
  const opt = activateOptions(state, p).find(o => o.uid === uid && o.effectKey === effectKey);
  if (!opt?.ok) return;
  state.turnFlags.playedSomething = true;
  const unit = ps.units.find(x => x.card.uid === uid);
  switch (effectKey) {
    case 'whiteBase': {
      payCost(state, p, 2); state.turnFlags['whiteBase'] = true;
      const n = ps.units.length;
      log(state, `${ps.name} activates White Base.`, 'effect', p);
      deployToken(state, p, n === 0 ? 'T-001' : n === 1 ? 'T-002' : 'T-003');
      break;
    }
    case 'asticassia': ps.base!.rested = true; for (const u of ps.units) if (isLinked(u)) u.tempAp += 1; log(state, `${ps.name} rests Asticassia: Link Units get AP+1 this turn.`, 'effect', p); break;
    case 'tallgeese': payCost(state, p, 4); unit!.rested = false; unit!.usedThisTurn.push('tallgeese'); log(state, `${ps.name} pays 4: Tallgeese is set as active.`, 'effect', p); break;
    case 'archangel': payCost(state, p, 2); state.turnFlags['archangel'] = true; log(state, `${ps.name} activates Archangel.`, 'effect', p); chooseUnit(state, p, 'Archangel: choose a rested friendly Blocker to set active.', ps.units.filter(u => unitKeywords(u).blocker && u.rested), { op: 'reactivateNoAttack' }, 'Archangel'); break;
    case 'vesalius': ps.base!.rested = true; log(state, `${ps.name} rests Vesalius.`, 'effect', p); chooseUnit(state, p, 'Vesalius: choose 1 friendly Unit. It gets AP+1 this turn.', ps.units, { op: 'ap', amount: 1 }, 'Vesalius'); break;
    case 'isaribi': ps.base!.rested = true; log(state, `${ps.name} rests Isaribi.`, 'effect', p); chooseUnit(state, p, 'Isaribi: choose 1 damaged Unit of yours. It gets AP+2 this turn.', ps.units.filter(u => u.damage > 0), { op: 'ap', amount: 2 }, 'Isaribi'); break;
    case 'support': { const n = unitKeywords(unit!).support ?? 0; unit!.rested = true; log(state, `${ps.name} rests ${unitName(unit!)} for <Support ${n}>.`, 'effect', p); chooseUnit(state, p, `<Support ${n}>: choose 1 other friendly Unit. It gets AP+${n} this turn.`, ps.units.filter(u => u !== unit), { op: 'ap', amount: n }, `<Support ${n}>`); break; }
    case 'cgs': unit!.rested = true; log(state, `${ps.name} rests CGS Mobile Worker.`, 'effect', p); chooseUnit(state, p, 'CGS Mobile Worker: choose 1 of your Units. 1 damage to it; it gets AP+1 this turn.', ps.units, { op: 'selfDamageAp', amount: 1 }, 'CGS Mobile Worker'); break;
    case 'clanBattle': ps.base!.rested = true; log(state, `${ps.name} rests Clan Battle.`, 'effect', p); chooseUnit(state, p, 'Clan Battle: choose 1 friendly Unit. It gets AP+2 this turn.', ps.units, { op: 'ap', amount: 2 }, 'Clan Battle'); break;
    case 'davao': payCost(state, p, 2); state.turnFlags['davao'] = true; log(state, `${ps.name} activates Davao.`, 'effect', p); chooseUnit(state, p, 'Davao: choose 1 of your Units. It recovers 2 HP.', ps.units.filter(u => u.damage > 0), { op: 'recover', amount: 2 }, 'Davao'); break;
    case 'libra': ps.base!.rested = true; log(state, `${ps.name} rests Libra.`, 'effect', p); chooseUnit(state, p, 'Libra: choose 1 enemy Unit of Lv.4 or lower. Deal 1 damage to it.', state.players[other(p)].units.filter(u => unitLevel(u) <= 4), { op: 'damage', amount: 1 }, 'Libra'); break;
    case 'impulse': {
      payCost(state, p, 2);
      ps.units.splice(ps.units.indexOf(unit!), 1); ps.deck.push(unit!.card); if (unit!.pilot) ps.trash.push(unit!.pilot);
      log(state, `${ps.name} pays 2 and returns Impulse Gundam to the bottom of the deck.`, 'effect', p);
      chooseDeployFromTrash(state, p, 'Impulse Gundam: choose 1 Unit card with "Impulse Gundam" in its name of Lv.4 or higher in your trash. Deploy it.', ps.trash.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].name.includes('Impulse Gundam') && CARDS[c.defId].level >= 4), 'Impulse Gundam', { pay: false, rested: false });
      break;
    }
    case 'bansheeFS': chooseTrashCards(state, p, 'Banshee 【Activate･Main】: exile 4 cards from your trash for <First Strike> this turn.', [...ps.trash], 4, 'bansheeFS', { source: 'Banshee (Destroy Mode)', uid }, false); break;
    case 'qubeley': payCost(state, p, 1); unit!.usedThisTurn.push('qubeleyClash'); log(state, `${ps.name} pays 1 for Qubeley.`, 'effect', p); chooseClashUnit(state, p, p, 'Qubeley: choose 1 of your Unit tokens to battle.', { source: 'Qubeley', step: 'token' }); break;
    case 'redGundam79': {
      unit!.usedThisTurn.push('redGundam79');
      const toks = ps.units.filter(t => t.card.token);
      if (ps.isAI) { const t = [...toks].sort((a, b) => unitAp(state, a, p) + unitHp(a) - unitAp(state, b, p) - unitHp(b))[0]; log(state, `Red Gundam (0079): ${unitName(t)} is destroyed.`, 'effect', p); destroyUnit(state, p, t, false); applyUnitEffect(state, p, unit!, { op: 'breach', amount: 3 }, 'Red Gundam (0079)'); }
      else pushChoice(state, { kind: 'redGundamToken', player: p, title: 'Red Gundam (0079): choose 1 friendly Unit token to destroy. Red Gundam gains <Breach 3> this turn.', options: toks.map(t => unitOption(state, t, p)), ctx: { redUid: uid } });
      break;
    }
  }
}

// ---------- damage & destruction ----------

function dealEffectDamage(state: GameState, owner: PlayerId, u: UnitState, n: number, from?: PlayerId, srcUid: number | null = null) {
  const enemyDamage = from === undefined || from !== owner;
  // Acguy: during the opponent's turn, while rested, friendly (Marine) Units with 2 or less HP can't receive enemy effect damage
  if (enemyDamage && state.active !== owner && hasTrait(u, 'Marine') && unitMaxHp(u) <= 2 && state.players[owner].units.some(a => a.card.defId === 'ST11-002' && a.rested)) { log(state, `Acguy: ${unitName(u)} can't receive enemy effect damage.`, 'effect', owner); return; }
  u.damage += n;
  if (unitHp(u) <= 0) {
    destroyUnit(state, owner, u, false);
    if (enemyDamage && state.battle) { // Suletta Mercury: once per turn, an enemy Unit destroyed by effect damage while her Unit attacks draws a card
      const atk = findUnit(state, state.battle.attackerUid);
      if (atk && atk.owner !== owner && atk.unit.pilot?.defId === 'ST13-012' && !atk.unit.usedThisTurn.includes('suletta13')) { atk.unit.usedThisTurn.push('suletta13'); log(state, 'Suletta Mercury: an enemy Unit was destroyed by effect damage while attacking, draw 1.', 'effect', atk.owner); effectDraw(state, atk.owner, 1); }
    }
    if (enemyDamage && srcUid !== null) { const src = findUnit(state, srcUid); const srcOwner = src?.owner ?? from; if (srcOwner && srcOwner !== owner) { const killer = src?.unit ?? lastKnownUnit(state, srcUid); if (killer) onKillByUnit(state, killer, srcOwner, false); } }
  }
}
/** Units keep triggering "when this Unit destroys" even if they just left play: remember the last seen state by uid. */
const unitMemo = new Map<number, UnitState>();
function lastKnownUnit(_state: GameState, uid: number): UnitState | undefined { return unitMemo.get(uid); }

function destroyUnit(state: GameState, owner: PlayerId, u: UnitState, byBattle: boolean) {
  const ps = state.players[owner];
  const idx = ps.units.indexOf(u);
  if (idx < 0) return;
  ps.units.splice(idx, 1);
  if (!u.card.token) ps.trash.push(u.card);
  if (u.pilot) ps.trash.push(u.pilot);
  state.stats[owner].unitsLost++;
  state.stats[other(owner)].unitsDestroyed++;
  unitMemo.set(u.card.uid, u);
  log(state, `${unitName(u)} is destroyed.`, 'damage', owner);
  onDestroyed(state, owner, u);
  void byBattle;
}

/** 【Destroyed】 triggers, resolved from the trash. */
function onDestroyed(state: GameState, owner: PlayerId, u: UnitState) {
  const ps = state.players[owner];
  const op = other(owner);
  switch (u.card.defId) {
    case 'ST03-006': { // Char's Zaku II: look at top 3, may add a (Zeon)/(Neo Zeon) Unit
      const top = ps.deck.slice(0, 3);
      if (!top.length) break;
      const cands = top.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].traits.some(t => t === 'Zeon' || t === 'Neo Zeon'));
      log(state, `Char's Zaku Ⅱ 【Destroyed】: ${ps.name} looks at the top ${top.length} cards.`, 'effect', owner);
      if (ps.isAI) { const pick = [...cands].sort((a, b) => CARDS[b.defId].level - CARDS[a.defId].level)[0] ?? null; lookTopResolve(state, owner, top, pick); }
      else pushChoice(state, { kind: 'lookTop', player: owner, title: "Char's Zaku Ⅱ 【Destroyed】: top 3 cards. Add a (Zeon)/(Neo Zeon) Unit to your hand?", description: `Top cards: ${top.map(c => CARDS[c.defId].name).join(', ')}. The rest go to the bottom of your deck in random order.`, options: [...cands.map(c => ({ id: `deck:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].ap} AP / ${CARDS[c.defId].hp} HP` })), { id: 'pass', label: 'Take none' }], optional: true, ctx: { uids: top.map(c => c.uid) } });
      break;
    }
    case 'ST04-009': // Miguel's Ginn: During Pair + Destroyed, if another Link Unit in play draw 1
      if (u.pilot && ps.units.some(isLinked)) { log(state, "Miguel's Ginn 【Destroyed】: draw 1.", 'effect', owner); effectDraw(state, owner, 1); }
      break;
    case 'ST05-005': chooseUnit(state, owner, 'Gundam Gusion Rebake 【Destroyed】: choose 1 enemy Unit with 4 or less AP to rest.', state.players[op].units.filter(t => unitAp(state, t, op) <= 4 && !t.rested), { op: 'rest' }, 'Gundam Gusion Rebake'); break;
    case 'ST09-002': fromTrashToHand(state, owner, 'Force Impulse Gundam 【Destroyed】: choose 1 (Minerva Squad) Unit card (not Force Impulse) in your trash to add to your hand.', ps.trash.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].traits.includes('Minerva Squad') && !CARDS[c.defId].name.includes('Force Impulse Gundam')), 'Force Impulse Gundam'); break;
    case 'ST11-009': if (state.active !== owner && ps.units.some(t => hasTrait(t, 'Marine'))) { log(state, "Kapool 【Destroyed】: it is the opponent's turn and a (Marine) Unit is in play, draw 1.", 'effect', owner); effectDraw(state, owner, 1); } break;
    case 'ST12-009': if (state.players.p1.shields.length <= 3 || state.players.p2.shields.length <= 3) fromTrashToHand(state, owner, 'Banshee (Unicorn Mode) 【Destroyed】: choose 1 Unit card of Lv.6 or higher in your trash to add to your hand. Then discard 1.', ps.trash.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level >= 6), 'Banshee (Unicorn Mode)', true); break;
    case 'ST14-009': log(state, 'Duel Gundam (Assault Shroud) 【Destroyed】: place 1 EX Resource.', 'effect', owner); addExResource(state, owner); break;
  }
  if (u.pilot?.defId === 'ST07-010' && state.active !== owner && hasTrait(u, 'CB')) { log(state, "Tieria Erde 【Destroyed】: it is the opponent's turn, draw 1.", 'effect', owner); effectDraw(state, owner, 1); }
}

function lookTopResolve(state: GameState, p: PlayerId, top: CardInstance[], pick: CardInstance | null, mode: 'hand' | 'deploy' = 'hand') {
  const ps = state.players[p];
  for (const c of top) { const i = ps.deck.indexOf(c); if (i >= 0) ps.deck.splice(i, 1); }
  const rest = shuffle(top.filter(c => c !== pick));
  ps.deck.push(...rest);
  if (pick && mode === 'deploy') { log(state, `${ps.name} deploys ${cardName(pick)} from the top of the deck.`, 'effect', p); deployUnit(state, p, pick); }
  else if (pick) { ps.hand.push(pick); log(state, `${ps.name} adds ${cardName(pick)} to hand.`, 'effect', p); }
}

/** Damage to the first card in a player's shield area (Base, else top Shield). */
function damageShieldArea(state: GameState, target: PlayerId, amount: number, sourceLabel: string, opts: { battle: boolean; attackerLevel?: number; suppression?: boolean; attackerIsToken?: boolean }): { destroyed: boolean } {
  const ps = state.players[target];
  if (opts.battle && state.battle?.shieldProtectLvMax !== undefined && opts.attackerLevel !== undefined && opts.attackerLevel <= state.battle.shieldProtectLvMax) {
    log(state, `Peaceful Timbre: ${ps.name}'s shield area can't be damaged by a Lv.${opts.attackerLevel} Unit.`, 'effect', target);
    return { destroyed: false };
  }
  if (!opts.battle && state.turnFlags['shambloShield:' + target] && amount > 0) {
    const n = Math.max(0, amount - 5);
    log(state, `Shamblo reduces the ${amount} effect damage to ${ps.name}'s shield area by 5${n ? '' : ': no damage'}.`, 'effect', target);
    if (n === 0) return { destroyed: false };
    amount = n;
  }
  if (ps.base) {
    if (opts.battle && ps.base.card.defId === 'ST07-015' && opts.attackerLevel !== undefined && opts.attackerLevel <= 3 && !opts.attackerIsToken && ps.units.some(u => u.rested && hasTrait(u, 'CB'))) {
      log(state, `Ptolemaios can't be damaged by a Lv.${opts.attackerLevel} Unit while a rested (CB) Unit is in play.`, 'effect', target);
      return { destroyed: false };
    }
    ps.base.damage += amount;
    log(state, `${sourceLabel} deals ${amount} damage to ${cardName(ps.base.card)} (${Math.max(0, baseHp(ps.base))}/${baseMaxHp(ps.base)} HP).`, 'damage', target);
    if (baseHp(ps.base) <= 0) {
      if (!ps.base.isEx) ps.trash.push(ps.base.card);
      log(state, `${cardName(ps.base.card)} is destroyed!`, 'damage', target);
      ps.base = null;
      return { destroyed: true };
    }
    return { destroyed: false };
  }
  if (ps.shields.length) {
    if (amount <= 0) { log(state, `${sourceLabel} has 0 AP: the Shield is not destroyed.`, 'damage', target); return { destroyed: false }; }
    const count = opts.battle && opts.suppression ? Math.min(2, ps.shields.length) : 1;
    const broken = ps.shields.splice(0, count);
    state.stats[other(target)].shieldsBroken += broken.length;
    if (count === 2) log(state, `<Suppression>: two Shields are destroyed at once!`, 'effect', target);
    for (const s of broken) {
      log(state, `${sourceLabel} destroys a Shield: it was ${CARDS[s.defId].name}. (${ps.shields.length} Shields left)`, 'damage', target);
      handleBurst(state, target, s);
    }
    return { destroyed: true };
  }
  if (opts.battle) {
    if (amount <= 0) { log(state, `${sourceLabel} has 0 AP and deals no damage.`, 'damage', target); return { destroyed: false }; }
    defeat(state, target, 'took battle damage with no Shields or Base left');
    return { destroyed: true };
  }
  return { destroyed: false };
}

function handleBurst(state: GameState, owner: PlayerId, card: CardInstance) {
  const ps = state.players[owner];
  const d = CARDS[card.defId];
  if (!d.text.includes('【Burst】')) { ps.trash.push(card); return; }
  const burstLine = d.text.split('\n').find(l => l.startsWith('【Burst】')) ?? '';
  const desc = d.type === 'PILOT' ? 'Add this card to your hand.' : d.type === 'BASE' ? 'Deploy this card as your Base (replacing any current Base). Its 【Deploy】 then adds a Shield to your hand.' : burstLine.replace('【Burst】', '');
  if (ps.isAI) resolveBurst(state, owner, card, true);
  else {
    pushChoice(state, { kind: 'burst', player: owner, title: `【Burst】 ${d.name}`, description: desc, options: [{ id: 'yes', label: 'Activate Burst' }, { id: 'no', label: 'Decline (card goes to trash)' }], ctx: { cardUid: card.uid } });
    state.holding.push(card);
  }
}

function burstLineOf(d: CardDef): string { return d.text.split('\n').find(l => l.startsWith('【Burst】')) ?? ''; }
function resolveBurst(state: GameState, owner: PlayerId, card: CardInstance, activate: boolean) {
  const ps = state.players[owner];
  const op = other(owner);
  const d = CARDS[card.defId];
  if (!activate) { ps.trash.push(card); log(state, `${ps.name} declines the Burst.`, 'effect', owner); return; }
  log(state, `${ps.name} activates 【Burst】 ${d.name}.`, 'effect', owner);
  if (d.type === 'PILOT') { ps.hand.push(card); log(state, `${d.name} is added to hand.`, 'effect', owner); return; }
  if (d.type === 'BASE') { deployBase(state, owner, card, true); return; }
  if (burstLineOf(d).includes('Add this card to your hand')) { ps.hand.push(card); log(state, `${d.name} is added to hand.`, 'effect', owner); return; }
  ps.trash.push(card);
  // Commands whose Burst differs from their Main
  if (d.id === 'GD01-111') { chooseUnit(state, owner, 'Battle of Aces 【Burst】: choose 1 enemy Unit. Deal 2 damage to it.', state.players[op].units, { op: 'damage', amount: 2 }, 'Battle of Aces'); return; }
  if (d.id === 'ST11-013') { chooseUnit(state, owner, "Poorly Planned Offensive 【Burst】: choose 1 rested enemy Unit with 3 or less HP. Return it to its owner's hand.", state.players[op].units.filter(u => u.rested && unitHp(u) <= 3), { op: 'bounce' }, 'Poorly Planned Offensive'); return; }
  if (d.id === 'ST12-013') { chooseUnit(state, owner, 'The Final Victor 【Burst】: choose 1 enemy Unit. Deal 1 damage to it.', state.players[op].units, { op: 'damage', amount: 1 }, 'The Final Victor'); return; }
  if (d.id === 'ST14-013') { chooseUnit(state, owner, 'Natural Talent 【Burst】: choose 1 enemy Unit. It gets AP-3 this turn.', state.players[op].units, { op: 'ap', amount: -3 }, 'Natural Talent'); return; }
  if (d.id === 'ST14-015') { log(state, 'Battlefield Emotions 【Burst】: place 1 EX Resource.', 'effect', owner); addExResource(state, owner); return; }
  if (d.id === 'ST04-012') { if (!ps.units.some(u => u.card.token && u.card.token.traits.includes('Earth Alliance'))) deployToken(state, owner, 'T-008'); else log(state, 'Striker Pack Burst: an Earth Alliance token is already in play.', 'effect', owner); return; }
  if (d.id === 'ST05-014') { chooseUnit(state, owner, 'Fatal Strike 【Burst】: choose 1 enemy Unit. Deal 1 damage to it.', state.players[op].units, { op: 'damage', amount: 1 }, 'Fatal Strike'); return; }
  if (d.id === 'ST07-013') { log(state, 'Armed Intervention 【Burst】: draw 1.', 'effect', owner); effectDraw(state, owner, 1); return; }
  const targets = commandTargets(state, owner, d.id);
  if (targets && targets.length === 0) { log(state, `No valid target for ${d.name}.`, 'effect', owner); return; }
  resolveCommand(state, owner, d.id);
}

// ---------- attacking & battle ----------

export interface AttackTarget { id: 'player' | number; label: string; detail?: string }

export function attackTargets(state: GameState, p: PlayerId, u: UnitState): AttackTarget[] {
  const op = state.players[other(p)];
  const out: AttackTarget[] = [];
  if (canAttackPlayer(u)) {
    const shieldArea = op.base ? `Base ${cardName(op.base.card)} (${baseHp(op.base)} HP)` : op.shields.length ? `${op.shields.length} Shield${op.shields.length > 1 ? 's' : ''}` : 'NO SHIELDS — lethal!';
    out.push({ id: 'player', label: `Attack ${op.name}`, detail: shieldArea });
  }
  const f = u.flags?.canTargetActive;
  for (const t of op.units) {
    if (isUntargetable(state, t, other(p))) continue;
    const detail = `${unitAp(state, t, other(p))} AP / ${unitHp(t)} HP`;
    if (t.rested) out.push({ id: t.card.uid, label: `Attack ${unitName(t)} (rested)`, detail });
    else if (u.card.defId === 'ST02-001' && unitLevel(t) <= 4) out.push({ id: t.card.uid, label: `Attack ${unitName(t)} (active, Lv.${unitLevel(t)})`, detail: `${detail} · Wing Gundam may target active Lv.4-or-lower Units` });
    else if (f && (f.maxLv === undefined || unitLevel(t) <= f.maxLv) && (f.maxAp === undefined || unitAp(state, t, other(p)) <= f.maxAp) && (!f.damagedOnly || t.damage > 0)) out.push({ id: t.card.uid, label: `Attack ${unitName(t)} (active)`, detail: `${detail} · allowed by an effect this turn` });
  }
  return out;
}

function declareAttack(state: GameState, p: PlayerId, attackerUid: number, target: 'player' | number) {
  if (state.phase !== 'main' || state.active !== p || state.battle || state.pending) return;
  const ps = state.players[p];
  const op = other(p);
  const u = ps.units.find(x => x.card.uid === attackerUid);
  if (!u || !canAttackThisTurn(state, u)) return;
  if (!attackTargets(state, p, u).some(t => t.id === target)) return;
  u.rested = true;
  state.stats[p].attacksDeclared++;
  state.turnFlags.attacked = true;
  state.battle = { attackerUid, target, originalTarget: target, step: 'attack', blocked: false };
  const tLabel = target === 'player' ? state.players[op].name : unitName(findUnit(state, target)!.unit);
  log(state, `${unitName(u)} (${unitAp(state, u, p)} AP) attacks ${tLabel}.`, 'attack', p);
  // 【Attack】 effects (unit side)
  switch (u.card.defId) {
    case 'ST03-008': applyUnitEffect(state, p, u, { op: 'ap', amount: 2 }, 'Zaku Ⅱ 【Attack】'); break;
    case 'ST04-006': if (unitAp(state, u, p) >= 5) chooseUnit(state, p, 'Aegis Gundam 【Attack】: choose 1 enemy Unit of Lv.5 or higher. Deal 3 damage to it.', state.players[op].units.filter(t => unitLevel(t) >= 5), { op: 'damage', amount: 3 }, 'Aegis Gundam'); break;
    case 'ST06-005': chooseUnits(state, p, 'Red Gundam 【Attack】: choose 1 to 2 friendly (Clan) Units. They get AP+2 this turn.', ps.units.filter(t => hasTrait(t, 'Clan')), { op: 'ap', amount: 2 }, 'Red Gundam', 2); break;
    case 'ST08-004': if (target !== 'player') chooseUnit(state, p, 'Messer Type-F01 【Attack】: choose 1 enemy Unit. Deal 1 damage to it.', state.players[op].units, { op: 'damage', amount: 1 }, 'Messer Type-F01'); break;
    case 'ST12-005': { // GQuuuuuuX (Omega Psycommu): may discard 1 to draw 1
      if (!ps.hand.length) break;
      if (ps.isAI) { const dead = ps.hand.filter(c => CARDS[c.defId].level > playerLevel(ps) + 2 || (CARDS[c.defId].type === 'PILOT' && !ps.units.some(t => !t.pilot))); if (dead.length) { const c = dead[0]; ps.hand.splice(ps.hand.indexOf(c), 1); ps.trash.push(c); log(state, `GQuuuuuuX 【Attack】: discards ${cardName(c)}, draws 1.`, 'effect', p); effectDraw(state, p, 1); } }
      else pushChoice(state, { kind: 'discardDraw', player: p, title: 'GQuuuuuuX (Omega Psycommu) 【Attack】: discard 1 card to draw 1?', options: [...ps.hand.map(c => ({ id: `hand:${c.uid}`, label: cardName(c), detail: `Lv.${CARDS[c.defId].level} · ${CARDS[c.defId].type}`, ref: { kind: 'hand' as const, uid: c.uid, owner: p } })), { id: 'pass', label: 'Keep my hand' }], optional: true, ctx: {} });
      break;
    }
    case 'ST13-006': if (u.pilot && target === 'player') chooseUnit(state, p, 'Gundam Aerial 【During Pair】【Attack】: choose 1 enemy Unit. Deal 2 damage to it.', state.players[op].units, { op: 'damage', amount: 2 }, 'Gundam Aerial', false, u.card.uid); break;
    case 'ST13-009': enemyExilesFromTrash(state, p, 2, 'Gundam Pharact 【Attack】'); break;
    case 'ST08-006': if (u.pilot && target === 'player' && !u.usedThisTurn.includes('penelope')) {
      const cands = ps.hand.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].traits.includes('Earth Federation'));
      if (cands.length) {
        u.usedThisTurn.push('penelope');
        if (ps.isAI) { if (ps.hand.length >= 2) { const c = [...cands].sort((a, b) => CARDS[b.defId].level - CARDS[a.defId].level)[0]; ps.hand.splice(ps.hand.indexOf(c), 1); ps.deck.push(c); log(state, `Penelope 【Attack】: ${cardName(c)} returns to the bottom of the deck; draw 2.`, 'effect', p); effectDraw(state, p, 2); } }
        else pushChoice(state, { kind: 'penelope', player: p, title: 'Penelope 【Attack】: return 1 (Earth Federation) Unit card from your hand to the bottom of your deck to draw 2?', options: [...cands.map(c => ({ id: `hand:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level}`, ref: { kind: 'hand' as const, uid: c.uid, owner: p } })), { id: 'pass', label: 'Skip' }], optional: true, ctx: {} });
      }
    } break;
  }
  // 【Attack】 effects (pilot side)
  switch (u.pilot?.defId) {
    case 'ST01-011': if (!u.usedThisTurn.includes('suletta')) { const r = ps.resources.find(r => r.rested); if (r) { u.usedThisTurn.push('suletta'); r.rested = false; state.turnFlags['resActivated:' + p] = true; log(state, 'Suletta Mercury 【Attack】: 1 Resource is set as active.', 'effect', p); } } break;
    case 'ST09-008': if (hasTrait(u, 'Minerva Squad')) { const r = ps.resources.find(r => r.rested); if (r) { r.rested = false; state.turnFlags['resActivated:' + p] = true; log(state, 'Shinn Asuka 【Attack】: 1 Resource is set as active.', 'effect', p); } } break;
    case 'ST14-011': { const n = state.players[op].units.filter(t => t.rested).length; if (n > 0) chooseUnit(state, p, `Paptimus Scirocco 【Attack】: choose 1 enemy Unit. It gets AP-${n} this battle (${n} rested enemy Unit${n > 1 ? 's' : ''}).`, state.players[op].units, { op: 'apBattle', amount: -n }, 'Paptimus Scirocco'); else log(state, 'Paptimus Scirocco 【Attack】: no rested enemy Units, no AP reduction.', 'effect', p); break; }
    case 'ST03-011': applyUnitEffect(state, p, u, { op: 'ap', amount: 1 }, 'Char Aznable 【Attack】'); if (isLinked(u)) { u.tempKeywords.highManeuver = true; log(state, "Char Aznable: Link Unit gains <High-Maneuver> (can't be blocked).", 'effect', p); } break;
    case 'ST04-010': chooseUnit(state, p, 'Kira Yamato 【Attack】: choose 1 enemy Unit. It gets AP-2 during this battle.', state.players[op].units, { op: 'apBattle', amount: -2 }, 'Kira Yamato'); break;
    case 'ST07-009': {
      if (ps.trash.filter(c => CARDS[c.defId].traits.includes('CB')).length >= 7) { for (const t of ps.units) if (hasTrait(t, 'CB')) t.tempAp += 1; log(state, 'Setsuna F. Seiei 【Attack】: 7+ (CB) cards in the trash, all your (CB) Units get AP+1 this turn.', 'effect', p); }
      else applyUnitEffect(state, p, u, { op: 'ap', amount: 1 }, 'Setsuna F. Seiei 【Attack】');
      break;
    }
    case 'ST06-010': if (isLinked(u) && ps.units.some(t => hasTrait(t, 'Clan')) && ps.deck.length) {
      const top = ps.deck[0];
      if (ps.isAI) { const playable = CARDS[top.defId].level <= playerLevel(ps) + 1; if (!playable) { ps.deck.shift(); ps.deck.push(top); } log(state, `Shuji Itō 【Attack】: looks at the top card and ${playable ? 'keeps it on top' : 'puts it on the bottom'}.`, 'effect', p); }
      else pushChoice(state, { kind: 'topKeep', player: p, title: `Shuji Itō 【Attack】: the top card of your deck is ${CARDS[top.defId].name}. Keep it on top or put it on the bottom?`, options: [{ id: 'top', label: `Keep ${CARDS[top.defId].name} on top` }, { id: 'bottom', label: 'Put it on the bottom' }], ctx: {} });
    } break;
  }
  if (state.pending) return; // resume in resolveChoice
  continueBattle(state);
}

/** Advance the battle through its steps, pausing for pending choices. */
function continueBattle(state: GameState) {
  const b = state.battle;
  if (!b || state.winner) return;
  const atk = findUnit(state, b.attackerUid);
  const defender = other(state.active);
  if (!atk) { log(state, 'The attacker left the battle area; the battle ends.', 'attack'); endBattle(state); return; }
  if (b.target !== 'player' && !findUnit(state, b.target)) { log(state, 'The attack target left the battle area; the battle ends.', 'attack'); endBattle(state); return; }

  if (b.step === 'attack') {
    b.step = 'block';
    const kw = unitKeywords(atk.unit);
    const blockers = state.players[defender].units.filter(t => unitKeywords(t, state).blocker && !t.rested && t.card.uid !== b.target);
    if (blockers.length && kw.highManeuver) log(state, `<High-Maneuver>: ${unitName(atk.unit)} can't be blocked.`, 'effect', state.active);
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
    b.passes = 0; b.actor = defender;
    if (runActionStep(state)) return;
  }
  if (b.step === 'action') {
    b.step = 'damage';
    // 8-4-2: if the attacker or its target left the battle area during the action step, skip to battle end.
    if (!findUnit(state, b.attackerUid) || (b.target !== 'player' && !findUnit(state, b.target))) {
      log(state, 'A battling Unit left the battle area; no damage is dealt.', 'attack');
      endBattle(state); return;
    }
    damageStep(state);
    if (state.pending) return;
  }
  if (b.step === 'damage') endBattle(state);
}

/** Returns true if waiting on a human decision. */
function runActionStep(state: GameState): boolean {
  const b = state.battle!;
  while ((b.passes ?? 0) < 2) {
    const p = b.actor!;
    const ps = state.players[p];
    if (b.target !== 'player' && !findUnit(state, b.target)) return false; // target bounced/destroyed mid-step
    const playable = actionCommands(state, p);
    const acts = actionActivations(state, p);
    if (playable.length === 0 && acts.length === 0) { b.passes!++; b.actor = other(p); continue; }
    if (ps.isAI) {
      const act = aiActionActivation(state, p, acts);
      if (act) { log(state, `${act.a.label}: ${act.reason}`, 'ai', p); activateAction(state, p, act.a.uid, act.a.effectKey); b.passes = 0; b.actor = other(p); if (state.pending) return false; continue; }
      const pick = aiActionDecision(state, p, playable);
      if (pick) { log(state, `Plays ${CARDS[pick.card.defId].name} in the action step: ${pick.reason}`, 'ai', p); playActionCommand(state, p, pick.card.uid); b.passes = 0; } else b.passes!++;
      b.actor = other(p);
      continue;
    }
    pushChoice(state, {
      kind: 'actionStep', player: p, title: 'Action step: play an 【Action】 Command or activate an 【Activate･Action】 effect?',
      description: 'During a battle, the defender gets the first chance to act, then the attacker. Effects apply before damage is dealt.',
      options: [...playable.map(c => ({ id: `hand:${c.uid}`, label: `Play ${CARDS[c.defId].name}`, detail: CARDS[c.defId].text.split('\n').find(l => l.includes('【Action】')), ref: { kind: 'hand' as const, uid: c.uid, owner: p } })), ...acts.map(a => ({ id: `act:${a.uid}:${a.effectKey}`, label: a.label })), { id: 'pass', label: 'Pass' }],
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

function isImmune(state: GameState, u: UnitState, fromAp: number, from?: UnitState): boolean {
  if (state.battle?.immune?.some(i => i.uid === u.card.uid && fromAp <= i.apMax)) return true;
  if (from && u.flags?.immuneFromLvMax !== undefined && unitLevel(from) <= u.flags.immuneFromLvMax) return true;
  // Allelujah Haptism: during your turn, while you have a (CB) Link Unit, this Unit can't be damaged by Units with 3 or less AP
  const f = findUnit(state, u.card.uid);
  if (f && u.pilot?.defId === 'ST07-012' && state.active === f.owner && fromAp <= 3 && state.players[f.owner].units.some(x => isLinked(x) && hasTrait(x, 'CB'))) return true;
  return false;
}

function damageStep(state: GameState) {
  const b = state.battle!;
  const atk = findUnit(state, b.attackerUid)!;
  const p = atk.owner, op = other(p);
  const ap = unitAp(state, atk.unit, p);
  const kw = unitKeywords(atk.unit, state);
  if (b.target === 'player') {
    const r = damageShieldArea(state, op, ap, unitName(atk.unit), { battle: true, attackerLevel: unitLevel(atk.unit), suppression: kw.suppression, attackerIsToken: !!atk.unit.card.token });
    if (r.destroyed && atk.unit.card.defId === 'ST03-001' && state.active === p && !state.winner) {
      chooseUnit(state, p, 'Sinanju: destroyed a shield area card. Choose 1 enemy Unit. Deal 2 damage to it.', state.players[op].units, { op: 'damage', amount: 2 }, 'Sinanju');
    }
    if (r.destroyed && atk.unit.card.defId === 'ST10-001' && !state.winner) { atk.unit.rested = false; (atk.unit.flags ??= {}).cantTargetPlayer = true; log(state, "Zeta Gundam (EX) is set as active after breaking a shield area card. It can't attack the player again this turn.", 'effect', p); }
    return;
  }
  const tgt = findUnit(state, b.target)!;
  const tAp = unitAp(state, tgt.unit, op);
  const tName = unitName(tgt.unit), aName = unitName(atk.unit);
  const dmgToTarget = incomingBattleDamage(state, tgt.unit, op, atk.unit, ap);
  const dmgToAttacker = incomingBattleDamage(state, atk.unit, p, tgt.unit, tAp);
  let attackerDestroyed = false, targetDestroyed = false;
  if (kw.firstStrike) {
    tgt.unit.damage += dmgToTarget;
    log(state, `<First Strike> ${aName} deals ${dmgToTarget} to ${tName} first.`, 'damage', p);
    if (unitHp(tgt.unit) <= 0) targetDestroyed = true;
    else { atk.unit.damage += dmgToAttacker; log(state, `${tName} deals ${dmgToAttacker} back to ${aName}.`, 'damage', p); }
  } else {
    tgt.unit.damage += dmgToTarget;
    atk.unit.damage += dmgToAttacker;
    log(state, `${aName} deals ${dmgToTarget} to ${tName}; ${tName} deals ${dmgToAttacker} to ${aName}.`, 'damage', p);
    targetDestroyed = unitHp(tgt.unit) <= 0;
  }
  attackerDestroyed = unitHp(atk.unit) <= 0;
  // Snapshot attacker info before destruction (its effects still resolve)
  const atkUnit = atk.unit;
  if (targetDestroyed) destroyUnit(state, op, tgt.unit, true);
  if (attackerDestroyed) destroyUnit(state, p, atkUnit, true);
  if (attackerDestroyed && !targetDestroyed && state.active !== op) { /* defender kills attacker on the attacker's turn: no 'your turn' triggers */ }
  if (targetDestroyed) onKillByUnit(state, atkUnit, p, true);
  if (targetDestroyed && state.active === p) {
    if (kw.breach && (state.players[op].base || state.players[op].shields.length)) {
      log(state, `<Breach ${kw.breach}> triggers!`, 'effect', p);
      damageShieldArea(state, op, kw.breach, `<Breach ${kw.breach}>`, { battle: false });
    }
    if (atkUnit.card.defId === 'ST02-003' && atkUnit.pilot) {
      log(state, 'Gundam Heavyarms 【During Pair】: 1 damage to all enemy Units Lv.3 or lower.', 'effect', p);
      for (const e of [...state.players[op].units]) if (unitLevel(e) <= 3) dealEffectDamage(state, op, e, 1);
    }
    if (atkUnit.pilot?.defId === 'ST02-011' && isLinked(atkUnit)) { log(state, 'Zechs Merquise 【During Link】: draw 1.', 'effect', p); effectDraw(state, p, 1); }
    if (atkUnit.card.defId === 'ST07-005' && findUnit(state, atkUnit.card.uid) && atkUnit.damage > 0) { const before = atkUnit.damage; atkUnit.damage = Math.max(0, atkUnit.damage - 2); log(state, `Gundam Dynames recovers ${before - atkUnit.damage} HP after the kill.`, 'effect', p); }
    if (atkUnit.pilot?.defId === 'ST05-011' && isLinked(atkUnit)) { // Akihiro: Tekkadan Unit Lv<=2 from trash to hand
      const ps = state.players[p];
      const cands = ps.trash.filter(c => CARDS[c.defId].type === 'UNIT' && CARDS[c.defId].level <= 2 && CARDS[c.defId].traits.includes('Tekkadan'));
      if (cands.length) {
        if (ps.isAI) { const c = cands[cands.length - 1]; ps.trash.splice(ps.trash.indexOf(c), 1); ps.hand.push(c); log(state, `Akihiro Altland 【During Link】: ${cardName(c)} returns from the trash to hand.`, 'effect', p); }
        else pushChoice(state, { kind: 'fromTrash', player: p, title: 'Akihiro Altland 【During Link】: choose a (Tekkadan) Unit of Lv.2 or lower in your trash to add to your hand.', options: cands.map(c => ({ id: `trash:${c.uid}`, label: CARDS[c.defId].name, detail: `Lv.${CARDS[c.defId].level}` })), ctx: {} });
      }
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
  const lvl = state.botLevelByPlayer?.[defender] ?? state.botLevel;
  const strong = lvl !== 'basic';
  const heroic = blockers.filter(bl => unitAp(state, bl, defender) >= atkHp && unitHp(bl) > atkAp);
  if (heroic.length) return { unit: heroic[0], reason: `it destroys ${aName} (${atkHp} HP) and survives its ${atkAp} AP.` };
  // A blocker that survives without killing still saves the shield/unit for free (advanced+).
  const freeWall = strong ? blockers.filter(bl => unitHp(bl) > atkAp && !bl.pilot) : [];
  if (b.target === 'player') {
    const shieldsLeft = ps.shields.length + (ps.base ? 1 : 0);
    const trade = blockers.filter(bl => unitAp(state, bl, defender) >= atkHp);
    if (trade.length) return { unit: trade[0], reason: `it trades with ${aName}, and a Unit for a Unit is better than losing a Shield.` };
    if (freeWall.length && !ps.base) return { unit: freeWall[0], reason: `it absorbs the ${atkAp} AP hit and survives, so I keep my Shield for free.` };
    // Ace: count the race. If the opponent could finish me next turn, every shield matters.
    if (lvl === 'ace') {
      const threats = state.players[other(defender)].units.filter(canAttackPlayer).length;
      if (threats > shieldsLeft && shieldsLeft <= 3) return { unit: [...blockers].sort((a, b2) => unitLevel(a) - unitLevel(b2))[0], reason: `you have ${threats} attackers against my ${shieldsLeft} shield-area cards; I block to stay out of lethal range.` };
    }
    if (shieldsLeft <= 2) return { unit: [...blockers].sort((a, b2) => unitHp(a) - unitHp(b2))[0], reason: `I only have ${shieldsLeft} card(s) left in my shield area, so I must buy time.` };
    return { unit: null, reason: `blocking would just lose the Blocker; with ${ps.shields.length} Shields I can afford to take this hit.` };
  }
  const tgt = findUnit(state, b.target)!.unit;
  if (unitHp(tgt) <= atkAp && (tgt.pilot || unitLevel(tgt) >= 4)) {
    if (freeWall.length) return { unit: freeWall[0], reason: `${unitName(tgt)} would die; ${unitName(freeWall[0])} takes the hit and survives.` };
    return { unit: [...blockers].sort((a, b2) => unitLevel(a) - unitLevel(b2))[0], reason: `${unitName(tgt)} would die, and it is worth more than my cheapest Blocker.` };
  }
  if (strong && unitHp(tgt) <= atkAp && freeWall.length && unitLevel(tgt) >= 2) return { unit: freeWall[0], reason: `${unitName(freeWall[0])} can absorb this for free and keep ${unitName(tgt)} alive.` };
  return { unit: null, reason: unitHp(tgt) > atkAp ? `${unitName(tgt)} survives the hit anyway.` : `${unitName(tgt)} is not worth sacrificing a Blocker for.` };
}

function aiActionDecision(state: GameState, p: PlayerId, playable: CardInstance[]): { card: CardInstance; reason: string } | null {
  const b = state.battle!;
  const atk = findUnit(state, b.attackerUid);
  if (!atk) return null;
  const defending = atk.owner !== p;
  const op = other(p);
  const atkAp = unitAp(state, atk.unit, atk.owner);
  const tgt = b.target !== 'player' ? findUnit(state, b.target)?.unit : undefined;
  for (const c of playable) {
    const d = CARDS[c.defId];
    switch (d.id) {
      case 'ST02-013': if (defending) return { card: c, reason: `${unitName(atk.unit)} is Lv.${unitLevel(atk.unit)}, so Peaceful Timbre blanks this hit on my shield area.` }; break;
      case 'ST01-014': case 'ST10-015': case 'ST14-014': case 'ST14-013': {
        const ok = (u: UnitState) => (commandTargets(state, p, d.id) ?? []).includes(u);
        if (defending && tgt && ok(atk.unit) && unitHp(tgt) <= atkAp && unitHp(tgt) > atkAp - 3) return { card: c, reason: `AP-3 on ${unitName(atk.unit)} means ${unitName(tgt)} survives the battle.` };
        if (!defending && tgt && ok(tgt) && unitHp(atk.unit) <= unitAp(state, tgt, op) && unitHp(atk.unit) > unitAp(state, tgt, op) - 3) return { card: c, reason: `AP-3 on ${unitName(tgt)} keeps my attacker alive through the trade.` };
        if (defending && b.target === 'player' && ok(atk.unit) && atkAp <= 3 && state.players[p].shields.length <= 2 && !state.players[p].base) return { card: c, reason: `AP-3 drops ${unitName(atk.unit)} to 0 AP, so my Shield survives.` };
        break;
      }
      case 'ST09-009': // Giant Killing: destroy an active enemy Unit with 4 or less AP
        if (defending && !atk.unit.rested && (commandTargets(state, p, d.id) ?? []).includes(atk.unit)) return { card: c, reason: `Giant Killing destroys ${unitName(atk.unit)} before it deals damage.` };
        break;
      case 'GD01-111': // Battle of Aces: 3 damage to a damaged enemy Unit
        if (defending && atk.unit.damage > 0 && unitHp(atk.unit) <= 3) return { card: c, reason: `3 damage finishes the damaged ${unitName(atk.unit)} before it hits.` };
        if (!defending && tgt && tgt.damage > 0 && unitHp(tgt) <= 3 && atkAp < unitHp(tgt)) return { card: c, reason: `3 damage finishes ${unitName(tgt)}, which my attack alone would not.` };
        break;
      case 'ST10-013': // Tactical Training: +2 AP and 2 HP on a Lv5+ G Generation Unit
        if (!defending && tgt && hasTrait(atk.unit, 'G Generation') && unitLevel(atk.unit) >= 5 && atkAp < unitHp(tgt) && atkAp + 2 >= unitHp(tgt)) return { card: c, reason: `+2 AP lets ${unitName(atk.unit)} destroy ${unitName(tgt)}.` };
        if (defending && tgt && hasTrait(tgt, 'G Generation') && unitLevel(tgt) >= 5 && unitHp(tgt) <= atkAp && unitHp(tgt) + 2 > atkAp) return { card: c, reason: `Healing ${unitName(tgt)} 2 HP means it survives the hit.` };
        break;
      case 'ST11-013': // Poorly Planned Offensive: bounce a rested enemy with <=3 HP (the attacker is rested)
        if (defending && unitHp(atk.unit) <= 3 && (atk.unit.pilot || b.target === 'player' || (tgt && unitHp(tgt) <= atkAp))) return { card: c, reason: `Bouncing ${unitName(atk.unit)} cancels the attack and draws me a card.` };
        break;
      case 'ST11-014': // The Orca of Red Sea: untargetable (only useful before the attack; skip in battle)
        break;
      case 'ST12-014': // Wise Leader's Pride: attacker kills and there is a 2-or-less-AP enemy
        if (!defending && tgt && atkAp >= unitHp(tgt) && state.players[op].units.some(u => u !== tgt && unitAp(state, u, op) <= 2)) return { card: c, reason: `${unitName(atk.unit)} kills ${unitName(tgt)}, and Wise Leader's Pride then destroys a second small Unit.` };
        break;
      case 'ST12-015': // Two Unicorns
        if (defending && unitLevel(atk.unit) <= 2) return { card: c, reason: `Two Unicorns destroys the Lv.${unitLevel(atk.unit)} attacker outright.` };
        if (defending && unitLevel(atk.unit) >= 5 && unitHp(atk.unit) <= 2 && state.players[p].units.some(u => unitHp(u) > 2)) return { card: c, reason: `2 damage finishes ${unitName(atk.unit)}.` };
        break;
      case 'ST13-015': // Operation to Intercept Solomon: 3 damage
        if (defending && unitHp(atk.unit) <= 3 && (atk.unit.pilot || unitLevel(atk.unit) >= 4)) return { card: c, reason: `3 damage destroys ${unitName(atk.unit)} before it deals damage.` };
        break;
      case 'ST03-012': // Indignation +2 AP
        if (!defending && tgt && atkAp < unitHp(tgt) && atkAp + 2 >= unitHp(tgt)) return { card: c, reason: `+2 AP lets ${unitName(atk.unit)} destroy ${unitName(tgt)}.` };
        if (defending && tgt && unitAp(state, tgt, p) < unitHp(atk.unit) && unitAp(state, tgt, p) + 2 >= unitHp(atk.unit)) return { card: c, reason: `+2 AP lets ${unitName(tgt)} destroy the attacker.` };
        break;
      case 'ST03-013': // Close Combat 2 damage
        if (defending && unitHp(atk.unit) <= 2) return { card: c, reason: `2 damage destroys ${unitName(atk.unit)} before it deals damage.` };
        break;
      case 'ST04-013': // Hawk of Endymion bounce
        if (defending && unitHp(atk.unit) <= 3) return { card: c, reason: `Bouncing ${unitName(atk.unit)} to hand cancels the attack${atk.unit.pilot ? ' and wastes its Pilot' : ''}.` };
        break;
      case 'ST03-014': // Blue Giant
        if (defending && tgt && atkAp <= 2 && unitHp(tgt) <= atkAp) return { card: c, reason: `${unitName(tgt)} becomes immune to the ${atkAp} AP attacker.` };
        break;
      case 'ST05-013': // With Iron and Blood +3 AP
        if (!defending && tgt && unitHp(atk.unit) > 1 && atkAp < unitHp(tgt) && atkAp + 3 >= unitHp(tgt)) return { card: c, reason: `Self-damage for +3 AP turns this into a kill.` };
        break;
      case 'ST04-014': // First Strike for Lv<=2
        if (!defending && tgt && unitLevel(atk.unit) <= 2 && atkAp >= unitHp(tgt) && unitAp(state, tgt, op) >= unitHp(atk.unit)) return { card: c, reason: `First Strike: ${unitName(atk.unit)} kills first and takes nothing back.` };
        break;
      case 'ST06-011': // Ruthless Tactics +2 (Clan)
        if (!defending && tgt && hasTrait(atk.unit, 'Clan') && atkAp < unitHp(tgt) && atkAp + 2 >= unitHp(tgt)) return { card: c, reason: `+2 AP lets ${unitName(atk.unit)} destroy ${unitName(tgt)}.` };
        if (defending && tgt && hasTrait(tgt, 'Clan') && unitAp(state, tgt, p) < unitHp(atk.unit) && unitAp(state, tgt, p) + 2 >= unitHp(atk.unit)) return { card: c, reason: `+2 AP lets ${unitName(tgt)} destroy the attacker.` };
        break;
      case 'ST06-013': // Fierce Unity: immune from Lv<=2 attackers
        if (defending && tgt && hasTrait(tgt, 'Clan') && unitLevel(atk.unit) <= 2 && unitHp(tgt) <= atkAp) return { card: c, reason: `${unitName(tgt)} becomes immune to the Lv.${unitLevel(atk.unit)} attacker.` };
        break;
      case 'ST07-013': { // Armed Intervention: redirect to a rested CB unit that survives or trades well
        if (!defending) break;
        const wall = state.players[p].units.find(u => u.rested && hasTrait(u, 'CB') && unitHp(u) > atkAp);
        if (wall && (b.target === 'player' || (tgt && unitHp(tgt) <= atkAp))) return { card: c, reason: `Redirecting the attack into ${unitName(wall)}, which survives it.` };
        break;
      }
      case 'ST08-013': // Lady Luck
        if (defending && unitHp(atk.unit) <= (state.players[p].units.some(u => isLinked(u) && hasTrait(u, 'Mafty')) ? 2 : 1)) return { card: c, reason: `Lady Luck destroys ${unitName(atk.unit)} before it deals damage.` };
        break;
    }
  }
  return null;
}

function aiActionActivation(state: GameState, p: PlayerId, acts: ActionActivation[]): { a: ActionActivation; reason: string } | null {
  const b = state.battle!;
  const atk = findUnit(state, b.attackerUid);
  if (!atk) return null;
  const op = other(p);
  for (const a of acts) {
    if (a.effectKey === 'bansheeSupp' && state.players[op].shields.length >= 2 && !state.players[op].base) return { a, reason: 'Suppression breaks two Shields with this attack.' };
    if (a.effectKey === 'milliardo') return { a, reason: 'Free 2 damage to the damaged Unit I am battling.' };
    if (a.effectKey === 'aerialAction') {
      const spare = state.players[p].units.find(u => !u.rested && (u.card.token || (u.deployedTurn === state.turn && !isLinked(u)) || state.active !== p));
      const kill = state.players[op].units.some(u => unitLevel(u) <= 4 && unitHp(u) === 1);
      if (spare && kill) return { a, reason: `Resting ${unitName(spare)} costs me nothing and the 1 damage destroys a Unit.` };
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
  const idNum = (id: string) => Number(id.split(':')[1]);
  const unitFrom = (id: string) => findUnit(state, idNum(id));
  const ps = state.players[p];
  const passed = optionId === null || optionId === 'pass';

  switch (c.kind) {
    case 'mulligan': {
      if (optionId === 'redraw') { ps.deck.push(...ps.hand); ps.hand = []; draw(state, p, 5, true); shuffle(ps.deck); ps.redrew = true; log(state, `${ps.name} redraws their hand.`, 'system', p); }
      else log(state, `${ps.name} keeps their hand.`, 'system', p);
      const second = other(state.active);
      if (p === state.active) {
        const ps2 = state.players[second];
        if (ps2.isAI) {
          const goodKeep = ps2.hand.some(h => CARDS[h.defId].type === 'UNIT' && CARDS[h.defId].level <= 3);
          if (!goodKeep) { ps2.deck.push(...ps2.hand); ps2.hand = []; draw(state, second, 5, true); shuffle(ps2.deck); log(state, `${ps2.name} redraws their hand.`, 'system', second); }
          else log(state, `${ps2.name} keeps their hand.`, 'system', second);
          finishSetup(state);
        } else pushChoice(state, mulliganChoice(second));
      } else finishSetup(state);
      break;
    }
    case 'pairTarget': { const pilot = takeHeld(c.ctx.pilotUid as number)!; const t = unitFrom(optionId!)!; pairPilot(state, p, pilot, t.unit); break; }
    case 'target': { if (!passed) { const t = unitFrom(optionId!); if (t) { effectSrc = (c.ctx.srcUid as number | null) ?? null; applyUnitEffect(state, p, t.unit, c.ctx.e as UnitEffect, String(c.ctx.source)); effectSrc = null; } } else log(state, `${String(c.ctx.source)}: skipped.`, 'effect', p); break; }
    case 'unitLimit': {
      const t = unitFrom(optionId!)!;
      removeUnitToTrash(state, p, t.unit);
      const card = c.ctx.card as CardInstance;
      const u = newUnit(card, state.turn, !!c.ctx.rested);
      ps.units.push(u);
      log(state, `${ps.name} deploys ${cardName(card)}.`, 'play', p);
      onDeploy(state, p, u, !!c.ctx.fromTrash);
      break;
    }
    case 'saintGabriel': {
      const keepUid = idNum(optionId!);
      const [a, b] = ps.deck;
      if (a.uid === keepUid) { ps.deck.splice(1, 1); ps.deck.push(b); } else { ps.deck.shift(); ps.deck.push(a); }
      log(state, `${ps.name} keeps ${CARDS[ps.deck[0].defId].name} on top and puts the other on the bottom.`, 'effect', p);
      break;
    }
    case 'top2': resolveTop2(state, p, idNum(optionId!), c.ctx.other as 'bottom' | 'trash' | 'hand'); break;
    case 'trashPick': {
      if (passed) { log(state, `${String((c.ctx.args as Record<string, unknown>).source ?? c.ctx.cont)}: skipped.`, 'effect', p); break; }
      const chosen = [...(c.ctx.chosen as number[]), idNum(optionId!)];
      const need = c.ctx.need as number;
      if (chosen.length < need) {
        const pool = (c.ctx.pool as number[]).filter(u => !chosen.includes(u));
        pushChoice(state, { ...c, options: pool.map(u => trashOption(ps.trash.find(x => x.uid === u)!)), optional: false, description: `Choose ${need - chosen.length} more.`, ctx: { ...c.ctx, chosen } });
        return;
      }
      afterTrashPick(state, p, c.ctx.cont as string, chosen, c.ctx.args as Record<string, unknown>);
      break;
    }
    case 'mode': resolveMode(state, p, c.ctx.defId as string, optionId!); break;
    case 'clashPick': resolveClashPick(state, c.ctx.actor as PlayerId, p, idNum(optionId!), c.ctx as unknown as { source: string; step: string; firstUid?: number }); break;
    case 'finalDuty': resolveFinalDuty(state, p, idNum(optionId!)); break;
    case 'deployFromTrash': { const card = ps.trash.find(x => x.uid === idNum(optionId!)); if (card) deployFromTrash(state, p, card, String(c.ctx.source), { pay: !!c.ctx.pay, rested: !!c.ctx.rested }); break; }
    case 'discardDraw': { if (!passed) { const card = ps.hand.find(x => x.uid === idNum(optionId!)); if (card) { ps.hand.splice(ps.hand.indexOf(card), 1); ps.trash.push(card); log(state, `GQuuuuuuX 【Attack】: ${ps.name} discards ${cardName(card)}, draws 1.`, 'effect', p); effectDraw(state, p, 1); } } break; }
    case 'aerialRest': { const t = unitFrom(optionId!); if (t) { t.unit.rested = true; log(state, `Gundam Aerial: ${ps.name} rests ${unitName(t.unit)}.`, 'effect', p); chooseUnit(state, p, 'Gundam Aerial: choose 1 enemy Unit of Lv.4 or lower. Deal 1 damage to it.', state.players[other(p)].units.filter(e => unitLevel(e) <= 4), { op: 'damage', amount: 1 }, 'Gundam Aerial', false, c.ctx.aerialUid as number); } break; }
    case 'redGundamToken': { const t = unitFrom(optionId!); const red = findUnit(state, c.ctx.redUid as number); if (t && red) { log(state, `Red Gundam (0079): ${unitName(t.unit)} is destroyed.`, 'effect', p); destroyUnit(state, p, t.unit, false); applyUnitEffect(state, p, red.unit, { op: 'breach', amount: 3 }, 'Red Gundam (0079)'); } break; }
    case 'discard': {
      const card = ps.hand.find(x => x.uid === idNum(optionId!))!;
      ps.hand.splice(ps.hand.indexOf(card), 1); ps.trash.push(card);
      log(state, `${ps.name} discards ${cardName(card)}.`, 'info', p);
      if (ps.hand.length > 10) { pushChoice(state, { ...c, title: `Discard down to 10 cards (${ps.hand.length - 10} more)`, options: ps.hand.map(x => ({ id: `hand:${x.uid}`, label: cardName(x), ref: { kind: 'hand', uid: x.uid, owner: p } })) }); return; }
      finishEndTurn(state);
      return;
    }
    case 'discardOne': { const card = ps.hand.find(x => x.uid === idNum(optionId!)); if (card) { ps.hand.splice(ps.hand.indexOf(card), 1); ps.trash.push(card); log(state, `${ps.name} discards ${cardName(card)}.`, 'info', p); } break; }
    case 'burst': { const card = takeHeld(c.ctx.cardUid as number)!; resolveBurst(state, p, card, optionId === 'yes'); break; }
    case 'block': { if (!passed) { const t = unitFrom(optionId!)!; doBlock(state, p, t.unit); } else log(state, `${ps.name} does not block.`, 'attack', p); break; }
    case 'actionStep': {
      const b = state.battle!;
      if (!passed && optionId!.startsWith('act:')) { const [, uid, key] = optionId!.split(':'); activateAction(state, p, Number(uid), key); b.passes = 0; }
      else if (!passed) { playActionCommand(state, p, idNum(optionId!)); b.passes = 0; } else b.passes = (b.passes ?? 0) + 1;
      b.actor = other(p);
      break;
    }
    case 'freeDeploy': { if (!passed) { const card = ps.hand.find(x => x.uid === idNum(optionId!)); if (card) { ps.hand.splice(ps.hand.indexOf(card), 1); log(state, `Full Frontal 【When Paired】: ${ps.name} deploys ${cardName(card)} for free.`, 'effect', p); deployUnit(state, p, card); } } break; }
    case 'lookTop': { const uids = c.ctx.uids as number[]; const top = uids.map(u => ps.deck.find(x => x.uid === u)).filter(Boolean) as CardInstance[]; const pick = passed ? null : (top.find(x => x.uid === idNum(optionId!)) ?? null); lookTopResolve(state, p, top, pick, (c.ctx.mode as 'hand' | 'deploy' | undefined) ?? 'hand'); break; }
    case 'tokenChoice': deployToken(state, p, optionId!); break;
    case 'fromTrash': { const card = ps.trash.find(x => x.uid === idNum(optionId!)); if (card) { ps.trash.splice(ps.trash.indexOf(card), 1); ps.hand.push(card); log(state, `${cardName(card)} returns from the trash to hand.`, 'effect', p); if (c.ctx.thenDiscard) askDiscardOne(state, p, `${String(c.ctx.source)}: discard 1 card.`); } break; }
    case 'targetMulti': {
      if (passed) break;
      const t = unitFrom(optionId!);
      if (t) applyUnitEffect(state, p, t.unit, c.ctx.e as UnitEffect, String(c.ctx.source));
      const chosen = [...(c.ctx.chosen as number[]), idNum(optionId!)];
      const remaining = (c.ctx.remaining as number) - 1;
      const pool = (c.ctx.pool as number[]).filter(uid => !chosen.includes(uid));
      if (remaining > 0 && pool.length) {
        const opts = pool.map(uid => findUnit(state, uid)).filter(Boolean).map(f => unitOption(state, f!.unit, f!.owner));
        pushChoice(state, { ...c, options: [...opts, { id: 'pass', label: 'Done' }], optional: true, ctx: { ...c.ctx, chosen, remaining, pool } });
      }
      break;
    }
    case 'topKeep': { if (optionId === 'bottom') { const top = ps.deck.shift(); if (top) ps.deck.push(top); log(state, `${ps.name} puts the top card on the bottom.`, 'effect', p); } else log(state, `${ps.name} keeps the top card.`, 'effect', p); break; }
    case 'penelope': { if (!passed) { const card = ps.hand.find(x => x.uid === idNum(optionId!)); if (card) { ps.hand.splice(ps.hand.indexOf(card), 1); ps.deck.push(card); log(state, `Penelope 【Attack】: ${cardName(card)} returns to the bottom of the deck; draw 2.`, 'effect', p); effectDraw(state, p, 2); } } break; }
  }
  if (!state.pending) nextPending(state);
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
