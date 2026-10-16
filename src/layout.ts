import type { PlayerId, Station, StationKind, StoreId } from './types';

// Kitchen units follow the KayKit models: one counter is 2x2, 1 high.
//
//   z = -9.5  ┌──────────────┬──────────────┐
//             │ walk-in      │ walk-in      │
//             │ pantry       │ fridge       │
//   z = -4.5  └──[door]──┬stove┬──[door]──┘  (low wall, so you can see in)
//             │ chop        island      chop │
//             │ torch   (two plates)    pots │
//             │ sink                    rack │
//   z =  5.5  └ bin        [pass]            ┘  ← camera looks in from here

export const CHEF_RADIUS = 0.42;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Where chef centres can be. Overlapping rects join the rooms through the doorways. */
export const WALK: Rect[] = [
  { minX: -2.54, maxX: 2.54, minZ: -3.95, maxZ: 5.0 }, // main kitchen floor
  { minX: -4.55, maxX: 3.7, minZ: 4.05, maxZ: 5.0 }, // front strip by the bin
  { minX: -3.18, maxX: -2.02, minZ: -5.3, maxZ: -3.6 }, // pantry doorway
  { minX: 2.02, maxX: 3.18, minZ: -5.3, maxZ: -3.6 }, // fridge doorway
  { minX: -4.55, maxX: -0.6, minZ: -5.98, maxZ: -5.07 }, // walk-in pantry
  { minX: 0.6, maxX: 4.55, minZ: -5.98, maxZ: -5.07 }, // walk-in fridge
];

/** Furniture standing in the walkable area (not inflated by the chef radius). */
export const OBSTACLES: Rect[] = [
  { minX: -1, maxX: 1, minZ: -4.4, maxZ: -2.04 }, // stove
  { minX: -1, maxX: 1, minZ: -0.4, maxZ: 1.6 }, // centre island
  { minX: -1, maxX: 1, minZ: 3.5, maxZ: 5.5 }, // the pass
];

/** Area of each walk-in room: tapping anywhere inside walks you to its shelves. */
export const ROOMS: Record<StoreId, Rect> = {
  pantry: { minX: -5, maxX: -0.15, minZ: -9.5, maxZ: -4.65 },
  fridge: { minX: 0.15, maxX: 5, minZ: -9.5, maxZ: -4.65 },
};

export const SPAWN: Record<PlayerId, { x: number; z: number }> = {
  host: { x: -1.9, z: 2.6 },
  guest: { x: 1.9, z: 2.6 },
};

const S = Math.PI; // facing -z (towards the back)
const E = Math.PI / 2; // facing +x
const W = -Math.PI / 2; // facing -x
const N = 0; // facing +z (towards the camera)

export function makeStations(): Station[] {
  const st = (id: string, kind: StationKind, ax: number, az: number, face: number, extra: Partial<Station> = {}): Station => ({
    id, kind, ax, az, face, occupant: null, item: null, by: null, pot: [], cook: 0, stir: 0, ...extra,
  });
  return [
    st('store-pantry', 'store', -2.6, -5.55, S, { store: 'pantry' }),
    st('store-fridge', 'store', 2.6, -5.55, S, { store: 'fridge' }),
    st('board-l', 'board', -2.45, -1.4, W),
    st('board-r', 'board', 2.45, -1.4, E),
    st('torch', 'torch', -2.45, 0.6, W),
    st('pot-a', 'pot', 2.45, 0.15, E),
    st('pot-b', 'pot', 2.45, 1.15, E),
    st('stove-l', 'stove', -0.55, -1.6, S),
    st('stove-r', 'stove', 0.55, -1.6, S),
    st('plate-host', 'plate', -1.5, 0.6, E, { owner: 'host' }),
    st('plate-guest', 'plate', 1.5, 0.6, W, { owner: 'guest' }),
    st('pass', 'pass', 0, 3.0, N),
    st('bin', 'bin', -3.05, 4.65, W),
  ];
}

/** Where items sit on each station, in world space (for rendering). */
export const STATION_SPOTS: Record<string, { x: number; y: number; z: number }> = {
  'board-l': { x: -3.75, y: 1.0, z: -1.4 },
  'board-r': { x: 3.75, y: 1.0, z: -1.4 },
  torch: { x: -3.7, y: 1.02, z: 0.75 },
  'pot-a': { x: 3.72, y: 1.18, z: 0.15 },
  'pot-b': { x: 3.72, y: 1.18, z: 1.15 },
  'stove-l': { x: -0.5, y: 1.0, z: -2.85 },
  'stove-r': { x: 0.5, y: 1.0, z: -2.85 },
  'plate-host': { x: -0.5, y: 1.0, z: 0.6 },
  'plate-guest': { x: 0.5, y: 1.0, z: 0.6 },
  pass: { x: 0, y: 1.0, z: 4.3 },
  bin: { x: -4.0, y: 0, z: 4.65 },
  'store-pantry': { x: -2.6, y: 1.2, z: -7 },
  'store-fridge': { x: 2.6, y: 1.2, z: -7 },
};

