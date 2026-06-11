import type {
  Fixture,
  Intervention,
  KeyMoment,
  Outcome,
  ProbabilityContext,
  SeasonData,
  SimResult,
  TableRow,
  TeamId,
  Timeline,
} from './types';
import { mulberry32, deriveSeed, type Rng } from './rng';
import { fixtureElo, baselineEloMap } from './elo';
import { simulateMatch, outcomeOf } from './poisson';
import { buildTable, diffTables, rank } from './table';
import { generateHeadlines, describeIntervention } from './headlines';

const MOMENTUM = 25; // Elo swing applied by a flipped result.
const MOMENTUM_FIXTURES = 6; // linear decay window.
const BACKGROUND_SIMS = 500;

// A resolved plan: everything needed to re-simulate the touched fixtures.
interface RewritePlan {
  touched: Set<TeamId>;
  /** Fixtures whose result is forced (flip). */
  fixed: Map<number, { hg: number; ag: number }>;
  /** Per-team Elo delta as a function of fixture date (ISO). */
  eloDelta: (teamId: TeamId, date: string) => number;
  /** Per-(team,fixtureId) momentum bonus, precomputed. */
  momentum: Map<string, number>;
  /** Earliest fixture id (in date order) from which re-sim begins. */
  fromIndex: number;
}

function key(team: TeamId, fixtureId: number): string {
  return `${team}:${fixtureId}`;
}

// ── Plan builders, one per intervention type ──────────────────────────────

function fixturesInDateOrder(season: SeasonData): Fixture[] {
  return [...season.fixtures].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  );
}

function buildPlan(season: SeasonData, iv: Intervention, rng: Rng): RewritePlan {
  const ordered = fixturesInDateOrder(season);
  const touched = new Set<TeamId>();
  const fixed = new Map<number, { hg: number; ag: number }>();
  const momentum = new Map<string, number>();
  const deltas: Array<{
    team: TeamId;
    from: string;
    to: string | null;
    amount: number;
  }> = [];
  let fromIndex = 0;

  if (iv.type === 'flip') {
    const fx = season.fixtures.find((f) => f.id === iv.fixtureId);
    if (!fx) throw new Error(`flip: unknown fixture ${iv.fixtureId}`);
    touched.add(fx.home);
    touched.add(fx.away);
    fixed.set(fx.id, forcedScore(fx, iv.outcome, season, rng));

    // Momentum: the new winner gets +, loser gets −, decaying over their next
    // fixtures. A draw gives a small dip to whoever was favoured to win.
    const winner =
      iv.outcome === 'H' ? fx.home : iv.outcome === 'A' ? fx.away : null;
    const loser =
      iv.outcome === 'H' ? fx.away : iv.outcome === 'A' ? fx.home : null;
    applyMomentum(season, ordered, fx, winner, +MOMENTUM, momentum);
    applyMomentum(season, ordered, fx, loser, -MOMENTUM, momentum);

    fromIndex = ordered.findIndex((f) => f.id === fx.id);
  } else if (iv.type === 'cancel_transfer') {
    const tr = season.transfers.find((t) => t.id === iv.transferId);
    if (!tr) throw new Error(`cancel_transfer: unknown transfer ${iv.transferId}`);
    touched.add(tr.toClub);
    // Buyer loses the player's impact from the transfer date onward.
    deltas.push({ team: tr.toClub, from: tr.date, to: null, amount: -tr.impact });
    // If the seller is also in this league, they retain the player → gain.
    if (tr.fromClub && season.teams.some((t) => t.id === tr.fromClub)) {
      touched.add(tr.fromClub);
      deltas.push({ team: tr.fromClub, from: tr.date, to: null, amount: +tr.impact });
    }
    fromIndex = firstIndexOnOrAfter(ordered, tr.date);
  } else {
    // injure
    const pl = season.players.find((p) => p.id === iv.playerId);
    if (!pl) throw new Error(`injure: unknown player ${iv.playerId}`);
    touched.add(pl.club);
    const from = `${iv.startMonth}-01`;
    const to = addMonths(iv.startMonth, iv.months);
    deltas.push({ team: pl.club, from, to, amount: -pl.impact });
    fromIndex = firstIndexOnOrAfter(ordered, from);
  }

  const eloDelta = (teamId: TeamId, date: string): number => {
    let sum = 0;
    for (const d of deltas) {
      if (d.team !== teamId) continue;
      if (date < d.from) continue;
      if (d.to != null && date >= d.to) continue;
      sum += d.amount;
    }
    return sum;
  };

  return { touched, fixed, eloDelta, momentum, fromIndex };
}

