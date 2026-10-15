export type PlayerId = 'host' | 'guest';

export type Ingredient = 'bun' | 'patty' | 'cheese' | 'lettuce' | 'tomato' | 'onion' | 'ham' | 'carrot';

export interface Item {
  kind: Ingredient;
  sliced: boolean;
  /** 0..1 accuracy of the chopping mini-game (only meaningful when sliced). */
  cut: number;
  /** Grill progress: 0 raw, 1 perfect medium, >= BURNT_AT burnt. */
  doneness: number;
}

export type StationKind = 'pantry' | 'board' | 'stove' | 'plate' | 'pass' | 'bin';

export interface Station {
  id: string;
  kind: StationKind;
  /** Where a chef stands to use it. */
  ax: number;
  az: number;
  /** Direction the chef faces while using it. */
  face: number;
  /** Plates belong to one chef. */
  owner?: PlayerId;
  /** Chef currently using it (pantry, boards). */
  occupant: PlayerId | null;
  /** Item sitting on it (stove burners). */
  item: Item | null;
  /** Who put the item there. */
  by: PlayerId | null;
}

export type Busy = null | 'pantry' | 'chopping' | 'reading';

export interface Chef {
  id: PlayerId;
  name: string;
  color: string;
  x: number;
  z: number;
  dir: number;
  speed: number;
  /** Remaining waypoints to walk. */
  path: [number, number][];
  /** Station the chef is walking to. */
  target: string | null;
  held: Item | null;
  busy: Busy;
  busyAt: string | null;
  atPass: boolean;
  served: boolean;
  /** Seconds left on the clock when served. */
  servedTimeLeft: number;
  /** One-shot animation trigger: clients play `name` whenever `seq` changes. */
  emote: { name: string; seq: number };
}

export interface ScoreRow {
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface DishScore {
  total: number;
  rows: ScoreRow[];
}

export type Phase = 'intro' | 'cooking' | 'judging';

export interface GameState {
  phase: Phase;
  /** Seconds until cooking starts (intro). */
  countdown: number;
  timeLeft: number;
  roundTime: number;
  recipe: string;
  chefs: Partial<Record<PlayerId, Chef>>;
  stations: Station[];
  plates: Record<PlayerId, Item[]>;
  stock: Record<Ingredient, number>;
  scores: Partial<Record<PlayerId, DishScore>>;
  winner: PlayerId | 'tie' | null;
}

export interface Profile {
  name: string;
  color: string;
}

export type Intent =
  | { t: 'move'; x: number; z: number; station: string | null }
  | { t: 'take'; kind: Ingredient }
  | { t: 'closePantry' }
  | { t: 'chopDone'; quality: number }
  | { t: 'chopCancel' }
  | { t: 'read'; on: boolean }
  | { t: 'serve' };

export type NetMsg =
  | { t: 'hello'; profile: Profile }
  | { t: 'state'; s: GameState }
  | { t: 'intent'; i: Intent }
  | { t: 'event'; who: PlayerId; text: string };
