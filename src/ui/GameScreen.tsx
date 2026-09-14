import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameState, PlayerId, UnitState } from '../game/types';
import { CARDS } from '../game/cards';
import { activateOptions, applyAction, attackTargets, canAttackThisTurn, canPlay, cardName, commandTargets, other, unitName, whoseDecision } from '../game/engine';
import { aiNextAction } from '../game/ai';
import { coachTips, detectSkills, loadSkills, reviewTurn, SKILLS, type SkillProgress, type Tip } from '../game/coach';
import { Board } from './Board';
import { CardText, HandCard, UnitCard } from './CardView';
import type { Zone } from '../learn/lessons';

// ---------- game controller ----------

export interface GameController {
  state: GameState;
  me: PlayerId;
  dispatch: (a: Action) => void;
  /** Apply an action, then (after the AI has responded) an optional follow-up chosen from the new state. */
  dispatchWith: (a: Action, followUp?: (s: GameState) => Action | null) => void;
  undo: () => void;
  canUndo: boolean;
  skills: SkillProgress;
  reviews: Tip[][];
  lastLogMark: number; // log index at the human's last action
}

function runAI(s: GameState) {
  let guard = 0;
  while (!s.winner && guard++ < 500) {
    const who = s.pending ? s.pending.player : whoseDecision(s);
    if (!who || !s.players[who].isAI) break;
    const a = aiNextAction(s, who);
    if (!a) break;
    applyAction(s, a);
  }
}

export function useGame(initial: () => GameState, me: PlayerId): GameController {
  const [state, setState] = useState<GameState>(() => { const s = initial(); runAI(s); return s; });
  const [history, setHistory] = useState<GameState[]>([]);
  const [skills, setSkills] = useState<SkillProgress>(loadSkills);
  const [reviews, setReviews] = useState<Tip[][]>([]);
  const [lastLogMark, setLastLogMark] = useState(0);

  const dispatchWith = useCallback((a: Action, followUp?: (s: GameState) => Action | null) => {
    setState(prev => {
      const before = structuredClone(prev);
      const next = structuredClone(prev);
      if (a.type === 'endMain' && a.player === me) setReviews(r => [...r.slice(-5), reviewTurn(next, me)]);
      applyAction(next, a);
      runAI(next);
      const f = followUp?.(next);
      if (f) { applyAction(next, f); runAI(next); }
      setSkills(sk => detectSkills(before, next, me, sk));
      setHistory(h => [...h.slice(-30), before]);
      setLastLogMark(before.log.length);
      return next;
    });
  }, [me]);
  const dispatch = useCallback((a: Action) => dispatchWith(a), [dispatchWith]);

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setState(prev);
      return h.slice(0, -1);
    });
  }, []);

  return { state, me, dispatch, dispatchWith, undo, canUndo: history.length > 0, skills, reviews, lastLogMark };
}

// ---------- screen ----------

export interface GameScreenProps {
  game: GameController;
  highlightZones?: Zone[];
  sidePanel?: React.ReactNode; // replaces the coach panel top section (lessons)
  showCoach?: boolean;
  onExit?: () => void;
  title?: string;
}

type Modal =
  | { kind: 'hand'; uid: number }
  | { kind: 'attack'; uid: number }
  | null;

