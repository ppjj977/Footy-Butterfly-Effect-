import { useEffect, useRef, useState } from 'react';
import type { SeasonData, Timeline } from '../engine/types';
import TableDiff from './TableDiff';
import { drawShareCard, canvasToBlob } from '../lib/sharecard';

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export default function TimelineReveal({
  season,
  timeline,
  shareUrl,
  onRunAgain,
  onNewChange,
  onNewSeason,
}: {
  season: SeasonData;
  timeline: Timeline;
  shareUrl: string;
  onRunAgain: () => void;
  onNewChange: () => void;
  onNewSeason: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // Probability footnote: pick the most salient line.
  const champ = timeline.altTable[0];
  const champOdds = timeline.probability.titleOdds[champ.teamId] ?? 0;

  useEffect(() => {
    if (canvasRef.current) {
      drawShareCard(canvasRef.current, season, timeline, shareUrl);
    }
  }, [season, timeline, shareUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the URL is also in the address bar */
    }
  }

  async function downloadPng() {
    if (!canvasRef.current) return;
    const blob = await canvasToBlob(canvasRef.current);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `butterfly-${season.meta.league}-${season.meta.year}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-riseup space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-butter/80">
          The alternate timeline
        </p>
        <p className="mt-1 text-white/60">{timeline.interventionText}</p>
      </div>

      {/* Headlines */}
      <div className="space-y-2">
        {timeline.headlines.map((h, i) => (
          <div
            key={i}
            className={`card p-4 ${i === 0 ? 'border-butter/40' : ''}`}
            style={{ animation: `riseup 0.4s ease-out ${i * 0.12}s both` }}
          >
            <p
              className={`font-display tracking-wide ${
                i === 0 ? 'text-2xl text-white' : 'text-lg text-white/80'
              }`}
            >
              {h}
            </p>
          </div>
        ))}
      </div>

      {/* Table diff */}
      <div className="card p-4">
        <TableDiff diff={timeline.diff} />
      </div>

      {/* Key moments */}
      {timeline.keyMoments.length > 0 && (
        <div>
          <h3 className="mb-3 font-display text-2xl tracking-wide text-white/90">
            Key swing moments
          </h3>
          <div className="space-y-2">
            {timeline.keyMoments.map((m) => (
              <div key={m.fixtureId} className="card flex items-center gap-3 p-3">
                <div className="chip tabular-nums">MD{m.matchday}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.home} v {m.away}
                  </div>
                  <div className="text-xs text-white/50">{m.blurb}</div>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <span className="text-white/40 line-through">{m.realScore}</span>
                  <span className="ml-2 font-bold text-butter">{m.newScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Probability footnote */}
      <p className="rounded-xl bg-white/5 p-3 text-center text-sm text-white/55">
        Across {timeline.probability.sims} re-rolled timelines,{' '}
        <span className="font-semibold text-white/80">{champ.name}</span> win the
        league {pct(champOdds)} of the time. This is one draw from that
        distribution — hit <em>Run it again</em> to see another.
      </p>

      {/* Share card preview */}
      <div>
        <h3 className="mb-3 font-display text-2xl tracking-wide text-white/90">
          Share card
        </h3>
        <canvas
          ref={canvasRef}
          className="w-full rounded-2xl border border-white/10"
          style={{ aspectRatio: '1 / 1' }}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={downloadPng}>
            ⤓ Download PNG
          </button>
          <button className="btn-ghost" onClick={copyLink}>
            {copied ? '✓ Link copied' : '🔗 Copy share link'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 -mx-4 grid grid-cols-3 gap-2 bg-gradient-to-t from-pitch-900 via-pitch-900/95 to-transparent px-4 pb-4 pt-3">
        <button className="btn-primary" onClick={onRunAgain}>
          🎲 Run again
        </button>
        <button className="btn-ghost" onClick={onNewChange}>
          New change
        </button>
        <button className="btn-ghost" onClick={onNewSeason}>
          New season
        </button>
      </div>
    </div>
  );
}
