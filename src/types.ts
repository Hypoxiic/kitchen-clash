export type PlayerId = 'host' | 'guest';
export type StationKind = 'crate' | 'board' | 'hatch';
export type Carrying = null | 'carrot' | 'chopped';

export interface Station {
  id: string;
  kind: StationKind;
  /** Where the counter sits. */
  x: number;
  z: number;
  /** Rotation (radians) so the counter faces the open floor. */
  rot: number;
  /** Where a chef stands to use it. */
  ax: number;
  az: number;
  occupant: PlayerId | null;
}

export interface Chef {
  id: PlayerId;
  name: string;
  color: string;
  x: number;
  z: number;
  dir: number;
  tx: number;
  tz: number;
  /** Station the chef is walking to, used when they arrive. */
  target: string | null;
  moving: boolean;
  carrying: Carrying;
  choppingAt: string | null;
  score: number;
}

export interface GameState {
  phase: 'countdown' | 'playing' | 'done';
  countdown: number;
  goal: number;
  chefs: Partial<Record<PlayerId, Chef>>;
  stations: Station[];
  winner: PlayerId | null;
}

export interface Profile {
  name: string;
  color: string;
}

export type Intent =
  | { t: 'move'; x: number; z: number; station: string | null }
  | { t: 'chopDone'; quality: number }
  | { t: 'chopCancel' };

export type NetMsg =
  | { t: 'hello'; profile: Profile }
  | { t: 'state'; s: GameState }
  | { t: 'intent'; i: Intent }
  | { t: 'event'; who: PlayerId; text: string };
