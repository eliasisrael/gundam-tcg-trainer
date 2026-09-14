// Card database: ST01 "Heroic Beginnings" and ST02 "Wings of Advance".
// Stats and text sourced from the official card list (via the gcg-api dataset).
// Card names, text and Gundam are property of Bandai; this is metadata only.

import type { CardDef, Color, TokenDef } from './types';

export const CARDS: Record<string, CardDef> = {
  // ---------- ST01 Heroic Beginnings (Blue / White) ----------
  'ST01-001': {
    id: 'ST01-001', name: 'Gundam', type: 'UNIT', color: 'Blue', level: 4, cost: 3, ap: 3, hp: 4,
    traits: ['Earth Federation', 'White Base Team'], link: ['Amuro Ray'], zones: ['Space', 'Earth'],
    text: '<Repair 2> (At the end of your turn, this Unit recovers the specified number of HP.)\n【During Pair】During your turn, all your Units get AP+1.',
    keywords: { repair: 2 },
    tip: 'Your flagship. Pair Amuro to make it a Link Unit that attacks the turn it lands, and the team-wide AP+1 turns every trade in your favor.',
  },
  'ST01-002': {
    id: 'ST01-002', name: 'Gundam (MA Form)', type: 'UNIT', color: 'Blue', level: 5, cost: 3, ap: 4, hp: 3,
    traits: ['Earth Federation', 'White Base Team'], link: ['Amuro Ray'], zones: ['Space'],
    text: '【When Paired･(White Base Team) Pilot】Draw 1.',
    tip: 'High AP, low HP. Pairing any White Base Team pilot (Amuro, Kai, Hayato) refunds a card.',
  },
  'ST01-003': {
    id: 'ST01-003', name: 'Guncannon', type: 'UNIT', color: 'Blue', level: 3, cost: 2, ap: 2, hp: 4,
    traits: ['Earth Federation', 'White Base Team'], link: ['Kai Shiden'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'A sturdy early body. 4 HP survives most early attackers. "Kai\'s Resolve" can be paired as Kai Shiden to link it.',
  },
  'ST01-004': {
    id: 'ST01-004', name: 'Guntank', type: 'UNIT', color: 'Blue', level: 3, cost: 2, ap: 2, hp: 3,
    traits: ['Earth Federation', 'White Base Team'], link: ['Hayato Kobayashi'], zones: ['Space', 'Earth'],
    text: '【Deploy】Choose 1 enemy Unit with 2 or less HP. Rest it.',
    tip: 'Resting an enemy unit lets your other units attack it this turn. Deploy it before you attack, not after.',
  },
  'ST01-005': {
    id: 'ST01-005', name: 'GM', type: 'UNIT', color: 'Blue', level: 2, cost: 1, ap: 2, hp: 2,
    traits: ['Earth Federation'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Cheap pressure. A turn-1 or turn-2 GM starts chipping shields before the opponent stabilizes.',
  },
  'ST01-006': {
    id: 'ST01-006', name: 'Gundam Aerial (Permet Score Six)', type: 'UNIT', color: 'White', level: 5, cost: 4, ap: 4, hp: 4,
    traits: ['Academy'], link: ['Suletta Mercury'], zones: ['Space', 'Earth'],
    text: '【When Paired】Choose 1 enemy Unit that is Lv.5 or lower. It gets AP-3 during this turn.',
    tip: 'Pair Suletta and shrink an enemy unit to 0-1 AP, then attack it for a free kill.',
  },
  'ST01-007': {
    id: 'ST01-007', name: 'Gundam Aerial (Bit on Form)', type: 'UNIT', color: 'White', level: 4, cost: 2, ap: 3, hp: 4,
    traits: ['Academy'], link: ['Suletta Mercury'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Best stats-per-cost in the deck: 3/4 for 2. Play it on curve at Lv.4.',
  },
  'ST01-008': {
    id: 'ST01-008', name: 'Demi Trainer', type: 'UNIT', color: 'White', level: 1, cost: 1, ap: 1, hp: 1,
    traits: ['Academy'], zones: ['Space', 'Earth'],
    text: '<Blocker> (Rest this Unit to change the attack target to it.)',
    keywords: { blocker: true },
    tip: 'A 1-cost shield. Block a big attack to save a Shield card or a valuable unit.',
  },
  'ST01-009': {
    id: 'ST01-009', name: 'Zowort', type: 'UNIT', color: 'White', level: 2, cost: 2, ap: 3, hp: 2,
    traits: ['Academy'], zones: ['Space', 'Earth'],
    text: "<Blocker> (Rest this Unit to change the attack target to it.)\nThis Unit can't choose the enemy player as its attack target.",
    keywords: { blocker: true },
    tip: 'Defensive: it can only attack rested enemy units, but 3 AP blocks and kills most early attackers.',
  },
  'ST01-010': {
    id: 'ST01-010', name: 'Amuro Ray', type: 'PILOT', color: 'Blue', level: 4, cost: 1, ap: 2, hp: 1,
    traits: ['Earth Federation', 'White Base Team', 'Newtype'],
    text: '【Burst】Add this card to your hand.\n【When Paired】Choose 1 enemy Unit with 5 or less HP. Rest it.',
    tip: 'Pair onto Gundam for a Link Unit. The When Paired rest lets you attack the target the same turn.',
  },
  'ST01-011': {
    id: 'ST01-011', name: 'Suletta Mercury', type: 'PILOT', color: 'White', level: 4, cost: 1, ap: 1, hp: 2,
    traits: ['Academy'],
    text: '【Burst】Add this card to your hand.\n【Attack】【Once per Turn】Choose 1 of your Resources. Set it as active.',
    tip: 'Every attack refunds a resource. Attack first, then spend the reactivated resource on more plays.',
  },
  'ST01-012': {
    id: 'ST01-012', name: 'Thoroughly Damaged', type: 'COMMAND', color: 'Blue', level: 2, cost: 1, ap: 0, hp: 1,
    traits: ['Earth Federation', 'White Base Team'], timing: ['Main'], pilotName: 'Hayato Kobayashi',
    text: '【Main】Choose 1 rested enemy Unit. Deal 1 damage to it.\n【Pilot】[Hayato Kobayashi]',
    tip: 'Finish off a damaged rested unit, or pair it as Hayato to link a Guntank.',
  },
  'ST01-013': {
    id: 'ST01-013', name: "Kai's Resolve", type: 'COMMAND', color: 'Blue', level: 3, cost: 1, ap: 1, hp: 0,
    traits: ['Earth Federation', 'White Base Team'], timing: ['Main'], pilotName: 'Kai Shiden',
    text: '【Main】Choose 1 friendly Unit. It recovers 3 HP.\n【Pilot】[Kai Shiden]',
    tip: 'Heal a damaged Gundam, or pair it as Kai Shiden to link a Guncannon.',
  },
  'ST01-014': {
    id: 'ST01-014', name: 'Unforeseen Incident', type: 'COMMAND', color: 'White', level: 3, cost: 1,
    traits: [], timing: ['Main', 'Action'],
    text: "【Burst】Activate this card's 【Main】.\n【Main】/【Action】Choose 1 enemy Unit. It gets AP-3 during this turn.",
    tip: 'Playable during battle (Action). Shrink the attacker so your blocker or defender survives, or neuter a shield hit.',
  },
  'ST01-015': {
    id: 'ST01-015', name: 'White Base', type: 'BASE', color: 'Blue', level: 3, cost: 2, ap: 0, hp: 5,
    traits: ['Earth Federation', 'White Base Team', 'Warship'], zones: ['Space', 'Earth'],
    text: '【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand.\n【Activate･Main】【Once per Turn】②：Deploy 1 [Gundam]((White Base Team)･AP3･HP3) Unit token if you have no Units in play, deploy 1 [Guncannon]((White Base Team)･AP2･HP2) Unit token if you have only 1 Unit in play, or deploy 1 [Guntank]((White Base Team)･AP1･HP1) Unit token if you have 2 or more Units in play.',
    tip: 'A 5 HP wall that also draws you a card (from your shields) and makes tokens. Best when your board is empty.',
  },
  'ST01-016': {
    id: 'ST01-016', name: 'Asticassia School of Technology, Earth House', type: 'BASE', color: 'White', level: 2, cost: 1, ap: 0, hp: 5,
    traits: ['Academy', 'Stronghold'], zones: ['Space'],
    text: '【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand.\n【Activate･Main】Rest this Base：All friendly Link Units get AP+1 during this turn.',
    tip: 'Cheap protection plus a card. Rest it before attacking with Link Units for extra damage.',
  },

  // ---------- ST02 Wings of Advance (Green / Blue) ----------
  'ST02-001': {
    id: 'ST02-001', name: 'Wing Gundam', type: 'UNIT', color: 'Green', level: 6, cost: 4, ap: 4, hp: 5,
    traits: ['Operation Meteor'], link: ['Heero Yuy'], zones: ['Space', 'Earth'],
    text: "<Breach 5> (When this Unit's attack destroys an enemy Unit, deal the specified amount of damage to the first card in that opponent's shield area.)\nThis Unit may choose an active enemy Unit that is Lv.4 or lower as its attack target.",
    keywords: { breach: 5 },
    tip: 'Kill a unit and Breach 5 wipes their Base or a Shield too. It can even attack active low-level units.',
  },
  'ST02-002': {
    id: 'ST02-002', name: 'Wing Gundam (Bird Mode)', type: 'UNIT', color: 'Green', level: 3, cost: 3, ap: 2, hp: 2,
    traits: ['Operation Meteor'], link: ['Heero Yuy'], zones: ['Space', 'Earth'],
    text: '【Deploy】Place 1 EX Resource.',
    tip: 'Ramp. The EX Resource raises your level immediately, letting you play bigger cards a turn early.',
  },
  'ST02-003': {
    id: 'ST02-003', name: 'Gundam Heavyarms', type: 'UNIT', color: 'Green', level: 5, cost: 3, ap: 3, hp: 4,
    traits: ['Operation Meteor'], link: ['Trowa Barton'], zones: ['Earth'],
    text: '【During Pair】During your turn, when this Unit destroys an enemy Unit with battle damage, deal 1 damage to all enemy Units that are Lv.3 or lower.',
    tip: 'Paired, every kill splashes 1 damage across their small units. Pair "Simultaneous Fire" as Trowa to link it.',
  },
  'ST02-004': {
    id: 'ST02-004', name: 'Gundam Sandrock', type: 'UNIT', color: 'Green', level: 4, cost: 2, ap: 4, hp: 3,
    traits: ['Operation Meteor'], link: ['Quatre Raberba Winner'], zones: ['Earth'],
    text: '-',
    tip: '4 AP for 2 cost is a bargain. Kills almost any early unit in one hit.',
  },
  'ST02-005': {
    id: 'ST02-005', name: 'Maganac', type: 'UNIT', color: 'Green', level: 2, cost: 2, ap: 3, hp: 2,
    traits: ['Maganac Corps'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Aggressive early drop. Trades up into 2 HP units.',
  },
  'ST02-006': {
    id: 'ST02-006', name: 'Tallgeese', type: 'UNIT', color: 'Blue', level: 5, cost: 4, ap: 4, hp: 4,
    traits: ['OZ'], link: ['Zechs Merquise'], zones: ['Space', 'Earth'],
    text: '【Activate･Main】【Once per Turn】④：Set this Unit as active.',
    tip: 'Pay 4 to untap and attack twice in one turn. Devastating late-game with spare resources.',
  },
  'ST02-007': {
    id: 'ST02-007', name: 'Leo', type: 'UNIT', color: 'Blue', level: 2, cost: 2, ap: 2, hp: 2,
    traits: ['OZ'], link: ['(OZ)'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Links with ANY OZ-trait pilot (Zechs). A linked Leo attacks immediately.',
  },
  'ST02-008': {
    id: 'ST02-008', name: 'Aries', type: 'UNIT', color: 'Blue', level: 2, cost: 2, ap: 2, hp: 1,
    traits: ['OZ'], zones: ['Earth'],
    text: '<Blocker> (Rest this Unit to change the attack target to it.)',
    keywords: { blocker: true },
    tip: 'A blocker with 2 AP: blocking a 1 HP attacker kills it.',
  },
  'ST02-009': {
    id: 'ST02-009', name: 'Tragos', type: 'UNIT', color: 'Blue', level: 1, cost: 1, ap: 1, hp: 1,
    traits: ['OZ'], zones: ['Earth'],
    text: '<Blocker> (Rest this Unit to change the attack target to it.)',
    keywords: { blocker: true },
    tip: 'One-cost blocker. Absorbs one attack that would otherwise hit a shield.',
  },
  'ST02-010': {
    id: 'ST02-010', name: 'Heero Yuy', type: 'PILOT', color: 'Green', level: 4, cost: 1, ap: 2, hp: 1,
    traits: ['Operation Meteor'],
    text: '【Burst】Add this card to your hand.\n【During Link】This Unit gets AP+1 and HP+1.',
    tip: 'On a Wing Gundam: +3 AP / +2 HP total. A linked Wing is a 7/7 that Breaches for 5.',
  },
  'ST02-011': {
    id: 'ST02-011', name: 'Zechs Merquise', type: 'PILOT', color: 'Blue', level: 5, cost: 1, ap: 2, hp: 1,
    traits: ['OZ'],
    text: '【Burst】Add this card to your hand.\n【During Link】During your turn, when this Unit destroys an enemy Unit with battle damage, draw 1.',
    tip: 'Links with Tallgeese or Leo. Kill units to draw cards.',
  },
  'ST02-012': {
    id: 'ST02-012', name: 'Simultaneous Fire', type: 'COMMAND', color: 'Green', level: 4, cost: 1, ap: 1, hp: 1,
    traits: ['Operation Meteor'], timing: ['Main'], pilotName: 'Trowa Barton',
    text: '【Main】Choose 1 of your Units. It gains <Breach 3> during this turn.\n【Pilot】[Trowa Barton]',
    tip: 'Give Breach 3 to a unit about to kill something, or pair it as Trowa to link Heavyarms.',
  },
  'ST02-013': {
    id: 'ST02-013', name: 'Peaceful Timbre', type: 'COMMAND', color: 'Green', level: 4, cost: 1, ap: 1, hp: 1,
    traits: ['Operation Meteor'], timing: ['Action'], pilotName: 'Quatre Raberba Winner',
    text: "【Action】During this battle, your shield area cards can't receive damage from enemy Units that are Lv.4 or lower.\n【Pilot】[Quatre Raberba Winner]",
    tip: 'Play during the action step of an enemy attack to blank a shield hit, or pair it as Quatre to link Sandrock.',
  },
  'ST02-014': {
    id: 'ST02-014', name: 'Siege Ploy', type: 'COMMAND', color: 'Blue', level: 3, cost: 1,
    traits: [], timing: ['Main', 'Action'],
    text: "【Burst】Activate this card's 【Main】.\n【Main】/【Action】Choose 1 enemy Unit with 5 or less HP. Rest it.",
    tip: 'Rest a unit so you can attack it, or rest a would-be blocker before you swing.',
  },
  'ST02-015': {
    id: 'ST02-015', name: 'Saint Gabriel Institute', type: 'BASE', color: 'Green', level: 2, cost: 2, ap: 0, hp: 5,
    traits: ['Academy', 'Stronghold'], zones: ['Earth'],
    text: '【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand. Then, look at the top 2 cards of your deck and return 1 to the top and 1 to the bottom.',
    tip: 'Protection, a card, and a peek at your next draws.',
  },
  'ST02-016': {
    id: 'ST02-016', name: 'Corsica Base', type: 'BASE', color: 'Blue', level: 3, cost: 3, ap: 0, hp: 5,
    traits: ['OZ', 'Stronghold'], zones: ['Earth'],
    text: '【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand. Then, if it is your turn, deploy 1 [Tallgeese]((OZ)･AP4･HP2) Unit token. If it is your turn and a card with "Corsica Base" in its card name is in your trash, deploy 2 [Leo]((OZ)･AP1･HP1) Unit tokens instead.',
    tip: 'Deploy it on your turn for a free 4/2 Tallgeese token. From a Burst on the opponent\'s turn you only get the base and the card.',
  },
};

export const TOKENS: Record<string, TokenDef> = {
  'T-001': { id: 'T-001', name: 'Gundam', ap: 3, hp: 3, traits: ['White Base Team'] },
  'T-002': { id: 'T-002', name: 'Guncannon', ap: 2, hp: 2, traits: ['White Base Team'] },
  'T-003': { id: 'T-003', name: 'Guntank', ap: 1, hp: 1, traits: ['White Base Team'] },
  'T-004': { id: 'T-004', name: 'Leo', ap: 1, hp: 1, traits: ['OZ'] },
  'T-005': { id: 'T-005', name: 'Tallgeese', ap: 4, hp: 2, traits: ['OZ'] },
  'EX-BASE': { id: 'EX-BASE', name: 'EX Base', ap: 0, hp: 3, traits: [] },
};

export interface DeckDef {
  id: string;
  name: string;
  colors: Color[];
  description: string;
  cards: [string, number][]; // [card id, count]
}

// Starter deck lists. Counts reflect the retail decks (50 cards).
export const DECKS: Record<string, DeckDef> = {
  ST01: {
    id: 'ST01', name: 'Heroic Beginnings', colors: ['Blue', 'White'],
    description: 'Gundam & Aerial. Sturdy units, pilots that link, blockers, and a Base that makes tokens. The best deck to learn on.',
    cards: [
      ['ST01-001', 2], ['ST01-002', 4], ['ST01-003', 4], ['ST01-004', 4], ['ST01-005', 3],
      ['ST01-006', 2], ['ST01-007', 4], ['ST01-008', 3], ['ST01-009', 3],
      ['ST01-010', 4], ['ST01-011', 4],
      ['ST01-012', 3], ['ST01-013', 3], ['ST01-014', 2],
      ['ST01-015', 3], ['ST01-016', 2],
    ],
  },
  ST02: {
    id: 'ST02', name: 'Wings of Advance', colors: ['Green', 'Blue'],
    description: 'Wing Gundam & Tallgeese. Aggressive, ramps with EX Resources, and punishes kills with Breach.',
    cards: [
      ['ST02-001', 2], ['ST02-002', 4], ['ST02-003', 4], ['ST02-004', 3], ['ST02-005', 3],
      ['ST02-006', 2], ['ST02-007', 4], ['ST02-008', 3], ['ST02-009', 3],
      ['ST02-010', 4], ['ST02-011', 4],
      ['ST02-012', 3], ['ST02-013', 3], ['ST02-014', 2],
      ['ST02-015', 3], ['ST02-016', 2],
    ],
  },
};

export function deckSize(d: DeckDef): number {
  return d.cards.reduce((n, [, c]) => n + c, 0);
}
