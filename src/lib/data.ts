import type { SeasonData } from '../engine/types';

export interface ManifestSeason {
  key: string;
  league: string;
  year: number;
  name: string;
  file: string;
  sizeKb: number;
  dataSource: string;
  impactFallback: boolean;
}

export interface Manifest {
  leagues: Record<string, { name: string }>;
  seasons: ManifestSeason[];
}

// Base path respects Vite's `base` (relative deploy on Cloudflare Pages).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch(`${BASE}/data/seasons/manifest.json`);
  if (!res.ok) throw new Error('Could not load season manifest');
  return res.json();
}

const cache = new Map<string, SeasonData>();

export async function loadSeason(key: string): Promise<SeasonData> {
  if (cache.has(key)) return cache.get(key)!;
  const res = await fetch(`${BASE}/data/seasons/${key}.json`);
  if (!res.ok) throw new Error(`Could not load season ${key}`);
  const data: SeasonData = await res.json();
  cache.set(key, data);
  return data;
}

export function seasonKey(league: string, year: number): string {
  return `${league}_${year}`;
}
