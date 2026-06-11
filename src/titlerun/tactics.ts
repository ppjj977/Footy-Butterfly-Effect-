// ── Title Run / Gaffer Duel — shared tactical core ─────────────────────────
// Pure, deterministic. A match is resolved from both sides' game plans and
// strengths via a 5-way "tactics counter tactics" system. Per-match variance is
// deliberately LOW so that decisions compound over a season and skill beats
// luck. No DOM, no Date.now — a function of (inputs, seed).

export type Style = 'press' | 'possession' | 'direct' | 'lowblock' | 'counter';

export const STYLES: Style[] = ['press', 'possession', 'direct', 'lowblock', 'counter'];

export const STYLE_LABEL: Record<Style, string> = {
  press: 'High Press',
  possession: 'Possession',
  direct: 'Direct',
  lowblock: 'Low Block',
  counter: 'Counter',
};

export const STYLE_BLURB: Record<Style, string> = {
  press: 'Hunt the ball high. Suffocates build-up, but space in behind.',
  possession: 'Keep it, probe, stretch them. Beaten by a hard press.',
  direct: 'Go long, bypass the midfield. Punishes a deep block.',
  lowblock: 'Sit deep, stay compact. Frustrates a press, soaks pressure.',
  counter: 'Invite them on, break fast. Murders an over-committed side.',
};

export type Intensity = 'low' | 'normal' | 'high';

export interface GamePlan {
  style: Style;
  intensity: Intensity;
}

// ── The counter pentagon ───────────────────────────────────────────────────
// In cycle order each style beats the next two and loses to the previous two.
// press > possession,direct · possession > direct,lowblock · direct >
// lowblock,counter · lowblock > counter,press · counter > press,possession.
const BEATS: Record<Style, Style[]> = {
  press: ['possession', 'direct'],
  possession: ['direct', 'lowblock'],
  direct: ['lowblock', 'counter'],
  lowblock: ['counter', 'press'],
  counter: ['press', 'possession'],
};

/** +1 if a beats b, -1 if b beats a, 0 if mirror. */
export function styleEdge(a: Style, b: Style): number {
  if (a === b) return 0;
  if (BEATS[a].includes(b)) return 1;
  return -1;
}

// ── Tuning constants ───────────────────────────────────────────────────────
export const HOME_ADV = 55; // Elo points
const STYLE_SWING = 115; // Elo a won tactical battle is worth
const INTENSITY_MOD: Record<Intensity, number> = { low: -16, normal: 0, high: 24 };

// Quality (squad strength) gaps are compressed through a soft cap so a top club
// can't steamroll on quality alone — they're clearly favoured, but beatable, and
// your tactics/management (applied AFTER the cap, at full strength) always swing
// the match. This is what makes every game a contest and bad choices costly even
// for the best sides, while a stronger opponent is still genuinely harder.
const QUALITY_CAP = 300;
const BASE_XG = 1.35;
const ELO_PER_GOAL = 220;

function compress(diff: number): number {
  return QUALITY_CAP * Math.tanh(diff / QUALITY_CAP);
}

export interface SideContext {
  elo: number;
  plan: GamePlan;
  isHome: boolean;
  /** Net Elo modifier from stamina / morale / rotation etc. (campaign layer). */
  formMod?: number;
}

export interface MatchResult {
  hg: number;
  ag: number;
  /** Effective strengths after all modifiers (for UI explanation). */
  homeStrength: number;
  awayStrength: number;
  /** Home tactical edge: +1 won the matchup, -1 lost it, 0 mirror. */
  tacticalEdge: number;
}

/** Quality only (squad + home) — gets compressed against the opponent. */
function quality(side: SideContext): number {
  return side.elo + (side.isHome ? HOME_ADV : 0);
}

/** Tactics + management — applied at full strength, never compressed. */
function tactical(side: SideContext, oppStyle: Style): number {
  return (
    styleEdge(side.plan.style, oppStyle) * STYLE_SWING +
    INTENSITY_MOD[side.plan.intensity] +
    (side.formMod ?? 0)
  );
}

/** Effective strength for display: compressed-quality midpoint + own tactics. */
export function effectiveStrength(side: SideContext, oppStyle: Style): number {
  return Math.round(compress(quality(side)) + tactical(side, oppStyle));
}

// A small, bounded, seeded jitter. Triangular-ish: mostly near 0. Keeps the
// scoreline lively without letting one match be a coin flip.
function jitter(rng: () => number): number {
  return (rng() + rng() - 1) * 0.95;
}

export function resolveMatch(
  home: SideContext,
  away: SideContext,
  rng: () => number,
): MatchResult {
  const h = { ...home, isHome: true };
  const a = { ...away, isHome: false };

  // Compress the QUALITY gap, then add full-strength tactics on top.
  const qualityDiff = compress(quality(h) - quality(a));
  const tacticalDiff = tactical(h, a.plan.style) - tactical(a, h.plan.style);
  const effDiff = qualityDiff + tacticalDiff;

  const hXg = Math.max(0.15, BASE_XG * Math.pow(2, effDiff / 2 / ELO_PER_GOAL));
  const aXg = Math.max(0.15, BASE_XG * Math.pow(2, -effDiff / 2 / ELO_PER_GOAL));

  const hg = Math.max(0, Math.round(hXg + jitter(rng)));
  const ag = Math.max(0, Math.round(aXg + jitter(rng)));

  return {
    hg,
    ag,
    homeStrength: effectiveStrength(h, a.plan.style),
    awayStrength: effectiveStrength(a, h.plan.style),
    tacticalEdge: styleEdge(home.plan.style, away.plan.style),
  };
}

export function outcome(hg: number, ag: number): 'H' | 'D' | 'A' {
  return hg > ag ? 'H' : hg < ag ? 'A' : 'D';
}
