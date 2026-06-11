import { useState } from 'react';
import Butterfly from './Butterfly';
import TitleRun from './titlerun/TitleRun';

type Game = 'titlerun' | 'butterfly';

export default function App() {
  const [game, setGame] = useState<Game>('titlerun');

  return (
    <div className="min-h-full">
      <nav className="sticky top-0 z-20 border-b border-white/10 bg-pitch-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2">
          <span className="font-display text-lg tracking-widest text-white/70">
            FOOTY&nbsp;LAB
          </span>
          <div className="flex overflow-hidden rounded-lg border border-white/15 text-xs font-semibold">
            <button
              onClick={() => setGame('titlerun')}
              className={`px-3 py-1.5 ${game === 'titlerun' ? 'bg-butter text-black' : 'text-white/55'}`}
            >
              ⚽ Title Run
            </button>
            <button
              onClick={() => setGame('butterfly')}
              className={`px-3 py-1.5 ${game === 'butterfly' ? 'bg-butter text-black' : 'text-white/55'}`}
            >
              🦋 Butterfly
            </button>
          </div>
        </div>
      </nav>

      {game === 'titlerun' ? <TitleRun /> : <Butterfly />}
    </div>
  );
}