function applyMomentum(
  _season: SeasonData,
  ordered: Fixture[],
  flipped: Fixture,
  team: TeamId | null,
  amount: number,
  out: Map<string, number>,
): void {
  if (!team) return;
  let count = 0;
  const flipIdx = ordered.findIndex((f) => f.id === flipped.id);
  for (let i = flipIdx + 1; i < ordered.length && count < MOMENTUM_FIXTURES; i++) {
    const f = ordered[i];
    if (f.home !== team && f.away !== team) continue;
    count++;
    const factor = (MOMENTUM_FIXTURES - (count - 1)) / MOMENTUM_FIXTURES;
    out.set(key(team, f.id), amount * factor);
  }
}

function firstIndexOnOrAfter(ordered: Fixture[], date: string): number {
  const i = ordered.findIndex((f) => f.date >= date);
  return i < 0 ? ordered.length : i;
}

function forcedScore(
  fx: Fixture,
  outcome: Outcome,
  season: SeasonData,
  rng: Rng,
): { hg: number; ag: number } {
  // If the real result already matches, keep the real scoreline.
  if (outcomeOf(fx.fhg, fx.fag) === outcome) return { hg: fx.fhg, ag: fx.fag };
  const elo = baselineEloMap(season.teams);
  const he = fixtureElo(fx, 'home', elo);
  const ae = fixtureElo(fx, 'away', elo);
  for (let i = 0; i < 24; i++) {
    const { hg, ag } = simulateMatch(he, ae, rng);
    if (outcomeOf(hg, ag) === outcome) return { hg, ag };
  }
  // Fallback canonical scorelines.
  if (outcome === 'H') return { hg: 2, ag: 1 };
  if (outcome === 'A') return { hg: 1, ag: 2 };
  return { hg: 1, ag: 1 };
}

