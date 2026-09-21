// Keyword and timing glossary, shared by the drills screen and the card hover/inspector panels.

export const GLOSSARY: [string, string][] = [
  ['Active / Rested', 'Upright cards are active; sideways cards are rested. Attacking rests a Unit; paying costs rests Resources. Everything re-activates in your Start Phase.'],
  ['Lv. (Level)', 'Minimum number of Resources you must have in play to play the card. Rested Resources still count.'],
  ['Cost', 'Number of active Resources you rest to play the card.'],
  ['EX Base', '0 AP / 3 HP Base token each player starts with. Absorbs attacks until destroyed.'],
  ['EX Resource', 'Bonus Resource token for Player Two (and from effects). Counts toward Level; removed from the game when spent.'],
  ['Shield', 'Face-down card in your shield area. 1 HP each. Destroyed Shields are revealed and may trigger 【Burst】.'],
  ['Link Unit', 'A Unit paired with a Pilot that meets its link requirement. Can attack the turn it is deployed.'],
  ['Pair', 'Place a Pilot (or a Command with a 【Pilot】 effect) under a Unit. Permanent until the Unit leaves.'],
  ['<Repair X>', 'At the end of your turn, this Unit recovers X HP.'],
  ['<Breach X>', 'When this Unit destroys an enemy Unit with battle damage on your turn, deal X damage to their Base or top Shield.'],
  ['<Support X>', 'Rest this Unit in your Main Phase: another friendly Unit gets AP+X this turn.'],
  ['<Blocker>', 'When an enemy attacks, rest this active Unit to become the attack target instead. Once per attack.'],
  ['<First Strike>', 'When attacking, deals battle damage before the defender. If the defender dies, it deals no damage back.'],
  ['<High-Maneuver>', 'While this Unit attacks, enemy Units cannot use <Blocker>.'],
  ['<Suppression>', 'When this Unit deals battle damage to a Shield, it damages the first two Shields at once.'],
  ['【Deploy】', 'Triggers when the card enters the battle area or base section.'],
  ['【Attack】', 'Triggers when the Unit declares an attack.'],
  ['【Destroyed】', 'Triggers when the Unit or Base is destroyed.'],
  ['【When Paired】 / 【During Pair】', 'Triggers when a Pilot is paired / active while a Pilot is paired.'],
  ['【When Linked】 / 【During Link】', 'Same, but only for a Pilot that meets the link requirement.'],
  ['【Main】 / 【Action】', 'Command timing: your Main Phase / any action step (during battles or the End Phase).'],
  ['【Activate･Main】 / 【Activate･Action】', 'Effects you choose to activate, sometimes with a cost like ②. Once per Turn if marked.'],
  ['【Burst】', 'Free effect you may activate when this card is destroyed as a Shield and revealed.'],
  ['Battle steps', 'Attack → Block → Action → Damage → Battle end.'],
  ['Turn phases', 'Start → Draw → Resource → Main → End.'],
  ['【Once per Turn】', 'This effect can be used only once during the turn. Each copy of a card gets its own use.'],
  ['【Pilot】', 'A Command with a 【Pilot】 line may be played as a Pilot instead of cast: pay its cost and pair it with a Unit. Its printed +AP/+HP then apply.'],
  ['Development X', 'You may exile X cards with the named trait from your trash (remove them from the game). If you do, the effect after ■ resolves.'],
  ['Exile', 'Removed from the game: the card leaves your trash and cannot come back. Some effects exile as a cost (Development, Banshee) or as a punishment (Pharact).'],
  ['Unit token', 'A Unit with no card, made by an effect. Bit / Funnel tokens can\'t attack or be paired, but Qubeley can make them fight in a damage-step-only battle.'],
  ['Link requirement', 'The Pilot name or (trait) a Unit needs. A Unit paired with a matching Pilot is a Link Unit and may attack the turn it is deployed.'],
];

/** Map a term as it appears on a card (e.g. "<Breach 3>", "【During Pair】") to its glossary entry. */
function lookup(term: string): [string, string] | undefined {
  const norm = term.replace(/\s+\d+>/, ' X>').replace(/\s*·\s*/g, '･');
  return GLOSSARY.find(([k]) => {
    if (k === norm) return true;
    // Compound keys like "【When Paired】 / 【During Pair】" match either half.
    return k.split(' / ').some(part => part.trim() === norm);
  });
}

/** Every keyword and timing icon in a card's text, each with a one-line explanation. Deduplicated, in order of appearance. */
export function explainCardText(text: string): { term: string; def: string }[] {
  const out: { term: string; def: string }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(【[^】]+】|<[^>]+>)/g)) {
    const raw = m[1];
    if (raw.startsWith('(')) continue;
    // "【When Paired･(White Base Team) Pilot】" -> "【When Paired】", but keep "【Activate･Main】" intact.
    const norm = raw.replace(/・/g, '･');
    const term = norm.startsWith('【Activate') ? norm : norm.replace(/･.*】$/, '】');
    if (/Development \d/.test(norm)) { const dev = lookup('Development X'); if (dev && !seen.has(dev[0])) { seen.add(dev[0]); out.push({ term: dev[0], def: dev[1] }); } }
    const hit = lookup(term);
    if (!hit || seen.has(hit[0])) continue;
    seen.add(hit[0]);
    out.push({ term: hit[0], def: hit[1] });
  }
  return out;
}
