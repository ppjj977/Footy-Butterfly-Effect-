import type { PlayerRecord } from './types';

// ── Player impact model ───────────────────────────────────────────────────
// A player's removal shifts his club's effective Elo by an impact delta. The
// pipeline precomputes `impact` per player using exactly this formula, so the
// engine can simply read it — but the function is exported here so tests and
// the calibration report can recompute and sanity-check it.

export const MAX_DELTA = 90; // Elo points for a season-defining star.

const W_MIN = 0.35; // weight on minutes share
const W_VAL = 0.4; // weight on squad-value share
const W_GA = 0.25; // weight on goal-involvement share

const GK_MULTIPLIER = 0.7; // value share overstates GK match impact

export interface ImpactInputs {
  minutesShare: number; // player's minutes / max minutes in squad (0..1)
  valueShare?: number; // share of squad value (0..1), may be missing pre-2004
  gaShare: number; // (G+A) / max(G+A) in squad (0..1)
  position: PlayerRecord['position'];
  /** When valuations are unavailable, reweight minutes + G/A only. */
  fallback: boolean;
}

export function computeImpact(inp: ImpactInputs): number {
  let raw: number;
  if (inp.fallback || inp.valueShare == null) {
    // Pre-2004 fallback: minutes + goal involvement only, reweighted to sum 1.
    raw = (0.55 * inp.minutesShare + 0.45 * inp.gaShare);
  } else {
    raw = W_MIN * inp.minutesShare + W_VAL * inp.valueShare + W_GA * inp.gaShare;
  }
  let delta = raw * MAX_DELTA;
  if (inp.position === 'GK') delta *= GK_MULTIPLIER;
  return clamp(delta, 0, MAX_DELTA);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
