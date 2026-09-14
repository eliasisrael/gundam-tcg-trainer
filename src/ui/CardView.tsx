import type { CardInstance, UnitState, BaseState, PlayerId } from '../game/types';
import type { GameState } from '../game/types';
import { CARDS } from '../game/cards';
import { baseHp, baseMaxHp, cardName, isLinked, pilotName, unitAp, unitHp, unitKeywords, unitLevel, unitMaxHp } from '../game/engine';

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

export interface DragProps {
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  dragging?: boolean;
  drop?: 'ok' | 'hover';
  dropId?: string;
}

export function HandCard({ card, onClick, selected, disabled, reason, drag, anim }: { card: CardInstance; onClick?: () => void; selected?: boolean; disabled?: boolean; reason?: string; drag?: DragProps; anim?: string }) {
  const d = CARDS[card.defId];
  return (
    <button className={`card hand-card type-${d.type.toLowerCase()} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${drag?.dragging ? 'dragging' : ''} ${!disabled && drag?.onPointerDown ? 'draggable' : ''} ${anim ?? ''}`} style={{ '--c': COLOR[d.color] } as React.CSSProperties} onClick={onClick} onPointerDown={disabled ? undefined : drag?.onPointerDown} title={disabled && reason ? reason : d.text}>
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
    </button>
  );
}

export function UnitCard({ state, unit, owner, onClick, selected, highlight: hl, canAct, dim, drag, anim, dmg }: { state: GameState; unit: UnitState; owner: PlayerId; onClick?: () => void; selected?: boolean; highlight?: boolean; canAct?: boolean; dim?: boolean; drag?: DragProps; anim?: string; dmg?: number }) {
  const d = unit.card.token ? undefined : CARDS[unit.card.defId];
  const ap = unitAp(state, unit, owner), hp = unitHp(unit), max = unitMaxHp(unit);
  const kw = unitKeywords(unit);
  const baseAp = unit.card.token ? unit.card.token.ap : (d?.ap ?? 0);
  const kws = [kw.repair && `Repair ${kw.repair}`, kw.breach && `Breach ${kw.breach}`, kw.blocker && 'Blocker', kw.firstStrike && 'First Strike', kw.highManeuver && 'High-Maneuver'].filter(Boolean) as string[];
  return (
    <button className={`card unit ${unit.rested ? 'rested' : ''} ${selected ? 'selected' : ''} ${hl ? 'highlight' : ''} ${canAct ? 'can-act' : ''} ${dim ? 'dim' : ''} ${unit.card.token ? 'token' : ''} ${drag?.dragging ? 'dragging' : ''} ${canAct && drag?.onPointerDown ? 'draggable' : ''} ${drag?.drop ? 'drop-' + drag.drop : ''} ${anim ?? ''}`}
      data-drop={drag?.dropId} style={{ '--c': d ? COLOR[d.color] : '#666' } as React.CSSProperties} onClick={onClick} onPointerDown={canAct ? drag?.onPointerDown : undefined} title={d?.text}>
      <div className="card-head"><span className="lv">{unit.card.token ? 'Token' : `Lv.${unitLevel(unit)}`}</span>{unit.rested && <span className="badge">Rested</span>}</div>
      <div className="card-name">{cardName(unit.card)}</div>
      <div className="card-stats big"><span className={ap !== baseAp ? 'mod' : ''}>{ap} AP</span> <span className={hp < max ? 'hurt' : ''}>{hp}/{max} HP</span></div>
      {kws.length > 0 && <div className="card-kws">{kws.map(k => <span key={k} className="kw-keyword">&lt;{k}&gt;</span>)}</div>}
      {unit.pilot && <div className={`pilot-tag ${isLinked(unit) ? 'linked' : ''}`}>{isLinked(unit) ? '⛓ ' : '👤 '}{pilotName(unit.pilot)}</div>}
      {unit.deployedTurn === state.turn && state.active === owner && !isLinked(unit) && <div className="sick">deployed this turn</div>}
      {dmg ? <span className="dmg-float">-{dmg}</span> : null}
    </button>
  );
}

export function BaseCard({ base, onClick, highlight: hl, drop, dropId, anim }: { base: BaseState; onClick?: () => void; highlight?: boolean; drop?: 'ok' | 'hover'; dropId?: string; anim?: string }) {
  const d = base.card.token ? undefined : CARDS[base.card.defId];
  return (
    <button className={`card base ${base.rested ? 'rested' : ''} ${hl ? 'highlight' : ''} ${base.isEx ? 'token' : ''} ${drop ? 'drop-' + drop : ''} ${anim ?? ''}`} data-drop={dropId} style={{ '--c': d ? COLOR[d.color] : '#666' } as React.CSSProperties} onClick={onClick} title={d?.text}>
      <div className="card-head"><span className="lv">BASE</span>{base.rested && <span className="badge">Rested</span>}</div>
      <div className="card-name">{cardName(base.card)}</div>
      <div className="card-stats big"><span className={base.damage ? 'hurt' : ''}>{baseHp(base)}/{baseMaxHp(base)} HP</span></div>
    </button>
  );
}

export function MiniCard({ card }: { card: CardInstance }) {
  const d = CARDS[card.defId];
  return <span className="mini-card" style={{ '--c': COLOR[d.color] } as React.CSSProperties}>{d.name}</span>;
}

export { COLOR };
