import type { GameState, PlayerId, UnitState } from '../game/types';
import { CARDS } from '../game/cards';
import { activeResources, other, playerLevel } from '../game/engine';
import { BaseCard, HandCard, UnitCard } from './CardView';
import type { Zone } from '../learn/lessons';

// Layout follows the official play sheet. From each player's point of view:
//   left column  = Shield Area (Base nearest the centre line, Shields stacked toward the player)
//   centre       = Battle Area, with Resource Deck + Resource Area in front of it
//   right column = Deck (far) and Trash (near)
// The opponent's side is the same sheet rotated 180 degrees.

export interface BoardProps {
  state: GameState;
  me: PlayerId;
  highlightZones?: Zone[];
  selectedUid?: number | null;
  clickableUnits?: Set<number>;
  clickableHand?: Set<number>;
  onUnitClick?: (u: UnitState, owner: PlayerId) => void;
  onHandClick?: (uid: number) => void;
  onPlayerClick?: (p: PlayerId) => void;
  playerClickable?: boolean;
  handDisabledReason?: (uid: number) => string | undefined;
  /** Drag-and-drop wiring (optional). */
  drag?: {
    validDrops: Set<string>;
    hoverDrop: string | null;
    draggingUid: number | null;
    onPointerDown: (kind: 'hand' | 'unit', uid: number, e: React.PointerEvent<HTMLButtonElement>) => void;
  };
}

export function Board(p: BoardProps) {
  const { state, me } = p;
  const op = other(me);
  const hz = new Set(p.highlightZones ?? []);
  const z = (name: Zone, extra = '') => `zone ${extra} ${hz.has(name) ? 'hl' : ''}`;
  const meS = state.players[me], opS = state.players[op];
  const dg = p.drag;
  const dropCls = (id: string) => dg ? (dg.hoverDrop === id ? 'drop-hover' : dg.validDrops.has(id) ? 'drop-ok' : '') : '';
  const dropState = (id: string): 'ok' | 'hover' | undefined => dg ? (dg.hoverDrop === id ? 'hover' : dg.validDrops.has(id) ? 'ok' : undefined) : undefined;
  const unitDrag = (u: UnitState) => dg ? { onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => dg.onPointerDown('unit', u.card.uid, e), dragging: dg.draggingUid === u.card.uid, drop: dropState(`unit:${u.card.uid}`), dropId: `unit:${u.card.uid}` } : undefined;

  return (
    <div className="board mat">
      {/* ---------- Opponent side (rotated sheet) ---------- */}
      <div className={z('opp-hand', 'opp-hand-row')}>
        <span className="zone-label">{opS.name}'s hand · {opS.hand.length}</span>
        <div className="hand-backs">{opS.hand.map(c => <span key={c.uid} className="card-back" />)}</div>
      </div>

      <div className="sheet opp">
        {/* far row: trash | resource area + resource deck */}
        <div className={z('trash', 'pile opp-trash')}>
          <div className="zone-label">Trash</div>
          <div className="deck-pile trash" title={opS.trash.map(c => CARDS[c.defId].name).join(', ')}>{opS.trash.length}</div>
        </div>
        <div className={z('opp-resources', 'resource-row')}>
          <div className="res-deck">
            <div className="zone-label">Resource Deck</div>
            <div className="deck-pile small">{opS.resourceDeck}</div>
          </div>
          <div className="res-area">
            <div className="zone-label">Resource Area · Lv.{playerLevel(opS)} · {activeResources(opS)} active</div>
            <Resources ps={opS} />
          </div>
        </div>
        {/* shield column (opponent's left = our right) */}
        <div className={z('opp-shields', `shield-col opp-shield-col ${dropCls('opp-player')}`)} data-drop="opp-player" onClick={() => p.playerClickable && p.onPlayerClick?.(op)}>
          <div className="zone-label">Shield Area</div>
          <div className={`shield-stack vertical ${p.playerClickable ? 'clickable' : ''}`}>
            {opS.shields.map(s => <span key={s.uid} className="card-back shield" />)}
            {opS.shields.length === 0 && <span className="empty">no Shields</span>}
          </div>
          <div className="zone-label">Shields · {opS.shields.length}</div>
          <div className={z('opp-base', 'base-slot')}>
            <div className="zone-label">Base</div>
            {opS.base ? <BaseCard base={opS.base} onClick={() => p.playerClickable && p.onPlayerClick?.(op)} highlight={p.playerClickable} dropId="opp-player" /> : <div className="empty-slot">no Base</div>}
          </div>
        </div>
        {/* near row: deck | battle area */}
        <div className={z('deck', 'pile opp-deck')}>
          <div className="zone-label">Deck</div>
          <div className="deck-pile">{opS.deck.length}</div>
        </div>
        <div className={z('opp-units', 'battle')}>
          <div className="zone-label">Battle Area · {opS.units.length}/6</div>
          <div className="units">
            {opS.units.map(u => <UnitCard key={u.card.uid} state={state} unit={u} owner={op} onClick={() => p.onUnitClick?.(u, op)} highlight={p.clickableUnits?.has(u.card.uid)} dim={p.clickableUnits && !p.clickableUnits.has(u.card.uid) && p.selectedUid != null} drag={unitDrag(u)} />)}
            {opS.units.length === 0 && <div className="empty-slot">no Units</div>}
          </div>
        </div>
      </div>

      <div className={z('phase', 'phase-bar')}>
        <PhaseBar state={state} me={me} />
      </div>

      {/* ---------- My side ---------- */}
      <div className="sheet me">
        <div className={z('shields', 'shield-col my-shield-col')}>
          <div className="zone-label">Shield Area</div>
          <div className={z('base', `base-slot ${dropCls('my-base')}`)} data-drop="my-base">
            <div className="zone-label">Base</div>
            {meS.base ? <BaseCard base={meS.base} dropId="my-base" /> : <div className="empty-slot">no Base</div>}
          </div>
          <div className="zone-label">Shields · {meS.shields.length}</div>
          <div className="shield-stack vertical">
            {meS.shields.map(s => <span key={s.uid} className="card-back shield" />)}
            {meS.shields.length === 0 && <span className="empty">no Shields!</span>}
          </div>
        </div>
        <div className={z('units', `battle ${dropCls('my-battle')}`)} data-drop="my-battle">
          <div className="zone-label">Battle Area · {meS.units.length}/6</div>
          <div className="units">
            {meS.units.map(u => <UnitCard key={u.card.uid} state={state} unit={u} owner={me} onClick={() => p.onUnitClick?.(u, me)} selected={p.selectedUid === u.card.uid} highlight={p.clickableUnits?.has(u.card.uid)} canAct={p.clickableUnits?.has(u.card.uid)} drag={unitDrag(u)} />)}
            {meS.units.length === 0 && <div className="empty-slot">no Units yet</div>}
          </div>
        </div>
        <div className={z('deck', 'pile my-deck')}>
          <div className="zone-label">Deck</div>
          <div className="deck-pile">{meS.deck.length}</div>
        </div>
        <div className={z('resources', 'resource-row')}>
          <div className={z('resourceDeck', 'res-deck')}>
            <div className="zone-label">Resource Deck</div>
            <div className="deck-pile small">{meS.resourceDeck}</div>
          </div>
          <div className="res-area">
            <div className="zone-label">Resource Area · Lv.{playerLevel(meS)} · {activeResources(meS)} active</div>
            <Resources ps={meS} />
          </div>
        </div>
        <div className={z('trash', 'pile my-trash')}>
          <div className="zone-label">Trash</div>
          <div className="deck-pile trash" title={meS.trash.map(c => CARDS[c.defId].name).join(', ')}>{meS.trash.length}</div>
        </div>
      </div>

      <div className={z('hand', 'hand-zone')}>
        <div className="zone-label">Your hand · {meS.hand.length}</div>
        <div className="hand">
          {meS.hand.map(c => {
            const ok = p.clickableHand?.has(c.uid) ?? false;
            return <HandCard key={c.uid} card={c} onClick={() => p.onHandClick?.(c.uid)} disabled={!ok} reason={p.handDisabledReason?.(c.uid)} drag={dg ? { onPointerDown: e => dg.onPointerDown('hand', c.uid, e), dragging: dg.draggingUid === c.uid } : undefined} />;
          })}
          {meS.hand.length === 0 && <div className="empty-slot">empty</div>}
        </div>
      </div>
    </div>
  );
}

