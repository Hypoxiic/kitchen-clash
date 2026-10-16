import { CHEF_RADIUS, OBSTACLES, WALK, type Rect } from './layout';

// A* over a fine grid of the walkable floor (several joined rectangles), then
// shortened by skipping waypoints that are in straight-line sight of each other.

const CELL = 0.2;
const BOUNDS = {
  minX: Math.min(...WALK.map((r) => r.minX)),
  maxX: Math.max(...WALK.map((r) => r.maxX)),
  minZ: Math.min(...WALK.map((r) => r.minZ)),
  maxZ: Math.max(...WALK.map((r) => r.maxZ)),
};
const COLS = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL) + 1;
const ROWS = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL) + 1;

const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;

function inObstacle(x: number, z: number, pad = CHEF_RADIUS) {
  return OBSTACLES.some((o) => x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad);
}

export function isWalkable(x: number, z: number, pad = CHEF_RADIUS) {
  return WALK.some((r) => inRect(r, x, z)) && !inObstacle(x, z, pad);
}

const cellX = (c: number) => BOUNDS.minX + c * CELL;
const cellZ = (r: number) => BOUNDS.minZ + r * CELL;

const blocked = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) blocked[r * COLS + c] = isWalkable(cellX(c), cellZ(r)) ? 0 : 1;

/** Pushes a point out of furniture and back onto walkable floor (nearest spot). */
export function resolve(x: number, z: number): [number, number] {
  if (isWalkable(x, z)) return [x, z];
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const r of WALK) {
    let cx = Math.max(r.minX, Math.min(r.maxX, x));
    let cz = Math.max(r.minZ, Math.min(r.maxZ, z));
    // Step out of any obstacle through its nearest side.
    for (const o of OBSTACLES) {
      const minX = o.minX - CHEF_RADIUS, maxX = o.maxX + CHEF_RADIUS;
      const minZ = o.minZ - CHEF_RADIUS, maxZ = o.maxZ + CHEF_RADIUS;
      if (cx <= minX || cx >= maxX || cz <= minZ || cz >= maxZ) continue;
      const exits: [number, number, number][] = [
        [cx - minX, minX - 0.001, cz],
        [maxX - cx, maxX + 0.001, cz],
        [cz - minZ, cx, minZ - 0.001],
        [maxZ - cz, cx, maxZ + 0.001],
      ];
      exits.sort((a, b) => a[0] - b[0]);
      [, cx, cz] = exits[0];
    }
    if (!isWalkable(cx, cz)) continue;
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [cx, cz];
    }
  }
  if (best) return best;
  const i = nearestFree(x, z);
  return [cellX(i % COLS), cellZ(Math.floor(i / COLS))];
}

function lineClear(ax: number, az: number, bx: number, bz: number) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isWalkable(ax + (bx - ax) * t, az + (bz - az) * t, CHEF_RADIUS - 0.02)) return false;
  }
  return true;
}

function nearestFree(x: number, z: number): number {
  let best = 0;
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
  const f = new Float32Array(COLS * ROWS).fill(Infinity);
  const came = new Int32Array(COLS * ROWS).fill(-1);
  const inOpen = new Uint8Array(COLS * ROWS);
  const open: number[] = [start];
  inOpen[start] = 1;
  const gx = cellX(goal % COLS);
  const gz = cellZ(Math.floor(goal / COLS));
  const h = (i: number) => Math.hypot(cellX(i % COLS) - gx, cellZ(Math.floor(i / COLS)) - gz);
  g[start] = 0;
  f[start] = h(start);

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    inOpen[cur] = 0;
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
        // Don't cut diagonally past a blocked corner.
        if (dr && dc && (blocked[cr * COLS + nc] || blocked[nr * COLS + cc])) continue;
        const cost = g[cur] + (dr && dc ? Math.SQRT2 : 1) * CELL;
        if (cost >= g[n]) continue;
        g[n] = cost;
        came[n] = cur;
        f[n] = cost + h(n);
        if (!inOpen[n]) {
          inOpen[n] = 1;
          open.push(n);
        }
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
