import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Intervention, SeasonData, Timeline } from './engine/types';
import { runTimeline } from './engine';
import {
  loadManifest,
  loadSeason,
  seasonKey,
  type Manifest,
  type ManifestSeason,
} from './lib/data';
import { buildShareUrl, parseShareUrl } from './lib/share';
import SeasonSelect from './components/SeasonSelect';
import InterventionSelect from './components/InterventionSelect';
import TimelineReveal from './components/TimelineReveal';

type Step = 'season' | 'intervention' | 'reveal';

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export default function Butterfly() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [step, setStep] = useState<Step>('season');
  const [season, setSeason] = useState<SeasonData | null>(null);
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [seed, setSeed] = useState<number>(0);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load manifest, then hydrate from a share URL if present.
  useEffect(() => {
    (async () => {
      try {
        const m = await loadManifest();
        setManifest(m);
        const parsed = parseShareUrl(window.location.search);
        if (parsed) {
          const s = await loadSeason(seasonKey(parsed.league, parsed.year));
          setSeason(s);
          setIntervention(parsed.intervention);
          setSeed(parsed.seed);
          setStep('reveal');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      }
    })();
  }, []);

  // Compute the timeline whenever (season, intervention, seed) change.
  useEffect(() => {
    if (step !== 'reveal' || !season || !intervention) return;
    setBusy(true);
    setError(null);
    // Defer to next frame so the loading state can paint before the (sync)
    // 500-sim run blocks the thread.
    const id = window.setTimeout(() => {
      try {
        const t = runTimeline(season, intervention, seed);
        setTimeline(t);
        const url = buildShareUrl(window.location.href, {
          league: season.meta.league,
          year: season.meta.year,
          intervention,
          seed,
        });
        window.history.replaceState(null, '', url);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Simulation failed');
      } finally {
        setBusy(false);
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [step, season, intervention, seed]);

  const shareUrl = useMemo(() => {
    if (!season || !intervention) return window.location.href;
    return buildShareUrl(window.location.href.split('?')[0], {
      league: season.meta.league,
      year: season.meta.year,
      intervention,
      seed,
    });
  }, [season, intervention, seed]);

  const pickSeason = useCallback(async (s: ManifestSeason) => {
    setBusy(true);
    try {
      const data = await loadSeason(s.key);
      setSeason(data);
      setIntervention(null);
      setTimeline(null);
      setStep('intervention');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load season');
    } finally {
      setBusy(false);
    }
  }, []);

  const commitIntervention = useCallback((iv: Intervention) => {
    setIntervention(iv);
    setSeed(randomSeed());
    setStep('reveal');
  }, []);

  const goSeason = () => {
    setStep('season');
    window.history.replaceState(null, '', window.location.pathname);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 pb-2 pt-6">
      <Header onHome={goSeason} />

      <main className="flex-1">
        {error && (
          <div className="card mb-4 border-red-500/40 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {!manifest && !error && <Loading label="Loading seasons…" />}

        {manifest && step === 'season' && (
          <SeasonSelect manifest={manifest} onPick={pickSeason} />
        )}

        {step === 'intervention' && season && (
          <InterventionSelect
            season={season}
            onCommit={commitIntervention}
            onBack={goSeason}
          />
        )}

        {step === 'reveal' && season && (
          <>
            {busy || !timeline ? (
              <Loading label="Rewriting history…" />
            ) : (
              <TimelineReveal
                season={season}
                timeline={timeline}
                shareUrl={shareUrl}
                onRunAgain={() => setSeed(randomSeed())}
                onNewChange={() => setStep('intervention')}
                onNewSeason={goSeason}
              />
            )}
          </>
        )}
      </main>

      <Footer source={season?.meta.dataSource} />
    </div>
  );
}

function Header({ onHome }: { onHome: () => void }) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <button onClick={onHome} className="flex items-center gap-2">
        <span className="inline-block animate-flap text-2xl">🦋</span>
        <span className="font-display text-3xl tracking-widest">BUTTERFLY</span>
      </button>
      <span className="chip text-white/50">counterfactual football</span>
    </header>
  );
}

function Footer({ source }: { source?: string }) {
  return (
    <footer className="mt-8 border-t border-white/10 pt-4 text-center text-[11px] leading-relaxed text-white/35">
      <p>
        <span className="font-semibold text-red-400/70">SIMULATION.</span>{' '}
        Independent fan project, no affiliation. Stats from public sources.
        {source ? ` Data: ${source}.` : ''}
      </p>
      <p className="mt-1">Outcomes only — positions, points, trophies, relegation.</p>
    </footer>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="mb-3 animate-flap text-4xl">🦋</span>
      <p className="text-white/60">{label}</p>
    </div>
  );
}