function Resources({ ps }: { ps: GameState['players']['p1'] }) {
  return (
    <div className="resources">
      {ps.resources.map(r => <span key={r.uid} className={`resource ${r.rested ? 'rested' : ''} ${r.isEx ? 'ex' : ''}`} title={r.isEx ? 'EX Resource (removed when spent)' : r.rested ? 'Rested' : 'Active'}>{r.isEx ? 'EX' : ''}</span>)}
      {ps.resources.length === 0 && <span className="empty">none</span>}
    </div>
  );
}

function PhaseBar({ state, me }: { state: GameState; me: PlayerId }) {
  const phases: { id: GameState['phase']; label: string }[] = [
    { id: 'start', label: 'Start' }, { id: 'draw', label: 'Draw' }, { id: 'resource', label: 'Resource' }, { id: 'main', label: 'Main' }, { id: 'end', label: 'End' },
  ];
  const activeName = state.players[state.active].name;
  const b = state.battle;
  return (
    <div className="phase-inner">
      <span className="turn">Turn {state.turn} · <b>{state.active === me ? 'Your turn' : `${activeName}'s turn`}</b></span>
      <span className="phases">{phases.map(ph => <span key={ph.id} className={`ph ${state.phase === ph.id ? 'on' : ''}`}>{ph.label}</span>)}</span>
      {b && <span className="battle-step">Battle: <b>{b.step} step</b></span>}
    </div>
  );
}