/** Floating signs above each station so they're easy to spot. */
export interface Sign {
  label: string;
  emoji: string;
  /** Station ids this sign is for (used to highlight what you need next). */
  stations: string[];
  x: number;
  y: number;
  z: number;
  color: string;
}

export const SIGNS: Sign[] = [
  { label: 'Pantry', emoji: '🧺', stations: ['store-pantry'], x: -2.6, y: 2.5, z: -4.5, color: '#c98a3c' },
  { label: 'Fridge', emoji: '❄️', stations: ['store-fridge'], x: 2.6, y: 2.5, z: -4.5, color: '#4aa3d8' },
  { label: 'Grill', emoji: '🍳', stations: ['stove-l', 'stove-r'], x: 0, y: 2.3, z: -3.1, color: '#e2622f' },
  { label: 'Chop', emoji: '🔪', stations: ['board-l'], x: -3.75, y: 2.05, z: -1.4, color: '#4f9d4a' },
  { label: 'Chop', emoji: '🔪', stations: ['board-r'], x: 3.75, y: 2.05, z: -1.4, color: '#4f9d4a' },
  { label: 'Torch', emoji: '🔥', stations: ['torch'], x: -3.75, y: 2.05, z: 0.7, color: '#d9452b' },
  { label: 'Pots', emoji: '🍲', stations: ['pot-a', 'pot-b'], x: 3.75, y: 2.25, z: 0.65, color: '#8a5cc7' },
  { label: 'Serve', emoji: '🛎️', stations: ['pass'], x: 0, y: 2.05, z: 4.3, color: '#d8a128' },
  { label: 'Bin', emoji: '🗑️', stations: ['bin'], x: -3.25, y: 1.85, z: 4.65, color: '#7d8790' },
];

/** Colour of the work-spot decal on the floor in front of each kind of station. */
export const SPOT_COLORS: Partial<Record<StationKind, string>> = {
  store: '#c98a3c', board: '#4f9d4a', torch: '#d9452b', pot: '#8a5cc7', stove: '#e2622f', pass: '#d8a128', bin: '#7d8790',
};

export interface Prop {
  model: string;
  x: number;
  z: number;
  rot?: number;
  y?: number;
  scale?: number;
  /** Tapping this prop walks to that station ('stove' is split by side). */
  station?: string;
  /** Recoloured by the kitchen theme. */
  role?: 'counter' | 'wall';
}

