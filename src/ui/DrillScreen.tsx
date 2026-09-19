import { useMemo, useState } from 'react';
import { LESSONS, type QuizQuestion } from '../learn/lessons';
import { GLOSSARY } from '../learn/glossary';

export function Quiz({ questions, onFinish }: { questions: QuizQuestion[]; onFinish?: (score: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const answered = Object.keys(answers).length;
  const score = questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  return (
    <div>
      {questions.map((q, i) => (
        <div key={i} className="q">
          <b>{i + 1}. {q.q}</b>
          <div className="opts">
            {q.options.map((o, j) => {
              const picked = answers[i];
              const cls = picked === undefined ? '' : j === q.answer ? 'correct' : picked === j ? 'wrong' : '';
              return <button key={j} className={`btn opt ${cls}`} disabled={picked !== undefined} onClick={() => setAnswers(a => ({ ...a, [i]: j }))}>{o}</button>;
            })}
          </div>
          {answers[i] !== undefined && <div className="why">{answers[i] === q.answer ? '✓ Correct. ' : '✗ Not quite. '}{q.why}</div>}
        </div>
      ))}
      {answered === questions.length && (
        <div className="q">
          <div className="score">Score: {score} / {questions.length}</div>
          {onFinish && <button className="btn primary" style={{ marginTop: 10 }} onClick={() => onFinish(score)}>Continue ▶</button>}
        </div>
      )}
    </div>
  );
}

const EXTRA: QuizQuestion[] = [
  { q: 'Your Unit (3 AP) attacks the player. They have an EX Base (3 HP) and 6 Shields. Result?', options: ['One Shield destroyed', 'The EX Base takes 3 and is destroyed', 'The Base takes 3 and a Shield is destroyed'], answer: 1, why: 'A Base in the shield area absorbs the attack; 3 damage destroys the 3 HP EX Base. Shields are untouched (8-5-2-4).' },
  { q: 'Which attacker CANNOT be blocked?', options: ['A Unit with <First Strike>', 'A Unit with <High-Maneuver>', 'A Link Unit', 'A Unit with <Breach>'], answer: 1, why: 'High-Maneuver stops enemy Blockers while it attacks (13-1-6).' },
  { q: 'Your 2 AP <First Strike> Unit attacks a rested 3 AP / 2 HP Unit. Your Unit has 2 HP. Result?', options: ['Both destroyed', 'Only theirs destroyed', 'Only yours destroyed'], answer: 1, why: 'First Strike damage is dealt first; the target hits 0 HP and never deals its damage (13-1-5-2).' },
  { q: 'You are Player Two. On your first turn how many Resources do you have after the Resource Phase?', options: ['1', '2', '3'], answer: 1, why: 'The EX Resource from setup plus the one placed in your Resource Phase (6-2-4, 7-4).' },
  { q: 'It is your opponent\'s turn. Can you play a 【Main】 Command from your hand?', options: ['Yes, in their action step', 'No'], answer: 1, why: 'Main timing is only during your own Main Phase. Only 【Action】 cards work on their turn (13-2-3).' },
  { q: 'A Unit with <Repair 2> has 2 damage and is destroyed in battle on your turn. Does Repair save it?', options: ['Yes, it heals first', 'No'], answer: 1, why: 'Repair happens at the end of your turn; destruction is immediate (13-1-1, 11-3).' },
  { q: 'You deploy a 7th Unit. What happens?', options: ['Not allowed', 'Choose one of your Units to trash (not destroyed)', 'The new Unit is discarded'], answer: 1, why: 'Battle area excess management: trash one existing Unit; it is not considered destroyed (11-4).' },
  { q: 'Pilot with an 【Attack】 effect is on a Unit that does NOT meet its link requirement. Does the effect trigger when the Unit attacks?', options: ['Yes', 'No'], answer: 0, why: 'Link requirements only govern attacking on the deploy turn; effects and stats work regardless (FAQ: Pilot).' },
  { q: 'Which of these is legal when you have 3 Resources (all active)?', options: ['Lv.4 cost 1 Pilot', 'Lv.3 cost 3 Unit', 'Lv.2 cost 4 Command'], answer: 1, why: 'Lv.3 ≤ 3 and cost 3 ≤ 3 active. The Pilot fails Level; the Command fails cost.' },
  { q: 'Opponent has 0 Shields and a 5 HP Base. Your 4 AP Unit attacks the player and is not blocked. Result?', options: ['You win', 'Base takes 4 damage', 'A Shield is destroyed'], answer: 1, why: 'The Base is still in the shield area and absorbs the attack. You win only when the shield area is empty (8-5-2).' },
];


export function DrillScreen({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<'drill' | 'glossary'>('drill');
  const [seed, setSeed] = useState(0);
  const questions = useMemo(() => {
    const all = [...LESSONS.flatMap(l => l.quiz), ...EXTRA];
    // deterministic shuffle by seed
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all.slice(0, 10);
  }, [seed]);
  return (
    <div className="quiz">
      <button className="btn ghost" onClick={onExit}>← Menu</button>
      <div className="tabs" style={{ margin: '10px 0 16px' }}>
        <button className={tab === 'drill' ? 'on' : ''} onClick={() => setTab('drill')}>Rules drill (10 random)</button>
        <button className={tab === 'glossary' ? 'on' : ''} onClick={() => setTab('glossary')}>Glossary</button>
      </div>
      {tab === 'drill' && (
        <>
          <p className="muted">Ten questions drawn from every lesson plus tricky rules interactions. Each answer cites the Comprehensive Rules.</p>
          <Quiz key={seed} questions={questions} onFinish={() => setSeed(x => x + 1)} />
        </>
      )}
      {tab === 'glossary' && (
        <dl className="glossary">{GLOSSARY.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      )}
    </div>
  );
}
