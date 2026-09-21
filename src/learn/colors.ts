// Color identities: what each color does, how to play it, and which pairs work.
// Used by the Colors lesson, the deck builder, and the coach.

import type { Color } from '../game/types';

export interface ColorGuide {
  color: Color;
  hex: string;
  tagline: string;
  identity: string;
  mechanics: string[];       // signature mechanics / keywords
  howToPlay: string[];       // concrete play patterns
  weaknesses: string;
  keyCards: string[];        // card ids in our pool
  factions: string;
}

export const COLORS: Record<Color, ColorGuide> = {
  Blue: {
    color: 'Blue', hex: '#2f6fd6', tagline: 'Card advantage and control of tempo',
    identity: 'Blue plays the long game. It draws extra cards, rests enemy Units so they can be attacked, refunds Resources, and makes tokens. It rarely wins fast, but it rarely runs out of gas.',
    mechanics: ['Rest an enemy Unit (Guntank, Amuro Ray, Siege Ploy)', 'Draw when things happen (Gundam MA Form, Zechs Merquise)', 'Tokens from Bases (White Base, Corsica Base)', 'Reactivate Units and Resources (Tallgeese, Suletta pairs well)'],
    howToPlay: ['Rest a target first, then attack it: Blue turns active Units into legal targets.', 'Spend every Resource; your Base makes tokens with leftovers.', 'Trade Units happily. You draw more than the opponent, so an even trade favors you.'],
    weaknesses: 'Slow starts. A Red or Green deck that curves out can break Shields before Blue stabilizes.',
    keyCards: ['ST01-001', 'ST01-004', 'ST01-010', 'ST02-006', 'ST02-011', 'ST01-015'],
    factions: 'Earth Federation, White Base Team, OZ, Penelope\'s Federation (Flash of Radiance), G Generation (Zeta), Zeon Marines (Char\'s Z\'Gok)',
  },
  Green: {
    color: 'Green', hex: '#2e9e5b', tagline: 'Ramp, big Units, and Breach',
    identity: 'Green accelerates. EX Resources raise your Level early, so your Lv.5-6 Units land a turn ahead of schedule. Green Units are large, and Breach converts Unit kills into Shield damage.',
    mechanics: ['Place EX Resources (Wing Gundam Bird Mode)', '<Breach> (Wing Gundam, Simultaneous Fire)', 'Attack active Units (Wing Gundam)', 'Card advantage from bodies (Char\'s Zaku II, Gouf tokens)'],
    howToPlay: ['Ramp first, then drop a Unit the opponent cannot answer.', 'Attack Units with Breach: the kill plus the Shield is two-for-one.', 'Protect your investment with Peaceful Timbre or The Blue Giant during battles.'],
    weaknesses: 'Few answers to a wide board of cheap Units. If the ramp card does not show up, the curve is clunky.',
    keyCards: ['ST02-001', 'ST02-002', 'ST02-010', 'ST03-006', 'ST03-011', 'ST03-009'],
    factions: 'Operation Meteor, Zeon, Maganac Corps, Clan (Red Gundam), Celestial Being (Dynames, Kyrios), Neo Zeon Newtypes (Qubeley, Funnels), Full Armor Unicorn',
  },
  Red: {
    color: 'Red', hex: '#d64a3a', tagline: 'Aggression, direct damage, and combat tricks',
    identity: 'Red kills things. Cheap Units with high AP, <Support> to stack AP onto one attacker, direct damage to finish wounded Units, <First Strike> and <High-Maneuver> to make attacks connect. Red wants the game over before the opponent\'s big cards matter.',
    mechanics: ['<Support X>: rest a Unit to buff another (Angelo\'s Geara Zulu, Gaza D)', 'Direct damage (Close Combat, Rewloola, Aegis Gundam)', '<High-Maneuver>: can\'t be blocked (Sinanju)', 'AP pumps in the action step (Indignation)'],
    howToPlay: ['Sequence: Support and Base buffs first, then attack with the buffed Unit.', 'Use direct damage on Blockers before you attack, or on a damaged Unit after a battle.', 'Race. Count their Shields and your attackers every turn.'],
    weaknesses: 'Poor recovery. If the opponent stabilizes behind a Base and Blockers, Red runs out of steam.',
    keyCards: ['ST03-001', 'ST03-002', 'ST03-013', 'ST03-010', 'ST04-006', 'ST04-014'],
    factions: 'Neo Zeon, ZAFT, Clan (GQuuuuuuX), Mafty (Ξ Gundam), White Fang (Epyon), Academy (Aerial, Pharact)',
  },
  White: {
    color: 'White', hex: '#8a8fa8', tagline: 'Defense and disruption',
    identity: 'White says no. Blockers redirect attacks, AP reduction makes enemy attacks fizzle, bounce effects return Units (and their Pilots) to hand. White wins by making the opponent\'s plan fail, then closing with a few efficient Units.',
    mechanics: ['<Blocker> on many Units (Demi Trainer, Zowort, Moebius, Aile Strike)', 'AP reduction (Unforeseen Incident, Kira Yamato, Aerial)', 'Bounce to hand (Hawk of Endymion, Aile Strike Gundam)', 'Reactivate Blockers (Archangel)'],
    howToPlay: ['Hold 【Action】 Commands for the opponent\'s attack; they are worth more there than in your Main Phase.', 'Block when your Blocker kills the attacker or survives; take early Shield hits otherwise.', 'Bounce a Unit that has a Pilot on it: two cards for one.'],
    weaknesses: 'Low damage output. White struggles to close a game and can lose to a deck that simply out-resources it.',
    keyCards: ['ST01-008', 'ST01-014', 'ST04-001', 'ST04-010', 'ST04-013', 'ST04-015'],
    factions: 'Academy, Earth Alliance, Gjallarhorn, G Generation (Barbatos, Phoenix), Titans (The-O, Scirocco)',
  },
  Purple: {
    color: 'Purple', hex: '#8c4ad6', tagline: 'Self-damage as fuel',
    identity: 'Purple hurts its own Units on purpose. Damaged Units gain AP or <Suppression>, and pings to your own board turn those bonuses on. It also has hard removal and trash recursion. High risk, explosive turns.',
    mechanics: ['Self-damage engines (CGS Mobile Worker, Mikazuki, With Iron and Blood)', 'Damaged-Unit bonuses (Barbatos 2nd Form AP+2, Barbatos 4th Form <Suppression>)', 'Hard removal (Fatal Strike)', 'Recursion from trash (Akihiro Altland)'],
    howToPlay: ['Deploy a Barbatos, then damage it yourself before attacking: it hits harder while hurt.', 'Never self-damage a Unit down to 0 HP; count first.', 'Suppression breaks two Shields per hit, so a damaged Barbatos 4th Form ends games quickly.'],
    weaknesses: 'Fragile. Your Units are already damaged, so enemy pings and small attackers finish them. Collapses under early pressure.',
    keyCards: ['ST05-001', 'ST05-002', 'ST05-003', 'ST05-010', 'ST05-013', 'ST05-014'],
    factions: 'Tekkadan, Teiwaz, Celestial Being (Exia, Virtue), Minerva Squad (Impulse), Marines (Shamblo), Banshee',
  },
};