function addMonths(startMonth: string, months: number): string {
  const [y, m] = startMonth.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

// ── Core re-simulation ────────────────────────────────────────────────────

function simulateTimeline(
  season: SeasonData,
  plan: RewritePlan,
  seed: number,
): { results: SimResult[]; overrides: Map<number, SimResult> } {
  const rng = mulberry32(seed);
  const baseElo = baselineEloMap(season.teams);
  const ordered = fixturesInDateOrder(season);
  const results: SimResult[] = [];
  const overrides = new Map<number, SimResult>();

  for (let i = 0; i < ordered.length; i++) {
    const fx = ordered[i];
    const involvesTouched = plan.touched.has(fx.home) || plan.touched.has(fx.away);
    const forced = plan.fixed.get(fx.id);

    if (forced) {
      const r: SimResult = {
        fixtureId: fx.id,
        hg: forced.hg,
        ag: forced.ag,
        outcome: outcomeOf(forced.hg, forced.ag),
      };
      results.push(r);
      overrides.set(fx.id, r);
      continue;
    }

    // Only re-simulate touched teams' fixtures from the intervention onward.
    if (!involvesTouched || i < plan.fromIndex) continue;

    const he =
      fixtureElo(fx, 'home', baseElo) +
      plan.eloDelta(fx.home, fx.date) +
      (plan.momentum.get(key(fx.home, fx.id)) ?? 0);
    const ae =
      fixtureElo(fx, 'away', baseElo) +
      plan.eloDelta(fx.away, fx.date) +
      (plan.momentum.get(key(fx.away, fx.id)) ?? 0);

    const { hg, ag } = simulateMatch(he, ae, rng);
    const r: SimResult = { fixtureId: fx.id, hg, ag, outcome: outcomeOf(hg, ag) };
    results.push(r);
    overrides.set(fx.id, r);
  }

  return { results, overrides };
}

// ── Probability context (background sims) ─────────────────────────────────

function backgroundProbabilities(
  season: SeasonData,
  iv: Intervention,
  seed: number,
  sims = BACKGROUND_SIMS,
): ProbabilityContext {
  const title: Record<TeamId, number> = {};
  const top4: Record<TeamId, number> = {};
  const releg: Record<TeamId, number> = {};
  for (const t of season.teams) {
    title[t.id] = 0;
    top4[t.id] = 0;
    releg[t.id] = 0;
  }
  const n = season.teams.length;

  for (let s = 0; s < sims; s++) {
    const childSeed = deriveSeed(seed, s + 1);
    // Rebuild the plan with its own rng draw so forced scorelines vary too.
    const plan = buildPlan(season, iv, mulberry32(deriveSeed(childSeed, 7)));
    const { overrides } = simulateTimeline(season, plan, childSeed);
    const table = buildTable(season, overrides);
    title[table[0].teamId]++;
    for (let i = 0; i < 4 && i < n; i++) top4[table[i].teamId]++;
    for (let i = n - 3; i < n; i++) releg[table[i].teamId]++;
  }

  for (const t of season.teams) {
    title[t.id] /= sims;
    top4[t.id] /= sims;
    releg[t.id] /= sims;
  }
  return { titleOdds: title, top4Odds: top4, relegationOdds: releg, sims };
}

// ── Key moments ───────────────────────────────────────────────────────────

function pointsEarned(teamIsHome: boolean, o: 'H' | 'D' | 'A'): number {
  if (o === 'D') return 1;
  if (teamIsHome) return o === 'H' ? 3 : 0;
  return o === 'A' ? 3 : 0;
}

function keyMoments(
  season: SeasonData,
  results: SimResult[],
  limit = 3,
): KeyMoment[] {
  const byId = new Map(season.fixtures.map((f) => [f.id, f]));
  const teamName = new Map(season.teams.map((t) => [t.id, t.short]));
  const scored = results
    .map((r) => {
      const fx = byId.get(r.fixtureId)!;
      const realO = outcomeOf(fx.fhg, fx.fag);
      const homeSwing = Math.abs(
        pointsEarned(true, r.outcome) - pointsEarned(true, realO),
      );
      const awaySwing = Math.abs(
        pointsEarned(false, r.outcome) - pointsEarned(false, realO),
      );
      const swing = homeSwing + awaySwing;
      return { r, fx, swing, realO };
    })
    .filter((x) => x.swing > 0)
    .sort((a, b) => b.swing - a.swing || a.fx.id - b.fx.id)
    .slice(0, limit);

  return scored.map(({ r, fx }) => ({
    fixtureId: fx.id,
    matchday: fx.matchday,
    date: fx.date,
    home: teamName.get(fx.home) ?? fx.home,
    away: teamName.get(fx.away) ?? fx.away,
    realScore: `${fx.fhg}–${fx.fag}`,
    newScore: `${r.hg}–${r.ag}`,
    swing: r.outcome === outcomeOf(fx.fhg, fx.fag) ? 0 : 3,
    blurb: momentBlurb(
      teamName.get(fx.home) ?? fx.home,
      teamName.get(fx.away) ?? fx.away,
      fx.fhg,
      fx.fag,
      r.hg,
      r.ag,
    ),
  }));
}

function momentBlurb(
  home: string,
  away: string,
  rhg: number,
  rag: number,
  hg: number,
  ag: number,
): string {
  const realO = outcomeOf(rhg, rag);
  const newO = outcomeOf(hg, ag);
  if (realO === newO) return `${home} ${hg}–${ag} ${away} (scoreline shifts)`;
  const realWinner = realO === 'H' ? home : realO === 'A' ? away : 'a draw';
  const newWinner = newO === 'H' ? home : newO === 'A' ? away : 'a draw';
  if (newO === 'D') return `${home} held ${away}: ${realWinner}'s win becomes a draw`;
  if (realO === 'D') return `${newWinner} now beat their rival instead of drawing`;
  return `${newWinner} win where ${realWinner} once did`;
}

// ── Public entry point ────────────────────────────────────────────────────

export function runTimeline(
  season: SeasonData,
  intervention: Intervention,
  seed: number,
): Timeline {
  // The canonical timeline: one draw with the given seed.
  const planRng = mulberry32(deriveSeed(seed, 7));
  const plan = buildPlan(season, intervention, planRng);
  const { results, overrides } = simulateTimeline(season, plan, seed);

  const realTable = buildTable(season);
  const altTable = buildTable(season, overrides);
  const diff = diffTables(realTable, altTable);
  const moments = keyMoments(season, results);
  const probability = backgroundProbabilities(season, intervention, seed);
  const headlines = generateHeadlines(season, diff, intervention, probability);

  return {
    seed,
    intervention,
    realTable,
    altTable,
    diff,
    touchedFixtureIds: results.map((r) => r.fixtureId),
    results,
    keyMoments: moments,
    headlines,
    probability,
    interventionText: describeIntervention(season, intervention),
  };
}

// Re-export for tests/UI that want a no-intervention baseline sim (used by the
// calibration harness): simulate every fixture from scratch.
export function simulateWholeSeason(season: SeasonData, seed: number): TableRow[] {
  const rng = mulberry32(seed);
  const baseElo = baselineEloMap(season.teams);
  const overrides = new Map<number, SimResult>();
  for (const fx of fixturesInDateOrder(season)) {
    const he = fixtureElo(fx, 'home', baseElo);
    const ae = fixtureElo(fx, 'away', baseElo);
    const { hg, ag } = simulateMatch(he, ae, rng);
    overrides.set(fx.id, { fixtureId: fx.id, hg, ag, outcome: outcomeOf(hg, ag) });
  }
  return rank(buildTable(season, overrides));
}
