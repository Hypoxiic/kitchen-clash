import * as THREE from 'three';
import { model } from './assets';
import type { Theme } from './themes';

// Procedural props (things the model packs don't have) and each theme's decor.

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function shadows<T extends THREE.Object3D>(obj: T, cast = true): T {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = cast;
      o.receiveShadow = true;
    }
  });
  return obj;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Low wall between the kitchen and the walk-in rooms, with two doorways. */
export function roomFrontWall(wallMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const segments: [number, number][] = [[-5, -3.6], [-1.6, 1.6], [3.6, 5]];
  for (const [a, b] of segments) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(b - a, 1.1, 0.3), wallMat);
    wall.position.set((a + b) / 2, 0.55, -4.5);
    g.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(b - a + 0.06, 0.08, 0.38), mat('#8a6a50'));
    cap.position.set((a + b) / 2, 1.14, -4.5);
    g.add(cap);
  }
  // Door frames.
  for (const x of [-3.6, -1.6, 1.6, 3.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.36), mat('#7a5638'));
    // Just outside each doorway opening.
    post.position.set(x + (x === -3.6 || x === 1.6 ? -0.08 : 0.08), 1.2, -4.5);
    g.add(post);
  }
  // The divider between the two rooms: low at the front so you can see in,
  // and not too tall at the back so it doesn't hide the wall sign.
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.9), wallMat);
  front.position.set(0, 0.55, -5.1);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 3.95), wallMat);
  back.position.set(0, 1.1, -7.53);
  g.add(front, back);
  return shadows(g);
}

/** Clear plastic strip curtain in the fridge doorway; strips sway as chefs pass. */
export function fridgeCurtain(): { group: THREE.Group; strips: THREE.Mesh[] } {
  const group = new THREE.Group();
  const strips: THREE.Mesh[] = [];
  const stripMat = new THREE.MeshStandardMaterial({
    color: '#cfefff', transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  });
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.PlaneGeometry(0.24, 2.0);
    geo.translate(0, -1.0, 0); // hinge at the top
    const strip = new THREE.Mesh(geo, stripMat);
    strip.position.set(1.75 + i * 0.25, 2.3, -4.5);
    group.add(strip);
    strips.push(strip);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.1), mat('#9aa4ab', { metalness: 0.6, roughness: 0.3 }));
  rail.position.set(2.6, 2.32, -4.5);
  group.add(rail);
  return { group, strips };
}

/** A kitchen blowtorch on a slate mat. */
export function blowtorch(): THREE.Group {
  const g = new THREE.Group();
  const slate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.8), mat('#33393d', { roughness: 0.9 }));
  slate.position.y = 0.02;
  g.add(slate);
  const torch = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 18), mat('#d9453a', { roughness: 0.4 }));
  can.position.y = 0.17;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 14), mat('#2b2b2b', { metalness: 0.6 }));
  head.position.y = 0.39;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 10), mat('#bfc5c9', { metalness: 0.8, roughness: 0.25 }));
  nozzle.rotation.z = Math.PI / 2.6;
  nozzle.position.set(0.09, 0.45, 0);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.06), mat('#222'));
  trigger.position.set(-0.08, 0.36, 0);
  torch.add(can, head, nozzle, trigger);
  torch.position.set(0.22, 0.04, -0.18);
  torch.scale.setScalar(1.7);
  g.add(torch);
  g.userData.torch = torch;
  return shadows(g);
}

/** Sacks of flour and rice for the pantry. */
export function sacks(): THREE.Group {
  const g = new THREE.Group();
  const burlap = mat('#d8c39a', { roughness: 1 });
  const spots: [number, number, number, string][] = [[0, 0, 0, 'FLOUR'], [0.62, 0, 0.12, 'RICE'], [0.3, 0.55, 0.05, '']];
  for (const [x, y, z, label] of spots) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), burlap);
    sack.scale.set(1, 1.25, 0.8);
    sack.position.set(x, y + 0.4, z);
    g.add(sack);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.14, 10), burlap);
    tie.position.set(x, y + 0.86, z);
    g.add(tie);
    if (label) {
      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.18),
        new THREE.MeshStandardMaterial({ map: canvasTexture(128, 56, (ctx) => {
          ctx.fillStyle = '#efe4c8';
          ctx.fillRect(0, 0, 128, 56);
          ctx.fillStyle = '#7a3b1e';
          ctx.font = 'bold 30px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, 64, 38);
        }) }),
      );
      tag.position.set(x, y + 0.42, z + 0.28);
      g.add(tag);
    }
  }
  return shadows(g);
}

