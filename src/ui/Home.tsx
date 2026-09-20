import { useState } from 'react';
import type { DeckDef } from '../game/cards';
import { allDecks, deckColors, loadCustomDecks, saveCustomDecks } from '../game/decks';
import { SKILLS, loadSkills } from '../game/coach';
import { LESSONS } from '../learn/lessons';
import { loadLessonProgress } from './LessonScreen';
import { COLOR } from './CardView';
import type { BotLevel, PlayerId } from '../game/types';
import { LEVELS, loadRecord, suggestion, type LevelId } from '../game/ladder';
import { COACH_MODES, type CoachMode } from '../game/coach';

export interface PracticeOptions { myDeck: string; oppDeck: string; goFirst: boolean; me: PlayerId; level: LevelId; botLevel: BotLevel; coachMode: CoachMode }

export function Home({ onLesson, onPractice, onDrills, onBuilder }: { onLesson: (id: string) => void; onPractice: (o: PracticeOptions) => void; onDrills: () => void; onBuilder: (deck?: DeckDef) => void }) {
  const [view, setView] = useState<'home' | 'lessons' | 'practice'>('home');
  const progress = loadLessonProgress();
  const skills = loadSkills();
  const lessonsDone = LESSONS.filter(l => progress[l.id]).length;
  const skillsDone = SKILLS.filter(s => skills[s.id]).length;

  if (view === 'lessons') {
    return (
      <div className="home">
        <button className="btn ghost" onClick={() => setView('home')}>← Menu</button>
        <h2 style={{ marginTop: 12 }}>Learn the game</h2>
        <p className="muted">Nine short lessons. Most run on a live board where you make the plays yourself, then a quick quiz locks it in.</p>
        <div className="lesson-list">
          {LESSONS.map((l, i) => (
            <button key={l.id} className={`lesson-row ${progress[l.id] ? 'done' : ''}`} onClick={() => onLesson(l.id)}>
              <span className="num">{progress[l.id] ? '✓' : i + 1}</span>
              <div><b>{l.title.replace(/^\d+\. /, '')}</b><div className="muted small">{l.summary}</div></div>
              <span className="meta">{l.minutes} min{l.setup ? ' · hands-on' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'practice') return <PracticeSetup onBack={() => setView('home')} onStart={onPractice} onBuilder={onBuilder} />;

  return (
    <div className="home">
      <div className="hero">
        <div>
          <div className="kicker" style={{ color: 'var(--accent)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase' }}>Unofficial fan-made trainer</div>
          <h1>Gundam Card Game <span>Trainer</span></h1>
          <p className="muted" style={{ maxWidth: 560 }}>Learn the rules by playing them, then practice against a bot with a coach that explains every decision. Built on the official Comprehensive Rules v1.9.0 and the eight starter decks ST01-ST08.</p>
        </div>
        <div className="muted small" style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div>Lessons: <b>{lessonsDone}/{LESSONS.length}</b></div>
          <div>Mechanics demonstrated: <b>{skillsDone}/{SKILLS.length}</b></div>
        </div>
      </div>

      <div className="modes">
        <button className="mode" onClick={() => setView('lessons')}>
          <span className="kicker">Step 1</span>
          <h3>Learn</h3>
          <p className="muted">Guided, hands-on lessons on a real board: zones, turn structure, deploying, pilots &amp; links, attacking, defending, commands and strategy.</p>
          <span className="muted small">{lessonsDone}/{LESSONS.length} complete</span>
        </button>
        <button className="mode" onClick={() => setView('practice')}>
          <span className="kicker">Step 2</span>
          <h3>Practice</h3>
          <p className="muted">Full games against the Trainer Bot. The Coach flags free kills, missed links, unspent Resources and risky attacks, and reviews every turn.</p>
          <span className="muted small">Undo any move while you learn</span>
        </button>
        <button className="mode" onClick={() => onBuilder()}>
          <span className="kicker">Step 3</span>
          <h3>Deck Builder</h3>
          <p className="muted">Pick any one or two colors and build a 50-card deck from all eight starter pools. Auto-build gives you a legal deck in one click; the color guide explains what each color wants.</p>
          <span className="muted small">Then play it in Practice, or hand it to the bot</span>
        </button>
        <button className="mode" onClick={onDrills}>
          <span className="kicker">Anytime</span>
          <h3>Drills &amp; Glossary</h3>
          <p className="muted">Ten-question rules drills with rule citations, and a glossary of every keyword and timing icon.</p>
        </button>
      </div>

      <h3>Why this exists</h3>
      <p className="muted" style={{ maxWidth: 720 }}>The official Teaching App shows you the rules once. This trainer keeps teaching: every lesson is a task you perform on the board, the Coach comments on the actual position in front of you, and a skill tracker records each mechanic the first time you use it correctly.</p>
      <p className="muted" style={{ maxWidth: 720 }}>Card pool: the eight starter decks ST01-ST08, covering all five colors (Blue, Green, Red, White, Purple).</p>
      <p className="muted small">Card names and text are property of Bandai. This tool is not affiliated with or endorsed by Bandai.</p>
    </div>
  );
}

function PracticeSetup({ onBack, onStart, onBuilder }: { onBack: () => void; onStart: (o: PracticeOptions) => void; onBuilder: (deck?: DeckDef) => void }) {
  const [decks, setDecks] = useState<DeckDef[]>(allDecks);
  const [myDeck, setMyDeck] = useState('ST01');
  const [oppDeck, setOppDeck] = useState('ST02');
  const [goFirst, setGoFirst] = useState(true);
  const [level, setLevel] = useState<LevelId>(() => { try { return (localStorage.getItem('gcg-trainer-level') as LevelId) || 'rookie'; } catch { return 'rookie'; } });
  const [botLevel, setBotLevel] = useState<BotLevel>('advanced');
  const [coachMode, setCoachMode] = useState<CoachMode>('full');
  const record = loadRecord();
  const tip = suggestion(level);
  const pickLevel = (id: LevelId) => { setLevel(id); try { localStorage.setItem('gcg-trainer-level', id); } catch { /* ignore */ } };
  const custom = new Set(loadCustomDecks().map(d => d.id));
  const remove = (id: string) => {
    saveCustomDecks(loadCustomDecks().filter(d => d.id !== id));
    setDecks(allDecks());
    if (myDeck === id) setMyDeck('ST01');
    if (oppDeck === id) setOppDeck('ST02');
  };
  const DeckPick = ({ value, onPick }: { value: string; onPick: (id: string) => void }) => (
    <div className="deck-pick">
      {decks.map(d => (
        <button key={d.id} className={`deck-card ${value === d.id ? 'on' : ''}`} onClick={() => onPick(d.id)}>
          <b>{d.name}{custom.has(d.id) ? '' : ` [${d.id}]`}</b>
          <div className="swatches">{deckColors(d).map(c => <span key={c} className="swatch" style={{ background: COLOR[c] }} />)}<span className="muted small" style={{ marginLeft: 6 }}>{deckColors(d).join(' / ')}</span></div>
          <div className="muted small">{d.description}</div>
          {custom.has(d.id) && <div className="deck-actions"><span className="link" onClick={e => { e.stopPropagation(); onBuilder(d); }}>Edit</span><span className="link" onClick={e => { e.stopPropagation(); remove(d.id); }}>Delete</span></div>}
        </button>
      ))}
    </div>
  );
  return (
    <div className="home">
      <button className="btn ghost" onClick={onBack}>← Menu</button>
      <h2 style={{ marginTop: 12 }}>Practice game</h2>
      <h3 className="muted" style={{ fontWeight: 500 }}>Challenge level</h3>
      <div className="levels">
        {LEVELS.map(l => {
          const r = record[l.id];
          return (
            <button key={l.id} className={`level-card ${level === l.id ? 'on' : ''}`} onClick={() => pickLevel(l.id)}>
              <b>{l.name}</b>
              <div className="muted small">{l.blurb}</div>
              <div className="rec">{r ? <>Record: <b>{r.w}</b> W · {r.l} L</> : 'No games yet'}</div>
            </button>
          );
        })}
      </div>
      {level === 'custom' && (
        <div className="custom-row">
          <label>Bot strength<select value={botLevel} onChange={e => setBotLevel(e.target.value as BotLevel)}><option value="basic">Basic</option><option value="advanced">Advanced</option><option value="ace">Ace</option></select></label>
          <label>Coach<select value={coachMode} onChange={e => setCoachMode(e.target.value as CoachMode)}>{Object.entries(COACH_MODES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>
          <span className="muted small" style={{ alignSelf: 'flex-end', maxWidth: 420 }}>{COACH_MODES[coachMode].blurb}</span>
        </div>
      )}
      {tip && <div className="tip good" style={{ maxWidth: 720 }}><b>Move up?</b><div>{tip}</div></div>}
      <p className="muted">Eight starter decks cover all five colors. Build your own two-color deck in the <span className="link" onClick={() => onBuilder()}>Deck Builder</span> and it appears here for you or the bot.</p>
      <h3 className="muted" style={{ fontWeight: 500 }}>Your deck</h3>
      <DeckPick value={myDeck} onPick={setMyDeck} />
      <h3 className="muted" style={{ fontWeight: 500 }}>Opponent deck</h3>
      <DeckPick value={oppDeck} onPick={setOppDeck} />
      <div className="options-row">
        <label><input type="radio" checked={goFirst} onChange={() => setGoFirst(true)} /> I go first</label>
        <label><input type="radio" checked={!goFirst} onChange={() => setGoFirst(false)} /> I go second (get an EX Resource)</label>
      </div>
      <button className="btn primary" onClick={() => { const L = LEVELS.find(x => x.id === level)!; onStart({ myDeck, oppDeck, goFirst, me: 'p1', level, botLevel: level === 'custom' ? botLevel : L.bot, coachMode: level === 'custom' ? coachMode : L.coach }); }}>Start game ▶</button>
    </div>
  );
}
