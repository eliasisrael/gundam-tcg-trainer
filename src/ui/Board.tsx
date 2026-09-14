import type { GameState, PlayerId, UnitState } from '../game/types';
import { CARDS } from '../game/cards';
import { activeResources, other, playerLevel } from '../game/engine';
import { BaseCard, HandCard, UnitCard } from './CardView';
import type { Zone } from '../learn/lessons';

export interface BoardProps {
  state: GameState;
  me: PlayerId;
  highlightZones?: Zone[];
  selectedUid?: number | null;
  /** Units/hand cards that are valid click targets right now */
  clickableUnits?: Set<number>;
  clickableHand?: Set<number>;
  onUnitClick?: (u: UnitState, owner: PlayerId) => void;
  onHandClick?: (uid: number) => void;
  onPlayerClick?: (p: PlayerId) => void;
  playerClickable?: boolean;
  handDisabledReason?: (uid: number) => string | undefined;
}

export function Board(p: BoardProps) {
  const { state, me } = p;
  const op = other(me);
  const hz = new Set(p.highlightZones ?? []);
  const z = (name: Zone) => (hz.has(name) ? 'zone hl' : 'zone');
  const meS = state.players[me], opS = state.players[op];

  return (
    <div className="board">
      {/* Opponent side */}
      <div className="side opp">
        <div className="side-row">
          <div className={z('opp-hand')}>
            <div className="zone-label">{opS.name}'s hand</div>
            <div className="hand-backs">{opS.hand.map(c => <span key={c.uid} className="card-back" />)}</div>
          </div>
          <div className={z('opp-resources')}>
            <div className="zone-label">Resources · Lv.{playerLevel(opS)} ({activeResources(opS)} active)</div>
            <Resources ps={opS} />
          </div>
          <div className="zone deck-zone">
            <div className="zone-label">Deck</div>
            <div className="deck-pile">{opS.deck.length}</div>
            <div className="zone-label">Trash {opS.trash.length}</div>
          </div>
        </div>
        <div className="side-row">
          <div className={z('opp-shields') + ' shield-zone'} onClick={() => p.playerClickable && p.onPlayerClick?.(op)}>
            <div className="zone-label">Shields</div>
            <div className={`shield-stack ${p.playerClickable ? 'clickable' : ''}`}>{opS.shields.map(s => <span key={s.uid} className="card-back shield" />)}{opS.shields.length === 0 && <span className="empty">none</span>}</div>
          </div>
          <div className={z('opp-base')}>
            <div className="zone-label">Base</div>
            {opS.base ? <BaseCard base={opS.base} onClick={() => p.playerClickable && p.onPlayerClick?.(op)} highlight={p.playerClickable} /> : <div className="empty-slot">no Base</div>}
          </div>
          <div className={z('opp-units') + ' units-zone'}>
            <div className="zone-label">{opS.name}'s Units ({opS.units.length}/6)</div>
            <div className="units">
              {opS.units.map(u => <UnitCard key={u.card.uid} state={state} unit={u} owner={op} onClick={() => p.onUnitClick?.(u, op)} highlight={p.clickableUnits?.has(u.card.uid)} dim={p.clickableUnits && !p.clickableUnits.has(u.card.uid) && p.selectedUid != null} />)}
              {opS.units.length === 0 && <div className="empty-slot">no Units</div>}
            </div>
          </div>
        </div>
      </div>

      <div className={z('phase') + ' phase-bar'}>
        <PhaseBar state={state} me={me} />
      </div>

      {/* My side */}
      <div className="side me">
        <div className="side-row">
          <div className={z('units') + ' units-zone'}>
            <div className="zone-label">Your Units ({meS.units.length}/6)</div>
            <div className="units">
              {meS.units.map(u => <UnitCard key={u.card.uid} state={state} unit={u} owner={me} onClick={() => p.onUnitClick?.(u, me)} selected={p.selectedUid === u.card.uid} highlight={p.clickableUnits?.has(u.card.uid)} canAct={p.clickableUnits?.has(u.card.uid)} />)}
              {meS.units.length === 0 && <div className="empty-slot">no Units yet</div>}
            </div>
          </div>
          <div className={z('base')}>
            <div className="zone-label">Your Base</div>
            {meS.base ? <BaseCard base={meS.base} /> : <div className="empty-slot">no Base</div>}
          </div>
          <div className={z('shields') + ' shield-zone'}>
            <div className="zone-label">Your Shields</div>
            <div className="shield-stack">{meS.shields.map(s => <span key={s.uid} className="card-back shield" />)}{meS.shields.length === 0 && <span className="empty">none!</span>}</div>
          </div>
        </div>
        <div className="side-row">
          <div className={z('deck') + ' deck-zone'}>
            <div className="zone-label">Deck</div>
            <div className="deck-pile">{meS.deck.length}</div>
            <div className={z('trash') + ' zone-label'} title={meS.trash.map(c => CARDS[c.defId].name).join(', ')}>Trash {meS.trash.length}</div>
          </div>
          <div className={z('resources')}>
            <div className="zone-label">Your Resources · Lv.{playerLevel(meS)} ({activeResources(meS)} active)</div>
            <Resources ps={meS} />
            <div className={z('resourceDeck') + ' zone-label'}>Resource Deck: {meS.resourceDeck}</div>
          </div>
          <div className={z('hand') + ' hand-zone'}>
            <div className="zone-label">Your hand ({meS.hand.length})</div>
            <div className="hand">
              {meS.hand.map(c => {
                const ok = p.clickableHand?.has(c.uid) ?? false;
                return <HandCard key={c.uid} card={c} onClick={() => p.onHandClick?.(c.uid)} disabled={!ok} reason={p.handDisabledReason?.(c.uid)} />;
              })}
            </div>
          </div>
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
