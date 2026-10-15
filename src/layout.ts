import type { Station } from './types';

/** Floor area chefs can walk on (counters line the walls around it). */
export const WALK = { minX: -2.7, maxX: 2.7, minZ: -2.3, maxZ: 2.3 };

/** Whole kitchen footprint, including counters and walls. */
export const ROOM = { halfW: 4, halfD: 3.6 };

export const SPAWN = {
  host: { x: -1.2, z: 1.2 },
  guest: { x: 1.2, z: 1.2 },
};

export function makeStations(): Station[] {
  return [
    { id: 'crate', kind: 'crate', x: 0, z: -3.05, rot: 0, ax: 0, az: -2.2, occupant: null },
    { id: 'board-l', kind: 'board', x: -3.45, z: -0.4, rot: Math.PI / 2, ax: -2.6, az: -0.4, occupant: null },
    { id: 'board-r', kind: 'board', x: 3.45, z: -0.4, rot: -Math.PI / 2, ax: 2.6, az: -0.4, occupant: null },
    { id: 'hatch', kind: 'hatch', x: 0, z: 3.05, rot: Math.PI, ax: 0, az: 2.2, occupant: null },
  ];
}
