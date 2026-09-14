import { useState } from 'react';
import { DECKS } from '../game/cards';
import { SKILLS, loadSkills } from '../game/coach';
import { LESSONS } from '../learn/lessons';
import { loadLessonProgress } from './LessonScreen';
import { COLOR } from './CardView';
import type { PlayerId } from '../game/types';

export interface PracticeOptions { myDeck: string; oppDeck: string; goFirst: boolean; me: PlayerId }

export function Home({ onLesson, onPractice, onDrills }: { onLesson: (id: string) => void; onPractice: (o: PracticeOptions) => void; onDrills: () => void }) {
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
        <p className="muted">Eight short lessons. Each runs on a live board where you make the plays yourself, then a quick quiz locks it in.</p>
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

  if (view === 'practice') return <PracticeSetup onBack={() => setView('home')} onStart={onPractice} />;

  return (
    <div className="home">
      <div className="hero">
        <div>
          <div className="kicker" style={{ color: 'var(--accent)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase' }}>Unofficial fan-made trainer</div>
          <h1>Gundam Card Game <span>Trainer</span></h1>
          <p className="muted" style={{ maxWidth: 560 }}>Learn the rules by playing them, then practice against a bot with a coach that explains every decision. Built on the official Comprehensive Rules v1.9.0 and the ST01 / ST02 starter decks.</p>
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
        <button className="mode" onClick={onDrills}>
          <span className="kicker">Anytime</span>
          <h3>Drills &amp; Glossary</h3>
          <p className="muted">Ten-question rules drills with rule citations, and a glossary of every keyword and timing icon.</p>
        </button>
      </div>

      <h3>Why this exists</h3>
      <p className="muted" style={{ maxWidth: 720 }}>The official Teaching App shows you the rules once. This trainer keeps teaching: every lesson is a task you perform on the board, the Coach comments on the actual position in front of you, and a skill tracker records each mechanic the first time you use it correctly.</p>
      <p className="muted small">Card names and text are property of Bandai. This tool is not affiliated with or endorsed by Bandai.</p>
    </div>
  );
}

function PracticeSetup({ onBack, onStart }: { onBack: () => void; onStart: (o: PracticeOptions) => void }) {
  const [myDeck, setMyDeck] = useState('ST01');
  const [oppDeck, setOppDeck] = useState('ST02');
  const [goFirst, setGoFirst] = useState(true);
  return (
    <div className="home">
      <button className="btn ghost" onClick={onBack}>← Menu</button>
      <h2 style={{ marginTop: 12 }}>Practice game</h2>
      <h3 className="muted" style={{ fontWeight: 500 }}>Your deck</h3>
      <div className="deck-pick">
        {Object.values(DECKS).map(d => (
          <button key={d.id} className={`deck-card ${myDeck === d.id ? 'on' : ''}`} onClick={() => setMyDeck(d.id)}>
            <b>{d.name} [{d.id}]</b>
            <div className="swatches">{d.colors.map(c => <span key={c} className="swatch" style={{ background: COLOR[c] }} />)}</div>
            <div className="muted small">{d.description}</div>
          </button>
        ))}
      </div>
      <h3 className="muted" style={{ fontWeight: 500 }}>Opponent deck</h3>
      <div className="deck-pick">
        {Object.values(DECKS).map(d => (
          <button key={d.id} className={`deck-card ${oppDeck === d.id ? 'on' : ''}`} onClick={() => setOppDeck(d.id)}>
            <b>{d.name} [{d.id}]</b>
            <div className="swatches">{d.colors.map(c => <span key={c} className="swatch" style={{ background: COLOR[c] }} />)}</div>
          </button>
        ))}
      </div>
      <div className="options-row">
        <label><input type="radio" checked={goFirst} onChange={() => setGoFirst(true)} /> I go first</label>
        <label><input type="radio" checked={!goFirst} onChange={() => setGoFirst(false)} /> I go second (get an EX Resource)</label>
      </div>
      <button className="btn primary" onClick={() => onStart({ myDeck, oppDeck, goFirst, me: 'p1' })}>Start game ▶</button>
    </div>
  );
}
