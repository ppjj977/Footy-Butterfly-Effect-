import { useEffect, useMemo, useState } from 'react';
import type { SeasonData, TeamId } from '../engine/types';
import { loadManifest, loadSeason, type ManifestSeason } from '../lib/data';
import {
  createRun,
  playWeek,
  weekPreview,
  sortedTable,
  gradeSeason,
  baseStyle,
  type RunState,
  type Decision,
  type WeekResult,
} from './campaign';
import {
  STYLES,
  STYLE_LABEL,
  STYLE_BLURB,
  styleEdge,
  type Style,
  type Intensity,
} from './tactics';

function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
function counterOf(s: Style): Style {
  return STYLES.find((x) => styleEdge(x, s) === 1)!;
}

type Phase = 'setup' | 'decide' | 'result' | 'end';

export default function TitleRun() {
  const [seasons, setSeasons] = useState<ManifestSeason[]>([]);
  const [run, setRun] = useState<RunState | null>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [last, setLast] = useState<WeekResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then((m) => setSeasons([...m.seasons].reverse()))
      .catch((e) => setError(e.message));
  }, []);

  async function start(seasonKey: string, clubId: TeamId) {
    try {
      const data = await loadSeason(seasonKey);
      setRun(createRun(data, clubId, randomSeed()));
      setLast(null);
      setPhase('decide');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load season');
    }
  }

  function commit(decision: Decision) {
    if (!run) return;
    const next = playWeek(run, decision);
    setRun(next);
    setLast(next.history[next.history.length - 1] ?? null);
    setPhase(next.finished ? 'end' : 'result');
  }

  return (
    <div className="mx-auto flex min-h-[calc(100%-44px)] max-w-xl flex-col px-4 pb-6 pt-5">
      {error && (
        <div className="card mb-4 border-red-500/40 p-4 text-sm text-red-300">{error}</div>
      )}

      {phase === 'setup' && (
        <Setup seasons={seasons} onStart={start} />
      )}

      {phase === 'decide' && run && (
        <Decide run={run} onPlay={commit} onQuit={() => setPhase('setup')} />
      )}

      {phase === 'result' && run && last && (
        <Result run={run} result={last} onNext={() => setPhase('decide')} />
      )}

      {phase === 'end' && run && (
        <End run={run} onRestart={() => setPhase('setup')} />
      )}
    </div>
  );
}

// ── Setup ────────────────────────────────────────────────────────────────────
function difficulty(rank: number, total: number): string {
  if (rank <= 2) return 'Title favourites';
  if (rank <= 5) return 'European hopefuls';
  if (rank <= 10) return 'Top-half club';
  if (rank <= total - 5) return 'Mid-table';
  return 'Relegation scrap';
}

