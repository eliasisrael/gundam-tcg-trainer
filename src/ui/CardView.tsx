import type { CardInstance, UnitState, BaseState, PlayerId } from '../game/types';
import type { GameState } from '../game/types';
import { CARDS } from '../game/cards';
import { baseHp, baseMaxHp, cardName, isLinked, pilotName, unitAp, unitHp, unitKeywords, unitLevel, unitMaxHp } from '../game/engine';
import { cardImage, isMissing, markMissing, setPeek, useArtAvailable, useSettings } from './settings';
import { explainCardText } from '../learn/glossary';

/** Called when a card's magnifier is clicked: opens the full-size inspector. */
export let openInspector: (defId: string) => void = () => {};
export function setInspectorOpener(fn: (defId: string) => void) { openInspector = fn; }

function Magnifier({ defId }: { defId: string }) {
  return <span className="magnify" role="button" title="Inspect card" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openInspector(defId); }}>🔍</span>;
}
const peekProps = (defId: string, uid?: number) => ({ onPointerEnter: () => setPeek(defId, uid), onPointerLeave: () => setPeek(null) });

const COLOR: Record<string, string> = { Blue: '#2f6fd6', Green: '#2e9e5b', Red: '#d64a3a', White: '#8a8fa8', Purple: '#8c4ad6' };

/** Render card text with keyword highlighting. */
export function CardText({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean);
  return (
    <div className="card-text">
      {lines.map((l, i) => <div key={i}>{highlight(l)}</div>)}
    </div>
  );
}

function highlight(line: string) {
  const parts = line.split(/(【[^】]+】|<[^>]+>|\([^)]+\))/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('【')) return <span key={i} className="kw-timing">{p}</span>;
    if (p.startsWith('<')) return <span key={i} className="kw-keyword">{p}</span>;
    if (p.startsWith('(') && p.length < 30) return <span key={i} className="kw-trait">{p}</span>;
    return <span key={i}>{p}</span>;
  });
}

/** Whether to show the printed card art for this card id. */
function useArt(defId: string): boolean {
  const s = useSettings();
  const available = useArtAvailable();
  return s.art && available !== false && !isMissing(defId);
}

/** The printed card image; a load failure marks the card so it falls back to the text card. */
export function CardArt({ defId, alt }: { defId: string; alt: string }) {
  return <img className="card-art" src={cardImage(defId)} alt={alt} draggable={false} onError={() => markMissing(defId)} />;
}

export interface DragProps {
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  dragging?: boolean;
  drop?: 'ok' | 'hover';
  dropId?: string;
}

export function HandCard({ card, onClick, selected, disabled, reason, drag, anim }: { card: CardInstance; onClick?: () => void; selected?: boolean; disabled?: boolean; reason?: string; drag?: DragProps; anim?: string }) {
  const d = CARDS[card.defId];
  const art = useArt(card.defId);
  return (
    <button className={`card hand-card type-${d.type.toLowerCase()} ${art ? 'with-art' : ''} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${drag?.dragging ? 'dragging' : ''} ${!disabled && drag?.onPointerDown ? 'draggable' : ''} ${anim ?? ''}`} style={{ '--c': COLOR[d.color] } as React.CSSProperties} onClick={onClick} onPointerDown={disabled ? undefined : drag?.onPointerDown} title={disabled && reason ? `${d.name}: ${reason}` : d.name} {...peekProps(card.defId)}>
      <Magnifier defId={card.defId} />
      {art ? <CardArt defId={card.defId} alt={d.name} /> : (
        <>
          <div className="card-head">
            <span className="lv">Lv.{d.level}</span>
            <span className="cost">{d.cost}</span>
          </div>
          <div className="card-name">{d.name}</div>
          <div className="card-type">{d.type}{d.pilotName ? ' · Pilot' : ''}</div>
          {(d.type === 'UNIT' || d.type === 'BASE') && <div className="card-stats">{d.type === 'UNIT' ? `${d.ap} AP` : ''} {d.hp} HP</div>}
          {(d.type === 'PILOT' || (d.type === 'COMMAND' && d.pilotName)) && <div className="card-stats mod">{d.ap ? `+${d.ap} AP` : ''} {d.hp ? `+${d.hp} HP` : ''}</div>}
          {d.link && <div className="card-link">Link: {d.link.join(' / ')}</div>}
          <div className="card-text compact"><CardText text={d.text} /></div>
        </>
      )}
    </button>
  );
}

