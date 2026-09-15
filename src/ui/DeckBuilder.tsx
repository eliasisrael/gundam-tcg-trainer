import { useMemo, useState } from 'react';
import type { Color } from '../game/types';
import { CARDS, type DeckDef } from '../game/cards';
import { autoBuild, loadCustomDecks, poolFor, poolMax, saveCustomDecks, validateDeck } from '../game/decks';
import { COLORS, pairingFor } from '../learn/colors';
import { CardText, COLOR } from './CardView';

const ALL: Color[] = ['Blue', 'Green', 'Red', 'White', 'Purple'];

export function DeckBuilder({ onExit, initial }: { onExit: () => void; initial?: DeckDef }) {
  const [colors, setColors] = useState<Color[]>(initial ? [...new Set(initial.cards.map(([id]) => CARDS[id].color))] as Color[] : ['Red', 'Green']);
  const [counts, setCounts] = useState<Record<string, number>>(() => initial ? Object.fromEntries(initial.cards) : Object.fromEntries(autoBuild(['Red', 'Green'])));
  const [name, setName] = useState(initial?.name ?? 'My Red/Green deck');
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'UNIT' | 'PILOT' | 'COMMAND' | 'BASE'>('ALL');
  const pool = useMemo(() => poolFor(colors), [colors]);
  const cards = useMemo(() => Object.entries(counts).filter(([, n]) => n > 0) as [string, number][], [counts]);
  const v = validateDeck(cards);
  const pairing = pairingFor(colors[0], colors[1]);

  const toggleColor = (c: Color) => {
    let next: Color[];
    if (colors.includes(c)) next = colors.filter(x => x !== c);
    else if (colors.length >= 2) next = [colors[1], c];
    else next = [...colors, c];
    if (!next.length) return;
    setColors(next);
    // drop cards that no longer fit
    setCounts(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => next.includes(CARDS[id].color))));
    setName(`My ${next.join('/')} deck`);
  };
  const set = (id: string, n: number) => setCounts(prev => ({ ...prev, [id]: Math.max(0, Math.min(4, n)) }));
  const doAuto = () => { setCounts(Object.fromEntries(autoBuild(colors))); setSaved(null); };
  const save = () => {
    const decks = loadCustomDecks();
    const id = initial?.id ?? `custom-${Date.now()}`;
    const def: DeckDef = { id, name: name.trim() || 'Custom deck', colors, description: `Custom ${colors.join('/')} deck: ${pairing?.name ?? colors.join(' & ')}.`, cards };
    const idx = decks.findIndex(d => d.id === id);
    if (idx >= 0) decks[idx] = def; else decks.push(def);
    saveCustomDecks(decks);
    setSaved(def.name);
  };

  const typeTotals = (t: string) => cards.filter(([id]) => CARDS[id].type === t).reduce((n, [, c]) => n + c, 0);
  const curve = [1, 2, 3, 4, 5, 6, 7].map(lv => cards.filter(([id]) => CARDS[id].level === lv && CARDS[id].type !== 'BASE').reduce((n, [, c]) => n + c, 0));
  const shown = filter === 'ALL' ? pool : pool.filter(c => c.type === filter);

  return (
    <div className="builder">
      <div className="topbar">
        <button className="btn ghost" onClick={onExit}>← Menu</button>
        <span className="title">Deck Builder</span>
        <span className="spacer" />
        <button className="btn" onClick={doAuto}>Auto-build for these colors</button>
        <button className="btn primary" disabled={!v.ok} onClick={save} title={v.ok ? '' : v.problems.join(' ')}>Save deck</button>
      </div>
      <div className="builder-body">
        <aside className="builder-side">
          <div className="zone-label">Colors (pick 1 or 2)</div>
          <div className="color-picks">
            {ALL.map(c => <button key={c} className={`color-pick ${colors.includes(c) ? 'on' : ''}`} style={{ '--c': COLOR[c] } as React.CSSProperties} onClick={() => toggleColor(c)}>{c}</button>)}
          </div>
          {colors.map(c => (
            <div key={c} className="color-blurb" style={{ borderColor: COLOR[c] }}>
              <b style={{ color: COLOR[c] }}>{c}: {COLORS[c].tagline}</b>
              <div className="muted small">{COLORS[c].identity}</div>
            </div>
          ))}
          {pairing && <div className="color-blurb pairing"><b>{colors.join(' + ')}: {pairing.name}</b><div className="muted small">{pairing.why}</div>{pairing.starter && <div className="muted small">Starter deck with this pairing: {pairing.starter}.</div>}</div>}
          {colors.length === 2 && !pairing && <div className="color-blurb pairing"><b>{colors.join(' + ')}</b><div className="muted small">An unusual pairing. Lean on each color's strengths: {COLORS[colors[0]].tagline.toLowerCase()} and {COLORS[colors[1]].tagline.toLowerCase()}.</div></div>}

          <div className="zone-label" style={{ marginTop: 12 }}>Deck</div>
          <input className="deck-name" value={name} onChange={e => { setName(e.target.value); setSaved(null); }} />
          <div className={`deck-count ${v.ok ? 'ok' : 'bad'}`}>{v.count} / 50 cards</div>
          {v.problems.map((p, i) => <div key={i} className="muted small problem">{p}</div>)}
          {poolMax(colors) < 50 && <div className="muted small problem">The {colors.join('/')} pool in this trainer has only {poolFor(colors).length} different cards ({poolMax(colors)} at 4 copies each), so a legal 50-card deck needs a second color.</div>}
          {saved && <div className="saved">Saved "{saved}". Pick it in Practice.</div>}
          <div className="stat-row"><span>Units {typeTotals('UNIT')}</span><span>Pilots {typeTotals('PILOT')}</span><span>Commands {typeTotals('COMMAND')}</span><span>Bases {typeTotals('BASE')}</span></div>
          <div className="zone-label">Curve (Lv.1-7, non-Base)</div>
          <div className="curve">{curve.map((n, i) => <div key={i} className="bar" title={`Lv.${i + 1}: ${n}`}><div className="fill" style={{ height: `${Math.min(100, n * 10)}%` }} /><span>{i + 1}</span></div>)}</div>
          <p className="muted small">Guidelines: about 24 Units with plays at every Level from 1 to 5, 8 Pilots that link with your Units, 8-12 Commands, 4-6 Bases. Bursts (Pilots, Bases, some Commands) make your Shields dangerous to attack.</p>
          <div className="zone-label">Your deck list</div>
          <div className="deck-list">
            {cards.sort((a, b) => CARDS[a[0]].type.localeCompare(CARDS[b[0]].type) || CARDS[a[0]].level - CARDS[b[0]].level).map(([id, n]) => <div key={id} className="deck-line"><span className="swatch" style={{ background: COLOR[CARDS[id].color] }} /><span>{n}× {CARDS[id].name}</span><span className="muted small">Lv.{CARDS[id].level}</span></div>)}
          </div>
        </aside>
        <main className="builder-main">
          <div className="tabs">
            {(['ALL', 'UNIT', 'PILOT', 'COMMAND', 'BASE'] as const).map(t => <button key={t} className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>{t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase() + 's'}</button>)}
          </div>
          <div className="pool">
            {shown.map(c => {
              const n = counts[c.id] ?? 0;
              return (
                <div key={c.id} className={`pool-card ${n ? 'in' : ''}`} style={{ '--c': COLOR[c.color] } as React.CSSProperties}>
                  <div className="card-head"><span className="lv">Lv.{c.level}</span><span className="cost">{c.cost}</span></div>
                  <div className="card-name">{c.name}</div>
                  <div className="card-type">{c.type}{c.pilotName ? ' · Pilot' : ''} · {c.color}</div>
                  {(c.type === 'UNIT' || c.type === 'BASE') && <div className="card-stats">{c.type === 'UNIT' ? `${c.ap} AP ` : ''}{c.hp} HP</div>}
                  {(c.type === 'PILOT' || (c.type === 'COMMAND' && c.pilotName)) && <div className="card-stats mod">{c.ap ? `+${c.ap} AP ` : ''}{c.hp ? `+${c.hp} HP` : ''}</div>}
                  {c.link && <div className="card-link">Link: {c.link.join(' / ')}</div>}
                  <CardText text={c.text} />
                  {c.tip && <div className="pool-tip">💡 {c.tip}</div>}
                  <div className="counter">
                    <button className="btn small" onClick={() => set(c.id, n - 1)} disabled={n === 0}>−</button>
                    <b>{n}</b>
                    <button className="btn small" onClick={() => set(c.id, n + 1)} disabled={n >= 4}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
