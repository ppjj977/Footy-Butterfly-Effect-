import { useMemo, useState } from 'react';
import type { Intervention, Outcome, SeasonData } from '../engine/types';

type Tab = 'flip' | 'cancel_transfer' | 'injure';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'flip', label: 'Flip a result', hint: 'Change one match outcome' },
  { id: 'cancel_transfer', label: 'Cancel a transfer', hint: 'Undo a signing' },
  { id: 'injure', label: 'Injure a player', hint: 'Rule a star out' },
];

function teamName(season: SeasonData, id: string) {
  return season.teams.find((t) => t.id === id)?.name ?? id;
}

export default function InterventionSelect({
  season,
  onCommit,
  onBack,
}: {
  season: SeasonData;
  onCommit: (iv: Intervention) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('flip');

  return (
    <div className="animate-riseup">
      <button onClick={onBack} className="mb-3 text-sm text-white/50 hover:text-white">
        ← {season.meta.name}
      </button>
      <p className="mb-1 text-sm font-medium uppercase tracking-widest text-butter/80">
        Step 2 — change one thing
      </p>
      <h2 className="mb-4 font-display text-4xl tracking-wide">The intervention</h2>

      <div className="mb-5 grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl border p-2 text-center transition ${
              tab === t.id
                ? 'border-butter bg-butter/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="text-sm font-semibold leading-tight">{t.label}</div>
            <div className="mt-0.5 text-[10px] text-white/45">{t.hint}</div>
          </button>
        ))}
      </div>

      {tab === 'flip' && <FlipPicker season={season} onCommit={onCommit} />}
      {tab === 'cancel_transfer' && (
        <TransferPicker season={season} onCommit={onCommit} />
      )}
      {tab === 'injure' && <InjuryPicker season={season} onCommit={onCommit} />}
    </div>
  );
}