export function UnitCard({ state, unit, owner, onClick, selected, highlight: hl, canAct, dim, drag, anim, dmg }: { state: GameState; unit: UnitState; owner: PlayerId; onClick?: () => void; selected?: boolean; highlight?: boolean; canAct?: boolean; dim?: boolean; drag?: DragProps; anim?: string; dmg?: number }) {
  const d = unit.card.token ? undefined : CARDS[unit.card.defId];
  const art = useArt(unit.card.defId);
  const ap = unitAp(state, unit, owner), hp = unitHp(unit), max = unitMaxHp(unit);
  const kw = unitKeywords(unit, state);
  const baseAp = unit.card.token ? unit.card.token.ap : (d?.ap ?? 0);
  const kws = [kw.repair && `Repair ${kw.repair}`, kw.breach && `Breach ${kw.breach}`, kw.support && `Support ${kw.support}`, kw.blocker && 'Blocker', kw.firstStrike && 'First Strike', kw.highManeuver && 'High-Maneuver', kw.suppression && 'Suppression'].filter(Boolean) as string[];
  // Keywords granted by effects (not printed on the card) are worth showing over the art.
  const grantedKws = kws.filter(k => ['First Strike', 'High-Maneuver', 'Suppression'].includes(k) || (k.startsWith('Breach') && unit.tempKeywords.breach));
  const sick = unit.deployedTurn === state.turn && state.active === owner && !isLinked(unit);
  return (
    <button className={`card unit ${art ? 'with-art' : ''} ${unit.rested ? 'rested' : ''} ${selected ? 'selected' : ''} ${hl ? 'highlight' : ''} ${canAct ? 'can-act' : ''} ${dim ? 'dim' : ''} ${unit.card.token ? 'token' : ''} ${drag?.dragging ? 'dragging' : ''} ${canAct && drag?.onPointerDown ? 'draggable' : ''} ${drag?.drop ? 'drop-' + drag.drop : ''} ${anim ?? ''}`}
      data-drop={drag?.dropId} style={{ '--c': d ? COLOR[d.color] : '#666' } as React.CSSProperties} onClick={onClick} onPointerDown={canAct ? drag?.onPointerDown : undefined} title={cardName(unit.card)} {...peekProps(unit.card.defId, unit.card.uid)}>
      <Magnifier defId={unit.card.defId} />
      {art ? (
        <>
          <CardArt defId={unit.card.defId} alt={cardName(unit.card)} />
          <div className="art-top">{unit.rested && <span className="badge">Rested</span>}{sick && <span className="badge">new</span>}</div>
          {grantedKws.length > 0 && <div className="art-kws">{grantedKws.map(k => <span key={k} className="kw-keyword">&lt;{k}&gt;</span>)}</div>}
          {unit.pilot && <div className={`pilot-tag art ${isLinked(unit) ? 'linked' : ''}`}>{isLinked(unit) ? '⛓ ' : '👤 '}{pilotName(unit.pilot)}</div>}
          <div className="art-stats"><span className={ap !== baseAp ? 'mod' : ''}>{ap} AP</span><span className={hp < max ? 'hurt' : ''}>{hp}/{max} HP</span></div>
        </>
      ) : (
        <>
          <div className="card-head"><span className="lv">{unit.card.token ? 'Token' : `Lv.${unitLevel(unit)}`}</span>{unit.rested && <span className="badge">Rested</span>}</div>
          <div className="card-name">{cardName(unit.card)}</div>
          <div className="card-stats big"><span className={ap !== baseAp ? 'mod' : ''}>{ap} AP</span> <span className={hp < max ? 'hurt' : ''}>{hp}/{max} HP</span></div>
          {kws.length > 0 && <div className="card-kws">{kws.map(k => <span key={k} className="kw-keyword">&lt;{k}&gt;</span>)}</div>}
          {unit.pilot && <div className={`pilot-tag ${isLinked(unit) ? 'linked' : ''}`}>{isLinked(unit) ? '⛓ ' : '👤 '}{pilotName(unit.pilot)}</div>}
          {sick && <div className="sick">deployed this turn</div>}
        </>
      )}
      {dmg ? <span className="dmg-float">-{dmg}</span> : null}
    </button>
  );
}

