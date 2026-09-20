// Core type definitions for the Gundam Card Game engine.
// Rules reference: docs/comprehensive-rules-v1.9.0.txt

export type PlayerId = 'p1' | 'p2';
/** Bot strength: basic = simple heuristics, advanced = evaluates every attack, ace = also plays around blockers, exposure and lethal races. */
export type BotLevel = 'basic' | 'advanced' | 'ace';
export type Color = 'Blue' | 'Green' | 'Red' | 'White' | 'Purple';
export type CardType = 'UNIT' | 'PILOT' | 'COMMAND' | 'BASE';

export interface Keywords {
  repair?: number;
  breach?: number;
  support?: number;
  blocker?: boolean;
  firstStrike?: boolean;
  highManeuver?: boolean;
}

export interface CardDef {
  id: string; // card number, e.g. ST01-001
  name: string;
  type: CardType;
  color: Color;
  level: number;
  cost: number;
  ap?: number; // Units: AP. Pilots / pilot-commands: AP modifier.
  hp?: number; // Units/Bases: HP. Pilots / pilot-commands: HP modifier.
  traits: string[];
  link?: string[]; // link requirements: pilot name fragments or "(Trait)" entries
  zones?: string[];
  text: string; // official card text (for display)
  keywords?: Keywords;
  /** Command cards that may also be paired as a Pilot: the pilot name. */
  pilotName?: string;
  /** Command timing */
  timing?: ('Main' | 'Action')[];
  /** Short teaching blurb: why this card matters, how to use it. */
  tip?: string;
}

export interface TokenDef {
  id: string;
  name: string;
  ap: number;
  hp: number;
  traits: string[];
  keywords?: Keywords;
}

export interface CardInstance {
  uid: number;
  defId: string;
  owner: PlayerId;
  /** Token instance (no printed card). */
  token?: TokenDef;
}

export interface UnitState {
  card: CardInstance;
  rested: boolean;
  damage: number;
  pilot?: CardInstance; // paired Pilot or Command-as-Pilot
  deployedTurn: number; // turn number when deployed
  /** Temporary modifiers that expire at cleanup ("during this turn"). */
  tempAp: number;
  tempHp: number;
  tempKeywords: Keywords;
  /** Once-per-turn tracker for effects on this unit */
  usedThisTurn: string[];
  /** Turn-scoped permissions/restrictions granted by effects (cleared at cleanup). */
  flags?: {
    canTargetActive?: { maxLv?: number; maxAp?: number; damagedOnly?: boolean };
    cantAttackThisTurn?: boolean;
    /** Can't receive battle damage from enemy Units of this Lv. or lower this turn (Fierce Unity). */
    immuneFromLvMax?: number;
  };
  /** Won't be set active during its owner's next start phase (Jegan Man Hunter). Survives cleanup. */
  skipNextActivate?: boolean;
}

export interface BaseState {
  card: CardInstance;
  rested: boolean;
  damage: number;
  isEx?: boolean;
}

export interface ResourceState {
  uid: number;
  rested: boolean;
  isEx: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  deck: CardInstance[];
  resourceDeck: number; // count of remaining resource cards
  hand: CardInstance[];
  shields: CardInstance[]; // index 0 = top (first to be hit)
  base: BaseState | null;
  units: UnitState[];
  resources: ResourceState[];
  trash: CardInstance[];
  redrew: boolean;
  isAI: boolean;
}

export type Phase = 'start' | 'draw' | 'resource' | 'main' | 'end' | 'gameover';

export interface BattleState {
  attackerUid: number;
  /** 'player' or a unit uid */
  target: 'player' | number;
  originalTarget: 'player' | number;
  step: 'attack' | 'block' | 'action' | 'damage' | 'end';
  blocked: boolean;
  /** Peaceful Timbre: shields can't take damage from units Lv <= X */
  shieldProtectLvMax?: number;
  /** "During this battle" AP modifiers (Kira Yamato). */
  apMods?: { uid: number; delta: number }[];
  /** "Can't receive battle damage from enemy Units with N or less AP" this battle (The Blue Giant). */
  immune?: { uid: number; apMax: number }[];
  /** Action-step bookkeeping */
  passes?: number;
  actor?: PlayerId;
}

export type ChoiceOption = {
  id: string;
  label: string;
  detail?: string;
  /** For UI highlighting: a unit uid, a card uid, or a zone */
  ref?: { kind: 'unit' | 'hand' | 'base' | 'player' | 'resource' | 'shield'; uid?: number; owner?: PlayerId };
};

export interface PendingChoice {
  kind: string; // effect key resolved in effects.ts / engine.ts
  player: PlayerId; // who chooses
  title: string;
  description?: string;
  options: ChoiceOption[];
  optional?: boolean; // may pass
  /** Free-form context for the resolver */
  ctx: Record<string, unknown>;
}

export interface LogEntry {
  turn: number;
  player?: PlayerId;
  text: string;
  kind: 'info' | 'play' | 'attack' | 'damage' | 'effect' | 'phase' | 'system' | 'coach' | 'ai';
}

export interface GameState {
  turn: number;
  active: PlayerId;
  phase: Phase;
  players: Record<PlayerId, PlayerState>;
  battle: BattleState | null;
  pending: PendingChoice | null;
  /** Queue of pending choices to process after the current one */
  queue: PendingChoice[];
  log: LogEntry[];
  winner: PlayerId | null;
  loseReason?: string;
  nextUid: number;
  /** Turn-scoped flags */
  turnFlags: Record<string, boolean>;
  /** Mulligan phase before turn 1 */
  setupStage: 'mulligan' | 'playing';
  /** Whether the human controls p1 */
  humanId: PlayerId;
  /** How strong the bot plays (also read by the engine's block / action-step decisions). */
  botLevel: BotLevel;
  /** Optional per-player override, used by simulations that pit levels against each other. */
  botLevelByPlayer?: Partial<Record<PlayerId, BotLevel>>;
  /** stats for coaching */
  stats: Record<PlayerId, PlayerStats>;
  /** Cards temporarily out of any zone while a choice about them is pending */
  holding: CardInstance[];
}

export interface PlayerStats {
  attacksDeclared: number;
  shieldsBroken: number;
  unitsDestroyed: number;
  unitsLost: number;
  linkUnitsMade: number;
  pilotsPaired: number;
  blocksUsed: number;
  commandsPlayed: number;
  resourcesLeftUnspent: number[]; // per turn
  turnsWithNoPlay: number;
}

export type Action =
  | { type: 'mulligan'; player: PlayerId; redraw: boolean }
  | { type: 'playCard'; player: PlayerId; uid: number; asPilot?: boolean }
  | { type: 'activateMain'; player: PlayerId; uid: number; effectKey: string }
  | { type: 'attack'; player: PlayerId; attackerUid: number; target: 'player' | number }
  | { type: 'endMain'; player: PlayerId }
  | { type: 'choose'; player: PlayerId; optionId: string | null }
  | { type: 'concede'; player: PlayerId };
