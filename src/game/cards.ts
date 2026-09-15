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

  // ---------- ST03 Zeon's Rush (Red / Green) ----------
  'ST03-001': {
    id: 'ST03-001', name: 'Sinanju', type: 'UNIT', color: 'Red', level: 6, cost: 5, ap: 5, hp: 4,
    traits: ['Neo Zeon'], link: ['Full Frontal'], zones: ['Space'],
    text: "【During Pair】This Unit gains <High-Maneuver>.\n(This Unit can't be blocked.)\nDuring your turn, when this Unit destroys an enemy shield area card with battle damage, choose 1 enemy Unit. Deal 2 damage to it.",
    tip: 'Red\'s finisher: unblockable once paired, and every Shield or Base it breaks also burns an enemy Unit for 2.',
  },
  'ST03-002': {
    id: 'ST03-002', name: "Angelo's Geara Zulu", type: 'UNIT', color: 'Red', level: 4, cost: 3, ap: 3, hp: 3,
    traits: ['Neo Zeon'], link: ['Angelo Sauper'], zones: ['Space'],
    text: '【Activate･Main】<Support 2> (Rest this Unit. 1 other friendly Unit gets AP+(specified amount) during this turn.)',
    keywords: { support: 2 },
    tip: 'Rest it to give another Unit +2 AP before an attack. Red trades a body for a kill.',
  },
  'ST03-003': {
    id: 'ST03-003', name: 'Geara Zulu', type: 'UNIT', color: 'Red', level: 3, cost: 2, ap: 3, hp: 2,
    traits: ['Neo Zeon'], link: ['(Neo Zeon)'], zones: ['Space'],
    text: '-',
    tip: 'Links with any Neo Zeon pilot (Full Frontal). 3 AP for 2 is pure aggression.',
  },
  'ST03-004': {
    id: 'ST03-004', name: 'Gaza D (Sleeves)', type: 'UNIT', color: 'Red', level: 2, cost: 2, ap: 2, hp: 1,
    traits: ['Neo Zeon'], zones: ['Space'],
    text: '【Activate･Main】<Support 2> (Rest this Unit. 1 other friendly Unit gets AP+(specified amount) during this turn.)',
    keywords: { support: 2 },
    tip: 'Fragile, so use it as a Support battery: +2 AP to your real attacker each turn.',
  },
  'ST03-005': {
    id: 'ST03-005', name: 'Dra-C (Sleeves)', type: 'UNIT', color: 'Red', level: 1, cost: 1, ap: 1, hp: 2,
    traits: ['Neo Zeon'], zones: ['Space'],
    text: '-',
    tip: 'Turn-1 body. Chips a Shield early or soaks a hit later.',
  },
  'ST03-006': {
    id: 'ST03-006', name: "Char's Zaku Ⅱ", type: 'UNIT', color: 'Green', level: 3, cost: 2, ap: 3, hp: 2,
    traits: ['Zeon'], link: ['Char Aznable'], zones: ['Space', 'Earth'],
    text: '【Destroyed】Look at the top 3 cards of your deck. You may reveal 1 (Zeon)/(Neo Zeon) Unit card among them and add it to your hand. Return the remaining cards randomly to the bottom of your deck.',
    tip: 'Green card advantage: trade it away freely, it replaces itself with a Zeon Unit.',
  },
  'ST03-007': {
    id: 'ST03-007', name: 'Zaku Ⅰ', type: 'UNIT', color: 'Green', level: 1, cost: 1, ap: 1, hp: 2,
    traits: ['Zeon'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Cheap body for the curve.',
  },
  'ST03-008': {
    id: 'ST03-008', name: 'Zaku Ⅱ', type: 'UNIT', color: 'Green', level: 2, cost: 1, ap: 1, hp: 2,
    traits: ['Zeon'], zones: ['Space', 'Earth'],
    text: '【Attack】This Unit gets AP+2 during this turn.',
    tip: 'Attacks as a 3 AP Unit for 1 cost, but blocks and defends as a 1 AP Unit.',
  },
  'ST03-009': {
    id: 'ST03-009', name: 'Gouf', type: 'UNIT', color: 'Green', level: 3, cost: 3, ap: 2, hp: 3,
    traits: ['Zeon'], link: ['Ramba Ral'], zones: ['Earth'],
    text: '【Deploy】Deploy 1 rested [Zaku Ⅱ]((Zeon)･AP1･HP1) Unit token.',
    tip: 'Two bodies for one card. The token arrives rested, so it attacks next turn.',
  },
  'ST03-010': {
    id: 'ST03-010', name: 'Full Frontal', type: 'PILOT', color: 'Red', level: 6, cost: 1, ap: 2, hp: 2,
    traits: ['Neo Zeon', 'Cyber-Newtype'],
    text: '【Burst】Add this card to your hand.\n【When Paired】You may deploy 1 (Neo Zeon)/(Zeon) Unit card that is Lv.4 or lower from your hand.',
    tip: 'Pair him and drop a free Geara Zulu or Zaku from hand. Tempo swing.',
  },
  'ST03-011': {
    id: 'ST03-011', name: 'Char Aznable', type: 'PILOT', color: 'Green', level: 3, cost: 1, ap: 1, hp: 1,
    traits: ['Zeon', 'Newtype'],
    text: "【Burst】Add this card to your hand.\n【Attack】During this turn, this Unit gets AP+1 and, if it is a Link Unit, it gains <High-Maneuver>.\n(This Unit can't be blocked.)",
    tip: "On Char's Zaku II the attack can't be blocked: your Shield hits always connect.",
  },
  'ST03-012': {
    id: 'ST03-012', name: 'Indignation', type: 'COMMAND', color: 'Red', level: 2, cost: 1, ap: 1, hp: 0,
    traits: ['Neo Zeon'], timing: ['Main', 'Action'], pilotName: 'Angelo Sauper',
    text: '【Main】/【Action】Choose 1 friendly Unit. It gets AP+2 during this turn.\n【Pilot】[Angelo Sauper]',
    tip: 'A combat trick: +2 AP in the action step turns a losing battle into a kill.',
  },
  'ST03-013': {
    id: 'ST03-013', name: 'Close Combat', type: 'COMMAND', color: 'Red', level: 2, cost: 2,
    traits: [], timing: ['Main', 'Action'],
    text: "【Burst】Activate this card's 【Main】.\n【Main】/【Action】Choose 1 enemy Unit. Deal 2 damage to it.",
    tip: 'Direct damage: finish a damaged Unit or kill a 2 HP blocker before you attack.',
  },
  'ST03-014': {
    id: 'ST03-014', name: 'The Blue Giant', type: 'COMMAND', color: 'Green', level: 4, cost: 1, ap: 1, hp: 1,
    traits: ['Zeon'], timing: ['Action'], pilotName: 'Ramba Ral',
    text: "【Action】Choose 1 friendly Unit. It can't receive battle damage from enemy Units with 2 or less AP during this battle.\n【Pilot】[Ramba Ral]",
    tip: 'Protects a Unit from small attackers this battle, or pairs as Ramba Ral to link Gouf.',
  },
  'ST03-015': {
    id: 'ST03-015', name: 'Rewloola', type: 'BASE', color: 'Red', level: 3, cost: 2, ap: 0, hp: 5,
    traits: ['Neo Zeon', 'Warship'], zones: ['Space'],
    text: '【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand. Then, choose 1 enemy Unit with 5 or less AP. Deal 1 damage to it.',
    tip: 'A wall that also pings an enemy Unit on arrival.',
  },
  'ST03-016': {
    id: 'ST03-016', name: 'Falmel', type: 'BASE', color: 'Green', level: 3, cost: 2, ap: 0, hp: 5,
    traits: ['Zeon', 'Warship'], zones: ['Space'],
    text: "【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand. Then, if it is your turn, deploy 1 rested [Char's Zaku Ⅱ]((Zeon)･AP3･HP1) Unit token.",
    tip: 'Deploy on your turn for a free 3 AP token.',
  },

  // ---------- ST04 SEED Strike (White / Red) ----------
  'ST04-001': {
    id: 'ST04-001', name: 'Aile Strike Gundam', type: 'UNIT', color: 'White', level: 5, cost: 4, ap: 4, hp: 4,
    traits: ['Earth Alliance'], link: ['Kira Yamato'], zones: ['Space', 'Earth'],
    text: "<Blocker> (Rest this Unit to change the attack target to it.)\n【When Paired･Lv.4 or Higher Pilot】Choose 1 enemy Unit with 4 or less HP. Return it to its owner's hand.",
    keywords: { blocker: true },
    tip: 'A 4/4 Blocker that bounces an enemy Unit when Kira lands: they lose the tempo and the Pilot on it.',
  },
  'ST04-002': {
    id: 'ST04-002', name: 'Strike Gundam', type: 'UNIT', color: 'White', level: 4, cost: 2, ap: 3, hp: 3,
    traits: ['Earth Alliance'], link: ['Kira Yamato'], zones: ['Space', 'Earth'],
    text: '【Deploy】Draw 1. Then, discard 1.',
    tip: 'Filters your hand: draw first, then throw away the card you least need.',
  },
  'ST04-003': {
    id: 'ST04-003', name: 'Moebius Zero', type: 'UNIT', color: 'White', level: 3, cost: 2, ap: 2, hp: 4,
    traits: ['Earth Alliance'], link: ['Mu La Flaga'], zones: ['Space'],
    text: '-',
    tip: 'Sturdy. Links with Hawk of Endymion played as Mu La Flaga.',
  },
  'ST04-004': {
    id: 'ST04-004', name: 'Moebius', type: 'UNIT', color: 'White', level: 1, cost: 1, ap: 1, hp: 1,
    traits: ['Earth Alliance'], zones: ['Space'],
    text: '<Blocker> (Rest this Unit to change the attack target to it.)',
    keywords: { blocker: true },
    tip: 'One-cost Blocker.',
  },
  'ST04-005': {
    id: 'ST04-005', name: 'Strike Dagger', type: 'UNIT', color: 'White', level: 2, cost: 2, ap: 3, hp: 2,
    traits: ['Earth Alliance'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Early attacker.',
  },
  'ST04-006': {
    id: 'ST04-006', name: 'Aegis Gundam', type: 'UNIT', color: 'Red', level: 4, cost: 3, ap: 4, hp: 3,
    traits: ['ZAFT'], link: ['Athrun Zala'], zones: ['Space', 'Earth'],
    text: '【Attack】If this Unit has 5 or more AP, choose 1 enemy Unit that is Lv.5 or higher. Deal 3 damage to it.',
    tip: 'With Athrun (+1 AP) it hits 5 AP and snipes a big enemy Unit for 3 every attack.',
  },
  'ST04-007': {
    id: 'ST04-007', name: 'Aegis Gundam (MA Mode)', type: 'UNIT', color: 'Red', level: 4, cost: 3, ap: 3, hp: 4,
    traits: ['ZAFT'], link: ['Athrun Zala'], zones: ['Space', 'Earth'],
    text: "<Breach 3> (When this Unit's attack destroys an enemy Unit, deal the specified amount of damage to the first card in that opponent's shield area.)",
    keywords: { breach: 3 },
    tip: 'Kill a Unit and Breach 3 hits their Base or breaks a Shield.',
  },
  'ST04-008': {
    id: 'ST04-008', name: 'Ginn', type: 'UNIT', color: 'Red', level: 2, cost: 1, ap: 2, hp: 2,
    traits: ['ZAFT'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Efficient 2/2 for 1.',
  },
  'ST04-009': {
    id: 'ST04-009', name: "Miguel's Ginn", type: 'UNIT', color: 'Red', level: 2, cost: 2, ap: 3, hp: 1,
    traits: ['ZAFT'], link: ['Miguel Ayman'], zones: ['Space', 'Earth'],
    text: '【During Pair】【Destroyed】If you have another Link Unit in play, draw 1.',
    tip: 'Glass cannon. Paired and with another Link Unit out, dying draws you a card.',
  },
  'ST04-010': {
    id: 'ST04-010', name: 'Kira Yamato', type: 'PILOT', color: 'White', level: 4, cost: 1, ap: 2, hp: 1,
    traits: ['Earth Alliance', 'Coordinator'],
    text: '【Burst】Add this card to your hand.\n【Attack】Choose 1 enemy Unit. It gets AP-2 during this battle.',
    tip: 'Every attack shrinks the defender by 2 AP: your Unit survives trades it should lose.',
  },
  'ST04-011': {
    id: 'ST04-011', name: 'Athrun Zala', type: 'PILOT', color: 'Red', level: 4, cost: 1, ap: 1, hp: 2,
    traits: ['ZAFT', 'Coordinator'],
    text: '【Burst】Add this card to your hand.\n【When Linked】During this turn, this Unit may choose an active enemy Unit that is Lv.5 or lower as its attack target.',
    tip: 'Link him onto Aegis and attack an active Unit the same turn: no waiting for it to rest.',
  },
  'ST04-012': {
    id: 'ST04-012', name: 'Striker Pack', type: 'COMMAND', color: 'White', level: 4, cost: 2,
    traits: [], timing: ['Main'],
    text: '【Burst】If you have no (Earth Alliance) Unit tokens in play, deploy 1 [Aile Strike Gundam]((Earth Alliance)･AP3･HP3･<Blocker>) Unit token.\n【Main】If you have no (Earth Alliance) Unit tokens in play, deploy 1 [Sword Strike Gundam]((Earth Alliance)･AP4･HP2･<Blocker>) or 1 [Launcher Strike Gundam]((Earth Alliance)･AP2･HP4･<Blocker>) Unit token.',
    tip: 'A Blocker token on demand. Sword to kill, Launcher to wall.',
  },
  'ST04-013': {
    id: 'ST04-013', name: 'Hawk of Endymion', type: 'COMMAND', color: 'White', level: 2, cost: 1, ap: 1, hp: 0,
    traits: ['Earth Alliance'], timing: ['Main', 'Action'], pilotName: 'Mu La Flaga',
    text: "【Main】/【Action】Choose 1 enemy Unit with 3 or less HP. Return it to its owner's hand.\n【Pilot】[Mu La Flaga]",
    tip: 'Bounce an attacker mid-battle and its attack fizzles. White disruption at its best.',
  },
  'ST04-014': {
    id: 'ST04-014', name: 'The Magic Bullet of Dusk', type: 'COMMAND', color: 'Red', level: 3, cost: 1, ap: 0, hp: 1,
    traits: ['ZAFT', 'Coordinator'], timing: ['Main', 'Action'], pilotName: 'Miguel Ayman',
    text: '【Main】/【Action】Choose 1 friendly Unit that is Lv.2 or lower. It gains <First Strike> during this turn.\n(While this Unit is attacking, it deals damage before the enemy Unit.)\n【Pilot】[Miguel Ayman]',
    tip: "First Strike on Miguel's Ginn: 3 AP kills first and takes nothing back.",
  },
  'ST04-015': {
    id: 'ST04-015', name: 'Archangel', type: 'BASE', color: 'White', level: 3, cost: 1, ap: 0, hp: 5,
    traits: ['Earth Alliance', 'Warship'], zones: ['Space', 'Earth'],
    text: "【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand.\n【Activate･Main】【Once per Turn】②：Choose 1 friendly Unit with <Blocker>. Set it as active. It can't attack during this turn.",
    tip: 'Attack with a Blocker, then pay 2 to stand it back up as a defender.',
  },
  'ST04-016': {
    id: 'ST04-016', name: 'Vesalius', type: 'BASE', color: 'Red', level: 3, cost: 1, ap: 0, hp: 5,
    traits: ['ZAFT', 'Warship'], zones: ['Space'],
    text: '【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand.\n【Activate･Main】Rest this Base：Choose 1 friendly Unit. It gets AP+1 during this turn.',
    tip: 'Free +1 AP every turn: rest it before your key attack.',
  },

  // ---------- ST05 Iron Bloom (Purple / White) ----------
  'ST05-001': {
    id: 'ST05-001', name: 'Gundam Barbatos 4th Form', type: 'UNIT', color: 'Purple', level: 6, cost: 4, ap: 4, hp: 5,
    traits: ['Tekkadan', 'Gundam Frame'], link: ['Mikazuki Augus'], zones: ['Space', 'Earth'],
    text: '【Deploy】Choose 1 of your other Units. Deal 1 damage to it. It gets AP+1 during this turn.\nWhile this is damaged, it gains <Suppression>.\n(Damage to Shields by an attack is dealt to the first 2 cards simultaneously.)',
    tip: 'Purple wants its own Units hurt. Damaged, Barbatos breaks two Shields per hit.',
  },
  'ST05-002': {
    id: 'ST05-002', name: 'Gundam Barbatos 2nd Form', type: 'UNIT', color: 'Purple', level: 4, cost: 2, ap: 2, hp: 4,
    traits: ['Tekkadan', 'Gundam Frame'], link: ['Mikazuki Augus'], zones: ['Space', 'Earth'],
    text: 'While this Unit is damaged, it gets AP+2.',
    tip: 'A 2/4 that becomes 4/3 after one damage. Ping it yourself with Mobile Worker or Mikazuki.',
  },
  'ST05-003': {
    id: 'ST05-003', name: 'CGS Mobile Worker', type: 'UNIT', color: 'Purple', level: 1, cost: 1, ap: 0, hp: 2,
    traits: ['Tekkadan'], zones: ['Earth'],
    text: '【Activate･Main】Rest this Unit：Choose 1 of your Units. Deal 1 damage to it. It gets AP+1 during this turn.',
    tip: 'The engine: rest it to damage (and buff) your own Unit, turning on Purple\'s damaged bonuses.',
  },
  'ST05-004': {
    id: 'ST05-004', name: 'Graze Custom', type: 'UNIT', color: 'Purple', level: 2, cost: 1, ap: 2, hp: 2,
    traits: ['Tekkadan'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Curve filler.',
  },
  'ST05-005': {
    id: 'ST05-005', name: 'Gundam Gusion Rebake', type: 'UNIT', color: 'Purple', level: 4, cost: 3, ap: 3, hp: 4,
    traits: ['Tekkadan', 'Gundam Frame'], link: ['Akihiro Altland'], zones: ['Space', 'Earth'],
    text: '【Destroyed】Choose 1 enemy Unit with 4 or less AP. Rest it.',
    tip: 'Even dying helps: it rests an enemy Unit so your next attacker has a target.',
  },
  'ST05-006': {
    id: 'ST05-006', name: 'Hyakuren', type: 'UNIT', color: 'Purple', level: 3, cost: 2, ap: 4, hp: 3,
    traits: ['Teiwaz'], zones: ['Space'],
    text: '-',
    tip: '4 AP for 2 cost. Purple pays for stats with fragility elsewhere.',
  },
  'ST05-007': {
    id: 'ST05-007', name: "McGillis' Schwalbe Graze", type: 'UNIT', color: 'White', level: 4, cost: 3, ap: 4, hp: 2,
    traits: ['Gjallarhorn'], link: ['McGillis Fareed'], zones: ['Space', 'Earth'],
    text: '<Blocker> (Rest this Unit to change the attack target to it.)\n【When Paired】Choose 1 enemy Unit that is Lv.3 or lower. It gets AP-2 during this turn.',
    keywords: { blocker: true },
    tip: 'A hard-hitting Blocker; pairing shrinks a small enemy so you can kill it safely.',
  },
  'ST05-008': {
    id: 'ST05-008', name: 'Graze Commander Type', type: 'UNIT', color: 'White', level: 3, cost: 2, ap: 3, hp: 2,
    traits: ['Gjallarhorn'], link: ['(Gjallarhorn)'], zones: ['Space', 'Earth'],
    text: '<Blocker> (Rest this Unit to change the attack target to it.)',
    keywords: { blocker: true },
    tip: 'Links with any Gjallarhorn pilot (McGillis).',
  },
  'ST05-009': {
    id: 'ST05-009', name: 'Graze', type: 'UNIT', color: 'White', level: 2, cost: 1, ap: 2, hp: 2,
    traits: ['Gjallarhorn'], zones: ['Space', 'Earth'],
    text: '-',
    tip: 'Efficient early body.',
  },
  'ST05-010': {
    id: 'ST05-010', name: 'Mikazuki Augus', type: 'PILOT', color: 'Purple', level: 4, cost: 1, ap: 2, hp: 1,
    traits: ['Tekkadan', 'Alaya-Vijnana'],
    text: '【Burst】Add this card to your hand.\n【When Paired】Choose 1 of your Units and 1 enemy Unit. Deal 1 damage to them.',
    tip: 'Damages your Barbatos (turning on its bonus) and an enemy at the same time.',
  },
  'ST05-011': {
    id: 'ST05-011', name: 'Akihiro Altland', type: 'PILOT', color: 'Purple', level: 3, cost: 1, ap: 1, hp: 1,
    traits: ['Tekkadan', 'Alaya-Vijnana'],
    text: '【Burst】Add this card to your hand.\n【During Link】During your turn, when this Unit destroys an enemy Unit with battle damage, choose 1 (Tekkadan) Unit card that is Lv.2 or lower from your trash. Add it to your hand.',
    tip: 'Recursion: linked on Gusion Rebake, every kill returns a cheap Tekkadan Unit from the trash.',
  },
  'ST05-012': {
    id: 'ST05-012', name: 'McGillis Fareed', type: 'PILOT', color: 'White', level: 4, cost: 1, ap: 2, hp: 1,
    traits: ['Gjallarhorn'],
    text: '【Burst】Add this card to your hand.\n【When Paired】If you have 2 or more other (Gjallarhorn)/(Tekkadan) Units in play, choose 1 enemy Unit with 3 or less HP. Rest it.',
    tip: 'With a board, pairing him rests an enemy Unit for your attackers.',
  },
  'ST05-013': {
    id: 'ST05-013', name: 'With Iron and Blood', type: 'COMMAND', color: 'Purple', level: 2, cost: 1,
    traits: [], timing: ['Main', 'Action'],
    text: '【Main】/【Action】Choose 1 of your Units. Deal 1 damage to it. It gets AP+3 during this turn.',
    tip: 'Self-damage for +3 AP, playable mid-battle. Also turns on Barbatos.',
  },
  'ST05-014': {
    id: 'ST05-014', name: 'Fatal Strike', type: 'COMMAND', color: 'Purple', level: 4, cost: 2,
    traits: [], timing: ['Main'],
    text: '【Burst】Choose 1 enemy Unit. Deal 1 damage to it.\n【Main】Choose 1 enemy Unit that is Lv.3 or lower. Destroy it.',
    tip: 'Hard removal for small Units; as a Burst it pings instead.',
  },
  'ST05-015': {
    id: 'ST05-015', name: 'Isaribi', type: 'BASE', color: 'Purple', level: 3, cost: 1, ap: 0, hp: 5,
    traits: ['Tekkadan', 'Warship'], zones: ['Space'],
    text: '【Burst】Deploy this card.\n【Deploy】Add 1 of your Shields to your hand.\n【Activate･Main】Rest this Base：Choose 1 of your damaged Units. It gets AP+2 during this turn.',
    tip: 'Rewards the self-damage plan: +2 AP to a damaged Unit every turn.',
  },
};

export const TOKENS: Record<string, TokenDef> = {
  'T-001': { id: 'T-001', name: 'Gundam', ap: 3, hp: 3, traits: ['White Base Team'] },
  'T-002': { id: 'T-002', name: 'Guncannon', ap: 2, hp: 2, traits: ['White Base Team'] },
  'T-003': { id: 'T-003', name: 'Guntank', ap: 1, hp: 1, traits: ['White Base Team'] },
  'T-004': { id: 'T-004', name: 'Leo', ap: 1, hp: 1, traits: ['OZ'] },
  'T-005': { id: 'T-005', name: 'Tallgeese', ap: 4, hp: 2, traits: ['OZ'] },
  'T-006': { id: 'T-006', name: "Char's Zaku Ⅱ", ap: 3, hp: 1, traits: ['Zeon'] },
  'T-007': { id: 'T-007', name: 'Zaku Ⅱ', ap: 1, hp: 1, traits: ['Zeon'] },
  'T-008': { id: 'T-008', name: 'Aile Strike Gundam', ap: 3, hp: 3, traits: ['Earth Alliance'], keywords: { blocker: true } },
  'T-009': { id: 'T-009', name: 'Launcher Strike Gundam', ap: 2, hp: 4, traits: ['Earth Alliance'], keywords: { blocker: true } },
  'T-010': { id: 'T-010', name: 'Sword Strike Gundam', ap: 4, hp: 2, traits: ['Earth Alliance'], keywords: { blocker: true } },
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
  ST03: {
    id: 'ST03', name: "Zeon's Rush", colors: ['Red', 'Green'],
    description: 'Sinanju & Char. Red aggression: Support buffs, direct damage, unblockable attacks; Green bodies that replace themselves.',
    cards: [
      ['ST03-001', 2], ['ST03-002', 4], ['ST03-003', 4], ['ST03-004', 3], ['ST03-005', 3],
      ['ST03-006', 2], ['ST03-007', 3], ['ST03-008', 4], ['ST03-009', 3],
      ['ST03-010', 4], ['ST03-011', 4],
      ['ST03-012', 3], ['ST03-013', 3], ['ST03-014', 2],
      ['ST03-015', 3], ['ST03-016', 3],
    ],
  },
  ST04: {
    id: 'ST04', name: 'SEED Strike', colors: ['White', 'Red'],
    description: 'Strike & Aegis. White disruption: Blockers, bounce, AP reduction; Red sniping with Aegis and First Strike.',
    cards: [
      ['ST04-001', 2], ['ST04-002', 4], ['ST04-003', 4], ['ST04-004', 3], ['ST04-005', 3],
      ['ST04-006', 2], ['ST04-007', 4], ['ST04-008', 3], ['ST04-009', 3],
      ['ST04-010', 4], ['ST04-011', 4],
      ['ST04-012', 3], ['ST04-013', 3], ['ST04-014', 2],
      ['ST04-015', 3], ['ST04-016', 3],
    ],
  },
  ST05: {
    id: 'ST05', name: 'Iron Bloom', colors: ['Purple', 'White'],
    description: 'Barbatos & Tekkadan. Purple self-damage that powers up your Units and Suppression; White Blockers to hold the line.',
    cards: [
      ['ST05-001', 2], ['ST05-002', 4], ['ST05-003', 4], ['ST05-004', 4], ['ST05-005', 4], ['ST05-006', 4],
      ['ST05-007', 2], ['ST05-008', 4], ['ST05-009', 4],
      ['ST05-010', 4], ['ST05-011', 3], ['ST05-012', 3],
      ['ST05-013', 3], ['ST05-014', 2], ['ST01-014', 1],
      ['ST05-015', 2],
    ],
  },
};

export function deckSize(d: DeckDef): number {
  return d.cards.reduce((n, [, c]) => n + c, 0);
}
