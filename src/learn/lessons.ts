// Curriculum: interactive lessons. Each lesson is a series of steps. A step
// can highlight zones on the board, and may set a "task" the learner must
// perform on a live board before advancing.

import type { GameState, PlayerId, UnitState } from '../game/types';
import { CARDS } from '../game/cards';
import { createGame, isLinked, unitHp } from '../game/engine';
import { COLORS, PAIRINGS } from './colors';

export type Zone = 'hand' | 'deck' | 'resourceDeck' | 'resources' | 'shields' | 'base' | 'units' | 'trash' | 'opp-units' | 'opp-shields' | 'opp-base' | 'opp-resources' | 'opp-hand' | 'phase' | 'coach';

export interface LessonStep {
  title: string;
  body: string; // markdown-lite: **bold**, line breaks
  highlight?: Zone[];
  /** If set, the learner must make this true on the sandbox board to continue. */
  task?: { prompt: string; check: (s: GameState, me: PlayerId) => boolean; hint?: string };
  /** Rules citation */
  rule?: string;
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  /** Build the sandbox board for this lesson (undefined = no board, text only). */
  setup?: () => GameState;
  steps: LessonStep[];
  quiz: QuizQuestion[];
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

// ---------- sandbox builders ----------

function findCard(s: GameState, p: PlayerId, defId: string, from: 'deck' | 'hand' = 'deck') {
  const ps = s.players[p];
  const src = from === 'deck' ? ps.deck : ps.hand;
  const i = src.findIndex(c => c.defId === defId);
  if (i < 0) return null;
  return src.splice(i, 1)[0];
}

/** Put specific cards in hand (pulled from the deck), replacing the current hand. */
function setHand(s: GameState, p: PlayerId, ids: string[]) {
  const ps = s.players[p];
  ps.deck.push(...ps.hand); ps.hand = [];
  for (const id of ids) { const c = findCard(s, p, id); if (c) ps.hand.push(c); }
}

function addResources(s: GameState, p: PlayerId, n: number) {
  const ps = s.players[p];
  while (ps.resources.filter(r => !r.isEx).length < n && ps.resourceDeck > 0) { ps.resourceDeck--; ps.resources.push({ uid: s.nextUid++, rested: false, isEx: false }); }
}

function putUnit(s: GameState, p: PlayerId, defId: string, opts: { rested?: boolean; damage?: number; turnsAgo?: number; pilot?: string } = {}) {
  const c = findCard(s, p, defId)!;
  const u: UnitState = { card: c, rested: !!opts.rested, damage: opts.damage ?? 0, deployedTurn: s.turn - (opts.turnsAgo ?? 1), tempAp: 0, tempHp: 0, tempKeywords: {}, usedThisTurn: [] };
  if (opts.pilot) u.pilot = findCard(s, p, opts.pilot)!;
  s.players[p].units.push(u);
  return u;
}

function base(): GameState {
  const s = createGame({ p1Deck: 'ST01', p2Deck: 'ST02', humanId: 'p1', seed: 7, skipMulligan: true, p2Name: 'Trainer Bot' });
  s.players.p2.isAI = true;
  return s;
}

/** Deterministic board for the deployment / pairing / attack lessons. */
function boardTurn3(): GameState {
  const s = base();
  // Move to turn 3 for p1 with 3 resources and a chosen hand
  s.turn = 5; s.active = 'p1'; s.phase = 'main';
  addResources(s, 'p1', 3); addResources(s, 'p2', 3);
  for (const r of s.players.p1.resources) r.rested = false;
  setHand(s, 'p1', ['ST01-005', 'ST01-003', 'ST01-010', 'ST01-001', 'ST01-013', 'ST01-015']);
  putUnit(s, 'p2', 'ST02-007', { rested: true });      // Leo 2/2 rested
  putUnit(s, 'p2', 'ST02-009', { rested: false });     // Tragos blocker 1/1
  s.log = [];
  return s;
}

function boardAttack(): GameState {
  const s = base();
  s.turn = 7; s.active = 'p1'; s.phase = 'main';
  addResources(s, 'p1', 4); addResources(s, 'p2', 4);
  setHand(s, 'p1', ['ST01-012', 'ST01-011']);
  putUnit(s, 'p1', 'ST01-001', { pilot: 'ST01-010', turnsAgo: 2 }); // Gundam + Amuro (link) 5 AP+1
  putUnit(s, 'p1', 'ST01-003', { turnsAgo: 2 });                    // Guncannon 2/4
  putUnit(s, 'p2', 'ST02-005', { rested: true, damage: 1 });        // Maganac 3/2 damaged, rested
  putUnit(s, 'p2', 'ST02-004', { rested: false });                  // Sandrock 4/3 active
  s.players.p2.base = null; // no base: shields exposed
  s.log = [];
  return s;
}

function boardDefense(): GameState {
  const s = base();
  s.turn = 6; s.active = 'p2'; s.phase = 'main';
  addResources(s, 'p1', 3); addResources(s, 'p2', 4);
  setHand(s, 'p1', ['ST01-014']);
  setHand(s, 'p2', []); // keep the bot predictable: it only has Sandrock to attack with
  putUnit(s, 'p1', 'ST01-008', { turnsAgo: 2 });      // Demi Trainer blocker 1/1
  putUnit(s, 'p1', 'ST01-009', { turnsAgo: 2 });      // Zowort blocker 3/2
  putUnit(s, 'p2', 'ST02-004', { turnsAgo: 2 });      // Sandrock 4/3 will attack
  s.players.p1.base = null;
  s.log = [];
  return s;
}

// ---------- lessons ----------

export const LESSONS: Lesson[] = [
  {
    id: 'basics',
    title: '1. The board and how you win',
    minutes: 4,
    summary: 'Zones, the 50-card deck, Shields, the EX Base, and the two ways a game ends.',
    setup: base,
    steps: [
      { title: 'Welcome to the cockpit', body: 'This is a real game board. **You** are at the bottom, the opponent at the top. Every lesson runs on a live board, so you learn by doing.\n\nThe Gundam Card Game is a two-player duel. You win by breaking through your opponent\'s **Shields** and landing one more hit, or by making them run out of cards.', highlight: ['phase'] },
      { title: 'Your deck', body: 'A deck is **exactly 50 cards** in at most **two colors**, with up to **4 copies** of any card number. Units, Pilots, Commands and Bases live here.\n\nSeparately, a **Resource Deck** of 10 cards fuels your plays. It is never shuffled into the main deck.', highlight: ['deck', 'resourceDeck'], rule: '6-1-1' },
      { title: 'Shields: your life total', body: 'At setup, the top **6 cards** of your deck are placed face-down as Shields. Each attack that reaches you destroys **one** Shield, regardless of the attacker\'s AP.\n\nDestroyed Shields are revealed. If the card has a **【Burst】** effect, you may activate it for free. Your Shields are also your comeback mechanic.', highlight: ['shields'], rule: '6-2-2, 8-5-2-3' },
      { title: 'The EX Base', body: 'Both players start with an **EX Base** token: 0 AP, **3 HP**. While a Base is in your shield area, attacks on you hit the Base first. Only when the Base is destroyed do attacks start breaking Shields.\n\nYou can deploy a stronger Base from your hand (they usually have 5 HP). You can only have **one** Base at a time.', highlight: ['base'], rule: '6-2-3, 8-5-2-4' },
      { title: 'Resources', body: 'Every turn you place **one** Resource from your Resource Deck. Your total Resource count is your **Level (Lv.)**: you can only play cards whose Lv. is at or below it.\n\nTo pay a card\'s **cost**, you **rest** (turn sideways) that many active Resources. They all re-activate at the start of your next turn. The player who goes second starts with a bonus **EX Resource**.', highlight: ['resources'], rule: '2-9, 2-10, 7-4' },
      { title: 'Two ways to lose', body: '1. You take **battle damage** from a Unit while you have **no Base and no Shields**.\n2. Your **deck runs out** of cards (drawing the last card loses).\n\nEverything else in the game is about making one of these happen to your opponent first.', highlight: ['shields', 'base', 'deck'], rule: '1-2-2' },
    ],
    quiz: [
      { q: 'How many Shields does each player start with?', options: ['4', '5', '6', '7'], answer: 2, why: 'The top six cards of the deck become Shields (6-2-2).' },
      { q: 'A Unit with 4 AP attacks you. You have no Base and 3 Shields. What happens?', options: ['You lose 4 Shields', 'You lose 1 Shield', 'You take 4 damage', 'Nothing until you block'], answer: 1, why: 'Each Shield is treated as having 1 HP; one attack destroys one Shield no matter the AP (11-3-1-1).' },
      { q: 'You have 4 Resources, 2 of them rested. What is your Level?', options: ['2', '4', '6', 'Depends on the card'], answer: 1, why: 'Level counts all Resources in the area, active or rested (2-9-1).' },
      { q: 'Which is NOT a way to lose?', options: ['Deck has no cards', 'Battle damage with empty shield area', 'Having no Units in play'], answer: 2, why: 'An empty battle area is fine. Only deck-out and unshielded battle damage cause defeat (1-2-2).' },
    ],
  },
  {
    id: 'turn',
    title: '2. The five phases of a turn',
    minutes: 4,
    summary: 'Start, Draw, Resource, Main, End: what happens in each, and what you actually decide.',
    setup: base,
    steps: [
      { title: 'Phase 1: Start', body: 'All your **rested** cards become **active** again: Units, Resources and your Base. This is automatic. Then "at the start of the turn" effects fire.\n\nThis matters for defense: Units you attacked with last turn stay rested (and attackable) until *your* next Start Phase.', highlight: ['phase', 'units', 'resources'], rule: '7-2' },
      { title: 'Phase 2: Draw', body: 'Draw **one** card. Yes, even the first player on turn one. You cannot skip it. There is no hand limit during the turn, but you discard down to **10** at the end.', highlight: ['deck', 'hand'], rule: '7-3' },
      { title: 'Phase 3: Resource', body: 'Place one Resource card from your Resource Deck into your Resource area, active. Your Level goes up by one. After 10 turns the Resource Deck is empty and the phase simply does nothing.', highlight: ['resourceDeck', 'resources'], rule: '7-4' },
      { title: 'Phase 4: Main', body: 'Where the game happens. In **any order, as many times as you can afford**:\n• Deploy Units and Bases\n• Pair Pilots\n• Play 【Main】 Commands\n• Use 【Activate･Main】 effects\n• **Attack** with Units\n\nThe trainer handles phases 1-3 for you. You only ever act in the Main Phase and in decisions during battles.', highlight: ['phase', 'hand', 'units'], rule: '7-5' },
      { title: 'Phase 5: End', body: 'An action step (rarely used), then "end of turn" effects such as **<Repair>**, then discard to 10 cards, then all "during this turn" effects expire.\n\nPress **End Turn** when you are done with your Main Phase.', highlight: ['phase'], rule: '7-6' },
      { title: 'Try it', body: 'End your turn now. Watch the log: the opponent will run through their five phases, and the coach will describe what it sees.', highlight: ['phase'], task: { prompt: 'Press End Turn.', check: s => s.turn >= 2 } },
    ],
    quiz: [
      { q: 'When do your rested Units become active again?', options: ['End of your turn', 'Start of your next turn', 'Immediately after battle', 'Start of the opponent\'s turn'], answer: 1, why: 'The Active Step of your own Start Phase (7-2-3).' },
      { q: 'Can you attack before deploying a Unit in the same Main Phase?', options: ['No, deploy first', 'Yes, any order', 'Only with Link Units'], answer: 1, why: 'Main Phase actions may be performed in any order (7-5-1).' },
      { q: '<Repair> heals at what point?', options: ['Start of your turn', 'When the Unit is attacked', 'End of your turn', 'End of the opponent\'s turn'], answer: 2, why: 'Repair is an end-of-turn effect during the End Step (13-1-1).' },
    ],
  },
  {
    id: 'deploy',
    title: '3. Deploying Units and paying costs',
    minutes: 5,
    summary: 'Level vs. cost, resting Resources, the 6-Unit limit, and why new Units can\'t attack.',
    setup: boardTurn3,
    steps: [
      { title: 'Level and cost are different', body: 'Look at your hand. Each card shows **Lv.** and **cost**.\n• **Lv.** is a gate: you need at least that many Resources in play.\n• **Cost** is the price: rest that many active Resources.\n\nYou have 3 Resources, so you are **Lv.3**. Gundam (Lv.4) is off-limits this turn, even though its cost is only 3.', highlight: ['hand', 'resources'], rule: '2-9, 2-10' },
      { title: 'Deploy a Unit', body: 'Drag the **GM** from your hand into your Battle Area (or click it and choose Deploy). It costs 1, so one Resource rests.', highlight: ['hand'], task: { prompt: 'Deploy GM (cost 1).', check: s => s.players.p1.units.some(u => u.card.defId === 'ST01-005'), hint: 'Drag GM from your hand onto your Battle Area.' } },
      { title: 'Summoning sickness', body: 'The GM is on the board but greyed: **a Unit cannot attack on the turn it is deployed**. Next turn it can. The exception is a **Link Unit**, which we cover in the next lesson.', highlight: ['units'], rule: '3-2-4' },
      { title: 'Deploy another', body: 'You have 2 active Resources left. Guncannon costs 2 and is Lv.3. Deploy it.', highlight: ['hand'], task: { prompt: 'Deploy Guncannon.', check: s => s.players.p1.units.some(u => u.card.defId === 'ST01-003') } },
      { title: 'Spending everything', body: 'All 3 Resources are rested. This is the rhythm of a good turn: **use every Resource**. They come back next turn regardless.\n\nAlso note the **6-Unit limit**. If you deploy a seventh, you must trash one of your existing Units (it does not count as destroyed).', highlight: ['resources', 'units'], rule: '11-4' },
    ],
    quiz: [
      { q: 'You have 4 Resources (1 rested). Can you play a Lv.4, cost-3 Unit?', options: ['Yes', 'No, Level too low', 'No, not enough active Resources'], answer: 0, why: 'Level 4 ≤ 4 Resources, and 3 active Resources cover the cost 3.' },
      { q: 'You have 3 Resources (all active). Can you play a Lv.4, cost-2 Unit?', options: ['Yes', 'No'], answer: 1, why: 'Level 4 is higher than your 3 Resources. Cost is irrelevant until Level is met.' },
      { q: 'A normally deployed Unit can attack…', options: ['The turn it is deployed', 'Your next turn', 'Only after it is paired'], answer: 1, why: 'Units cannot attack the turn they are deployed unless they are Link Units (3-2-4, 3-2-6-3).' },
    ],
  },
  {
    id: 'pilots',
    title: '4. Pilots and Link Units',
    minutes: 5,
    summary: 'Pairing, AP/HP bonuses, link requirements, and attacking the turn you deploy.',
    setup: () => {
      const s = boardTurn3();
      addResources(s, 'p1', 4);
      setHand(s, 'p1', ['ST01-001', 'ST01-010', 'ST01-013', 'ST01-003']);
      return s;
    },
    steps: [
      { title: 'What a Pilot does', body: 'A **Pilot** is placed under a Unit. While paired, the Unit gains the Pilot\'s **AP and HP bonuses** and its lower text box. One Pilot per Unit, and once paired it stays until the Unit leaves.\n\nAmuro Ray: **+2 AP / +1 HP**, and 【When Paired】 rests an enemy Unit with 5 or less HP.', highlight: ['hand'], rule: '3-3' },
      { title: 'Link requirements', body: 'Gundam shows a link requirement: **[Amuro Ray]**. Pair a Pilot whose name contains that text and the Unit becomes a **Link Unit**.\n\nLink Units can **attack the turn they are deployed**. Some Units instead list a trait like **(OZ)**: any Pilot with that trait links.', highlight: ['hand'], rule: '3-2-6' },
      { title: 'Deploy Gundam', body: 'You are Lv.4 now. Deploy Gundam (cost 3).', highlight: ['hand'], task: { prompt: 'Deploy Gundam.', check: s => s.players.p1.units.some(u => u.card.defId === 'ST01-001') } },
      { title: 'Pair Amuro', body: 'Now drag Amuro Ray (cost 1) from your hand onto Gundam. Gundam becomes 5 AP / 5 HP, and Amuro\'s When Paired will let you rest an enemy Unit. Choose the **Tragos**.', highlight: ['hand', 'units'], task: { prompt: 'Pair Amuro Ray with Gundam.', check: s => s.players.p1.units.some(u => u.card.defId === 'ST01-001' && u.pilot?.defId === 'ST01-010') } },
      { title: 'Attack immediately', body: 'Gundam is a **Link Unit** now: it can attack this turn even though you just deployed it. Drag Gundam onto a rested enemy Unit, or onto the enemy Shield Area to attack the player.\n\nBonus: Gundam\'s 【During Pair】 gives **all your Units AP+1** during your turn.', highlight: ['units'], task: { prompt: 'Attack with Gundam.', check: s => s.stats.p1.attacksDeclared >= 1, hint: 'Drag Gundam onto the Tragos (rested) or onto the enemy Shield Area.' } },
      { title: 'Commands as Pilots', body: 'Some Commands, like **Kai\'s Resolve**, have a **【Pilot】** line. You may play them as a Pilot instead of casting them. Kai\'s Resolve pairs as **Kai Shiden**, which links Guncannon.\n\nThat is why starter decks run 4 copies: they are flexible.', highlight: ['hand'], rule: 'FAQ: Commands with Pilot effects' },
    ],
    quiz: [
      { q: 'A Pilot that does NOT meet the link requirement is paired. Does the Unit get the Pilot\'s AP/HP?', options: ['Yes, always', 'No, only when linked'], answer: 0, why: 'Link only affects whether the Unit may attack the turn it was deployed. Stats and effects apply regardless (FAQ).' },
      { q: 'Can you swap a paired Pilot for a better one?', options: ['Yes, during your Main Phase', 'No'], answer: 1, why: 'A paired Pilot cannot be removed or exchanged (3-3-5).' },
      { q: 'Leo\'s link requirement is (OZ). Which Pilot links it?', options: ['Any Pilot named Leo', 'Any Pilot with the OZ trait', 'Only Zechs Merquise'], answer: 1, why: 'A trait in parentheses means any Pilot with that trait satisfies the requirement. Zechs has (OZ), so he works, but so would any other OZ Pilot.' },
      { q: 'When a paired Unit is destroyed, the Pilot…', options: ['Stays in the battle area', 'Returns to your hand', 'Goes to the trash with the Unit'], answer: 2, why: 'The Pilot moves to the same location as the Unit (3-3-6).' },
    ],
  },
  {
    id: 'attack',
    title: '5. Attacking: Units, Shields and Breach',
    minutes: 6,
    summary: 'Who you can attack, how battle damage works, and when to hit Units instead of Shields.',
    setup: boardAttack,
    steps: [
      { title: 'Two kinds of target', body: 'An attack targets either **the player** or a **rested enemy Unit**. Active (upright) enemy Units cannot be attacked, unless a card says otherwise.\n\nHere the enemy Maganac is rested and damaged (1 HP left). Sandrock is active and untouchable this turn.', highlight: ['opp-units'], rule: '8-2-1' },
      { title: 'Battle math', body: 'When Units fight, **both deal damage equal to their AP at the same time**. Damage stays on a Unit as counters; a Unit at 0 HP is destroyed.\n\nYour Guncannon (2 AP, 4 HP) into Maganac (3 AP, 1 HP left): Maganac dies, Guncannon takes 3 and survives with 1 HP.', highlight: ['units', 'opp-units'], rule: '8-5-3' },
      { title: 'Take the free kill', body: 'Your linked Gundam has 6 AP this turn (3 base +2 Amuro +1 from its own During Pair). Drag Gundam onto **Maganac**: it dies and its 3 AP does not threaten Gundam\'s 5 HP.', highlight: ['units'], task: { prompt: 'Attack Maganac with Gundam.', check: s => s.players.p2.units.every(u => u.card.defId !== 'ST02-005') } },
      { title: 'Now the Shields', body: 'The opponent has **no Base**, so attacks on the player break Shields directly. Guncannon has 3 AP this turn (2 +1 from Gundam). Drag Guncannon onto the enemy Shield Area to attack the player.\n\nWatch: the Shield is revealed. If it has a Burst, the opponent may use it.', highlight: ['units', 'opp-shields'], task: { prompt: 'Attack the player with Guncannon.', check: s => s.players.p2.shields.length <= 5 } },
      { title: 'Units or Shields?', body: 'Rule of thumb:\n• A **free kill** (you destroy them and survive) is almost always better than a Shield. Their board shrinks; your pressure stays.\n• If no kill is available, **hit Shields**. Six hits win the game.\n• Late in the game, count: if your attackers ≥ their remaining Shields + Base, go face.\n\n**<Breach X>** rewards Unit kills: when a Breach Unit destroys a Unit in battle, it also deals X damage to their Base or top Shield.', highlight: ['opp-shields'], rule: '13-1-2' },
      { title: 'Finish the turn', body: 'Thoroughly Damaged can deal 1 damage to a **rested** enemy Unit. Nothing is rested now, so it cannot be played. End your turn.', highlight: ['hand'], task: { prompt: 'End your turn.', check: s => s.active === 'p2' || s.turn > 7 } },
    ],
    quiz: [
      { q: 'Which enemy Unit can a normal Unit attack?', options: ['Any enemy Unit', 'Only rested Units', 'Only active Units', 'Only Units with lower Lv.'], answer: 1, why: 'Attack targets are the player or a rested enemy Unit (8-2-1).' },
      { q: 'Your 3 AP / 3 HP Unit attacks a rested 3 AP / 3 HP Unit. Result?', options: ['Only theirs is destroyed', 'Only yours is destroyed', 'Both destroyed', 'Neither'], answer: 2, why: 'Battle damage is simultaneous; both reach 0 HP (8-5-3-2).' },
      { q: 'A Unit with <Breach 3> destroys a Unit in battle. The opponent has a 5 HP Base and 4 Shields. What happens?', options: ['A Shield is destroyed', 'The Base takes 3 damage', 'Nothing, Breach needs no Base', '3 Shields are destroyed'], answer: 1, why: 'Breach damages the first card in the shield area: the Base if present (13-1-2-2).' },
      { q: 'Does damage on a Unit go away at end of turn?', options: ['Yes', 'No, it stays as counters'], answer: 1, why: 'Damage remains on the Unit (FAQ: Damage).' },
    ],
  },
  {
    id: 'defense',
    title: '6. Defending: Blockers, action steps and Bursts',
    minutes: 6,
    summary: 'The five battle steps, when to block, and how Action Commands flip a fight.',
    setup: boardDefense,
    steps: [
      { title: 'The five battle steps', body: 'Every attack goes: **Attack step → Block step → Action step → Damage step → Battle end**.\n\nYou, the defender, get to act in two of them: **Block** (use a <Blocker>) and **Action** (play 【Action】 Commands). Damage is dealt only after both.', highlight: ['phase'], rule: '8-1' },
      { title: 'Blocker', body: 'A Unit with **<Blocker>** may be rested during the Block step to become the new attack target. Only **active** Units can block, only **one** block per attack, and a Unit cannot block for itself.\n\nYou have Demi Trainer (1/1) and Zowort (3/2), both Blockers. Sandrock (4 AP / 3 HP) is about to attack you.', highlight: ['units'], rule: '8-3, 13-1-4' },
      { title: 'Action Commands', body: 'Your hand has **Unforeseen Incident**: 【Main】/【Action】 gives an enemy Unit AP-3 this turn. Playing it in the Action step drops Sandrock to 1 AP **before** damage.\n\nZowort blocking + Unforeseen Incident = Zowort survives (1 damage vs 2 HP) and deals 3 back, killing Sandrock.', highlight: ['hand'], rule: '9, 13-2-4' },
      { title: 'Let the opponent attack', body: 'It is the opponent\'s turn and the Trainer Bot is already attacking with Sandrock. In the **Block** prompt choose **Zowort**. Then, in the **Action step** prompt, play **Unforeseen Incident** targeting Sandrock.', highlight: ['phase'], task: { prompt: 'Block with Zowort and play Unforeseen Incident during the same battle.', check: s => s.stats.p1.blocksUsed >= 1 && s.stats.p1.commandsPlayed >= 1, hint: 'When the Block prompt appears choose Zowort. When the Action step prompt appears choose Unforeseen Incident and target Sandrock.' } },
      { title: 'When not to block', body: 'Blocking costs you: the Blocker rests (no block next attack) and may die. Early on, **losing a Shield is cheap**, and it might reveal a Burst. Block when:\n• the Blocker kills the attacker,\n• the Blocker would survive anyway,\n• the alternative is losing a paired Unit or your last Shields.', highlight: ['shields'] },
      { title: 'Bursts', body: 'When a Shield is destroyed it is revealed. If it shows **【Burst】**, you choose whether to activate it before it goes to the trash.\n• Pilots: return to your hand.\n• Bases: deploy for free, and their 【Deploy】 adds a Shield to your hand.\n• Commands: activate their 【Main】 for free.\n\nThat is why aggressive players think twice before breaking early Shields.', highlight: ['shields'], rule: '13-2-5' },
    ],
    quiz: [
      { q: 'A rested Unit with <Blocker> can block.', options: ['True', 'False'], answer: 1, why: 'Only active Units can activate Blocker (8-3-1, FAQ).' },
      { q: 'In which step are 【Action】 Commands played during a battle?', options: ['Attack step', 'Block step', 'Action step', 'Damage step'], answer: 2, why: 'The action step comes after the block step and before damage (8-4).' },
      { q: 'Who acts first in an action step?', options: ['The attacker', 'The defender (standby player)', 'Whoever has more Resources'], answer: 1, why: 'Players take turns starting with the standby player (9-2).' },
      { q: 'A Shield is destroyed and revealed as a Base with 【Burst】Deploy this card. You already have a Base.', options: ['Burst cannot be used', 'New Base replaces the old one', 'You get two Bases'], answer: 1, why: 'Only one Base at a time; the old one is trashed, not destroyed (11-5).' },
      { q: 'A Unit with <High-Maneuver> attacks. Can the defender block?', options: ['Yes', 'No'], answer: 1, why: 'While a High-Maneuver Unit is attacking, enemy Units cannot activate Blocker (13-1-6).' },
    ],
  },
  {
    id: 'commands-bases',
    title: '7. Commands, Bases and Activate effects',
    minutes: 5,
    summary: 'Main vs Action timing, targeting rules, Base value, and paying for 【Activate･Main】.',
    setup: () => {
      const s = boardTurn3();
      addResources(s, 'p1', 5);
      setHand(s, 'p1', ['ST01-015', 'ST01-012', 'ST01-014']);
      return s;
    },
    steps: [
      { title: 'Command timing', body: '【Main】 Commands are played in your Main Phase. 【Action】 Commands are played during action steps (in battles). Cards marked **【Main】/【Action】** work at either time.\n\nA Command that says "choose" **cannot be played if no legal target exists**.', highlight: ['hand'], rule: '13-2-3, 10-2-2' },
      { title: 'Bases', body: 'You have White Base in hand (Lv.3, cost 2, **5 HP**). Drag it onto your Base slot: it replaces your EX Base. Its 【Deploy】 adds one of your Shields to your hand, so you are trading a face-down Shield for a real card and a bigger wall.', highlight: ['hand', 'base'], task: { prompt: 'Deploy White Base.', check: s => s.players.p1.base?.card.defId === 'ST01-015' } },
      { title: '【Activate･Main】', body: 'White Base has **【Activate･Main】【Once per Turn】②**: pay 2 to deploy a token Unit. The token depends on how many Units you have (none → Gundam 3/3). Tokens have Lv. and cost 0 and count toward the 6-Unit limit.\n\nUse the Effects panel to activate it.', highlight: ['base'], task: { prompt: 'Activate White Base to deploy a Gundam token.', check: s => s.players.p1.units.some(u => u.card.token?.id === 'T-001'), hint: 'Open the Effects panel under your board.' } },
      { title: 'Targeting', body: 'Thoroughly Damaged needs a **rested** enemy Unit. The Leo is rested, so it is a legal play (1 damage). Unforeseen Incident targets any enemy Unit.\n\nDrag Thoroughly Damaged onto the Leo.', highlight: ['hand', 'opp-units'], task: { prompt: 'Play Thoroughly Damaged targeting Leo.', check: s => s.players.p2.units.some(u => u.card.defId === 'ST02-007' && u.damage >= 1) || !s.players.p2.units.some(u => u.card.defId === 'ST02-007') } },
      { title: 'Once per turn and EX Resources', body: '【Once per Turn】 effects reset each turn, and each copy of a card gets its own use.\n\n**EX Resources** count toward your Level but are **removed from the game** when spent. The trainer spends regular Resources first so you keep the EX bonus as long as possible.', highlight: ['resources'], rule: '13-2-13, FAQ: EX Resource' },
    ],
    quiz: [
      { q: 'You have no rested enemy Units. Can you play Thoroughly Damaged just to pair it as Hayato?', options: ['No, it needs a target', 'Yes, pairing does not need a Command target'], answer: 1, why: 'Playing it as a Pilot uses the 【Pilot】 effect, not the 【Main】 effect, so no target is required (FAQ).' },
      { q: 'Tokens count toward the 6-Unit limit.', options: ['True', 'False'], answer: 0, why: 'Unit tokens are included in the maximum (FAQ: Token).' },
      { q: 'You pay a cost using an EX Resource. Afterwards…', options: ['It rests like a normal Resource', 'It is removed from the game and your Level drops', 'It returns to the Resource Deck'], answer: 1, why: 'EX Resources are removed when used to pay, lowering the Level (FAQ: Playing Cards).' },
      { q: 'Can you deploy a second Base while one is in play?', options: ['No', 'Yes, the old one is trashed'], answer: 1, why: 'The previous Base is placed in the trash, not destroyed (11-5-2).' },
    ],
  },
  {
    id: 'strategy',
    title: '8. Strategy: curve, tempo and reading the board',
    minutes: 5,
    summary: 'How intermediate players think: resource curve, when to race, and what the coach watches for.',
    steps: [
      { title: 'The curve', body: 'You gain exactly one Level per turn. A good deck has plays at Lv.1-2, Lv.3-4 and Lv.5-6. Mulligan hands with **no Unit playable by turn 2**.\n\nOn each turn, aim to spend **all** your Resources. Unspent Resources are the most common beginner leak, and the coach will flag them at end of turn.' },
      { title: 'Tempo: rested Units are targets', body: 'Attacking rests your Unit, which exposes it to attack next turn. Before attacking, ask: *if this Unit is rested, what can they kill?* Sometimes holding back a fragile Unit (or a Blocker) is right.\n\nConversely, Units that attacked you are rested on your turn. Punish them.' },
      { title: 'Sequencing inside a turn', body: '1. Effects that **rest** enemies (Guntank, Amuro, Siege Ploy) go **before** attacks.\n2. Pilots with 【Attack】 refunds (Suletta) attack **before** you spend Resources.\n3. Deploy Bases **before** you need the card they give you.\n4. Play Blockers **after** attacking with the rest, so they stay active.' },
      { title: 'Racing math', body: 'Count both sides each turn: **attackers vs. (Base HP ÷ their AP) + Shields**. If you win the race in fewer turns even after they block once, go face every turn and ignore their Units. If not, trade Units and stabilize behind a Base.' },
      { title: 'Reading Shields', body: 'Six face-down cards from a 50-card deck. Starter decks hold ~8 Pilots and ~5 Bases with Bursts, so roughly **1 in 4** Shields is a Burst. Expect one or two per game. When you are ahead, break Shields early to flush Bursts while they cannot capitalize; when behind, a Burst is your comeback.' },
      { title: 'Ready to practice', body: 'Head to **Practice** and play a full game against the Trainer Bot. The Coach panel comments on every decision point, and the end-of-turn review tells you what you missed. Your skill tracker fills in as you demonstrate each mechanic.' },
    ],
    quiz: [
      { q: 'Best time to play a Blocker you want to keep active for defense?', options: ['Before your attacks', 'After your attacks', 'It makes no difference'], answer: 1, why: 'Order does not affect the Blocker\'s state, but deploying after attacking keeps your options open and prevents you from accidentally attacking with it.' },
      { q: 'You have 2 Resources unspent and a playable Unit. Ending the turn is…', options: ['Fine, save them', 'A tempo loss', 'Required'], answer: 1, why: 'Resources refresh every turn; saving them gains nothing. Play the Unit.' },
      { q: 'The opponent has 1 Shield, no Base, and one active Blocker. You have 3 attackers. Do you have lethal?', options: ['Yes', 'No', 'Only with Breach'], answer: 0, why: 'They can block once. Attack 1 is blocked, attack 2 breaks the Shield, attack 3 deals battle damage to the unshielded player: win.' },
    ],
  },
  {
    id: 'colors',
    title: '9. The five colors and how to combine them',
    minutes: 6,
    summary: 'Each color has a pattern. Learn what Blue, Green, Red, White and Purple want to do, and which pairs work.',
    steps: [
      { title: 'Why colors matter', body: 'Every card is one of five colors, and a deck may use **at most two**. Colors are not cosmetic: each one has a distinct pattern of effects, and a deck plays like its colors.\n\nThe five starter decks each pair two colors. Once you know the patterns you can read an opponent\'s plan from their first two plays, and you can build your own two-color deck in the **Deck Builder**.' },
      ...(['Blue', 'Green', 'Red', 'White', 'Purple'] as const).map(c => {
        const g = COLORS[c];
        return {
          title: `${c}: ${g.tagline}`,
          body: `${g.identity}\n\n**Signature mechanics**\n${g.mechanics.map(m => '• ' + m).join('\n')}\n\n**How to play it**\n${g.howToPlay.map(m => '• ' + m).join('\n')}\n\n**Weakness:** ${g.weaknesses}\n\nFactions: ${g.factions}.`,
        };
      }),
      { title: 'Pairing colors', body: 'A good pair covers the other\'s weakness.\n\n' + PAIRINGS.map(p => `• **${p.colors.join(' + ')}** (${p.name}${p.starter ? ', starter ' + p.starter : ''}): ${p.why}`).join('\n') },
      { title: 'Try a new combination', body: 'Open the **Deck Builder** from the menu, pick two colors, and press **Auto-build**. It assembles a legal 50-card deck with a sensible curve from every card in the trainer. Adjust counts, save it, and choose it in **Practice** for yourself or for the Trainer Bot.\n\nTo learn a color quickly: play it against a deck of the opposite style. Red vs White teaches both the race and the wall.' },
    ],
    quiz: [
      { q: 'Which color accelerates by placing EX Resources?', options: ['Blue', 'Green', 'Red', 'Purple'], answer: 1, why: 'Green ramps (Wing Gundam Bird Mode places an EX Resource).' },
      { q: 'Your deck is full of Blockers, AP reduction and bounce effects. Which color is it?', options: ['White', 'Red', 'Blue', 'Green'], answer: 0, why: 'Defense and disruption are White\'s identity.' },
      { q: 'A Purple deck damages its own Units on purpose because…', options: ['Damage counters are removed at end of turn', 'Damaged Units gain bonuses like AP+2 or Suppression', 'It draws a card for each damage'], answer: 1, why: 'Purple\'s Units get stronger while damaged (Barbatos 2nd Form, Barbatos 4th Form).' },
      { q: 'You have Angelo\'s Geara Zulu (<Support 2>) and Sinanju ready to attack. Correct order?', options: ['Attack with Sinanju, then Support', 'Rest Geara Zulu for Support onto Sinanju, then attack', 'Attack with both'], answer: 1, why: 'Support is an Activate·Main effect: use it before the attack so the +2 AP applies to the battle. Red\'s pattern is buff first, then swing.' },
      { q: 'How many colors may a deck contain?', options: ['1', 'Up to 2', 'Up to 3', 'Any number'], answer: 1, why: 'A deck is one or two colors (6-1-1-2).' },
      { q: 'Blue\'s typical way to make an enemy Unit attackable is…', options: ['Destroying its Pilot', 'Resting it with an effect', 'Giving it AP-3'], answer: 1, why: 'Guntank, Amuro Ray and Siege Ploy rest enemy Units so they become legal attack targets.' },
    ],
  },
];

export function lessonById(id: string) { return LESSONS.find(l => l.id === id); }

// Exports used by lesson tasks
export { CARDS, isLinked, unitHp };