export function GameScreen({ game, highlightZones, sidePanel, showCoach = true, onExit, title }: GameScreenProps) {
  const { state, me, dispatch } = game;
  const [modal, setModal] = useState<Modal>(null);
  const [tab, setTab] = useState<'coach' | 'log' | 'skills'>('coach');
  const ps = state.players[me];
  const myTurn = state.phase === 'main' && state.active === me && !state.battle && !state.pending;
  const pending = state.pending && state.pending.player === me ? state.pending : null;

  useEffect(() => { setModal(null); }, [state.turn, state.pending, state.battle]);

  const clickableHand = useMemo(() => {
    const s = new Set<number>();
    if (pending) { for (const o of pending.options) if (o.ref?.kind === 'hand' && o.ref.uid) s.add(o.ref.uid); return s; }
    if (myTurn) for (const c of ps.hand) if (canPlay(state, me, c).ok || canPlay(state, me, c, true).ok) s.add(c.uid);
    return s;
  }, [state, me, myTurn, pending, ps.hand]);

  const clickableUnits = useMemo(() => {
    const s = new Set<number>();
    if (pending) { for (const o of pending.options) if (o.ref?.kind === 'unit' && o.ref.uid) s.add(o.ref.uid); return s; }
    if (modal?.kind === 'attack') {
      const u = ps.units.find(x => x.card.uid === modal.uid);
      if (u) for (const t of attackTargets(state, me, u)) if (t.id !== 'player') s.add(t.id as number);
      return s;
    }
    if (myTurn) for (const u of ps.units) if (canAttackThisTurn(state, u) && attackTargets(state, me, u).length) s.add(u.card.uid);
    return s;
  }, [state, me, myTurn, pending, modal, ps.units]);

  const playerClickable = useMemo(() => {
    if (modal?.kind !== 'attack') return false;
    const u = ps.units.find(x => x.card.uid === modal.uid);
    return !!u && attackTargets(state, me, u).some(t => t.id === 'player');
  }, [modal, ps.units, state, me]);

  const onHandClick = (uid: number) => {
    if (justDragged.current) return;
    if (pending) { const o = pending.options.find(o => o.ref?.uid === uid); if (o) dispatch({ type: 'choose', player: me, optionId: o.id }); return; }
    if (!myTurn) return;
    setModal({ kind: 'hand', uid });
  };
  const onUnitClick = (u: UnitState, owner: PlayerId) => {
    if (justDragged.current) return;
    if (pending) { const o = pending.options.find(o => o.ref?.uid === u.card.uid); if (o) dispatch({ type: 'choose', player: me, optionId: o.id }); return; }
    if (modal?.kind === 'attack' && owner !== me) {
      if (clickableUnits.has(u.card.uid)) dispatch({ type: 'attack', player: me, attackerUid: modal.uid, target: u.card.uid });
      return;
    }
    if (!myTurn || owner !== me) return;
    if (canAttackThisTurn(state, u) && attackTargets(state, me, u).length) setModal({ kind: 'attack', uid: u.card.uid });
  };
  const onPlayerClick = () => {
    if (modal?.kind === 'attack' && playerClickable) dispatch({ type: 'attack', player: me, attackerUid: modal.uid, target: 'player' });
  };

  const acts = activateOptions(state, me);
  const tips = coachTips(state, me);

  // ---------- drag and drop ----------
  const [drag, setDrag] = useState<DragState | null>(null);
  const justDragged = useRef(false);
  const validDrops = useMemo(() => dropTargetsFor(state, me, drag), [state, me, drag]);

  const onCardPointerDown = (kind: 'hand' | 'unit', uid: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!myTurn || e.button !== 0) return;
    if (kind === 'hand') { const c = ps.hand.find(x => x.uid === uid); if (!c || !(canPlay(state, me, c).ok || canPlay(state, me, c, true).ok)) return; }
    if (kind === 'unit') { const u = ps.units.find(x => x.card.uid === uid); if (!u || !canAttackThisTurn(state, u) || !attackTargets(state, me, u).length) return; }
    setDrag({ kind, uid, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, hover: null });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      setDrag(d => {
        if (!d) return d;
        const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8;
        const el = active ? document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]') : null;
        return { ...d, x: e.clientX, y: e.clientY, active, hover: el ? el.getAttribute('data-drop') : null };
      });
      if (drag.active) e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      setDrag(null);
      const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8;
      if (!active) return; // plain click: the button's onClick handles it
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
      const target = el?.getAttribute('data-drop');
      if (target && validDrops.has(target)) performDrop(d, target);
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, validDrops]);

  function performDrop(d: DragState, target: string) {
    const unitUid = target.startsWith('unit:') ? Number(target.slice(5)) : null;
    if (d.kind === 'unit') {
      if (target === 'opp-player') game.dispatch({ type: 'attack', player: me, attackerUid: d.uid, target: 'player' });
      else if (unitUid !== null) game.dispatch({ type: 'attack', player: me, attackerUid: d.uid, target: unitUid });
      setModal(null);
      return;
    }
    const card = ps.hand.find(c => c.uid === d.uid);
    if (!card) return;
    const def = CARDS[card.defId];
    const pickUnit = (s: GameState): Action | null => {
      const o = s.pending?.player === me ? s.pending.options.find(o => o.ref?.kind === 'unit' && o.ref.uid === unitUid) : undefined;
      return o ? { type: 'choose', player: me, optionId: o.id } : null;
    };
    if (def.type === 'UNIT' && target === 'my-battle') game.dispatch({ type: 'playCard', player: me, uid: d.uid });
    else if (def.type === 'BASE' && target === 'my-base') game.dispatch({ type: 'playCard', player: me, uid: d.uid });
    else if (def.type === 'PILOT' && unitUid !== null) game.dispatchWith({ type: 'playCard', player: me, uid: d.uid }, pickUnit);
    else if (def.type === 'COMMAND' && unitUid !== null) {
      const mine = ps.units.find(u => u.card.uid === unitUid);
      const isSpellTarget = (commandTargets(state, me, def.id) ?? []).some(t => t.card.uid === unitUid);
      const canPair = !!(mine && def.pilotName && !mine.pilot && canPlay(state, me, card, true).ok);
      if (canPair && isSpellTarget) setModal({ kind: 'hand', uid: d.uid }); // ambiguous (e.g. Kai's Resolve on an unpaired Unit): ask
      else if (canPair) game.dispatchWith({ type: 'playCard', player: me, uid: d.uid, asPilot: true }, pickUnit);
      else game.dispatchWith({ type: 'playCard', player: me, uid: d.uid }, pickUnit);
    }
    else if (def.type === 'COMMAND' && target === 'my-battle') game.dispatch({ type: 'playCard', player: me, uid: d.uid });
  }

  const dragGhost = drag?.active ? (() => {
    if (drag.kind === 'hand') { const c = ps.hand.find(x => x.uid === drag.uid); return c ? <HandCard card={c} /> : null; }
    const u = ps.units.find(x => x.card.uid === drag.uid); return u ? <UnitCard state={state} unit={u} owner={me} /> : null;
  })() : null;
  const dragHint = drag?.active ? dragHintFor(state, me, drag, validDrops) : null;

  return (
    <div className="game-screen">
      <div className="topbar">
        <button className="btn ghost" onClick={onExit}>← Menu</button>
        <span className="title">{title ?? `${ps.name} (${state.players[me].id === 'p1' ? 'P1' : 'P2'}) vs ${state.players[other(me)].name}`}</span>
        <span className="spacer" />
        <button className="btn ghost" onClick={game.undo} disabled={!game.canUndo} title="Undo your last action (training aid)">↶ Undo</button>
        {myTurn && <button className="btn primary" onClick={() => dispatch({ type: 'endMain', player: me })}>End Turn ▶</button>}
        {!myTurn && !pending && !state.winner && state.active !== me && <button className="btn primary" onClick={() => dispatch({ type: 'choose', player: me, optionId: null })}>Continue ▶</button>}
      </div>

      <div className="game-body">
        <div className="board-wrap">
          {pending && <PendingDialog game={game} />}
          <Board state={state} me={me} highlightZones={highlightZones} clickableHand={clickableHand} clickableUnits={clickableUnits}
            onHandClick={onHandClick} onUnitClick={onUnitClick} onPlayerClick={onPlayerClick} playerClickable={playerClickable}
            selectedUid={modal?.kind === 'attack' ? modal.uid : null}
            handDisabledReason={uid => { const c = ps.hand.find(x => x.uid === uid); if (!c) return; const r = canPlay(state, me, c); return r.ok ? undefined : r.reason; }}
            drag={{ validDrops: drag?.active ? validDrops : new Set(), hoverDrop: drag?.active ? drag.hover : null, draggingUid: drag?.active ? drag.uid : null, onPointerDown: onCardPointerDown }} />
          {dragGhost && <div className="drag-ghost" style={{ left: drag!.x, top: drag!.y }}>{dragGhost}</div>}
          {dragHint && <div className="drag-hint">{dragHint}</div>}

          {myTurn && acts.length > 0 && (
            <div className="effects-panel">
              <span className="zone-label">【Activate･Main】 effects</span>
              {acts.map(a => <button key={a.uid + a.effectKey} className="btn small" disabled={!a.ok} title={a.ok ? '' : a.reason} onClick={() => dispatch({ type: 'activateMain', player: me, uid: a.uid, effectKey: a.effectKey })}>{a.label}{!a.ok && a.reason ? ` (${a.reason})` : ''}</button>)}
            </div>
          )}

          {state.winner && (
            <div className="overlay">
              <div className="dialog">
                <h2>{state.winner === me ? 'Victory!' : 'Defeat'}</h2>
                <p>{state.loseReason}</p>
                <p className="muted">Turns: {state.turn} · Shields you broke: {state.stats[me].shieldsBroken} · Units destroyed: {state.stats[me].unitsDestroyed} · Link Units: {state.stats[me].linkUnitsMade}</p>
                <button className="btn primary" onClick={onExit}>Back to menu</button>
              </div>
            </div>
          )}

          {modal?.kind === 'hand' && <HandDialog game={game} uid={modal.uid} onClose={() => setModal(null)} />}
          {modal?.kind === 'attack' && (
            <div className="float-hint">
              <b>{unitName(ps.units.find(u => u.card.uid === modal.uid)!)}</b> is attacking. Click a highlighted target (or drag the Unit onto one): the enemy Shield Area, or a rested enemy Unit.
              <button className="btn small ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          )}
        </div>

        <aside className="side-panel">
          {sidePanel}
          {showCoach && (
            <>
              <div className="tabs">
                <button className={tab === 'coach' ? 'on' : ''} onClick={() => setTab('coach')}>Coach</button>
                <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Log</button>
                <button className={tab === 'skills' ? 'on' : ''} onClick={() => setTab('skills')}>Skills</button>
              </div>
              {tab === 'coach' && <CoachPanel tips={tips} reviews={game.reviews} />}
              {tab === 'log' && <LogPanel state={state} mark={game.lastLogMark} me={me} />}
              {tab === 'skills' && <SkillsPanel skills={game.skills} />}
            </>
          )}
          {!showCoach && <LogPanel state={state} mark={game.lastLogMark} me={me} compact />}
        </aside>
      </div>
    </div>
  );
}

interface DragState { kind: 'hand' | 'unit'; uid: number; startX: number; startY: number; x: number; y: number; active: boolean; hover: string | null }

/** Which data-drop ids accept the card being dragged. */
function dropTargetsFor(state: GameState, me: PlayerId, drag: DragState | null): Set<string> {
  const out = new Set<string>();
  if (!drag) return out;
  const ps = state.players[me];
  if (drag.kind === 'unit') {
    const u = ps.units.find(x => x.card.uid === drag.uid);
    if (!u) return out;
    for (const t of attackTargets(state, me, u)) out.add(t.id === 'player' ? 'opp-player' : `unit:${t.id}`);
    return out;
  }
  const c = ps.hand.find(x => x.uid === drag.uid);
  if (!c) return out;
  const d = CARDS[c.defId];
  if (d.type === 'UNIT' && canPlay(state, me, c).ok) out.add('my-battle');
  if (d.type === 'BASE' && canPlay(state, me, c).ok) out.add('my-base');
  if (d.type === 'PILOT' && canPlay(state, me, c).ok) for (const u of ps.units) if (!u.pilot) out.add(`unit:${u.card.uid}`);
  if (d.type === 'COMMAND') {
    if (canPlay(state, me, c).ok) {
      const targets = commandTargets(state, me, d.id);
      if (targets === null) out.add('my-battle'); else for (const t of targets) out.add(`unit:${t.card.uid}`);
    }
    if (d.pilotName && canPlay(state, me, c, true).ok) for (const u of ps.units) if (!u.pilot) out.add(`unit:${u.card.uid}`);
  }
  return out;
}

function dragHintFor(state: GameState, me: PlayerId, drag: DragState, valid: Set<string>): string {
  const ps = state.players[me];
  if (drag.kind === 'unit') return valid.has('opp-player') ? 'Drop on a rested enemy Unit, or on their Shield Area to attack the player' : 'Drop on a rested enemy Unit';
  const c = ps.hand.find(x => x.uid === drag.uid); if (!c) return '';
  const d = CARDS[c.defId];
  if (d.type === 'UNIT') return 'Drop into your Battle Area to deploy';
  if (d.type === 'BASE') return 'Drop onto your Base slot to deploy';
  if (d.type === 'PILOT') return 'Drop onto one of your Units to pair';
  if (d.pilotName) return 'Drop onto a target to cast it, or onto an unpaired Unit of yours to pair it as a Pilot';
  return 'Drop onto a target';
}

function HandDialog({ game, uid, onClose }: { game: GameController; uid: number; onClose: () => void }) {
  const { state, me, dispatch } = game;
  const card = state.players[me].hand.find(c => c.uid === uid);
  if (!card) return null;
  const d = CARDS[card.defId];
  const normal = canPlay(state, me, card);
  const asPilot = d.type === 'COMMAND' && d.pilotName ? canPlay(state, me, card, true) : null;
  const verb = d.type === 'UNIT' ? 'Deploy' : d.type === 'BASE' ? 'Deploy Base' : d.type === 'PILOT' ? 'Pair with a Unit' : 'Play';
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog card-dialog" onClick={e => e.stopPropagation()}>
        <HandCard card={card} />
        <div className="dialog-side">
          <h3>{d.name}</h3>
          <div className="muted">{d.type} · {d.color} · Lv.{d.level} · Cost {d.cost}{d.traits.length ? ` · (${d.traits.join(') (')})` : ''}</div>
          {d.tip && <p className="tip">💡 {d.tip}</p>}
          <div className="actions">
            <button className="btn primary" disabled={!normal.ok} onClick={() => { dispatch({ type: 'playCard', player: me, uid }); onClose(); }}>{verb}{!normal.ok ? ` — ${normal.reason}` : ''}</button>
            {asPilot && <button className="btn" disabled={!asPilot.ok} onClick={() => { dispatch({ type: 'playCard', player: me, uid, asPilot: true }); onClose(); }}>Pair as Pilot ({d.pilotName}){!asPilot.ok ? ` — ${asPilot.reason}` : ''}</button>}
            <button className="btn ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingDialog({ game }: { game: GameController }) {
  const { state, me, dispatch } = game;
  const c = state.pending!;
  const hasRefs = c.options.some(o => o.ref?.kind === 'unit' || o.ref?.kind === 'hand');
  return (
    <div className="pending">
      <div className="pending-title">{c.title}</div>
      {c.description && <div className="muted small">{c.description}</div>}
      {hasRefs && <div className="muted small">Click a highlighted card on the board, or choose below.</div>}
      <div className="pending-options">
        {c.options.map(o => <button key={o.id} className="btn" onClick={() => dispatch({ type: 'choose', player: me, optionId: o.id })}><b>{o.label}</b>{o.detail && <span className="muted"> · {o.detail}</span>}</button>)}
        {c.optional && !c.options.some(o => o.id === 'pass') && <button className="btn ghost" onClick={() => dispatch({ type: 'choose', player: me, optionId: null })}>Pass</button>}
      </div>
      {c.kind === 'mulligan' && <div className="muted small">Your hand: {state.players[me].hand.map(h => cardName(h)).join(', ')}</div>}
    </div>
  );
}

export function CoachPanel({ tips, reviews }: { tips: Tip[]; reviews: Tip[][] }) {
  return (
    <div className="coach">
      <div className="coach-now">
        <div className="zone-label">Right now</div>
        {tips.map((t, i) => <div key={i} className={`tip ${t.level}`}><b>{t.title}</b><div>{t.text}</div></div>)}
      </div>
      {reviews.length > 0 && (
        <div className="coach-review">
          <div className="zone-label">Last turn review</div>
          {reviews[reviews.length - 1].map((t, i) => <div key={i} className={`tip ${t.level}`}><b>{t.title}</b><div>{t.text}</div></div>)}
        </div>
      )}
    </div>
  );
}

export function LogPanel({ state, mark, me, compact }: { state: GameState; mark: number; me: PlayerId; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [state.log.length]);
  const entries = compact ? state.log.slice(-12) : state.log;
  const offset = state.log.length - entries.length;
  return (
    <div className={`log ${compact ? 'compact' : ''}`} ref={ref}>
      {entries.map((l, i) => <div key={i + offset} className={`log-line ${l.kind} ${i + offset >= mark ? 'new' : ''} ${l.player === me ? 'mine' : l.player ? 'theirs' : ''}`}>{l.text}</div>)}
    </div>
  );
}

export function SkillsPanel({ skills }: { skills: SkillProgress }) {
  const done = SKILLS.filter(s => skills[s.id]).length;
  return (
    <div className="skills">
      <div className="zone-label">Mechanics demonstrated: {done}/{SKILLS.length}</div>
      {SKILLS.map(s => <div key={s.id} className={`skill ${skills[s.id] ? 'done' : ''}`}><span className="check">{skills[s.id] ? '✓' : '○'}</span><div><b>{s.name}</b>{skills[s.id] ? <span className="muted"> ×{skills[s.id]}</span> : <div className="muted small">{s.how}</div>}</div></div>)}
    </div>
  );
}

export { CardText };
