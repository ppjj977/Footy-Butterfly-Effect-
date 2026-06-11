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
export const HOME_ADV = 60; // Elo points
const STYLE_SWING = 80; // Elo points a won tactical battle is worth
const INTENSITY_MOD: Record<Intensity, number> = { low: -18, normal: 0, high: 26 };

// Goal model: low-variance. Expected goals come from the strength gap; the
// realised score is the expected score plus a small seeded nudge.
const BASE_XG = 1.35;
const ELO_PER_GOAL = 180;

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

export function effectiveStrength(side: SideContext, oppStyle: Style): number {
  return (
    side.elo +
    (side.isHome ? HOME_ADV : 0) +
    styleEdge(side.plan.style, oppStyle) * STYLE_SWING +
    INTENSITY_MOD[side.plan.intensity] +
    (side.formMod ?? 0)
  );
}

function expectedGoals(strengthFor: number, strengthAgainst: number): number {
  const diff = strengthFor - strengthAgainst;
  return Math.max(0.15, BASE_XG * Math.pow(2, diff / ELO_PER_GOAL));
}

// A small, bounded, seeded jitter. Triangular-ish: mostly near 0. Keeps the
// scoreline lively without letting one match be a coin flip.
function jitter(rng: () => number): number {
  return (rng() + rng() - 1) * 0.9; // in (-0.9, 0.9), peaked at 0
}

export function resolveMatch(
  home: SideContext,
  away: SideContext,
  rng: () => number,
): MatchResult {
  const homeStrength = effectiveStrength({ ...home, isHome: true }, away.plan.style);
  const awayStrength = effectiveStrength({ ...away, isHome: false }, home.plan.style);

  const hXg = expectedGoals(homeStrength, awayStrength);
  const aXg = expectedGoals(awayStrength, homeStrength);

  const hg = Math.max(0, Math.round(hXg + jitter(rng)));
  const ag = Math.max(0, Math.round(aXg + jitter(rng)));

  return {
    hg,
    ag,
    homeStrength,
    awayStrength,
    tacticalEdge: styleEdge(home.plan.style, away.plan.style),
  };
}

export function outcome(hg: number, ag: number): 'H' | 'D' | 'A' {
  return hg > ag ? 'H' : hg < ag ? 'A' : 'D';
}
