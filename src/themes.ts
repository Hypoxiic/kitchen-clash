// Kitchen themes: colours, floor, lighting and decor. The host picks one (or
// "surprise me") and it's sent to the guest in the game state.

export interface Theme {
  id: string;
  name: string;
  emoji: string;
  /** Tint multiplied onto the KayKit walls. */
  wall: string;
  /** Hue shift (degrees), saturation and lightness changes for counters and cabinets. */
  counter: { hue: number; sat: number; light: number };
  floor: FloorStyle;
  floorRoughness: number;
  background: string;
  exposure: number;
  sun: { color: string; intensity: number; x: number; y: number; z: number };
  hemi: { sky: string; ground: string; intensity: number };
  fill: { color: string; intensity: number };
  /** Colour of the theme's lamps (pendants, lanterns, neon). */
  accent: string;
  accentIntensity: number;
}

export type FloorStyle = 'terracotta' | 'checker' | 'herringbone' | 'zellige';

export const THEMES: Record<string, Theme> = {
  cottage: {
    id: 'cottage',
    name: 'Cozy Cottage',
    emoji: '🏡',
    wall: '#fff2dc',
    counter: { hue: 0, sat: 1, light: 0 },
    floor: 'terracotta',
    floorRoughness: 0.8,
    background: '#2b2118',
    exposure: 1.05,
    sun: { color: '#ffe0b5', intensity: 2.6, x: 6, y: 12, z: -7 },
    hemi: { sky: '#fff1dc', ground: '#7a5a44', intensity: 1.1 },
    fill: { color: '#cfe0ff', intensity: 0.55 },
    accent: '#ffcf8a',
    accentIntensity: 0,
  },
  diner: {
    id: 'diner',
    name: 'Retro Diner',
    emoji: '🍟',
    wall: '#bfeee2',
    counter: { hue: -28, sat: 1.25, light: -0.04 },
    floor: 'checker',
    floorRoughness: 0.35,
    background: '#1c2a2e',
    exposure: 1.08,
    sun: { color: '#fff7ee', intensity: 2.3, x: -5, y: 13, z: -6 },
    hemi: { sky: '#e9fff8', ground: '#5a4a52', intensity: 1.15 },
    fill: { color: '#ff9fd0', intensity: 0.6 },
    accent: '#ff4fa3',
    accentIntensity: 4,
  },
  bistro: {
    id: 'bistro',
    name: 'Night Bistro',
    emoji: '🌙',
    wall: '#56688a',
    counter: { hue: 185, sat: 0.55, light: -0.12 },
    floor: 'herringbone',
    floorRoughness: 0.6,
    background: '#10151f',
    exposure: 1.2,
    sun: { color: '#9fb4ff', intensity: 0.9, x: 7, y: 10, z: -4 },
    hemi: { sky: '#6a7aa8', ground: '#2a2420', intensity: 0.75 },
    fill: { color: '#ffb36b', intensity: 0.35 },
    accent: '#ffb35c',
    accentIntensity: 14,
  },
  market: {
    id: 'market',
    name: 'Spice Market',
    emoji: '🏮',
    wall: '#f2b48a',
    counter: { hue: 150, sat: 0.9, light: -0.03 },
    floor: 'zellige',
    floorRoughness: 0.4,
    background: '#2a1712',
    exposure: 1.08,
    sun: { color: '#ffd29a', intensity: 2.4, x: 7, y: 11, z: -5 },
    hemi: { sky: '#ffe4c4', ground: '#6b3f2a', intensity: 1.05 },
    fill: { color: '#ffd9a0', intensity: 0.4 },
    accent: '#ff9a3c',
    accentIntensity: 6,
  },
};

export const THEME_IDS = Object.keys(THEMES);

