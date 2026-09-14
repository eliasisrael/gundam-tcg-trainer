import { useEffect, useMemo, useState } from 'react';
import type { Lesson } from '../learn/lessons';
import { createGame } from '../game/engine';
import { GameScreen, useGame } from './GameScreen';
import { Quiz } from './DrillScreen';

const KEY = 'gcg-trainer-lessons';
export function loadLessonProgress(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}
export function markLessonDone(id: string) {
  const p = loadLessonProgress(); p[id] = true;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** Render **bold**, bullet lines and paragraphs. */
export function Rich({ text }: { text: string }) {
  const paras = text.split('\n\n');
  return (
    <div className="lesson-body">
      {paras.map((p, i) => {
        const lines = p.split('\n');
        if (lines.every(l => l.startsWith('• ') || /^\d\. /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^• |^\d\. /, ''))}</li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}
function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>);
}

export function LessonScreen({ lesson, onExit, onNext }: { lesson: Lesson; onExit: () => void; onNext?: () => void }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'steps' | 'quiz' | 'done'>('steps');
  const setup = useMemo(() => lesson.setup ?? (() => createGame({ p1Deck: 'ST01', p2Deck: 'ST02', humanId: 'p1', seed: 3, skipMulligan: true })), [lesson]);
  const game = useGame(setup, 'p1');
  const cur = lesson.steps[step];
  const taskDone = cur.task ? cur.task.check(game.state, 'p1') : true;
  const [everDone, setEverDone] = useState<Record<number, boolean>>({});
  useEffect(() => { if (taskDone && cur.task) setEverDone(d => ({ ...d, [step]: true })); }, [taskDone, step, cur.task]);
  const canNext = !cur.task || taskDone || everDone[step];

  if (mode === 'quiz') {
    return (
      <div className="quiz">
        <button className="btn ghost" onClick={onExit}>← Lessons</button>
        <h2>{lesson.title}: check your understanding</h2>
        <Quiz questions={lesson.quiz} onFinish={() => { markLessonDone(lesson.id); setMode('done'); }} />
      </div>
    );
  }
  if (mode === 'done') {
    return (
      <div className="quiz">
        <h2>Lesson complete ✓</h2>
        <p>{lesson.summary}</p>
        <div className="lesson-nav">
          <button className="btn ghost" onClick={onExit}>Back to lessons</button>
          {onNext && <button className="btn primary" onClick={onNext}>Next lesson ▶</button>}
        </div>
      </div>
    );
  }

  const panel = (
    <div className="lesson-panel">
      <div className="step-count">{lesson.title} · step {step + 1} of {lesson.steps.length}</div>
      <h3>{cur.title}</h3>
      <Rich text={cur.body} />
      {cur.task && (
        <div className={`task ${canNext ? 'done' : ''}`}>
          <b>{canNext ? '✓ Done: ' : '▶ Your move: '}</b>{cur.task.prompt}
          {!canNext && cur.task.hint && <div className="muted small">Hint: {cur.task.hint}</div>}
        </div>
      )}
      {cur.rule && <div className="rule-ref">Comprehensive Rules {cur.rule}</div>}
      <div className="lesson-nav">
        <button className="btn ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>◀ Back</button>
        {step < lesson.steps.length - 1
          ? <button className="btn primary" disabled={!canNext} onClick={() => setStep(s => s + 1)}>Next ▶</button>
          : <button className="btn primary" disabled={!canNext} onClick={() => setMode('quiz')}>Take the quiz ▶</button>}
      </div>
    </div>
  );

  if (!lesson.setup) {
    return (
      <div className="quiz">
        <button className="btn ghost" onClick={onExit}>← Lessons</button>
        {panel}
      </div>
    );
  }

  return <GameScreen game={game} highlightZones={cur.highlight} sidePanel={panel} showCoach={false} onExit={onExit} title={lesson.title} />;
}
