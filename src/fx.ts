import * as THREE from 'three';

export type FxKind = 'steam' | 'smoke' | 'puff' | 'sparkle' | 'bits' | 'confetti';

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size0: number;
  size1: number;
  alpha: number;
  gravity: number;
  drag: number;
  spin: number;
}

const POOL = 260;
const CONFETTI = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f45'];

/** Lightweight pooled sprite particles. */
export class Fx {
  readonly group = new THREE.Group();
  private free: Particle[] = [];
  private live: Particle[] = [];
  private soft = softTexture();
  private star = starTexture();
  private square = squareTexture();

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, transparent: true, depthWrite: false }));
      sprite.visible = false;
      this.group.add(sprite);
      this.free.push({ sprite, vel: new THREE.Vector3(), life: 0, max: 1, size0: 1, size1: 1, alpha: 1, gravity: 0, drag: 0, spin: 0 });
    }
  }

  emit(kind: FxKind, at: THREE.Vector3, count = 1) {
    for (let i = 0; i < count; i++) {
      const p = this.free.pop();
      if (!p) return;
      const mat = p.sprite.material as THREE.SpriteMaterial;
      p.sprite.position.copy(at);
      p.sprite.visible = true;
      p.life = 0;
      p.spin = 0;
      mat.rotation = Math.random() * Math.PI * 2;
      const r = () => Math.random() - 0.5;
      switch (kind) {
        case 'steam':
          mat.map = this.soft;
          mat.color.set('#ffffff');
          p.sprite.position.add(new THREE.Vector3(r() * 0.4, 0, r() * 0.3));
          p.vel.set(r() * 0.15, 0.7 + Math.random() * 0.4, r() * 0.15);
          Object.assign(p, { max: 1.4, size0: 0.22, size1: 0.75, alpha: 0.32, gravity: 0, drag: 0.6 });
          break;
        case 'smoke':
          mat.map = this.soft;
          mat.color.set('#4a4440');
          p.sprite.position.add(new THREE.Vector3(r() * 0.4, 0, r() * 0.3));
          p.vel.set(r() * 0.2, 0.9 + Math.random() * 0.4, r() * 0.2);
          Object.assign(p, { max: 2, size0: 0.3, size1: 1.2, alpha: 0.5, gravity: 0, drag: 0.4 });
          break;
        case 'puff':
          mat.map = this.soft;
          mat.color.set('#e8dccb');
          p.vel.set(r() * 1.2, 0.3 + Math.random() * 0.3, r() * 1.2);
          Object.assign(p, { max: 0.55, size0: 0.18, size1: 0.45, alpha: 0.45, gravity: 0, drag: 3 });
          break;
        case 'sparkle':
          mat.map = this.star;
          mat.color.set(Math.random() < 0.5 ? '#fff3b0' : '#ffffff');
          p.vel.set(r() * 2.4, 1.2 + Math.random() * 1.6, r() * 2.4);
          Object.assign(p, { max: 0.8, size0: 0.32, size1: 0.05, alpha: 1, gravity: -3, drag: 1.5, spin: r() * 8 });
          break;
        case 'bits':
          mat.map = this.square;
          mat.color.set('#f6c66b');
          p.vel.set(r() * 2, 1.5 + Math.random(), r() * 2);
          Object.assign(p, { max: 0.6, size0: 0.08, size1: 0.06, alpha: 1, gravity: -9, drag: 0.5, spin: r() * 10 });
          break;
        case 'confetti':
          mat.map = this.square;
          mat.color.set(CONFETTI[Math.floor(Math.random() * CONFETTI.length)]);
          p.sprite.position.add(new THREE.Vector3(r() * 5, Math.random() * 1.5, r() * 2));
          p.vel.set(r() * 1.5, 0.5 + Math.random() * 2, r() * 1.5);
          Object.assign(p, { max: 3.2, size0: 0.12, size1: 0.1, alpha: 1, gravity: -2.2, drag: 1.2, spin: r() * 12 });
          break;
      }
      this.live.push(p);
    }
  }

  /** Emits `kind` with the given colour (e.g. chopped food bits). */
  emitColored(kind: FxKind, at: THREE.Vector3, count: number, color: string) {
    const start = this.live.length;
    this.emit(kind, at, count);
    for (let i = start; i < this.live.length; i++) (this.live[i].sprite.material as THREE.SpriteMaterial).color.set(color);
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        p.sprite.visible = false;
        this.live.splice(i, 1);
        this.free.push(p);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = p.size0 + (p.size1 - p.size0) * t;
      p.sprite.scale.setScalar(s);
      const mat = p.sprite.material as THREE.SpriteMaterial;
      mat.rotation += p.spin * dt;
      // Fade in quickly, out slowly.
      mat.opacity = p.alpha * Math.min(1, t * 6) * (1 - t * t);
    }
  }
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d')!, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softTexture() {
  return canvasTexture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function starTexture() {
  return canvasTexture((ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 6 : 30;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
  });
}

function squareTexture() {
  return canvasTexture((ctx, s) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.4);
  });
}