/** Draws a floor texture; returns the canvas and how many world units one repeat covers. */
export function drawFloor(style: FloorStyle): { canvas: HTMLCanvasElement; units: number } {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  if (style === 'terracotta' || style === 'checker') {
    const n = 8;
    const px = 64;
    const [a, b, grout] =
      style === 'terracotta'
        ? [[240, 226, 202], [196, 118, 82], '#b9a58c']
        : [[246, 244, 238], [34, 36, 40], '#9aa0a6'];
    ctx.fillStyle = grout as string;
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const [r, g, bl] = (x + y) % 2 ? (b as number[]) : (a as number[]);
        const v = (rand() - 0.5) * (style === 'checker' ? 6 : 14);
        ctx.fillStyle = `rgb(${r + v},${g + v},${bl + v})`;
        ctx.beginPath();
        ctx.roundRect(x * px + 2, y * px + 2, px - 4, px - 4, 5);
        ctx.fill();
        const sheen = ctx.createLinearGradient(x * px, y * px, x * px + px, y * px + px);
        sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.06)');
        ctx.fillStyle = sheen;
        ctx.fillRect(x * px + 2, y * px + 2, px - 4, px - 4);
      }
    return { canvas: c, units: style === 'terracotta' ? 6 : 5 };
  }

  if (style === 'herringbone') {
    // Dark walnut parquet in a basketweave: blocks of four planks, alternating direction.
    ctx.fillStyle = '#24160d';
    ctx.fillRect(0, 0, 512, 512);
    const block = 128;
    const plank = block / 4;
    for (let by = 0; by < 4; by++)
      for (let bx = 0; bx < 4; bx++) {
        const horizontal = (bx + by) % 2 === 0;
        for (let i = 0; i < 4; i++) {
          const shade = 72 + rand() * 34;
          ctx.fillStyle = `rgb(${shade + 38},${shade + 8},${shade - 22})`;
          const x = bx * block + (horizontal ? 0 : i * plank);
          const y = by * block + (horizontal ? i * plank : 0);
          const w = horizontal ? block : plank;
          const h = horizontal ? plank : block;
          ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
          ctx.fillStyle = 'rgba(255,220,180,0.06)';
          ctx.fillRect(x + 1, y + 1, horizontal ? w - 2 : 3, horizontal ? 3 : h - 2);
        }
      }
    return { canvas: c, units: 3 };
  }

  // Zellige: glazed mosaic tiles with an eight-point star in each.
  const n = 8;
  const px = 64;
  ctx.fillStyle = '#e8e0cf';
  ctx.fillRect(0, 0, 512, 512);
  const palette = ['#1f6f8b', '#2a9d8f', '#e9c46a', '#f4f1e8'];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const base = palette[(x + y) % 2 ? 0 : 3];
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.roundRect(x * px + 2, y * px + 2, px - 4, px - 4, 3);
      ctx.fill();
      ctx.save();
      ctx.translate(x * px + px / 2, y * px + px / 2);
      ctx.fillStyle = (x + y) % 2 ? palette[3] : palette[1];
      for (const rot of [0, Math.PI / 4]) {
        ctx.save();
        ctx.rotate(rot);
        ctx.fillRect(-13, -13, 26, 26);
        ctx.restore();
      }
      ctx.fillStyle = palette[2];
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x * px + 4, y * px + 4, px - 8, 10);
    }
  return { canvas: c, units: 5 };
}

/** Plain wooden planks for the walk-in pantry. */
export function drawPlanks(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const shade = 150 + ((i * 37) % 30);
    ctx.fillStyle = `rgb(${shade + 40},${shade},${shade - 50})`;
    ctx.fillRect(0, i * 32, 256, 32);
    ctx.fillStyle = 'rgba(60,35,15,0.5)';
    ctx.fillRect(0, i * 32, 256, 2);
    ctx.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
  }
  return c;
}

/** Pale, slightly icy tiles for the walk-in fridge. */
export function drawIceTiles(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9fb3c2';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const v = ((x * 7 + y * 13) % 5) * 3;
      ctx.fillStyle = `rgb(${214 + v},${232 + v},${242})`;
      ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  return c;
}
