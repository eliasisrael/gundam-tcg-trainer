import { useState } from 'react';
import { createGame } from './game/engine';
import { LESSONS, lessonById } from './learn/lessons';
import { DrillScreen } from './ui/DrillScreen';
import { GameScreen, useGame } from './ui/GameScreen';
import { Home, type PracticeOptions } from './ui/Home';
import { LessonScreen } from './ui/LessonScreen';

type Route = { name: 'home' } | { name: 'lesson'; id: string } | { name: 'practice'; opts: PracticeOptions; key: number } | { name: 'drills' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const home = () => setRoute({ name: 'home' });

  if (route.name === 'lesson') {
    const lesson = lessonById(route.id)!;
    const idx = LESSONS.indexOf(lesson);
    const next = LESSONS[idx + 1];
    return <LessonScreen key={lesson.id} lesson={lesson} onExit={home} onNext={next ? () => setRoute({ name: 'lesson', id: next.id }) : undefined} />;
  }
  if (route.name === 'practice') return <Practice key={route.key} opts={route.opts} onExit={home} />;
  if (route.name === 'drills') return <DrillScreen onExit={home} />;
  return <Home onLesson={id => setRoute({ name: 'lesson', id })} onPractice={opts => setRoute({ name: 'practice', opts, key: Date.now() })} onDrills={() => setRoute({ name: 'drills' })} />;
}

function Practice({ opts, onExit }: { opts: PracticeOptions; onExit: () => void }) {
  const game = useGame(() => createGame({ p1Deck: opts.myDeck, p2Deck: opts.oppDeck, humanId: 'p1', first: opts.goFirst ? 'p1' : 'p2', p2Name: 'Trainer Bot' }), 'p1');
  return <GameScreen game={game} onExit={onExit} />;
}
