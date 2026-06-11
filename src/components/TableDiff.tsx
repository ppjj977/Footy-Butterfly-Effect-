import { useState } from 'react';
import type { TableDiffRow } from '../engine/types';

const ROW_H = 38;

// Zones: champion / top-4 / relegation, used for subtle row tinting.
function zoneClass(pos: number, n: number): string {
  if (pos === 1) return 'border-l-butter';
  if (pos <= 4) return 'border-l-sky-400/70';
  if (pos > n - 3) return 'border-l-red-500/70';
  return 'border-l-transparent';
}

export default function TableDiff({ diff }: { diff: TableDiffRow[] }) {
  const [view, setView] = useState<'alt' | 'real'>('alt');
  const n = diff.length;

  // Pre-compute each team's row index under both orderings for the morph.
  const altIndex = new Map(diff.map((r) => [r.teamId, r.position - 1]));
  const realIndex = new Map(diff.map((r) => [r.teamId, r.realPosition - 1]));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-2xl tracking-wide text-white/90">
          Final table
        </h3>
        <div className="flex overflow-hidden rounded-lg border border-white/15 text-xs">
          <button
            className={`px-3 py-1.5 font-semibold ${view === 'real' ? 'bg-white/15 text-white' : 'text-white/50'}`}
            onClick={() => setView('real')}
          >
            Real
          </button>
          <button
            className={`px-3 py-1.5 font-semibold ${view === 'alt' ? 'bg-butter text-black' : 'text-white/50'}`}
            onClick={() => setView('alt')}
          >
            Alternate
          </button>
        </div>
      </div>

      <div
        className="relative"
        style={{ height: n * ROW_H }}
        aria-label="league table"
      >
        {diff.map((r) => {
          const idx = (view === 'alt' ? altIndex : realIndex).get(r.teamId)!;
          const pos = view === 'alt' ? r.position : r.realPosition;
          const moved = r.positionDelta;
          return (
            <div
              key={r.teamId}
              className={`absolute left-0 right-0 flex items-center gap-2 border-l-2 px-2 text-sm transition-all duration-700 ease-out ${zoneClass(pos, n)}`}
              style={{ transform: `translateY(${idx * ROW_H}px)`, height: ROW_H }}
            >
              <span className="w-5 text-right tabular-nums text-white/50">{pos}</span>
              <span className="flex-1 truncate font-medium">{r.name}</span>

              {view === 'alt' && moved !== 0 && (
                <span
                  className={`tabular-nums text-xs font-bold ${moved > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {moved > 0 ? '▲' : '▼'}
                  {Math.abs(moved)}
                </span>
              )}

              <span className="w-12 text-right tabular-nums text-white/60">
                {r.gd > 0 ? `+${r.gd}` : r.gd}
              </span>
              <span className="w-8 text-right font-bold tabular-nums">
                {view === 'alt' ? r.points : r.realPoints}
              </span>
              {view === 'alt' && r.pointsDelta !== 0 && (
                <span
                  className={`w-9 text-right text-xs tabular-nums ${r.pointsDelta > 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}
                >
                  {r.pointsDelta > 0 ? '+' : ''}
                  {r.pointsDelta}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-white/40">
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-1 rounded bg-butter" /> Champions
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-1 rounded bg-sky-400/70" /> Top 4
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-1 rounded bg-red-500/70" /> Relegation
        </span>
      </div>
    </div>
  );
}
