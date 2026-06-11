import type { Intervention } from '../engine/types';

// ── Shareable-URL encoding ────────────────────────────────────────────────
// URL shape: ?l=PL&y=1995&i=<encoded intervention>&s=<seed>
// The intervention is encoded as a compact, human-skimmable string so a shared
// link reproduces the exact read-only timeline.

export interface RunParams {
  league: string;
  year: number;
  intervention: Intervention;
  seed: number;
}

export function encodeIntervention(iv: Intervention): string {
  switch (iv.type) {
    case 'flip':
      return `f.${iv.fixtureId}.${iv.outcome}`;
    case 'cancel_transfer':
      return `c.${iv.transferId}`;
    case 'injure':
      return `i.${iv.playerId}.${iv.months}.${iv.startMonth}`;
  }
}

export function decodeIntervention(s: string): Intervention | null {
  const parts = s.split('.');
  try {
    if (parts[0] === 'f') {
      const outcome = parts[2] as 'H' | 'D' | 'A';
      if (!['H', 'D', 'A'].includes(outcome)) return null;
      return { type: 'flip', fixtureId: Number(parts[1]), outcome };
    }
    if (parts[0] === 'c') {
      return { type: 'cancel_transfer', transferId: parts.slice(1).join('.') };
    }
    if (parts[0] === 'i') {
      const months = Number(parts[2]) as 3 | 6;
      if (months !== 3 && months !== 6) return null;
      return {
        type: 'injure',
        playerId: parts[1],
        months,
        startMonth: parts[3],
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function buildShareUrl(base: string, p: RunParams): string {
  const u = new URL(base);
  u.searchParams.set('l', p.league);
  u.searchParams.set('y', String(p.year));
  u.searchParams.set('i', encodeIntervention(p.intervention));
  u.searchParams.set('s', String(p.seed));
  return u.toString();
}

export function parseShareUrl(search: string): RunParams | null {
  const q = new URLSearchParams(search);
  const league = q.get('l');
  const year = q.get('y');
  const i = q.get('i');
  const s = q.get('s');
  if (!league || !year || !i || !s) return null;
  const intervention = decodeIntervention(i);
  if (!intervention) return null;
  return {
    league,
    year: Number(year),
    intervention,
    seed: Number(s),
  };
}
