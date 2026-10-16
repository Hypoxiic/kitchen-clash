import { INGREDIENTS } from './recipes';
import { sfx } from './sfx';
import type { Ingredient } from './types';

/** One of the swipe/drag games shown over the kitchen. */
interface Mode {
  title: string;
  hint: string;
  /** Show the "Done" button (games you finish yourself). */
  manualDone?: boolean;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number): void;
  down(x: number, y: number): void;
  move(x: number, y: number): void;
  up(x: number, y: number): void;
  /** Quality 0..1 when the player taps Done. */
  quality(): number;
}

/** The overlay the mini-games share: canvas, title, message, Leave/Done buttons. */
export class MiniGames {
  private root = document.getElementById('game')!;
  private canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  private titleEl = document.getElementById('game-title')!;
  private msgEl = document.getElementById('game-msg')!;
  private doneBtn = document.getElementById('game-done') as HTMLButtonElement;
  private ctx = this.canvas.getContext('2d')!;
  private mode: Mode | null = null;
  private raf = 0;
  private last = 0;
  private finished = false;
  private onDone: (quality: number) => void = () => {};
  private onCancel: () => void = () => {};

  constructor() {
    const pos = (e: PointerEvent) => [e.offsetX, e.offsetY] as const;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.finished || !this.mode) return;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Not every pointer can be captured (e.g. synthetic ones); the game still works.
      }
      this.mode.down(...pos(e));
    });
    this.canvas.addEventListener('pointermove', (e) => this.mode?.move(...pos(e)));
    const up = (e: PointerEvent) => this.mode?.up(...pos(e));
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    document.getElementById('game-leave')!.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
    this.doneBtn.addEventListener('click', () => this.mode && this.finish(this.mode.quality()));
  }

  get isOpen() {
    return !this.root.hidden;
  }

  chop(kind: Ingredient, onDone: (q: number) => void, onCancel: () => void) {
    this.open(new ChopMode(kind, this), onDone, onCancel);
  }

  torch(onDone: (q: number) => void, onCancel: () => void) {
    this.open(new TorchMode(this), onDone, onCancel);
  }

  stir(color: string, onDone: (q: number) => void, onCancel: () => void) {
    this.open(new StirMode(color, this), onDone, onCancel);
  }

  close() {
    this.root.hidden = true;
    this.mode = null;
    cancelAnimationFrame(this.raf);
  }

  message(text: string) {
    this.msgEl.textContent = text;
  }

  /** Ends the game after a short pause so the result can be seen. */
  finish(quality: number, text?: string) {
    if (this.finished) return;
    this.finished = true;
    this.doneBtn.hidden = true;
    this.message(text ?? `Done! ${Math.round(quality * 100)}%`);
    setTimeout(() => {
      if (!this.isOpen) return;
      this.close();
      this.onDone(quality);
    }, 650);
  }

  private open(mode: Mode, onDone: (q: number) => void, onCancel: () => void) {
    this.mode = mode;
    this.onDone = onDone;
    this.onCancel = onCancel;
    this.finished = false;
    this.titleEl.textContent = mode.title;
    this.message(mode.hint);
    this.doneBtn.hidden = !mode.manualDone;
    this.root.hidden = false;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private render(dt: number) {
    if (!this.mode) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    this.mode.draw(this.ctx, w, h, dt);
  }
}

// ---------------------------------------------------------------- Chop

interface Popup {
  text: string;
  x: number;
  y: number;
  age: number;
}

/** Proportions of each ingredient on the board, relative to the board width. */
const SHAPES: Partial<Record<Ingredient, { len: number; thick: number }>> = {
  tomato: { len: 0.5, thick: 0.46 },
  lettuce: { len: 0.78, thick: 0.34 },
  cheese: { len: 0.56, thick: 0.3 },
  onion: { len: 0.5, thick: 0.44 },
  potato: { len: 0.55, thick: 0.38 },
  carrot: { len: 0.8, thick: 0.18 },
};

/** Swipe down through each dashed line; quality is how close each cut lands. */
class ChopMode implements Mode {
  title: string;
  hint = 'Swipe down through each dashed line';
  private count: number;
  private cuts: { x: number; guide: number }[] = [];
  private scores: number[] = [];
  private popups: Popup[] = [];
  private trail: { x: number; y: number }[] = [];
  private trailFade = 0;
  private swiping = false;
  private shake = 0;
  private w = 0;
  private h = 0;