// ── Flip ───────────────────────────────────────────────────────────────────
function FlipPicker({
  season,
  onCommit,
}: {
  season: SeasonData;
  onCommit: (iv: Intervention) => void;
}) {
  const teams = [...season.teams].sort((a, b) => a.name.localeCompare(b.name));
  const [teamId, setTeamId] = useState(teams[0].id);

  const fixtures = useMemo(
    () =>
      season.fixtures
        .filter((f) => f.home === teamId || f.away === teamId)
        .sort((a, b) => a.matchday - b.matchday),
    [season, teamId],
  );

  function realFor(fx: (typeof fixtures)[number]): Outcome {
    return fx.fhg > fx.fag ? 'H' : fx.fhg < fx.fag ? 'A' : 'D';
  }
  // Map a "team perspective" pick to the home-perspective outcome.
  function toHomeOutcome(isHome: boolean, pick: 'W' | 'D' | 'L'): Outcome {
    if (pick === 'D') return 'D';
    if (pick === 'W') return isHome ? 'H' : 'A';
    return isHome ? 'A' : 'H';
  }

  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-wider text-white/50">
        Team
      </label>
      <select
        value={teamId}
        onChange={(e) => setTeamId(e.target.value)}
        className="mb-4 w-full rounded-xl border border-white/15 bg-pitch-900 px-3 py-3 text-white"
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <div className="max-h-[46vh] space-y-2 overflow-y-auto no-scrollbar pr-1">
        {fixtures.map((fx) => {
          const isHome = fx.home === teamId;
          const opp = teamName(season, isHome ? fx.away : fx.home);
          const real = realFor(fx);
          const teamResult =
            real === 'D' ? 'D' : (real === 'H') === isHome ? 'W' : 'L';
          return (
            <div key={fx.id} className="card p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-white/60">
                  MD{fx.matchday} · {isHome ? 'vs' : '@'} {opp}
                </span>
                <span className="chip tabular-nums">
                  {isHome ? `${fx.fhg}–${fx.fag}` : `${fx.fag}–${fx.fhg}`} ·{' '}
                  {teamResult}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['W', 'D', 'L'] as const).map((pick) => {
                  const out = toHomeOutcome(isHome, pick);
                  const isReal = out === real;
                  return (
                    <button
                      key={pick}
                      disabled={isReal}
                      onClick={() =>
                        onCommit({ type: 'flip', fixtureId: fx.id, outcome: out })
                      }
                      className={`rounded-lg py-2 text-sm font-semibold transition ${
                        isReal
                          ? 'cursor-default bg-white/5 text-white/30'
                          : 'bg-white/10 hover:bg-butter hover:text-black'
                      }`}
                    >
                      {pick === 'W' ? 'Win' : pick === 'D' ? 'Draw' : 'Lose'}
                      {isReal && ' ✓'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cancel transfer ──────────────────────────────────────────────────────
function TransferPicker({
  season,
  onCommit,
}: {
  season: SeasonData;
  onCommit: (iv: Intervention) => void;
}) {
  const transfers = [...season.transfers].sort((a, b) => b.fee - a.fee);
  if (transfers.length === 0)
    return <p className="text-white/50">No transfers recorded for this season.</p>;
  return (
    <div className="max-h-[52vh] space-y-2 overflow-y-auto no-scrollbar pr-1">
      {transfers.map((tr) => (
        <button
          key={tr.id}
          onClick={() => onCommit({ type: 'cancel_transfer', transferId: tr.id })}
          className="card flex w-full items-center gap-3 p-3 text-left hover:border-butter/50 hover:bg-white/10"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{tr.playerName}</div>
            <div className="text-xs text-white/55">
              {tr.fromClub ? teamName(season, tr.fromClub) : 'abroad'} →{' '}
              {teamName(season, tr.toClub)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-xl text-butter/90">
              {tr.fee > 0 ? `£${tr.fee}m` : 'free'}
            </div>
            <div className="text-[10px] text-white/40">
              {tr.impact.toFixed(0)} Elo
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Injure ─────────────────────────────────────────────────────────────────
function InjuryPicker({
  season,
  onCommit,
}: {
  season: SeasonData;
  onCommit: (iv: Intervention) => void;
}) {
  const players = useMemo(
    () =>
      [...season.players]
        .filter((p) => p.minutes >= 1500)
        .sort((a, b) => b.impact - a.impact),
    [season],
  );
  const months = useMemo(() => {
    const set = new Set(season.fixtures.map((f) => f.date.slice(0, 7)));
    return [...set].sort();
  }, [season]);

  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const [length, setLength] = useState<3 | 6>(3);
  const [startMonth, setStartMonth] = useState(months[0] ?? '');

  if (players.length === 0)
    return <p className="text-white/50">No eligible players (≥1500 mins).</p>;

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${y}`;
  };

  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-wider text-white/50">
        Player (≥ 1500 mins)
      </label>
      <select
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value)}
        className="mb-4 w-full rounded-xl border border-white/15 bg-pitch-900 px-3 py-3 text-white"
      >
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {teamName(season, p.club)} ({p.impact.toFixed(0)} Elo)
          </option>
        ))}
      </select>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-2 block text-xs uppercase tracking-wider text-white/50">
            Out for
          </label>
          <div className="flex overflow-hidden rounded-xl border border-white/15">
            {([3, 6] as const).map((m) => (
              <button
                key={m}
                onClick={() => setLength(m)}
                className={`flex-1 py-3 text-sm font-semibold ${
                  length === m ? 'bg-butter text-black' : 'bg-white/5'
                }`}
              >
                {m} months
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs uppercase tracking-wider text-white/50">
            From
          </label>
          <select
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-pitch-900 px-3 py-3 text-white"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="btn-primary w-full"
        onClick={() =>
          onCommit({ type: 'injure', playerId, months: length, startMonth })
        }
      >
        Rule them out →
      </button>
    </div>
  );
}
