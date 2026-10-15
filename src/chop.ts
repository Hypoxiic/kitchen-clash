import { INGREDIENTS } from './recipes';
import { sfx } from './sfx';
import type { Ingredient } from './types';

interface Cut {
  x: number;
  guide: number;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  age: number;
}

/** Proportions of each ingredient on the board: length and thickness relative to the board. */
const SHAPES: Partial<Record<Ingredient, { len: number; thick: number }>> = {
  tomato: { len: 0.5, thick: 0.46 },
  lettuce: { len: 0.78, thick: 0.34 },
  cheese: { len: 0.56, thick: 0.3 },
  onion: { len: 0.5, thick: 0.44 },
  ham: { len: 0.7, thick: 0.3 },
  carrot: { len: 0.8, thick: 0.18 },
};

/**
 * Chopping-board mini-game: swipe down through each dashed line.
 * Quality (0..1) is how close each cut lands to its line.
 */
export class ChopGame {
  private root = document.getElementById('chop')!;
  private canvas = document.getElementById('chop-canvas') as HTMLCanvasElement;
  private msg = document.getElementById('chop-msg')!;
  private title = document.getElementById('chop-title')!;
  private ctx = this.canvas.getContext('2d')!;
  private kind: Ingredient = 'tomato';
  private count = 3;
  private cuts: Cut[] = [];
  private scores: number[] = [];
  private popups: Popup[] = [];
  private trail: { x: number; y: number }[] = [];
  private trailFade = 0;
  private swiping = false;
  private finished = false;
  private shake = 0;
  private raf = 0;
  private last = 0;
  private onDone: (quality: number) => void = () => {};
  private onCancel: () => void = () => {};

  constructor() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.finished) return;
      this.swiping = true;
      this.trail = [{ x: e.offsetX, y: e.offsetY }];
      this.trailFade = 1;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.swiping) this.trail.push({ x: e.offsetX, y: e.offsetY });
    });
    const end = () => {
      if (!this.swiping) return;
      this.swiping = false;
      this.evaluateSwipe();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    document.getElementById('chop-leave')!.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open(kind: Ingredient, onDone: (quality: number) => void, onCancel: () => void) {
    this.kind = kind;
    this.count = INGREDIENTS[kind].cuts;
    this.onDone = onDone;
    this.onCancel = onCancel;
    this.cuts = [];
    this.scores = [];
    this.popups = [];
    this.trail = [];
    this.finished = false;
    this.title.textContent = `${INGREDIENTS[kind].emoji} Slice the ${INGREDIENTS[kind].name.toLowerCase()}`;
    this.msg.textContent = 'Swipe down through each dashed line';
    this.root.hidden = false;
    this.last = performance.now();
    const loop = (now: number) => {
      this.draw(Math.min(0.05, (now - this.last) / 1000));
      this.last = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    this.root.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  private geometry() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const board = Math.min(w * 0.9, 560);
    const shape = SHAPES[this.kind] ?? { len: 0.6, thick: 0.3 };
    const len = board * shape.len;
    const thick = board * shape.thick;
    const cx = w / 2;
    const cy = h * 0.52;
    const left = cx - len / 2;
    const guides = Array.from({ length: this.count }, (_, i) =>
      this.count === 1 ? cx : left + len * (0.2 + (i * 0.6) / (this.count - 1)),
    );
    const spacing = guides.length > 1 ? guides[1] - guides[0] : len * 0.5;
    return { w, h, board, len, thick, cx, cy, left, right: left + len, guides, spacing };
  }

  private evaluateSwipe() {
    const g = this.geometry();
    const top = g.cy - g.thick / 2;
    const bottom = g.cy + g.thick / 2;
    const ys = this.trail.map((p) => p.y);
    if (this.trail.length < 2 || Math.min(...ys) > top || Math.max(...ys) < bottom) {
      this.msg.textContent = 'Swipe all the way through!';
      return;
    }
    // Where the swipe crossed the middle of the food.
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

    if (this.cuts.length === this.count) {
      this.finished = true;
      const quality = this.scores.reduce((a, b) => a + b, 0) / this.count;
      this.msg.textContent = `Done! ${Math.round(quality * 100)}% accuracy`;
      setTimeout(() => {
        if (!this.isOpen) return;
        this.close();
        this.onDone(quality);
      }, 650);
    } else {
      const left = this.count - this.cuts.length;
      this.msg.textContent = `${left} cut${left > 1 ? 's' : ''} to go`;
    }
  }

  private draw(dt: number) {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cw = Math.round(this.canvas.clientWidth * dpr);
    const ch = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const ctx = this.ctx;
    this.shake = Math.max(0, this.shake - dt * 6);
    const sx = (Math.random() - 0.5) * this.shake * 6;
    const sy = (Math.random() - 0.5) * this.shake * 6;
    ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    const g = this.geometry();
    ctx.clearRect(-20, -20, g.w + 40, g.h + 40);

    // Wooden board with grain and a soft drop shadow.
    const bw = g.board;
    const bh = Math.max(g.thick * 2.6, bw * 0.55);
    const bx = g.cx - bw / 2;
    const by = g.cy - bh / 2;
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
    ctx.fillStyle = 'rgba(80,40,10,0.25)';
    ctx.beginPath();
    ctx.arc(bx + bw - 30, by + 30, 9, 0, Math.PI * 2);
    ctx.fill();

    // The food, split into pieces that slide apart at each cut.
    const xs = [g.left - g.thick, ...this.cuts.map((c) => c.x).sort((a, b) => a - b), g.right + g.thick];
    const pieces = xs.length - 1;
    for (let i = 0; i < pieces; i++) {
      const offset = (i - (pieces - 1)) * 7;
      ctx.save();
      ctx.translate(offset, 0);
      ctx.beginPath();
      ctx.rect(xs[i], 0, xs[i + 1] - xs[i], g.h);
      ctx.clip();
      drawFood(ctx, this.kind, g.left, g.right, g.cy, g.thick);
      ctx.restore();
      // Fresh cut faces.
      if (i > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(xs[i] + offset - 1, g.cy - g.thick * 0.4, 2, g.thick * 0.8);
      }
    }

    // Guide lines still to cut.
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

    // Blade trail.
    if (!this.swiping) this.trailFade = Math.max(0, this.trailFade - dt * 4);
    if (this.trail.length > 1 && this.trailFade > 0) {
      ctx.lineCap = 'round';
      for (const [w, a] of [[14, 0.15], [5, 0.85]] as const) {
        ctx.strokeStyle = `rgba(255,255,255,${a * this.trailFade})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(this.trail[0].x, this.trail[0].y);
        for (const p of this.trail) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    // Floating feedback.
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      p.age += dt;
      const a = Math.max(0, 1 - p.age / 0.9);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.strokeStyle = `rgba(60,30,10,${a * 0.6})`;
      ctx.lineWidth = 4;
      ctx.strokeText(p.text, p.x, p.y - p.age * 40);
      ctx.fillText(p.text, p.x, p.y - p.age * 40);
    }
    this.popups = this.popups.filter((p) => p.age < 0.9);
  }
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
    case 'ham': {
      ctx.fillStyle = shade('#ffb0b0', '#e07d86');
      ctx.beginPath();
      ctx.roundRect(left, cy - thick / 2, len, thick, thick / 2);
      ctx.fill();
      ctx.fillStyle = '#fff1ec';
      ctx.fillRect(left + 10, cy - thick / 2 + 6, len - 20, 7);
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
