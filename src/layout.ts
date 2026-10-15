import type { PlayerId, Station } from './types';

// Kitchen units follow the KayKit models: one counter is 2x2, 1 high.
// The room interior is x,z in [-5, 5], with the back wall at z = -5 and the
// camera looking in from +z.

export const CHEF_RADIUS = 0.42;

/** Open floor the chefs' centres can reach. */
export const WALK = { minX: -2.55, maxX: 2.55, minZ: -2.5, maxZ: 4.6 };

/** Solid furniture inside the walk area (not inflated by the chef radius). */
export const OBSTACLES = [
  { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, // centre island
  { minX: -1, maxX: 1, minZ: 3, maxZ: 5 }, // the pass
];

export const SPAWN: Record<PlayerId, { x: number; z: number }> = {
  host: { x: -1.9, z: 2.1 },
  guest: { x: 1.9, z: 2.1 },
};

const S = Math.PI; // facing -z (towards the back wall)
const E = Math.PI / 2; // facing +x
const W = -Math.PI / 2; // facing -x
const N = 0; // facing +z (towards the camera)

export function makeStations(): Station[] {
  const st = (id: string, kind: Station['kind'], ax: number, az: number, face: number, owner?: PlayerId): Station => ({
    id, kind, ax, az, face, owner, occupant: null, item: null, by: null,
  });
  return [
    st('pantry', 'pantry', -3, -2.45, S),
    st('board-l', 'board', -2.45, -2, W),
    st('board-r', 'board', 2.45, -2, E),
    st('stove-l', 'stove', -0.55, -2.45, S),
    st('stove-r', 'stove', 0.55, -2.45, S),
    st('plate-host', 'plate', -1.5, 0, E, 'host'),
    st('plate-guest', 'plate', 1.5, 0, W, 'guest'),
    st('pass', 'pass', 0, 2.42, N),
    st('bin', 'bin', -2.45, 4.1, W),
  ];
}

/** Where items sit on each station, in world space (for rendering). */
export const STATION_SPOTS: Record<string, { x: number; y: number; z: number }> = {
  'board-l': { x: -3.75, y: 1.0, z: -2 },
  'board-r': { x: 3.75, y: 1.0, z: -2 },
  'stove-l': { x: -0.5, y: 1.0, z: -3.55 },
  'stove-r': { x: 0.5, y: 1.0, z: -3.55 },
  'plate-host': { x: -0.5, y: 1.0, z: 0 },
  'plate-guest': { x: 0.5, y: 1.0, z: 0 },
  pass: { x: 0, y: 1.0, z: 3.8 },
  pantry: { x: -3, y: 2.2, z: -3.4 },
  bin: { x: -3.6, y: 0, z: 4.1 },
};

export interface Prop {
  model: string;
  x: number;
  z: number;
  rot?: number;
  y?: number;
  scale?: number;
  /** Tapping this prop walks to that station ('stove'/'island' split by side). */
  station?: string;
}

/** Static scenery, using KayKit Restaurant Bits model names. */
export const PROPS: Prop[] = [
  // Back wall, with a window over the sink.
  { model: 'wall', x: -4, z: -5.25 },
  { model: 'wall', x: 0, z: -5.25 },
  { model: 'wall_window_open', x: 4, z: -5.25 },
  // Side walls.
  { model: 'wall_window_open', x: -5.25, z: -3, rot: E },
  { model: 'wall', x: -5.25, z: 1, rot: E },
  { model: 'wall_half', x: -5.25, z: 5, rot: E },
  { model: 'wall', x: 5.25, z: -3, rot: W },
  { model: 'wall', x: 5.25, z: 1, rot: W },
  { model: 'wall_half', x: 5.25, z: 3, rot: W },

  // Back row: pantry (fridge + shelf of crates), stove, counters, sink.
  { model: 'fridge_A_decorated', x: -4, z: -4, station: 'pantry' },
  { model: 'kitchencounter_straight_A_backsplash', x: -2, z: -4, station: 'pantry' },
  { model: 'crate_buns', x: -2.5, z: -4.3, y: 1, scale: 0.42, station: 'pantry' },
  { model: 'crate_tomatoes', x: -1.6, z: -4.3, y: 1, scale: 0.42, station: 'pantry' },
  { model: 'crate_lettuce', x: -2.5, z: -3.55, y: 1, scale: 0.42, rot: 0.2, station: 'pantry' },
  { model: 'crate_cheese', x: -1.6, z: -3.55, y: 1, scale: 0.42, rot: -0.15, station: 'pantry' },
  { model: 'crate_steak', x: -2.05, z: -3.95, y: 1.39, scale: 0.42, station: 'pantry' },
  { model: 'stove_multi', x: 0, z: -4, station: 'stove' },
  { model: 'extractorhood', x: 0, z: -5 },
  { model: 'kitchencounter_straight_A_decorated', x: 2, z: -4 },
  { model: 'kitchencounter_sink_backsplash', x: 4, z: -4 },

  // Left wall: chopping board, spice counter.
  { model: 'kitchencounter_straight_A', x: -4, z: -2, rot: E, station: 'board-l' },
  { model: 'cuttingboard', x: -3.75, z: -2, y: 1, rot: E, station: 'board-l' },
  { model: 'knife', x: -3.55, z: -1.15, y: 1.02, rot: 1.2, scale: 0.8 },
  { model: 'kitchencounter_straight_B', x: -4, z: 0, rot: E },
  { model: 'jar_A_large', x: -4.2, z: -0.4, y: 1 },
  { model: 'jar_B_medium', x: -4.3, z: 0.25, y: 1 },
  { model: 'jar_C_small', x: -3.8, z: 0.55, y: 1 },
  { model: 'kitchencounter_straight_B', x: -4, z: 2, rot: E },
  { model: 'pot_A', x: -4.1, z: 2.2, y: 1, rot: 0.6 },
  { model: 'bowl', x: -3.8, z: 1.5, y: 1 },

  // Right wall: chopping board, dish rack, condiments.
  { model: 'kitchencounter_straight_A', x: 4, z: -2, rot: W, station: 'board-r' },
  { model: 'cuttingboard', x: 3.75, z: -2, y: 1, rot: W, station: 'board-r' },
  { model: 'knife', x: 3.55, z: -2.85, y: 1.02, rot: -1.9, scale: 0.8 },
  { model: 'kitchencounter_straight_B', x: 4, z: 0, rot: W },
  { model: 'dishrack_plates', x: 4.05, z: 0, y: 1, rot: W },
  { model: 'kitchencounter_straight_A', x: 4, z: 2, rot: W },
  { model: 'ketchup', x: 4.1, z: 1.6, y: 1 },
  { model: 'mustard', x: 4.3, z: 2.2, y: 1 },
  { model: 'papertowel', x: 3.75, z: 2.5, y: 1 },

  // Centre island where each chef plates up.
  { model: 'kitchentable_A', x: 0, z: 0, station: 'island' },

  // The pass at the front, with a bell and a ticket.
  { model: 'kitchentable_A', x: 0, z: 4, station: 'pass' },
  { model: 'menu', x: 0.55, z: 4.35, y: 1, rot: 0.3, scale: 0.8 },

  // Odds and ends.
  { model: 'chair_stool', x: 3.8, z: 4.2, rot: 0.5 },
  { model: 'shelf_papertowel_decorated', x: 2, z: -5, y: 2.6 },
];