export function BaseCard({ base, onClick, highlight: hl, drop, dropId, anim }: { base: BaseState; onClick?: () => void; highlight?: boolean; drop?: 'ok' | 'hover'; dropId?: string; anim?: string }) {
  const d = base.card.token ? undefined : CARDS[base.card.defId];
  const art = useArt(base.card.defId) && !base.isEx;
  return (
    <button className={`card base ${art ? 'with-art' : ''} ${base.rested ? 'rested' : ''} ${hl ? 'highlight' : ''} ${base.isEx ? 'token' : ''} ${drop ? 'drop-' + drop : ''} ${anim ?? ''}`} data-drop={dropId} style={{ '--c': d ? COLOR[d.color] : '#666' } as React.CSSProperties} onClick={onClick} title={cardName(base.card)} {...peekProps(base.card.defId, base.card.uid)}>
      {!base.isEx && <Magnifier defId={base.card.defId} />}
      {art ? (
        <>
          <CardArt defId={base.card.defId} alt={cardName(base.card)} />
          <div className="art-top">{base.rested && <span className="badge">Rested</span>}</div>
          <div className="art-stats"><span className={base.damage ? 'hurt' : ''}>{baseHp(base)}/{baseMaxHp(base)} HP</span></div>
        </>
      ) : (
        <>
          <div className="card-head"><span className="lv">BASE</span>{base.rested && <span className="badge">Rested</span>}</div>
          <div className="card-name">{cardName(base.card)}</div>
          <div className="card-stats big"><span className={base.damage ? 'hurt' : ''}>{baseHp(base)}/{baseMaxHp(base)} HP</span></div>
        </>
      )}
    </button>
  );
}

export function MiniCard({ card }: { card: CardInstance }) {
  const d = CARDS[card.defId];
  return <span className="mini-card" style={{ '--c': COLOR[d.color] } as React.CSSProperties}>{d.name}</span>;
}

export { COLOR };

/** Live board state for a card being previewed. */
export interface LiveInfo { ap: number; hp: number; maxHp: number; baseAp?: number; pilot?: string; linked?: boolean; rested?: boolean; canAttack?: boolean; damage?: number; keywords?: string[]; token?: boolean }

