import type { Profile } from './types';

export const COLORS = ['#e4572e', '#2e86de', '#29a36a', '#a259d9', '#f2a541', '#e84393'];

export interface MatchRecord {
  opponent: string;
  won: boolean;
  at: number;
}

const PROFILE_KEY = 'kc.profile';
const HISTORY_KEY = 'kc.history';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the game still works without it.
  }
}

export function loadProfile(): Profile {
  return read(PROFILE_KEY, { name: 'Chef', color: COLORS[Math.floor(Math.random() * COLORS.length)] });
}

export function saveProfile(p: Profile) {
  write(PROFILE_KEY, p);
}

export function loadHistory(): MatchRecord[] {
  return read<MatchRecord[]>(HISTORY_KEY, []);
}

export function recordMatch(m: MatchRecord) {
  write(HISTORY_KEY, [...loadHistory(), m].slice(-200));
}
