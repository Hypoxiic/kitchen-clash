const CUTS = 5;

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

/**
 * Chopping-board mini-game: swipe down through each dashed line on the carrot.
 * Quality (0..1) is how close each cut lands to its line.
 */
export class ChopGame {
  private root = document.getElementById('chop')!;
  private canvas = document.getElementById('chop-canvas') as HTMLCanvasElement;
  private msg = document.getElementById('chop-msg')!;
  private ctx = this.canvas.getContext('2d')!;
  private cuts: Cut[] = [];
  private scores: number[] = [];
  private popups: Popup[] = [];
  private trail: { x: number; y: number }[] = [];
  private trailFade = 0;
  private swiping = false;
  private finished = false;
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

  open(onDone: (quality: number) => void, onCancel: () => void) {
    this.onDone = onDone;
    this.onCancel = onCancel;
    this.cuts = [];
    this.scores = [];
    this.popups = [];
    this.trail = [];
    this.finished = false;
    this.msg.textContent = 'Swipe down through each line!';
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
    const len = Math.min(w * 0.72, 520);
    const thick = len * 0.2;
    // Nudge right so the leaves on the thick end stay on screen.
    const cx = w / 2 + thick * 0.5;
    const cy = h * 0.55;
    const left = cx - len / 2;
    const guides = Array.from({ length: CUTS }, (_, i) => left + len * (0.18 + (i * 0.64) / (CUTS - 1)));
    const spacing = guides[1] - guides[0];
    return { w, h, len, thick, cx, cy, left, right: left + len, guides, spacing };
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
    // Where the swipe crossed the carrot's centre line.
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
    this.popups.push({
      text: score > 0.85 ? 'Perfect!' : score > 0.55 ? 'Good' : 'Sloppy',
      x,
      y: top - 20,
      age: 0,
    });
    navigator.vibrate?.(score > 0.85 ? 25 : 10);

    if (this.cuts.length === CUTS) {
      this.finished = true;
      const quality = this.scores.reduce((a, b) => a + b, 0) / CUTS;
      this.msg.textContent = `Done! ${Math.round(quality * 100)}%`;
      setTimeout(() => {
        if (!this.isOpen) return;
        this.close();
        this.onDone(quality);
      }, 600);
    } else {
      this.msg.textContent = `${CUTS - this.cuts.length} cuts to go`;
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = this.geometry();
    ctx.clearRect(0, 0, g.w, g.h);

    // Board.
    ctx.fillStyle = '#d9a066';
    roundRect(ctx, g.w / 2 - g.len * 0.62, g.cy - g.thick * 1.8, g.len * 1.24, g.thick * 3.6, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,30,0.25)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const y = g.cy - g.thick * 1.8 + (g.thick * 3.6 * i) / 6;
      ctx.beginPath();
      ctx.moveTo(g.w / 2 - g.len * 0.59, y);
      ctx.lineTo(g.w / 2 + g.len * 0.59, y);
      ctx.stroke();
    }

    // Carrot, split into pieces that drift apart at each cut.
    const xs = [g.left - g.thick, ...this.cuts.map((c) => c.x).sort((a, b) => a - b), g.right + 4];
    const pieces = xs.length - 1;
    for (let i = 0; i < pieces; i++) {
      // Cut pieces slide left; the uncut tail stays put so its guides still line up.
      const offset = (i - (pieces - 1)) * 6;
      ctx.save();
      ctx.translate(offset, 0);
      ctx.beginPath();
      ctx.rect(xs[i], 0, xs[i + 1] - xs[i], g.h);
      ctx.clip();
      drawCarrot(ctx, g.left, g.right, g.cy, g.thick);
      ctx.restore();
    }

    // Guide lines still to cut.
    const done = new Set(this.cuts.map((c) => c.guide));
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    g.guides.forEach((x, i) => {
      if (done.has(i)) return;
      ctx.beginPath();
      ctx.moveTo(x, g.cy - g.thick * 0.95);
      ctx.lineTo(x, g.cy + g.thick * 0.95);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Swipe trail.
    if (!this.swiping) this.trailFade = Math.max(0, this.trailFade - dt * 4);
    if (this.trail.length > 1 && this.trailFade > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * this.trailFade})`;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (const p of this.trail) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // Floating feedback.
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      p.age += dt;
      const a = Math.max(0, 1 - p.age / 0.9);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillText(p.text, p.x, p.y - p.age * 40);
    }
    this.popups = this.popups.filter((p) => p.age < 0.9);
  }
}

function drawCarrot(ctx: CanvasRenderingContext2D, left: number, right: number, cy: number, thick: number) {
  // Leaves.
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
  // Body: thick rounded end on the left tapering to a point on the right.
  ctx.fillStyle = '#f07d22';
  ctx.beginPath();
  ctx.moveTo(left, cy - thick / 2);
  ctx.quadraticCurveTo(left + (right - left) * 0.6, cy - thick * 0.45, right, cy);
  ctx.quadraticCurveTo(left + (right - left) * 0.6, cy + thick * 0.45, left, cy + thick / 2);
  ctx.arc(left, cy, thick / 2, Math.PI / 2, -Math.PI / 2);
  ctx.fill();
  // Ridges.
  ctx.strokeStyle = 'rgba(160,70,10,0.45)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 8; i++) {
    const x = left + ((right - left) * i) / 9;
    const half = (thick / 2) * (1 - i / 10) * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, cy - half);
    ctx.lineTo(x + 6, cy - half * 0.3);
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
