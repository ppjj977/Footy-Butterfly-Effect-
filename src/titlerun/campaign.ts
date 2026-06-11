import type { SeasonData, TeamId } from '../engine/types';
import { mulberry32, type Rng } from '../engine/rng';
import {
  STYLES,
  type Style,
  type GamePlan,
  type Intensity,
  resolveMatch,
  styleEdge,
  type SideContext,
} from './tactics';

// ── Campaign layer ─────────────────────────────────────────────────────────
// A full single-club season built on the deterministic tactical core. You make
// ~38 weeks of decisions (style, intensity, rotation) while managing stamina,
// morale and injuries. Other fixtures are auto-resolved so the table stays
// live. Everything is a pure function of (season, clubId, seed) + your choices.

export interface TableLine {
  teamId: TeamId;
  name: string;
  short: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export interface WeekResult {
  matchday: number;
  opponent: TeamId;
  isHome: boolean;
  yourStyle: Style;
  oppStyle: Style;
  tacticalEdge: number; // +1 you won the matchup, -1 lost, 0 mirror
  hg: number;
  ag: number;
  yourGoals: number;
  oppGoals: number;
  result: 'W' | 'D' | 'L';
  injury?: string; // text if an injury occurred
  staminaAfter: number;
  moraleAfter: number;
}

export interface RunState {
  seed: number;
  season: SeasonData;
  clubId: TeamId;
  matchday: number; // 1-based, next to play
  totalWeeks: number;
  stamina: number; // 0..100
  morale: number; // 0..100
  injuryWeeks: number; // remaining weeks of an injury debuff
  table: Record<TeamId, TableLine>;
  history: WeekResult[];
  objective: Objective;
  finished: boolean;
}

export interface Objective {
  label: string;
  // success thresholds by final league position (1-based)
  triumph: number; // <= this = exceeded expectations
  par: number; // <= this = met
}

export interface Decision {
  style: Style;
  intensity: Intensity;
  rotate: boolean;
}

export interface WeekPreview {
  matchday: number;
  opponent: TeamId;
  opponentName: string;
  isHome: boolean;
  scoutedStyle: Style; // opponent's expected style
  reactive: boolean; // whether they tend to react to you
  yourPosition: number;
}

// ── Setup ──────────────────────────────────────────────────────────────────

function eloOf(season: SeasonData): Map<TeamId, number> {
  return new Map(season.teams.map((t) => [t.id, t.elo]));
}

function matchdaysOf(season: SeasonData): Map<number, typeof season.fixtures> {
  const m = new Map<number, typeof season.fixtures>();
  for (const fx of season.fixtures) {
    if (!m.has(fx.matchday)) m.set(fx.matchday, []);
    m.get(fx.matchday)!.push(fx);
  }
  return m;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Each club has a signature style, derived deterministically from its id. */
export function baseStyle(teamId: TeamId): Style {
  return STYLES[hash(teamId) % STYLES.length];
}

function counterTo(s: Style): Style {
  // a style that beats s
  return STYLES.find((x) => styleEdge(x, s) === 1)!;
}

function objectiveFor(rank: number, total: number): Objective {
  if (rank <= 2) return { label: 'Win the title', triumph: 1, par: 2 };
  if (rank <= 5) return { label: 'Qualify for Europe (top 5)', triumph: 2, par: 6 };
  if (rank <= 10) return { label: 'Finish in the top half', triumph: 5, par: 11 };
  if (rank <= total - 5)
    return { label: 'Comfortable mid-table', triumph: 9, par: 14 };
  return { label: 'Survive — stay up', triumph: total - 6, par: total - 3 };
}

export function createRun(season: SeasonData, clubId: TeamId, seed: number): RunState {
  const table: Record<TeamId, TableLine> = {};
  for (const t of season.teams) {
    table[t.id] = {
      teamId: t.id,
      name: t.name,
      short: t.short,
      p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
    };
  }
  const ranked = [...season.teams].sort((a, b) => b.elo - a.elo);
  const rank = ranked.findIndex((t) => t.id === clubId) + 1;
  const totalWeeks = Math.max(...season.fixtures.map((f) => f.matchday));

  return {
    seed,
    season,
    clubId,
    matchday: 1,
    totalWeeks,
    stamina: 100,
    morale: 60,
    injuryWeeks: 0,
    table,
    history: [],
    objective: objectiveFor(rank, season.teams.length),
    finished: false,
  };
}

// ── Per-week info ────────────────────────────────────────────────────────────

function rankOf(state: RunState, teamId: TeamId): number {
  return sortedTable(state).findIndex((l) => l.teamId === teamId) + 1;
}

export function sortedTable(state: RunState): TableLine[] {
  return Object.values(state.table).sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name),
  );
}

