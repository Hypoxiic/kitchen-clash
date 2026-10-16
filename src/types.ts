export type PlayerId = 'host' | 'guest';

/** Everything in the game is halal: no pork, no alcohol. */
export type Ingredient =
  | 'bun' | 'patty' | 'vegpatty' | 'steak' | 'cheese' | 'lettuce' | 'tomato'
  | 'onion' | 'potato' | 'carrot'
  // Made in a pot:
  | 'mash' | 'stew';

export interface Item {
  kind: Ingredient;
  sliced: boolean;
  /** 0..1 accuracy of the chopping mini-game (only meaningful when sliced). */
  cut: number;
  /** Grill/pot progress: 0 raw, 1 perfect, >= BURNT_AT burnt. */
  doneness: number;
  /** Blowtorch quality 0..1, or -1 if never torched. */
  melt: number;
  /** Pot stirring quality 0..1. */
  stir: number;
  /** What went into a pot dish (mash/stew). */
  contents: Ingredient[];
}

export type StationKind = 'store' | 'board' | 'stove' | 'pot' | 'torch' | 'plate' | 'pass' | 'bin';
export type StoreId = 'pantry' | 'fridge';

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
  /** Which walk-in room a store station is. */
  store?: StoreId;
  /** Chef currently using it (boards, torch). Stores are shared. */
  occupant: PlayerId | null;
  /** Item sitting on it (grill burners). */
  item: Item | null;
  /** Who put the item/pot contents there. */
  by: PlayerId | null;
  /** Pot contents, cooking progress and stirring. */
  pot: Item[];
  cook: number;
  stir: number;
}

export type Busy = null | 'store' | 'chopping' | 'torching' | 'stirring' | 'reading';

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
  /** Standing at their own plate (shows the "take back" button). */
  atPlate: boolean;
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
  theme: string;
  chefs: Partial<Record<PlayerId, Chef>>;
  stations: Station[];
  plates: Record<PlayerId, Item[]>;
  stock: Partial<Record<Ingredient, number>>;
  scores: Partial<Record<PlayerId, DishScore>>;
  winner: PlayerId | 'tie' | null;
}

export interface Profile {
  name: string;
  color: string;
}

/** Host's choices for the round; 'random' picks a new one each round. */
export interface RoundSettings {
  recipe: string;
  theme: string;
}

export type Intent =
  | { t: 'move'; x: number; z: number; station: string | null }
  | { t: 'take'; kind: Ingredient }
  | { t: 'closeStore' }
  | { t: 'gameDone'; quality: number }
  | { t: 'gameCancel' }
  | { t: 'read'; on: boolean }
  | { t: 'serve' }
  | { t: 'takeBack' };

export type NetMsg =
  | { t: 'hello'; profile: Profile }
  | { t: 'state'; s: GameState }
  | { t: 'intent'; i: Intent }
  | { t: 'event'; who: PlayerId; text: string };
