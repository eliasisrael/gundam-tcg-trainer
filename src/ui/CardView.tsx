import type { CardInstance, UnitState, BaseState, PlayerId } from '../game/types';
import type { GameState } from '../game/types';
import { CARDS } from '../game/cards';
import { baseHp, baseMaxHp, cardName, isLinked, pilotName, unitAp, unitHp, unitKeywords, unitLevel, unitMaxHp } from '../game/engine';
import { cardImage, isMissing, markMissing, useSettings } from './settings';

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
  return s.art && !isMissing(defId);
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
    <button className={`card hand-card type-${d.type.toLowerCase()} ${art ? 'with-art' : ''} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${drag?.dragging ? 'dragging' : ''} ${!disabled && drag?.onPointerDown ? 'draggable' : ''} ${anim ?? ''}`} style={{ '--c': COLOR[d.color] } as React.CSSProperties} onClick={onClick} onPointerDown={disabled ? undefined : drag?.onPointerDown} title={disabled && reason ? `${d.name}: ${reason}` : `${d.name}\n${d.text}`}>
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
          <CardText text={d.text} />
        </>
      )}
    </button>
  );
}

export function UnitCard({ state, unit, owner, onClick, selected, highlight: hl, canAct, dim, drag, anim, dmg }: { state: GameState; unit: UnitState; owner: PlayerId; onClick?: () => void; selected?: boolean; highlight?: boolean; canAct?: boolean; dim?: boolean; drag?: DragProps; anim?: string; dmg?: number }) {
  const d = unit.card.token ? undefined : CARDS[unit.card.defId];
  const art = useArt(unit.card.defId);
  const ap = unitAp(state, unit, owner), hp = unitHp(unit), max = unitMaxHp(unit);
  const kw = unitKeywords(unit) as ReturnType<typeof unitKeywords> & { suppression?: boolean };
  const baseAp = unit.card.token ? unit.card.token.ap : (d?.ap ?? 0);
  const kws = [kw.repair && `Repair ${kw.repair}`, kw.breach && `Breach ${kw.breach}`, kw.support && `Support ${kw.support}`, kw.blocker && 'Blocker', kw.firstStrike && 'First Strike', kw.highManeuver && 'High-Maneuver', kw.suppression && 'Suppression'].filter(Boolean) as string[];
  // Keywords granted by effects (not printed on the card) are worth showing over the art.
  const grantedKws = kws.filter(k => ['First Strike', 'High-Maneuver', 'Suppression'].includes(k) || (k.startsWith('Breach') && unit.tempKeywords.breach));
  const sick = unit.deployedTurn === state.turn && state.active === owner && !isLinked(unit);
  return (
    <button className={`card unit ${art ? 'with-art' : ''} ${unit.rested ? 'rested' : ''} ${selected ? 'selected' : ''} ${hl ? 'highlight' : ''} ${canAct ? 'can-act' : ''} ${dim ? 'dim' : ''} ${unit.card.token ? 'token' : ''} ${drag?.dragging ? 'dragging' : ''} ${canAct && drag?.onPointerDown ? 'draggable' : ''} ${drag?.drop ? 'drop-' + drag.drop : ''} ${anim ?? ''}`}
      data-drop={drag?.dropId} style={{ '--c': d ? COLOR[d.color] : '#666' } as React.CSSProperties} onClick={onClick} onPointerDown={canAct ? drag?.onPointerDown : undefined} title={`${cardName(unit.card)}${d ? '\n' + d.text : ''}`}>
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
    <button className={`card base ${art ? 'with-art' : ''} ${base.rested ? 'rested' : ''} ${hl ? 'highlight' : ''} ${base.isEx ? 'token' : ''} ${drop ? 'drop-' + drop : ''} ${anim ?? ''}`} data-drop={dropId} style={{ '--c': d ? COLOR[d.color] : '#666' } as React.CSSProperties} onClick={onClick} title={`${cardName(base.card)}${d ? '\n' + d.text : ''}`}>
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