/** A large, readable rendering of a card: printed art when available, otherwise a card sheet; plus rules explanations and the tip. */
export function BigCard({ defId, showText = true, live, tokenName }: { defId: string; showText?: boolean; live?: LiveInfo; tokenName?: string }) {
  const d = CARDS[defId];
  const art = d ? useArt(defId) : false;
  if (!d) {
    // Token: no printed card, describe the live state.
    return (
      <div className="bigcard">
        <div className="sheet-card" style={{ '--c': '#666' } as React.CSSProperties}>
          <div className="sheet-head"><span className="sheet-name">{tokenName ?? 'Token'}</span><span className="pill">Token</span></div>
          {live && <div className="sheet-stats"><span>{live.ap} AP</span><span>{live.hp}/{live.maxHp} HP</span></div>}
          {live?.keywords?.length ? <div className="sheet-kws">{live.keywords.map(k => <span key={k} className="kw-keyword">&lt;{k}&gt;</span>)}</div> : null}
          <p className="muted small">Tokens have Lv. 0 and cost 0, count toward the 6-Unit limit, and disappear instead of going to the trash.</p>
        </div>
      </div>
    );
  }
  const glossary = explainCardText(d.text);
  const statLine = d.type === 'UNIT' ? `${d.ap} AP / ${d.hp} HP` : d.type === 'BASE' ? `${d.hp} HP` : (d.ap || d.hp) ? `${d.ap ? '+' + d.ap + ' AP' : ''}${d.ap && d.hp ? ' / ' : ''}${d.hp ? '+' + d.hp + ' HP' : ''}` : '';
  return (
    <div className="bigcard">
      {art ? <img className="bigcard-art" src={cardImage(defId)} alt={d.name} draggable={false} onError={() => markMissing(defId)} /> : (
        <div className="sheet-card" style={{ '--c': COLOR[d.color] } as React.CSSProperties}>
          <div className="sheet-head">
            <span className="sheet-name">{d.name}</span>
            <span className="pill lv">Lv.{d.level}</span>
            <span className="pill cost" title="Cost: rest this many active Resources">{d.cost}</span>
          </div>
          <div className="sheet-sub">{d.type}{d.pilotName ? ` · Pilot: ${d.pilotName}` : ''} · <span style={{ color: COLOR[d.color] }}>{d.color}</span>{d.traits.length ? ` · ${d.traits.map(t => `(${t})`).join(' ')}` : ''}</div>
          {statLine && <div className="sheet-stats"><span>{statLine}</span>{d.zones?.length ? <span className="muted small">{d.zones.join(' / ')}</span> : null}</div>}
          {d.link && <div className="sheet-link">Link: {d.link.join(' / ')}</div>}
          <div className="sheet-text"><CardText text={d.text} /></div>
        </div>
      )}
      {showText && (
        <div className="bigcard-info">
          {art && <>
            <b>{d.name}</b>
            <div className="muted small">{d.type}{d.pilotName ? ` (Pilot: ${d.pilotName})` : ''} · {d.color} · Lv.{d.level} · Cost {d.cost}{statLine ? ` · ${statLine}` : ''}</div>
            {d.traits.length > 0 && <div className="muted small">Traits: {d.traits.map(t => `(${t})`).join(' ')}</div>}
            {d.link && <div className="card-link">Link requirement: {d.link.join(' / ')}</div>}
            <CardText text={d.text} />
          </>}
          {live && (
            <div className="live-box">
              <div className="zone-label">On the board now</div>
              <div className="live-stats">
                <span className={live.baseAp !== undefined && live.ap !== live.baseAp ? 'mod' : ''}>{live.ap} AP</span>
                <span className={live.hp < live.maxHp ? 'hurt' : ''}>{live.hp}/{live.maxHp} HP{live.damage ? ` (${live.damage} damage)` : ''}</span>
                {live.rested !== undefined && <span>{live.rested ? 'Rested' : 'Active'}</span>}
                {live.canAttack !== undefined && <span>{live.canAttack ? 'Can attack' : 'Cannot attack this turn'}</span>}
              </div>
              {live.pilot && <div className="small">{live.linked ? '⛓ Link Unit with ' : '👤 Paired with '}<b>{live.pilot}</b>{live.linked ? '' : ' (link requirement not met: stats and effects still apply)'}</div>}
              {live.keywords?.length ? <div className="sheet-kws">{live.keywords.map(k => <span key={k} className="kw-keyword">&lt;{k}&gt;</span>)}</div> : null}
            </div>
          )}
          {glossary.length > 0 && (
            <div className="glossary-box">
              <div className="zone-label">What the icons mean</div>
              {glossary.map(g => <div key={g.term} className="gloss"><span className={g.term.startsWith('<') ? 'kw-keyword' : 'kw-timing'}>{g.term}</span> <span>{g.def}</span></div>)}
            </div>
          )}
          {d.tip && <div className="tip-line">💡 {d.tip}</div>}
        </div>
      )}
    </div>
  );
}