function Setup({
  seasons,
  onStart,
}: {
  seasons: ManifestSeason[];
  onStart: (key: string, club: TeamId) => void;
}) {
  const [seasonKey, setSeasonKey] = useState<string>('');
  const [data, setData] = useState<SeasonData | null>(null);

  useEffect(() => {
    if (seasons.length && !seasonKey) setSeasonKey(seasons[0].key);
  }, [seasons, seasonKey]);
  useEffect(() => {
    if (seasonKey) loadSeason(seasonKey).then(setData).catch(() => setData(null));
  }, [seasonKey]);

  const teamsByStrength = useMemo(
    () => (data ? [...data.teams].sort((a, b) => b.elo - a.elo) : []),
    [data],
  );

  return (
    <div className="animate-riseup">
      <h1 className="font-display text-4xl tracking-wide">Title Run</h1>
      <p className="mb-5 mt-1 text-white/60">
        Take a club through a full season. Scout each opponent, pick your tactics,
        manage your squad. 38 weeks — your decisions, not the dice.
      </p>

      <label className="mb-2 block text-xs uppercase tracking-wider text-white/50">Season</label>
      <select
        value={seasonKey}
        onChange={(e) => setSeasonKey(e.target.value)}
        className="mb-5 w-full rounded-xl border border-white/15 bg-pitch-900 px-3 py-3 text-white"
      >
        {seasons.map((s) => (
          <option key={s.key} value={s.key}>{s.name}</option>
        ))}
      </select>

      <label className="mb-2 block text-xs uppercase tracking-wider text-white/50">
        Choose your club
      </label>
      <div className="grid max-h-[52vh] grid-cols-1 gap-2 overflow-y-auto no-scrollbar pr-1">
        {teamsByStrength.map((t, i) => (
          <button
            key={t.id}
            onClick={() => onStart(seasonKey, t.id)}
            className="card flex items-center justify-between p-3 text-left hover:border-butter/50 hover:bg-white/10"
          >
            <div>
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-white/50">
                Plays {STYLE_LABEL[baseStyle(t.id)]} · {difficulty(i + 1, teamsByStrength.length)}
              </div>
            </div>
            <span className="text-white/30">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Decision screen ──────────────────────────────────────────────────────────
function Decide({
  run,
  onPlay,
  onQuit,
}: {
  run: RunState;
  onPlay: (d: Decision) => void;
  onQuit: () => void;
}) {
  const pre = weekPreview(run)!;
  const suggested = counterOf(pre.scoutedStyle);
  const [style, setStyle] = useState<Style>(suggested);
  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [rotate, setRotate] = useState(false);

  useEffect(() => {
    setStyle(counterOf(pre.scoutedStyle));
    setIntensity('normal');
    setRotate(false);
  }, [pre.matchday, pre.scoutedStyle]);

  const clubName = run.season.teams.find((t) => t.id === run.clubId)?.short ?? run.clubId;

  return (
    <div className="animate-riseup">
      <ProgressBar run={run} onQuit={onQuit} />

      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between text-sm text-white/60">
          <span>Matchday {pre.matchday}</span>
          <span>{pre.isHome ? 'HOME' : 'AWAY'}</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-3 py-2 font-display text-2xl tracking-wide">
          <span>{clubName}</span>
          <span className="text-white/30 text-base">vs</span>
          <span>{pre.opponentName}</span>
        </div>
        <div className="rounded-lg bg-white/5 p-3 text-sm">
          <span className="text-white/50">Scouting report: </span>
          they line up <b className="text-butter">{STYLE_LABEL[pre.scoutedStyle]}</b>.
          {pre.reactive && (
            <span className="text-white/60"> Watch out — they often adapt to their opponent.</span>
          )}
        </div>
      </div>

      <Resources run={run} />

      {/* Style */}
      <h3 className="mb-2 mt-4 font-display text-xl tracking-wide text-white/90">Your shape</h3>
      <div className="grid grid-cols-1 gap-2">
        {STYLES.map((s) => {
          const edge = styleEdge(s, pre.scoutedStyle);
          return (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                style === s ? 'border-butter bg-butter/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="flex-1">
                <div className="font-semibold">{STYLE_LABEL[s]}</div>
                <div className="text-[11px] text-white/45">{STYLE_BLURB[s]}</div>
              </div>
              {edge === 1 && <span className="chip border-emerald-400/40 text-emerald-300">counters</span>}
              {edge === -1 && <span className="chip border-red-400/40 text-red-300">countered</span>}
            </button>
          );
        })}
      </div>

      {/* Intensity */}
      <h3 className="mb-2 mt-4 font-display text-xl tracking-wide text-white/90">Intensity</h3>
      <div className="flex overflow-hidden rounded-xl border border-white/15">
        {(['low', 'normal', 'high'] as Intensity[]).map((i) => (
          <button
            key={i}
            onClick={() => setIntensity(i)}
            className={`flex-1 py-3 text-sm font-semibold capitalize ${
              intensity === i ? 'bg-butter text-black' : 'bg-white/5'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-white/40">
        {intensity === 'high'
          ? 'Stronger today, but drains legs and risks knocks.'
          : intensity === 'low'
            ? 'Conserves energy — but you’ll be weaker.'
            : 'Balanced effort.'}
      </p>

      {/* Rotate */}
      <button
        onClick={() => setRotate((r) => !r)}
        className={`mt-4 flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
          rotate ? 'border-butter bg-butter/15' : 'border-white/10 bg-white/5'
        }`}
      >
        <div>
          <div className="font-semibold">Rotate the squad</div>
          <div className="text-[11px] text-white/45">
            Much weaker today, but recovers energy and dodges injuries. Pick your spots.
          </div>
        </div>
        <span className={`chip ${rotate ? 'border-butter/60 text-butter' : 'text-white/40'}`}>
          {rotate ? 'ON' : 'OFF'}
        </span>
      </button>

      <button className="btn-primary mt-5 w-full text-lg" onClick={() => onPlay({ style, intensity, rotate })}>
        Play the match →
      </button>
    </div>
  );
}

function ProgressBar({ run, onQuit }: { run: RunState; onQuit: () => void }) {
  const pos = sortedTable(run).findIndex((l) => l.teamId === run.clubId) + 1;
  return (
    <div className="mb-4 flex items-center justify-between text-sm">
      <button onClick={onQuit} className="text-white/40 hover:text-white">← quit run</button>
      <div className="text-white/60">
        Wk {run.matchday}/{run.totalWeeks} · <b className="text-white/80">{pos}{ordSuffix(pos)}</b>
      </div>
      <div className="chip text-white/50">🎯 {run.objective.label}</div>
    </div>
  );
}

function Resources({ run }: { run: RunState }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Bar label="Stamina" value={run.stamina} good={run.stamina >= 45} />
      <Bar label="Morale" value={run.morale} good={run.morale >= 50} />
      {run.injuryWeeks > 0 && (
        <div className="col-span-2 rounded-lg bg-red-500/10 p-2 text-center text-xs text-red-300">
          🩼 Injury crisis — squad weakened for {run.injuryWeeks} more week{run.injuryWeeks > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, good }: { label: string; value: number; good: boolean }) {
  return (
    <div className="card p-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-white/55">{label}</span>
        <span className="tabular-nums text-white/70">{Math.round(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${good ? 'bg-emerald-400/80' : 'bg-red-400/80'}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ── Result screen ────────────────────────────────────────────────────────────
function Result({
  run,
  result,
  onNext,
}: {
  run: RunState;
  result: WeekResult;
  onNext: () => void;
}) {
  const color = result.result === 'W' ? 'text-emerald-400' : result.result === 'L' ? 'text-red-400' : 'text-white/70';
  const oppName = run.season.teams.find((t) => t.id === result.opponent)?.short ?? result.opponent;
  const youName = run.season.teams.find((t) => t.id === run.clubId)?.short ?? run.clubId;
  const edgeText =
    result.tacticalEdge === 1
      ? `Your ${STYLE_LABEL[result.yourStyle]} beat their ${STYLE_LABEL[result.oppStyle]} 🧠`
      : result.tacticalEdge === -1
        ? `They out-thought you: ${STYLE_LABEL[result.oppStyle]} countered your ${STYLE_LABEL[result.yourStyle]}`
        : `Tactically matched (${STYLE_LABEL[result.yourStyle]} v ${STYLE_LABEL[result.oppStyle]})`;

  return (
    <div className="animate-riseup">
      <ProgressBar run={run} onQuit={onNext} />
      <div className="card mb-4 p-6 text-center">
        <div className="text-xs uppercase tracking-widest text-white/45">
          {result.isHome ? 'Home' : 'Away'} · Matchday {result.matchday}
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 font-display text-5xl tabular-nums">
          <span>{youName}</span>
          <span className={color}>{result.yourGoals}–{result.oppGoals}</span>
          <span>{oppName}</span>
        </div>
        <div className={`mt-2 text-lg font-bold ${color}`}>
          {result.result === 'W' ? 'WIN' : result.result === 'L' ? 'DEFEAT' : 'DRAW'}
        </div>
        <p className="mt-2 text-sm text-white/55">{edgeText}</p>
        {result.injury && (
          <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{result.injury}</p>
        )}
      </div>

      <Resources run={run} />
      <MiniTable run={run} />

      <button className="btn-primary mt-5 w-full text-lg" onClick={onNext}>
        {run.finished ? 'See how the season ended' : 'Next match →'}
      </button>
    </div>
  );
}

// ── End screen ───────────────────────────────────────────────────────────────
function End({ run, onRestart }: { run: RunState; onRestart: () => void }) {
  const grade = gradeSeason(run);
  const badge =
    grade.outcome === 'triumph'
      ? { t: 'OBJECTIVE SMASHED', c: 'text-butter border-butter/50' }
      : grade.outcome === 'met'
        ? { t: 'OBJECTIVE MET', c: 'text-emerald-300 border-emerald-400/40' }
        : { t: 'OBJECTIVE MISSED', c: 'text-red-300 border-red-400/40' };
  const me = sortedTable(run).find((l) => l.teamId === run.clubId)!;

  return (
    <div className="animate-riseup">
      <div className="card mb-4 p-6 text-center">
        <div className={`chip mx-auto mb-3 w-fit ${badge.c}`}>{badge.t}</div>
        <h2 className="font-display text-3xl leading-tight tracking-wide">{grade.headline}</h2>
        <p className="mt-2 text-white/55">
          {me.w}W {me.d}D {me.l}L · {me.pts} pts · {me.gf}–{me.ga}
        </p>
        <p className="mt-1 text-xs text-white/40">Target: {run.objective.label}</p>
      </div>

      <MiniTable run={run} full />

      <button className="btn-primary mt-5 w-full text-lg" onClick={onRestart}>
        New run
      </button>
    </div>
  );
}

// ── Shared league table ──────────────────────────────────────────────────────
function MiniTable({ run, full = false }: { run: RunState; full?: boolean }) {
  const table = sortedTable(run);
  const n = table.length;
  const myPos = table.findIndex((l) => l.teamId === run.clubId);
  const rows = full ? table.map((_, i) => i) : pickRows(myPos, n);

  return (
    <div className="card mt-4 p-3">
      <div className="mb-1 flex px-2 text-[10px] uppercase tracking-wider text-white/40">
        <span className="w-6">#</span>
        <span className="flex-1">Club</span>
        <span className="w-8 text-right">Pl</span>
        <span className="w-10 text-right">GD</span>
        <span className="w-8 text-right">Pts</span>
      </div>
      {rows.map((idx, k) => {
        if (idx < 0) return <div key={`gap${k}`} className="py-0.5 text-center text-white/20">···</div>;
        const l = table[idx];
        const pos = idx + 1;
        const mine = l.teamId === run.clubId;
        const zone = pos === 1 ? 'border-l-butter' : pos <= 4 ? 'border-l-sky-400/70' : pos > n - 3 ? 'border-l-red-500/70' : 'border-l-transparent';
        return (
          <div
            key={l.teamId}
            className={`flex items-center border-l-2 px-2 py-1 text-sm ${zone} ${mine ? 'rounded bg-butter/10 font-semibold' : ''}`}
          >
            <span className="w-6 tabular-nums text-white/50">{pos}</span>
            <span className="flex-1 truncate">{l.name}</span>
            <span className="w-8 text-right tabular-nums text-white/50">{l.p}</span>
            <span className="w-10 text-right tabular-nums text-white/60">{l.gf - l.ga > 0 ? '+' : ''}{l.gf - l.ga}</span>
            <span className="w-8 text-right font-bold tabular-nums">{l.pts}</span>
          </div>
        );
      })}
    </div>
  );
}

function pickRows(myPos: number, n: number): number[] {
  // Top 5 + a window around you.
  const set = new Set<number>([0, 1, 2, 3, 4]);
  for (let i = myPos - 1; i <= myPos + 1; i++) if (i >= 0 && i < n) set.add(i);
  for (let i = n - 3; i < n; i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  let prev = -1;
  for (const i of sorted) {
    if (i - prev > 1) out.push(-1); // gap marker
    out.push(i);
    prev = i;
  }
  return out;
}

function ordSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
