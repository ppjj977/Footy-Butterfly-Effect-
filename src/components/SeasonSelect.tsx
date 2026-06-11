import type { Manifest, ManifestSeason } from '../lib/data';

// A short hook line per shipped season to set the narrative.
const TAGLINES: Record<string, string> = {
  PL_1995: 'Newcastle led by 12 points. What if they’d held on?',
  PL_2003: 'Arsenal went unbeaten. What breaks the Invincibles?',
  PL_2011: 'Decided in the 94th minute. Aguerooo — or not?',
  PL_2015: 'Leicester at 5000–1. Undo the miracle?',
  PL_2018: 'City hit 100 points. How fragile was it really?',
  PL_2019: 'Liverpool’s 99. Project Restart, rewritten.',
  PL_2021: 'City pipped Liverpool by a point. Tip it back?',
  PL_2023: 'City’s treble year. Pull one thread.',
};

export default function SeasonSelect({
  manifest,
  onPick,
}: {
  manifest: Manifest;
  onPick: (s: ManifestSeason) => void;
}) {
  return (
    <div className="animate-riseup">
      <p className="mb-1 text-sm font-medium uppercase tracking-widest text-butter/80">
        Step 1
      </p>
      <h2 className="mb-5 font-display text-4xl tracking-wide">Pick a season</h2>
      <div className="grid gap-3">
        {[...manifest.seasons].reverse().map((s) => (
          <button
            key={s.key}
            onClick={() => onPick(s)}
            className="card group flex items-center gap-4 p-4 text-left transition hover:border-butter/50 hover:bg-white/10"
          >
            <div className="font-display text-3xl text-butter/90 tabular-nums">
              {String(s.year).slice(2)}/{String((s.year + 1) % 100).padStart(2, '0')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{s.name}</div>
              <div className="truncate text-sm text-white/55">
                {TAGLINES[s.key] ?? `${manifest.leagues[s.league]?.name ?? s.league}`}
              </div>
            </div>
            <div className="text-white/30 transition group-hover:translate-x-1">→</div>
          </button>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-white/35">
        More seasons are config additions to the pipeline. Shipped data uses real
        final standings; full fixture-level history is reproduced by the pipeline
        from public sources when run with network access.
      </p>
    </div>
  );
}