export interface Pairing { colors: [Color, Color]; name: string; why: string; starter?: string }

export const PAIRINGS: Pairing[] = [
  { colors: ['Blue', 'White'], name: 'Control fortress', why: 'Blue\'s card advantage plus White\'s Blockers and AP reduction. Survive, out-draw, then win with Link Units. Generation Pulse adds Development: exile trash cards to power effects.', starter: 'ST01 / ST10' },
  { colors: ['Green', 'Blue'], name: 'Ramp control', why: 'Green ramps into Wing Gundam and Tallgeese; Blue rests targets and reactivates for double attacks.', starter: 'ST02' },
  { colors: ['Red', 'Green'], name: 'Fast aggro', why: 'The fastest combination. Green bodies and ramp feed Red\'s Support buffs and unblockable finishers. Clan Unity plays it as a link-trigger deck; Silent Barrage as a Funnel deck.', starter: 'ST03 / ST06 / ST13' },
  { colors: ['White', 'Red'], name: 'Disruptive midrange', why: 'White Blockers and bounce keep you alive while Red snipes Units with Aegis and First Strike.', starter: 'ST04' },
  { colors: ['Purple', 'White'], name: 'Controlled chaos', why: 'Purple\'s self-damage engine behind White Blockers, so your damaged Units live long enough to swing.', starter: 'ST05' },
  { colors: ['Blue', 'Red'], name: 'Balanced midrange', why: 'Blue rests a target, Red\'s buffed attacker kills it. Draw engines keep the pressure fueled.', starter: 'ST08' },
  { colors: ['Purple', 'Blue'], name: 'Stabilized engine', why: 'Blue\'s recovery and draws protect Purple\'s fragile damaged Units. Aquatic Assault plays it as a wide Marine deck.', starter: 'ST11' },
  { colors: ['Green', 'White'], name: 'Tempo control', why: 'Ramp into big Units, protect them with White\'s action-step tricks and Blockers. Heavy Dominion plays it with The-O and Full Armor Unicorn.', starter: 'ST14' },
  { colors: ['Purple', 'Red'], name: 'All-in damage', why: 'Every Unit hits hard; Red\'s direct damage and Purple\'s self-damage make explosive but fragile turns. Destiny Ignition and Raging Onslaught both play it.', starter: 'ST09 / ST12' },
  { colors: ['Purple', 'Green'], name: 'Ramp combo', why: 'Get to Barbatos 4th Form early and start breaking two Shields at a time. Celestial Drive plays it as a trash-filling engine deck.', starter: 'ST07' },
];

export function pairingFor(a: Color, b?: Color): Pairing | undefined {
  if (!b || a === b) return undefined;
  return PAIRINGS.find(p => (p.colors[0] === a && p.colors[1] === b) || (p.colors[0] === b && p.colors[1] === a));
}