export function weekPreview(state: RunState): WeekPreview | null {
  if (state.finished) return null;
  const mds = matchdaysOf(state.season);
  const fixtures = mds.get(state.matchday) ?? [];
  const fx = fixtures.find((f) => f.home === state.clubId || f.away === state.clubId);
  if (!fx) {
    // Bye week (shouldn't happen in a normal league) — skip ahead.
    return null;
  }
  const isHome = fx.home === state.clubId;
  const opponent = isHome ? fx.away : fx.home;
  // Scouting: reveal their base style, and whether they're a reactive side.
  const reactive = hash(opponent + 'react') % 100 < 40;
  return {
    matchday: state.matchday,
    opponent,
    opponentName: state.season.teams.find((t) => t.id === opponent)?.name ?? opponent,
    isHome,
    scoutedStyle: baseStyle(opponent),
    reactive,
    yourPosition: rankOf(state, state.clubId),
  };
}

// ── Resolve a week ───────────────────────────────────────────────────────────

function aiPlan(teamId: TeamId, opponentId: TeamId, rng: Rng): GamePlan {
  const base = baseStyle(teamId);
  const reactive = hash(teamId + 'react') % 100 < 40;
  // Reactive sides sometimes try to counter the opponent's signature style.
  const style = reactive && rng() < 0.6 ? counterTo(baseStyle(opponentId)) : base;
  const r = rng();
  const intensity: Intensity = r < 0.2 ? 'low' : r < 0.8 ? 'normal' : 'high';
  return { style, intensity };
}

function applyResult(line: TableLine, gf: number, ga: number) {
  line.p++;
  line.gf += gf;
  line.ga += ga;
  if (gf > ga) { line.w++; line.pts += 3; }
  else if (gf < ga) line.l++;
  else { line.d++; line.pts++; }
}

function staminaCost(intensity: Intensity, rotate: boolean): number {
  const base = intensity === 'high' ? 16 : intensity === 'low' ? 6 : 11;
  return base - (rotate ? 16 : 0) - 8; // -8 = weekly recovery baseline
}

function staminaPenalty(stamina: number): number {
  if (stamina < 25) return -55;
  if (stamina < 40) return -28;
  if (stamina < 55) return -10;
  return 0;
}

