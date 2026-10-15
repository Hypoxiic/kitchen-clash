import { CHEF_RADIUS, OBSTACLES, WALK } from './layout';

// A* over a fine grid of the kitchen floor, then shortened by skipping
// waypoints that are in straight-line sight of each other.

const CELL = 0.2;
const COLS = Math.ceil((WALK.maxX - WALK.minX) / CELL) + 1;
const ROWS = Math.ceil((WALK.maxZ - WALK.minZ) / CELL) + 1;

const blocked = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) blocked[r * COLS + c] = isBlocked(cellX(c), cellZ(r)) ? 1 : 0;

function cellX(c: number) {
  return WALK.minX + c * CELL;
}
function cellZ(r: number) {
  return WALK.minZ + r * CELL;
}

export function isBlocked(x: number, z: number, pad = CHEF_RADIUS) {
  return OBSTACLES.some((o) => x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad);
}

/** Pushes a point out of obstacles and back inside the walkable area. */
export function resolve(x: number, z: number): [number, number] {
  x = Math.max(WALK.minX, Math.min(WALK.maxX, x));
  z = Math.max(WALK.minZ, Math.min(WALK.maxZ, z));
  for (const o of OBSTACLES) {
    const minX = o.minX - CHEF_RADIUS, maxX = o.maxX + CHEF_RADIUS;
    const minZ = o.minZ - CHEF_RADIUS, maxZ = o.maxZ + CHEF_RADIUS;
    if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
    // Exit through the nearest side.
    const exits = [
      { d: x - minX, x: minX - 0.001, z },
      { d: maxX - x, x: maxX + 0.001, z },
      { d: z - minZ, x, z: minZ - 0.001 },
      { d: maxZ - z, x, z: maxZ + 0.001 },
    ].sort((a, b) => a.d - b.d);
    x = exits[0].x;
    z = exits[0].z;
  }
  return [
    Math.max(WALK.minX, Math.min(WALK.maxX, x)),
    Math.max(WALK.minZ, Math.min(WALK.maxZ, z)),
  ];
}

function lineClear(ax: number, az: number, bx: number, bz: number) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isBlocked(ax + (bx - ax) * t, az + (bz - az) * t, CHEF_RADIUS - 0.02)) return false;
  }
  return true;
}

function nearestFree(x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < blocked.length; i++) {
    if (blocked[i]) continue;
    const d = (cellX(i % COLS) - x) ** 2 + (cellZ(Math.floor(i / COLS)) - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Returns waypoints from (sx, sz) to (tx, tz), excluding the start. */
export function findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] {
  [tx, tz] = resolve(tx, tz);
  if (lineClear(sx, sz, tx, tz)) return [[tx, tz]];

  const start = nearestFree(sx, sz);
  const goal = nearestFree(tx, tz);
  const g = new Float32Array(COLS * ROWS).fill(Infinity);
  const came = new Int32Array(COLS * ROWS).fill(-1);
  const open: number[] = [start];
  const f = new Float32Array(COLS * ROWS).fill(Infinity);
  g[start] = 0;
  const h = (i: number) => Math.hypot(cellX(i % COLS) - cellX(goal % COLS), cellZ(Math.floor(i / COLS)) - cellZ(Math.floor(goal / COLS)));
  f[start] = h(start);

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    const cc = cur % COLS;
    const cr = Math.floor(cur / COLS);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const n = nr * COLS + nc;
        if (blocked[n]) continue;
        const cost = g[cur] + (dr && dc ? Math.SQRT2 : 1) * CELL;
        if (cost >= g[n]) continue;
        g[n] = cost;
        came[n] = cur;
        f[n] = cost + h(n);
        if (!open.includes(n)) open.push(n);
      }
  }

  const cells: [number, number][] = [];
  for (let i = goal; i >= 0 && i !== start; i = came[i]) cells.unshift([cellX(i % COLS), cellZ(Math.floor(i / COLS))]);
  cells.push([tx, tz]);

  // String-pulling: keep only the waypoints needed to get around corners.
  const out: [number, number][] = [];
  let ax = sx, az = sz;
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !lineClear(ax, az, cells[j][0], cells[j][1])) j--;
    out.push(cells[j]);
    [ax, az] = cells[j];
    i = j + 1;
  }
  return out;
}
