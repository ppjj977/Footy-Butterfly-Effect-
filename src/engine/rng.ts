// mulberry32 — a tiny, fast, seedable PRNG. Reused from The Flip.
// Deterministic: the same seed always yields the same stream. This is what
// makes a whole timeline a pure function of its seed.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a 32-bit seed (xmur3). Used to derive stable seeds from
 * intervention descriptors so a shared URL reproduces the same timeline.
 */
export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Derive the Nth child seed from a parent seed (for background sims). */
export function deriveSeed(parent: number, n: number): number {
  return (Math.imul(parent ^ (n + 0x9e3779b9), 2654435761) >>> 0);
}