/** A standing chalkboard showing today's dish. */
export function chalkboard(): { group: THREE.Group; setDish: (emoji: string, name: string) => void } {
  const group = new THREE.Group();
  const wood = mat('#7a5232');
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), wood);
    leg.position.set(s * 0.48, 0.78, 0);
    leg.rotation.x = -0.12;
    group.add(leg);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 300;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, 0.05), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), wood]);
  board.position.set(0, 1.05, 0.04);
  board.rotation.x = -0.12;
  group.add(board);
  const setDish = (emoji: string, name: string) => {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2d3a32';
    ctx.fillRect(0, 0, 256, 300);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * 256, Math.random() * 300, 30, 2);
    ctx.fillStyle = '#f4efe2';
    ctx.textAlign = 'center';
    ctx.font = 'italic 26px Georgia, serif';
    ctx.fillText("Today's dish", 128, 48);
    ctx.font = '86px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(emoji, 128, 150);
    ctx.font = 'bold 26px Georgia, serif';
    const words = name.split(' ');
    const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
    lines.forEach((l, i) => ctx.fillText(l, 128, 210 + i * 32));
    tex.needsUpdate = true;
  };
  return { group: shadows(group), setDish };
}

function pottedPlant(size = 1, leaves = '#4f8f3a', pot = '#b5623b'): THREE.Group {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * size, 0.2 * size, 0.42 * size, 16), mat(pot));
  p.position.y = 0.21 * size;
  g.add(p);
  const leafMat = mat(leaves, { roughness: 0.85 });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22 * size, 10, 8), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.16 * size, (0.6 + (i % 3) * 0.18) * size, Math.sin(a) * 0.16 * size);
    leaf.scale.set(1, 1.3, 1);
    g.add(leaf);
  }
  return shadows(g);
}

function wallSign(text: string, opts: { bg: string; fg: string; font: string; glow?: string; w?: number }): THREE.Mesh {
  const w = opts.w ?? 3.2;
  const tex = canvasTexture(640, 180, (ctx) => {
    if (opts.bg !== 'transparent') {
      ctx.fillStyle = opts.bg;
      ctx.beginPath();
      ctx.roundRect(6, 6, 628, 168, 26);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = opts.font;
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = opts.fg;
    ctx.fillText(text, 320, 96);
    ctx.fillText(text, 320, 96);
  });
  const material = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, emissive: opts.glow ? new THREE.Color('#ffffff') : new THREE.Color('#000000'),
    emissiveMap: opts.glow ? tex : null, emissiveIntensity: opts.glow ? 1.2 : 0, roughness: 0.6,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 180) / 640), material);
}

function pendantLamp(color: string): THREE.Group {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6), mat('#111'));
  cord.position.y = 0.6;
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    mat('#20332c', { metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide }),
  );
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color }));
  bulb.position.y = -0.04;
  g.add(cord, shade, bulb);
  return g;
}

function lanternString(z: number, colors: string[], y = 3.1): THREE.Group {
  const g = new THREE.Group();
  const span = 9.6;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    points.push(new THREE.Vector3(-span / 2 + t * span, y - Math.sin(t * Math.PI) * 0.45, z));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.012, 4), mat('#3a2a1a')));
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const color = colors[i % colors.length];
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.09, 0.3, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 }),
    );
    lantern.position.set(-span / 2 + t * span, y - Math.sin(t * Math.PI) * 0.45 - 0.2, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 8), mat('#b08a3c', { metalness: 0.7, roughness: 0.3 }));
    cap.position.copy(lantern.position).add(new THREE.Vector3(0, 0.2, 0));
    g.add(lantern, cap);
  }
  return g;
}

function spiceMounds(): THREE.Group {
  const g = new THREE.Group();
  const spices = ['#c0392b', '#e67e22', '#f1c40f', '#8e5a2b', '#27ae60'];
  spices.forEach((c, i) => {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.12, 16), mat('#d9c6a5'));
    const mound = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.22, 16), mat(c, { roughness: 1 }));
    const x = (i % 3) * 0.45 - 0.45;
    const z = Math.floor(i / 3) * 0.45;
    bowl.position.set(x, 0.06, z);
    mound.position.set(x, 0.22, z);
    g.add(bowl, mound);
  });
  return shadows(g);
}

function wallClock(): THREE.Group {
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.06, 32),
    new THREE.MeshStandardMaterial({ map: canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = '#fbf7ee';
      ctx.beginPath();
      ctx.arc(64, 64, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3b2a1c';
      ctx.lineWidth = 6;
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillStyle = '#3b2a1c';
        ctx.fillRect(64 + Math.cos(a) * 48 - 2, 64 + Math.sin(a) * 48 - 2, 5, 5);
      }
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64, 26);
      ctx.moveTo(64, 64);
      ctx.lineTo(92, 74);
      ctx.stroke();
    }) }),
  );
  face.rotation.x = Math.PI / 2;
  g.add(face);
  return g;
}