function moraleMod(morale: number): number {
  return Math.round((morale - 55) * 0.55); // ~ -30..+25
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

export function playWeek(state: RunState, decision: Decision): RunState {
  if (state.finished) return state;
  // Deterministic per-week rng stream.
  const rng = mulberry32((state.seed ^ (state.matchday * 0x9e3779b1)) >>> 0);
  const elo = eloOf(state.season);
  const mds = matchdaysOf(state.season);
  const fixtures = [...(mds.get(state.matchday) ?? [])].sort((a, b) => a.id - b.id);

  const next: RunState = {
    ...state,
    table: structuredCloneTable(state.table),
    history: [...state.history],
  };

  // Your modifiers.
  const rotatePenalty = decision.rotate ? -42 : 0;
  const injuryPenalty = state.injuryWeeks > 0 ? -30 : 0;
  const yourFormMod =
    staminaPenalty(state.stamina) +
    moraleMod(state.morale) +
    rotatePenalty +
    injuryPenalty;

  let weekResult: WeekResult | null = null;

  for (const fx of fixtures) {
    const involvesYou = fx.home === state.clubId || fx.away === state.clubId;

    let homePlan: GamePlan;
    let awayPlan: GamePlan;
    let homeForm = 0;
    let awayForm = 0;

    if (involvesYou) {
      const youHome = fx.home === state.clubId;
      const oppId = youHome ? fx.away : fx.home;
      const oppPlan = aiPlan(oppId, state.clubId, rng);
      const yourPlan: GamePlan = { style: decision.style, intensity: decision.intensity };
      homePlan = youHome ? yourPlan : oppPlan;
      awayPlan = youHome ? oppPlan : yourPlan;
      homeForm = youHome ? yourFormMod : aiForm(fx.home, state, rng);
      awayForm = youHome ? aiForm(fx.away, state, rng) : yourFormMod;
    } else {
      homePlan = aiPlan(fx.home, fx.away, rng);
      awayPlan = aiPlan(fx.away, fx.home, rng);
      homeForm = aiForm(fx.home, state, rng);
      awayForm = aiForm(fx.away, state, rng);
    }

    const home: SideContext = { elo: elo.get(fx.home)!, plan: homePlan, isHome: true, formMod: homeForm };
    const away: SideContext = { elo: elo.get(fx.away)!, plan: awayPlan, isHome: false, formMod: awayForm };
    const res = resolveMatch(home, away, rng);

    applyResult(next.table[fx.home], res.hg, res.ag);
    applyResult(next.table[fx.away], res.ag, res.hg);

    if (involvesYou) {
      const youHome = fx.home === state.clubId;
      const yourGoals = youHome ? res.hg : res.ag;
      const oppGoals = youHome ? res.ag : res.hg;
      const r: 'W' | 'D' | 'L' = yourGoals > oppGoals ? 'W' : yourGoals < oppGoals ? 'L' : 'D';

      // Stamina + morale + injury bookkeeping (your club only).
      next.stamina = clamp(state.stamina - staminaCost(decision.intensity, decision.rotate), 0, 100);
      const moraleDelta = r === 'W' ? 9 : r === 'D' ? 1 : -8;
      next.morale = clamp(state.morale + moraleDelta, 0, 100);
      next.injuryWeeks = Math.max(0, state.injuryWeeks - 1);

      // Injury risk: driven by YOUR choices (high intensity on low stamina),
      // not pure luck. Rotation lowers it.
      let injury: string | undefined;
      const baseRisk =
        (decision.intensity === 'high' ? 0.1 : decision.intensity === 'normal' ? 0.05 : 0.02) +
        (state.stamina < 40 ? 0.12 : 0) -
        (decision.rotate ? 0.06 : 0);
      if (next.injuryWeeks === 0 && rng() < Math.max(0, baseRisk)) {
        next.injuryWeeks = 2 + Math.floor(rng() * 2); // 2–3 weeks
        injury = `Key player knock — out ~${next.injuryWeeks} weeks (squad weakened).`;
      }

      weekResult = {
        matchday: state.matchday,
        opponent: youHome ? fx.away : fx.home,
        isHome: youHome,
        yourStyle: decision.style,
        oppStyle: youHome ? awayPlan.style : homePlan.style,
        tacticalEdge: youHome ? res.tacticalEdge : -res.tacticalEdge,
        hg: res.hg,
        ag: res.ag,
        yourGoals,
        oppGoals,
        result: r,
        injury,
        staminaAfter: next.stamina,
        moraleAfter: next.morale,
      };
    }
  }

  if (weekResult) next.history.push(weekResult);
  next.matchday = state.matchday + 1;
  if (next.matchday > state.totalWeeks) next.finished = true;
  return next;
}

// Mild, seeded form swing for AI clubs so the table breathes (bounded).
function aiForm(teamId: TeamId, state: RunState, rng: Rng): number {
  const base = ((hash(teamId + state.matchday) % 41) - 20); // -20..+20
  return Math.round(base * 0.6 + (rng() - 0.5) * 14);
}

function structuredCloneTable(t: Record<TeamId, TableLine>): Record<TeamId, TableLine> {
  const out: Record<TeamId, TableLine> = {};
  for (const k in t) out[k] = { ...t[k] };
  return out;
}

// ── End of season grading ────────────────────────────────────────────────────

export interface SeasonGrade {
  position: number;
  outcome: 'triumph' | 'met' | 'missed';
  headline: string;
}

export function gradeSeason(state: RunState): SeasonGrade {
  const pos = rankOf(state, state.clubId);
  const name = state.season.teams.find((t) => t.id === state.clubId)?.name ?? state.clubId;
  let outcome: SeasonGrade['outcome'] = 'missed';
  if (pos <= state.objective.triumph) outcome = 'triumph';
  else if (pos <= state.objective.par) outcome = 'met';
  const champ = sortedTable(state)[0];
  const headline =
    pos === 1
      ? `${name.toUpperCase()} ARE CHAMPIONS`
      : outcome === 'triumph'
        ? `${name} smash expectations — finished ${ordinal(pos)}`
        : outcome === 'met'
          ? `${name} deliver: ${ordinal(pos)}, objective met`
          : `${name} fall short — ${ordinal(pos)} (${champ.short} won it)`;
  return { position: pos, outcome, headline };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