/** Static scenery, using KayKit Restaurant Bits model names. */
export const PROPS: Prop[] = [
  // ---- Walls ----
  // Back walls of the walk-in rooms.
  { model: 'wall', x: -4, z: -9.75, role: 'wall' },
  { model: 'wall', x: 0, z: -9.75, role: 'wall' },
  { model: 'wall', x: 4, z: -9.75, role: 'wall' },
  // Side walls.
  { model: 'wall', x: -5.25, z: -7.5, rot: E, role: 'wall' },
  { model: 'wall', x: -5.25, z: -3.5, rot: E, role: 'wall' },
  { model: 'wall_window_open', x: -5.25, z: 0.5, rot: E, role: 'wall' },
  { model: 'wall_half', x: -5.25, z: 4.5, rot: E, role: 'wall' },
  { model: 'wall_half', x: -5.25, z: 5.5, rot: E, role: 'wall' },
  { model: 'wall', x: 5.25, z: -7.5, rot: W, role: 'wall' },
  { model: 'wall', x: 5.25, z: -3.5, rot: W, role: 'wall' },
  { model: 'wall_window_open', x: 5.25, z: 0.5, rot: W, role: 'wall' },
  { model: 'wall_half', x: 5.25, z: 2.5, rot: W, role: 'wall' },
  { model: 'wall_half', x: 5.25, z: 3.5, rot: W, role: 'wall' },

  // ---- Walk-in pantry ----
  { model: 'kitchencabinet', x: -3.9, z: -9.5, role: 'counter' },
  { model: 'kitchencabinet', x: -1.4, z: -9.5, role: 'counter' },
  { model: 'kitchencounter_straight_A_backsplash', x: -3.9, z: -8.5, role: 'counter', station: 'store-pantry' },
  { model: 'kitchencounter_straight_A_backsplash', x: -1.4, z: -8.5, role: 'counter', station: 'store-pantry' },
  { model: 'crate_buns', x: -3.9, z: -8.6, y: 1, scale: 0.55, station: 'store-pantry' },
  { model: 'jar_A_large', x: -1.9, z: -8.9, y: 1 },
  { model: 'jar_B_large', x: -1.3, z: -8.9, y: 1 },
  { model: 'jar_C_medium', x: -0.8, z: -8.7, y: 1 },
  { model: 'crate_potatoes', x: -4.2, z: -6.95, scale: 0.55, rot: 0.1, station: 'store-pantry' },
  { model: 'crate_onions', x: -3.05, z: -6.95, scale: 0.55, rot: -0.08, station: 'store-pantry' },
  { model: 'crate_carrots', x: -1.9, z: -6.95, scale: 0.55, rot: 0.05, station: 'store-pantry' },
  { model: 'crate_buns', x: -0.85, z: -6.95, scale: 0.55, rot: -0.1, station: 'store-pantry' },

  // ---- Walk-in fridge ----
  { model: 'fridge_A', x: 1.3, z: -8.5, station: 'store-fridge' },
  { model: 'fridge_B', x: 3.6, z: -8.5, station: 'store-fridge' },
  { model: 'crate_tomatoes', x: 0.95, z: -6.95, scale: 0.55, rot: 0.06, station: 'store-fridge' },
  { model: 'crate_lettuce', x: 2.05, z: -6.95, scale: 0.55, rot: -0.07, station: 'store-fridge' },
  { model: 'crate_cheese', x: 3.15, z: -6.95, scale: 0.55, rot: 0.04, station: 'store-fridge' },
  { model: 'crate_steak', x: 4.25, z: -6.95, scale: 0.55, rot: -0.05, station: 'store-fridge' },
  { model: 'crate', x: 1.5, z: -7.35, y: 0.44, scale: 0.5, station: 'store-fridge' },
  { model: 'crate', x: 3.7, z: -7.35, y: 0.44, scale: 0.5, station: 'store-fridge' },

  // ---- Main kitchen ----
  // Stove in the middle of the back.
  { model: 'stove_multi', x: 0, z: -3.3, station: 'stove' },

  // Left wall: chopping board, blowtorch counter, sink.
  { model: 'kitchencounter_straight_A', x: -4, z: -1.4, rot: E, role: 'counter', station: 'board-l' },
  { model: 'cuttingboard', x: -3.75, z: -1.4, y: 1, rot: E, station: 'board-l' },
  { model: 'knife', x: -3.55, z: -0.6, y: 1.02, rot: 1.2, scale: 0.8 },
  { model: 'kitchencounter_straight_B', x: -4, z: 0.6, rot: E, role: 'counter', station: 'torch' },
  { model: 'kitchencounter_sink', x: -4, z: 2.6, rot: E, role: 'counter' },

  // Right wall: chopping board, pot cooktop, dish rack.
  { model: 'kitchencounter_straight_A', x: 4, z: -1.4, rot: W, role: 'counter', station: 'board-r' },
  { model: 'cuttingboard', x: 3.75, z: -1.4, y: 1, rot: W, station: 'board-r' },
  { model: 'knife', x: 3.55, z: -2.2, y: 1.02, rot: -1.9, scale: 0.8 },
  { model: 'kitchencounter_straight_B', x: 4, z: 0.6, rot: W, role: 'counter', station: 'pot' },
  { model: 'stove_multi_countertop', x: 3.95, z: 0.65, rot: W, station: 'pot' },
  { model: 'kitchencounter_straight_A', x: 4, z: 2.6, rot: W, role: 'counter' },
  { model: 'dishrack_plates', x: 4.05, z: 2.6, y: 1, rot: W },

  // Centre island where each chef plates up.
  { model: 'kitchentable_A', x: 0, z: 0.6, station: 'island' },

  // The pass at the front, with a ticket.
  { model: 'kitchentable_A', x: 0, z: 4.5, station: 'pass' },
  { model: 'menu', x: 0.6, z: 4.85, y: 1, rot: 0.3, scale: 0.8 },

  // Odds and ends.
  { model: 'chair_stool', x: 4.3, z: 4.7, rot: 0.5 },
  { model: 'papertowel', x: -3.75, z: 3.3, y: 1 },
  { model: 'ketchup', x: 4.25, z: 2.0, y: 1 },
  { model: 'mustard', x: 4.4, z: 3.2, y: 1 },
];