function jukebox(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.7), mat('#8b1e2d', { roughness: 0.35 }));
  body.position.y = 0.75;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 24, 1, false, 0, Math.PI), mat('#8b1e2d', { roughness: 0.35 }));
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  top.position.y = 1.5;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.9),
    new THREE.MeshStandardMaterial({ color: '#ffd38a', emissive: '#ff8a3c', emissiveIntensity: 1.2 }),
  );
  glow.position.set(0, 1.0, 0.36);
  g.add(body, top, glow);
  return shadows(g);
}

/** Everything that changes with the theme: signs, lamps, plants, lanterns… */
export function themeDecor(theme: Theme): { group: THREE.Group; light: THREE.PointLight | null } {
  const g = new THREE.Group();
  let light: THREE.PointLight | null = null;
  const sign = (mesh: THREE.Mesh) => {
    mesh.position.set(0, 3.35, -9.48);
    g.add(mesh);
  };

  switch (theme.id) {
    case 'cottage': {
      sign(wallSign('Home Kitchen', { bg: '#8a5a32', fg: '#fff1d8', font: 'italic bold 92px Georgia, serif' }));
      const plant = pottedPlant(1.4);
      plant.position.set(-4.3, 0, -3.4);
      const plant2 = pottedPlant(1.2, '#5f9a3e', '#c9845a');
      plant2.position.set(4.3, 0, -3.4);
      g.add(plant, plant2);
      for (const z of [2.2, 3.0]) {
        const herb = pottedPlant(0.45, '#6fae4b', '#d9a066');
        herb.position.set(-4.55, 1.0, z);
        g.add(herb);
      }
      const clock = wallClock();
      clock.position.set(-2.5, 3.2, -9.47);
      g.add(clock);
      break;
    }
    case 'diner': {
      sign(wallSign('DINER', { bg: 'transparent', fg: '#ffd1ea', font: 'bold 130px "Trebuchet MS", sans-serif', glow: '#ff4fa3' }));
      const open = wallSign('OPEN', { bg: 'transparent', fg: '#bfffe9', font: 'bold 120px "Trebuchet MS", sans-serif', glow: '#2ee6b5', w: 1.4 });
      open.position.set(3.4, 3.2, -9.48);
      g.add(open);
      const jb = jukebox();
      jb.position.set(-4.3, 0, -3.5);
      g.add(jb);
      const stool = model('chair_stool');
      stool.position.set(4.4, 0, -3.2);
      g.add(stool);
      light = new THREE.PointLight(theme.accent, theme.accentIntensity, 9, 1.5);
      light.position.set(0, 3.2, -8.6);
      break;
    }
    case 'bistro': {
      sign(wallSign('Bistro', { bg: '#1b2433', fg: '#e8c27a', font: 'italic 120px Georgia, serif', glow: '#e8a64a' }));
      for (const [x, z] of [[0, 0.6], [0, 4.5]]) {
        const lamp = pendantLamp(theme.accent);
        lamp.position.set(x, 2.9, z);
        g.add(lamp);
      }
      const plant = pottedPlant(1.6, '#3f7a3a', '#2a2a2a');
      plant.position.set(-4.3, 0, -3.4);
      const plant2 = pottedPlant(1.3, '#3f7a3a', '#2a2a2a');
      plant2.position.set(4.3, 0, -3.4);
      g.add(plant, plant2);
      light = new THREE.PointLight(theme.accent, theme.accentIntensity, 8, 1.6);
      light.position.set(0, 2.6, 2.2);
      break;
    }
    case 'market': {
      sign(wallSign('Spice Kitchen', { bg: '#7a2e1c', fg: '#ffd27a', font: 'bold 96px Georgia, serif' }));
      const colors = ['#e74c3c', '#f39c12', '#16a085', '#8e44ad', '#f1c40f'];
      g.add(lanternString(-1.2, colors), lanternString(2.9, colors, 3.3));
      const spices = spiceMounds();
      spices.position.set(-4.35, 0, -3.6);
      g.add(spices);
      const urn = pottedPlant(1.3, '#6aa84f', '#c97b3c');
      urn.position.set(4.3, 0, -3.4);
      g.add(urn);
      light = new THREE.PointLight(theme.accent, theme.accentIntensity, 10, 1.4);
      light.position.set(0, 3.0, 1.0);
      break;
    }
  }
  if (light) g.add(light);
  return { group: g, light };
}
