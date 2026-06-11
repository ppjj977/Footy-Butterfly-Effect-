import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SeasonData } from '../src/engine/types';

const SEASON_DIR = join(process.cwd(), 'public', 'data', 'seasons');

export function loadSeason(key: string): SeasonData {
  return JSON.parse(readFileSync(join(SEASON_DIR, `${key}.json`), 'utf-8'));
}

export function allSeasonKeys(): string[] {
  return readdirSync(SEASON_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => f.replace('.json', ''));
}