  constructor(private kind: Ingredient, private host: MiniGames) {
    this.count = INGREDIENTS[kind].cuts;
    this.title = `${INGREDIENTS[kind].emoji} Slice the ${INGREDIENTS[kind].name.toLowerCase()}`;
  }

  quality() {
    return this.scores.reduce((a, b) => a + b, 0) / this.count;
  }

  private geometry() {
    const board = Math.min(this.w * 0.9, 560);
    const shape = SHAPES[this.kind] ?? { len: 0.6, thick: 0.3 };
    const len = board * shape.len;
    const thick = board * shape.thick;
    const cx = this.w / 2;
    const cy = this.h * 0.52;
    const left = cx - len / 2;
    const guides = Array.from({ length: this.count }, (_, i) =>
      this.count === 1 ? cx : left + len * (0.2 + (i * 0.6) / (this.count - 1)),
    );
    const spacing = guides.length > 1 ? guides[1] - guides[0] : len * 0.5;
    return { board, len, thick, cx, cy, left, right: left + len, guides, spacing };
  }

  down(x: number, y: number) {
    this.swiping = true;
    this.trail = [{ x, y }];
    this.trailFade = 1;
  }

  move(x: number, y: number) {
    if (this.swiping) this.trail.push({ x, y });
  }

  up() {
    if (!this.swiping) return;
    this.swiping = false;
    const g = this.geometry();
    const top = g.cy - g.thick / 2;
    const bottom = g.cy + g.thick / 2;
    const ys = this.trail.map((p) => p.y);
    if (this.trail.length < 2 || Math.min(...ys) > top || Math.max(...ys) < bottom) {
      this.host.message('Swipe all the way through!');
      return;
    }
    let x: number | null = null;
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      if ((a.y - g.cy) * (b.y - g.cy) <= 0 && a.y !== b.y) {
        x = a.x + ((g.cy - a.y) / (b.y - a.y)) * (b.x - a.x);
        break;
      }
    }
    if (x === null || x < g.left || x > g.right) return;
    const taken = new Set(this.cuts.map((c) => c.guide));
    let guide = -1;
    for (let i = 0; i < g.guides.length; i++) {
      if (taken.has(i)) continue;
      if (guide < 0 || Math.abs(g.guides[i] - x) < Math.abs(g.guides[guide] - x)) guide = i;
    }
    if (guide < 0) return;
    const score = Math.max(0, 1 - Math.abs(g.guides[guide] - x) / (g.spacing * 0.5));
    this.cuts.push({ x, guide });
    this.scores.push(score);
    this.shake = 1;
    this.popups.push({ text: score > 0.85 ? 'Perfect!' : score > 0.55 ? 'Good' : 'Sloppy', x, y: top - 24, age: 0 });
    sfx.chop();
    navigator.vibrate?.(score > 0.85 ? 25 : 10);
    if (this.cuts.length === this.count) this.host.finish(this.quality(), `Done! ${Math.round(this.quality() * 100)}% accuracy`);
    else {
      const left = this.count - this.cuts.length;
      this.host.message(`${left} cut${left > 1 ? 's' : ''} to go`);
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    this.w = w;
    this.h = h;
    this.shake = Math.max(0, this.shake - dt * 6);
    ctx.save();
    ctx.translate((Math.random() - 0.5) * this.shake * 6, (Math.random() - 0.5) * this.shake * 6);
    const g = this.geometry();
    drawBoard(ctx, g.cx, g.cy, g.board, Math.max(g.thick * 2.6, g.board * 0.55));

    // The food, split into pieces that slide apart at each cut.
    const xs = [g.left - g.thick, ...this.cuts.map((c) => c.x).sort((a, b) => a - b), g.right + g.thick];
    for (let i = 0; i < xs.length - 1; i++) {
      const offset = (i - (xs.length - 2)) * 7;
      ctx.save();
      ctx.translate(offset, 0);
      ctx.beginPath();
      ctx.rect(xs[i], 0, xs[i + 1] - xs[i], h);
      ctx.clip();
      drawFood(ctx, this.kind, g.left, g.right, g.cy, g.thick);
      ctx.restore();
    }

    const done = new Set(this.cuts.map((c) => c.guide));
    ctx.setLineDash([9, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    g.guides.forEach((x, i) => {
      if (done.has(i)) return;
      ctx.beginPath();
      ctx.moveTo(x, g.cy - g.thick * 0.75);
      ctx.lineTo(x, g.cy + g.thick * 0.75);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    if (!this.swiping) this.trailFade = Math.max(0, this.trailFade - dt * 4);
    if (this.trail.length > 1 && this.trailFade > 0) {
      ctx.lineCap = 'round';
      for (const [lw, a] of [[14, 0.15], [5, 0.85]] as const) {
        ctx.strokeStyle = `rgba(255,255,255,${a * this.trailFade})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(this.trail[0].x, this.trail[0].y);
        for (const p of this.trail) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    drawPopups(ctx, this.popups, dt);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Torch

const TORCH_GRID = 7;

/** Sweep the flame over the cheese until it's all melted, without scorching it. */
class TorchMode implements Mode {
  title = '🔥 Melt the cheese';
  hint = 'Hold and sweep the flame over the whole slice. Don’t scorch it!';
  manualDone = true;
  private heat = new Float32Array(TORCH_GRID * TORCH_GRID);
  private pointer: { x: number; y: number } | null = null;
  private sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private time = 0;
  private hissT = 0;
  private w = 0;
  private h = 0;

  constructor(private host: MiniGames) {}

  private geometry() {
    const size = Math.min(this.w * 0.72, this.h * 0.42, 380);
    return { size, x: this.w / 2 - size / 2, y: this.h * 0.55 - size / 2, cell: size / TORCH_GRID };
  }

  quality() {
    let q = 0;
    for (const v of this.heat) q += v < 1 ? v * 0.5 : v < 1.7 ? 1 : Math.max(0, 1 - (v - 1.7) * 2);
    return q / this.heat.length;
  }

  private stats() {
    let melted = 0;
    let scorched = 0;
    for (const v of this.heat) {
      melted += Math.min(1, v);
      if (v >= 1.7) scorched++;
    }
    return { melted: melted / this.heat.length, scorched: scorched / this.heat.length };
  }

  down(x: number, y: number) {
    this.pointer = { x, y };
  }

  move(x: number, y: number) {
    if (this.pointer) this.pointer = { x, y };
  }

  up() {
    this.pointer = null;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    this.w = w;
    this.h = h;
    this.time += dt;
    const g = this.geometry();

    // Heat the cells under the flame.
    if (this.pointer) {
      const radius = g.size * 0.24;
      for (let r = 0; r < TORCH_GRID; r++)
        for (let c = 0; c < TORCH_GRID; c++) {
          const cx = g.x + (c + 0.5) * g.cell;
          const cy = g.y + (r + 0.5) * g.cell;
          const d = Math.hypot(cx - this.pointer.x, cy - this.pointer.y);
          if (d < radius) this.heat[r * TORCH_GRID + c] += dt * 3.4 * (1 - d / radius);
        }
      this.hissT -= dt;
      if (this.hissT <= 0) {
        sfx.torch();
        this.hissT = 0.18;
      }
      for (let i = 0; i < 2; i++)
        this.sparks.push({ x: this.pointer.x, y: this.pointer.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 140, life: 0.5 });
    }

    // Slate mat.
    ctx.fillStyle = '#2f3437';
    ctx.beginPath();
    ctx.roundRect(g.x - 40, g.y - 40, g.size + 80, g.size + 80, 26);
    ctx.fill();

    // Cheese: pale → glossy golden when melted → brown when scorched, with drips.
    for (let r = 0; r < TORCH_GRID; r++)
      for (let c = 0; c < TORCH_GRID; c++) {
        const v = this.heat[r * TORCH_GRID + c];
        ctx.fillStyle = cheeseColor(v);
        const x = g.x + c * g.cell;
        const y = g.y + r * g.cell;
        ctx.fillRect(x - 0.5, y - 0.5, g.cell + 1, g.cell + 1);
        if (v >= 1 && v < 1.7) {
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.beginPath();
          ctx.ellipse(x + g.cell * 0.35, y + g.cell * 0.3, g.cell * 0.18, g.cell * 0.08, -0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (r === TORCH_GRID - 1 && v >= 1) {
          ctx.fillStyle = cheeseColor(v);
          const drip = Math.min(1, v - 1) * g.cell * 0.9;
          ctx.beginPath();
          ctx.roundRect(x + g.cell * 0.3, y + g.cell, g.cell * 0.4, drip, g.cell * 0.2);
          ctx.fill();
        }
      }
    // Cheese holes (they fade as the cheese melts over them).
    for (const [fx, fy, fr] of [[0.22, 0.25, 0.07], [0.68, 0.2, 0.05], [0.45, 0.55, 0.09], [0.8, 0.7, 0.06], [0.2, 0.78, 0.05]]) {
      const v = this.heat[Math.min(TORCH_GRID - 1, Math.floor(fy * TORCH_GRID)) * TORCH_GRID + Math.min(TORCH_GRID - 1, Math.floor(fx * TORCH_GRID))];
      ctx.fillStyle = `rgba(180,120,20,${Math.max(0, 0.35 - v * 0.3)})`;
      ctx.beginPath();
      ctx.arc(g.x + fx * g.size, g.y + fy * g.size, fr * g.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,80,10,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x, g.y, g.size, g.size);

    // Sparks.
    for (const s of this.sparks) {
      s.life -= dt;
      s.vy += 300 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},80,${Math.max(0, s.life * 2)})`;
      ctx.fillRect(s.x, s.y, 3, 3);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);

    // The torch itself, aimed at the finger.
    const p = this.pointer ?? { x: g.x + g.size * 0.85, y: g.y - 70 };
    drawTorch(ctx, p.x, p.y, !!this.pointer, this.time);

    const st = this.stats();
    this.host.message(`Melted ${Math.round(st.melted * 100)}%${st.scorched > 0 ? ` · Scorched ${Math.round(st.scorched * 100)}%` : ''}`);
    if (this.time > 14) this.host.finish(this.quality(), "Time's up!");
  }
}

function cheeseColor(v: number) {
  const stops: [number, [number, number, number]][] = [
    [0, [255, 228, 138]],
    [1, [255, 176, 40]],
    [1.7, [222, 128, 30]],
    [2.4, [110, 58, 18]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (v - a) / (b - a);
      return `rgb(${ca.map((x, j) => Math.round(x + (cb[j] - x) * t)).join(',')})`;
    }
  }
  return 'rgb(90,45,14)';
}

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, lit: boolean, t: number) {
  // Nozzle points at (x, y) from up-right.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.6);
  if (lit) {
    const len = 46 + Math.sin(t * 40) * 4;
    const flame = ctx.createLinearGradient(0, -len, 0, 0);
    flame.addColorStop(0, 'rgba(90,150,255,0.95)');
    flame.addColorStop(0.6, 'rgba(160,210,255,0.8)');
    flame.addColorStop(1, 'rgba(255,200,120,0.1)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-9, -len);
    ctx.quadraticCurveTo(0, -len * 0.2, 0, 0);
    ctx.quadraticCurveTo(0, -len * 0.2, 9, -len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(-6, -78, 12, 32);
  ctx.fillStyle = '#d94a3a';
  ctx.beginPath();
  ctx.roundRect(-17, -150, 34, 76, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-11, -142, 6, 60);
  ctx.restore();
}

// ---------------------------------------------------------------- Stir

const STIR_LAPS = 4;

/** Drag round the pot at a steady pace. Too fast and it splashes. */
class StirMode implements Mode {
  title = '🥄 Stir the pot';
  hint = 'Drag round and round the pot. Nice and steady!';
  private angle = 0;
  private travelled = 0;
  private lastA: number | null = null;
  private speed = 0;
  private splash = 0;
  private splashFx: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private bits = Array.from({ length: 14 }, () => ({ r: 0.2 + Math.random() * 0.65, a: Math.random() * 6.28, c: Math.random() }));
  private pointer: { x: number; y: number } | null = null;
  private time = 0;
  private w = 0;
  private h = 0;

  constructor(private color: string, private host: MiniGames) {}

  quality() {
    const progress = Math.min(1, this.travelled / (STIR_LAPS * Math.PI * 2));
    return Math.max(0, progress * (1 - Math.min(0.7, this.splash)));
  }

  private center() {
    return { x: this.w / 2, y: this.h * 0.55, r: Math.min(this.w, this.h) * 0.32 };
  }

  down(x: number, y: number) {
    this.pointer = { x, y };
    const c = this.center();
    this.lastA = Math.atan2(y - c.y, x - c.x);
  }

  move(x: number, y: number) {
    if (!this.pointer) return;
    this.pointer = { x, y };
  }

  up() {
    this.pointer = null;
    this.lastA = null;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    this.w = w;
    this.h = h;
    this.time += dt;
    const c = this.center();

    // Track how far round the pot the finger has gone.
    let instant = 0;
    if (this.pointer && this.lastA !== null) {
      const a = Math.atan2(this.pointer.y - c.y, this.pointer.x - c.x);
      let d = a - this.lastA;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.lastA = a;
      if (Math.hypot(this.pointer.x - c.x, this.pointer.y - c.y) < c.r * 1.4) {
        this.travelled += Math.abs(d);
        this.angle += d;
        instant = Math.abs(d) / Math.max(dt, 0.001);
      }
    }
    this.speed += (instant - this.speed) * Math.min(1, dt * 8);
    if (this.speed > 13) {
      this.splash += dt * 0.35;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        this.splashFx.push({ x: c.x + Math.cos(a) * c.r * 0.8, y: c.y + Math.sin(a) * c.r * 0.8, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 - 100, life: 0.6 });
      }
    }

    // Pot.
    ctx.fillStyle = '#5b6066';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9aa1a8';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.06, 0, Math.PI * 2);
    ctx.fill();
    // Stew.
    const liquid = ctx.createRadialGradient(c.x - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.1, c.x, c.y, c.r);
    liquid.addColorStop(0, lighten(this.color, 0.25));
    liquid.addColorStop(1, this.color);
    ctx.fillStyle = liquid;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    // Swirl and veg bits that turn with the spoon.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * (0.3 + i * 0.22), this.angle + i, this.angle + i + 2.2);
      ctx.stroke();
    }
    for (const b of this.bits) {
      const a = b.a + this.angle * (1.2 - b.r * 0.6);
      ctx.fillStyle = b.c < 0.33 ? '#f08a2c' : b.c < 0.66 ? '#f2e2b8' : '#e9d4f2';
      ctx.beginPath();
      ctx.roundRect(c.x + Math.cos(a) * c.r * b.r - 7, c.y + Math.sin(a) * c.r * b.r - 7, 14, 14, 4);
      ctx.fill();
    }
    // Splashes.
    for (const s of this.splashFx) {
      s.life -= dt;
      s.vy += 500 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = Math.max(0, s.life * 1.6);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    this.splashFx = this.splashFx.filter((s) => s.life > 0);
    // Wooden spoon at the finger.
    if (this.pointer) {
      ctx.save();
      ctx.translate(this.pointer.x, this.pointer.y);
      ctx.rotate(-0.5);
      ctx.fillStyle = '#c58b4e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-5, -150, 10, 130);
      ctx.restore();
    }

    // Progress ring.
    const progress = Math.min(1, this.travelled / (STIR_LAPS * Math.PI * 2));
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = this.speed > 13 ? '#ff7b6b' : '#7fd38b';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.3, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();

    this.host.message(this.speed > 13 ? 'Whoa, too fast! It’s splashing!' : `Stirring… ${Math.round(progress * 100)}%`);
    if (progress >= 1) this.host.finish(this.quality(), this.splash > 0.15 ? 'Stirred (a bit messy)' : 'Perfectly stirred!');
    else if (this.time > 15) this.host.finish(this.quality(), "Time's up!");
  }
}

function lighten(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.min(255, Math.round(((n >> s) & 255) + 255 * amt));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// ---------------------------------------------------------------- Shared drawing

function drawBoard(ctx: CanvasRenderingContext2D, cx: number, cy: number, bw: number, bh: number) {
  const bx = cx - bw / 2;
  const by = cy - bh / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  const wood = ctx.createLinearGradient(0, by, 0, by + bh);
  wood.addColorStop(0, '#e2ad72');
  wood.addColorStop(1, '#c98c4f');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 28);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,70,30,0.18)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 9; i++) {
    const y = by + (bh * i) / 9;
    ctx.beginPath();
    ctx.moveTo(bx + 18, y);
    ctx.bezierCurveTo(bx + bw * 0.3, y + 6, bx + bw * 0.7, y - 6, bx + bw - 18, y);
    ctx.stroke();
  }
}

function drawPopups(ctx: CanvasRenderingContext2D, popups: Popup[], dt: number) {
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const p of popups) {
    p.age += dt;
    const a = Math.max(0, 1 - p.age / 0.9);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.strokeStyle = `rgba(60,30,10,${a * 0.6})`;
    ctx.lineWidth = 4;
    ctx.strokeText(p.text, p.x, p.y - p.age * 40);
    ctx.fillText(p.text, p.x, p.y - p.age * 40);
  }
  for (let i = popups.length - 1; i >= 0; i--) if (popups[i].age >= 0.9) popups.splice(i, 1);
}

function drawFood(ctx: CanvasRenderingContext2D, kind: Ingredient, left: number, right: number, cy: number, thick: number) {
  const cx = (left + right) / 2;
  const len = right - left;
  const shade = (c1: string, c2: string) => {
    const g = ctx.createLinearGradient(0, cy - thick / 2, 0, cy + thick / 2);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  };
  switch (kind) {
    case 'tomato': {
      ctx.fillStyle = shade('#ff6a55', '#c8291e');
      ctx.beginPath();
      ctx.ellipse(cx, cy, len / 2, thick / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx - len * 0.18, cy - thick * 0.22, len * 0.12, thick * 0.08, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f8f3a';
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.translate(cx, cy - thick / 2 + 4);
        ctx.rotate((i / 5) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(10, 0, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'lettuce': {
      ctx.fillStyle = shade('#a9e07a', '#5ea83b');
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = left + t * len;
        const y = cy - thick / 2 + Math.sin(t * Math.PI * 4) * 6;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.quadraticCurveTo(x - len / n / 2, y - 10, x, y);
      }
      for (let i = n; i >= 0; i--) {
        const t = i / n;
        ctx.quadraticCurveTo(left + t * len + 8, cy + thick / 2 + 8, left + t * len, cy + thick / 2 + Math.cos(t * 9) * 5);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,255,220,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left + 10, cy);
      ctx.lineTo(right - 10, cy);
      for (let i = 1; i < 6; i++) {
        const x = left + (len * i) / 6;
        ctx.moveTo(x, cy);
        ctx.lineTo(x + 16, cy - thick * 0.35);
        ctx.moveTo(x, cy);
        ctx.lineTo(x + 16, cy + thick * 0.35);
      }
      ctx.stroke();
      break;
    }
    case 'cheese': {
      ctx.fillStyle = shade('#ffe07a', '#e9b231');
      ctx.beginPath();
      ctx.roundRect(left, cy - thick / 2, len, thick, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,140,20,0.45)';
      for (const [fx, fy, r] of [[0.2, 0.3, 0.12], [0.45, 0.65, 0.09], [0.7, 0.35, 0.14], [0.85, 0.72, 0.07]]) {
        ctx.beginPath();
        ctx.arc(left + fx * len, cy - thick / 2 + fy * thick, r * thick, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'onion': {
      ctx.fillStyle = shade('#f1d6f0', '#b77fb5');
      ctx.beginPath();
      ctx.ellipse(cx, cy, len / 2, thick / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,60,120,0.35)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, (len / 2) * (1 - i * 0.22), thick / 2, 0, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
      break;
    }
    case 'potato': {
      ctx.fillStyle = shade('#d9b27a', '#a87b45');
      ctx.beginPath();
      ctx.ellipse(cx, cy, len / 2, thick / 2, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(110,70,30,0.45)';
      for (const [fx, fy] of [[0.25, 0.35], [0.55, 0.6], [0.75, 0.3], [0.4, 0.75]]) {
        ctx.beginPath();
        ctx.arc(left + fx * len, cy - thick / 2 + fy * thick, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'carrot':
    default: {
      ctx.fillStyle = '#4caf50';
      for (const a of [-0.5, 0, 0.5]) {
        ctx.save();
        ctx.translate(left, cy);
        ctx.rotate(Math.PI + a);
        ctx.beginPath();
        ctx.ellipse(thick * 0.55, 0, thick * 0.55, thick * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = shade('#ff9a3c', '#d9661a');
      ctx.beginPath();
      ctx.moveTo(left, cy - thick / 2);
      ctx.quadraticCurveTo(left + len * 0.6, cy - thick * 0.45, right, cy);
      ctx.quadraticCurveTo(left + len * 0.6, cy + thick * 0.45, left, cy + thick / 2);
      ctx.arc(left, cy, thick / 2, Math.PI / 2, -Math.PI / 2);
      ctx.fill();
    }
  }
}
