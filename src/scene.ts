import * as THREE from 'three';
import { ROOM } from './layout';
import type { Carrying, Chef, GameState, PlayerId, Station, StationKind } from './types';

export interface Pick {
  x: number;
  z: number;
  station: string | null;
}

interface ChefView {
  root: THREE.Group;
  body: THREE.Group;
  apron: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  held: Record<Exclude<Carrying, null>, THREE.Object3D>;
  /** Smoothed render position (the network only sends ~20 updates/s). */
  x: number;
  z: number;
  dir: number;
  walkT: number;
}

const STATION_ICON: Record<StationKind, string> = { crate: '🥕', board: '🔪', hatch: '🛎️' };

export class KitchenView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private raycaster = new THREE.Raycaster();
  private floor: THREE.Mesh;
  private pickables: THREE.Object3D[] = [];
  private stationGlow = new Map<string, THREE.Mesh>();
  private chefs = new Map<PlayerId, ChefView>();
  private marker: THREE.Mesh;
  private markerT = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color('#2b2118');

    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#5a4636', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(3, 9, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    this.scene.add(sun);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.halfW * 2, ROOM.halfD * 2),
      new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.9 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.buildWalls();

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 32),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.02;
    this.scene.add(this.marker);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setStations(stations: Station[]) {
    for (const st of stations) {
      const g = buildStation(st.kind);
      g.position.set(st.x, 0, st.z);
      g.rotation.y = st.rot;
      g.traverse((o) => (o.userData.station = st.id));
      this.scene.add(g);
      this.pickables.push(g);

      const icon = emojiSprite(STATION_ICON[st.kind]);
      icon.position.set(st.x, 1.55, st.z);
      this.scene.add(icon);

      // Glowing pad in front of the station; tinted with the occupant's colour.
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.42, 32),
        new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.18 }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(st.ax, 0.012, st.az);
      glow.userData.station = st.id;
      this.scene.add(glow);
      this.pickables.push(glow);
      this.stationGlow.set(st.id, glow);
    }
  }

  update(state: GameState, me: PlayerId, dt: number) {
    const k = 1 - Math.exp(-dt * 14);
    for (const id of ['host', 'guest'] as PlayerId[]) {
      const chef = state.chefs[id];
      if (!chef) {
        const v = this.chefs.get(id);
        if (v) this.scene.remove(v.root);
        this.chefs.delete(id);
        continue;
      }
      const v = this.chefs.get(id) ?? this.addChef(chef, id === me);
      v.x += (chef.x - v.x) * k;
      v.z += (chef.z - v.z) * k;
      v.dir = lerpAngle(v.dir, chef.dir, k);
      v.root.position.set(v.x, 0, v.z);
      v.root.rotation.y = v.dir;
      v.apron.color.set(chef.color);
      (v.ring.material as THREE.MeshBasicMaterial).color.set(chef.color);
      v.walkT = chef.moving ? v.walkT + dt * 12 : 0;
      v.body.position.y = Math.abs(Math.sin(v.walkT)) * 0.08;
      v.body.rotation.z = Math.sin(v.walkT) * 0.06;
      for (const [kind, obj] of Object.entries(v.held)) obj.visible = chef.carrying === kind;
    }

    for (const st of state.stations) {
      const glow = this.stationGlow.get(st.id)!;
      const mat = glow.material as THREE.MeshBasicMaterial;
      const occupant = st.occupant ? state.chefs[st.occupant] : undefined;
      mat.color.set(occupant ? occupant.color : '#ffd27a');
      mat.opacity = occupant ? 0.55 : 0.18;
    }

    if (this.markerT > 0) {
      this.markerT = Math.max(0, this.markerT - dt * 1.6);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = this.markerT;
      this.marker.scale.setScalar(1 + (1 - this.markerT) * 0.6);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Converts a screen tap into a floor position and (optionally) a station. */
  pick(clientX: number, clientY: number): Pick | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    if (hit) return { x: hit.point.x, z: hit.point.z, station: hit.object.userData.station ?? null };
    const floorHit = this.raycaster.intersectObject(this.floor)[0];
    if (floorHit) return { x: floorHit.point.x, z: floorHit.point.z, station: null };
    return null;
  }

  showMarker(x: number, z: number) {
    this.marker.position.x = x;
    this.marker.position.z = z;
    this.markerT = 1;
  }

  reset() {
    for (const v of this.chefs.values()) this.scene.remove(v.root);
    this.chefs.clear();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;

    // Pull the camera back until the whole kitchen fits, whatever the screen shape.
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const dist = Math.max((ROOM.halfW + 0.3) / Math.tan(hHalf), (ROOM.halfD + 0.9) / Math.tan(vHalf));
    const elev = THREE.MathUtils.degToRad(58);
    this.camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist + 0.3);
    this.camera.lookAt(0, 0, 0.3);
    this.camera.updateProjectionMatrix();
  }

  private buildWalls() {
    const mat = new THREE.MeshStandardMaterial({ color: '#e9dcc6', roughness: 1 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM.halfW * 2, 1.6, 0.2), mat);
    back.position.set(0, 0.8, -ROOM.halfD - 0.1);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, ROOM.halfD * 2), mat);
    left.position.set(-ROOM.halfW - 0.1, 0.8, 0);
    const right = left.clone();
    right.position.x = ROOM.halfW + 0.1;
    for (const m of [back, left, right]) {
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  private addChef(chef: Chef, isMe: boolean): ChefView {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const apron = new THREE.MeshStandardMaterial({ color: chef.color, roughness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: '#f1c7a1', roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 16), apron);
    torso.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
    head.position.y = 0.98;
    const hatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 16), white);
    hatBase.position.y = 1.2;
    const hatPuff = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), white);
    hatPuff.position.y = 1.35;
    hatPuff.scale.y = 0.7;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skin);
    nose.position.set(0, 0.97, 0.2);
    for (const m of [torso, head, hatBase, hatPuff, nose]) {
      m.castShadow = true;
      body.add(m);
    }

    const carrot = carrotMesh();
    carrot.position.set(0, 0.62, 0.36);
    const chopped = choppedMesh();
    chopped.position.set(0, 0.6, 0.36);
    body.add(carrot, chopped);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, isMe ? 0.44 : 0.38, 32),
      new THREE.MeshBasicMaterial({ color: chef.color, transparent: true, opacity: isMe ? 0.9 : 0.5 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    root.add(ring);

    this.scene.add(root);
    const v: ChefView = {
      root, body, apron, ring,
      held: { carrot, chopped },
      x: chef.x, z: chef.z, dir: chef.dir, walkT: 0,
    };
    this.chefs.set(chef.id, v);
    return v;
  }
}

function buildStation(kind: StationKind): THREE.Group {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: kind === 'hatch' ? '#9aa7b0' : '#c9875a', roughness: 0.8 }),
  );
  counter.position.y = 0.45;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.08, 1),
    new THREE.MeshStandardMaterial({ color: '#f3efe8', roughness: 0.5 }),
  );
  top.position.y = 0.94;
  g.add(counter, top);

  if (kind === 'crate') {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 0.6),
      new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 1 }),
    );
    crate.position.y = 1.13;
    g.add(crate);
    for (let i = 0; i < 5; i++) {
      const c = carrotMesh();
      c.position.set(-0.3 + i * 0.15, 1.32, (i % 2) * 0.12 - 0.06);
      c.rotation.y = i;
      g.add(c);
    }
  } else if (kind === 'board') {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.05, 0.55),
      new THREE.MeshStandardMaterial({ color: '#d9a066', roughness: 0.9 }),
    );
    board.position.y = 1.0;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.02, 0.08),
      new THREE.MeshStandardMaterial({ color: '#dfe6ea', metalness: 0.8, roughness: 0.2 }),
    );
    blade.position.set(0.1, 1.04, 0.15);
    g.add(board, blade);
  } else {
    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.7, roughness: 0.3 }),
    );
    bell.position.set(0.35, 0.98, 0);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.2, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    );
    plate.position.set(-0.2, 1.0, 0);
    g.add(bell, plate);
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function carrotMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const root = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.32, 10),
    new THREE.MeshStandardMaterial({ color: '#f07d22', roughness: 0.7 }),
  );
  root.rotation.x = Math.PI;
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: '#4caf50' }),
  );
  leaves.position.y = 0.2;
  g.add(root, leaves);
  return g;
}

function choppedMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#f07d22', roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), mat);
    slice.position.set((i - 2) * 0.07, (i % 2) * 0.03, 0);
    g.add(slice);
  }
  return g;
}

function checkerTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#d8cfc0' : '#f4eee3';
      ctx.fillRect(x * 64, y * 64, 64, 64);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ROOM.halfW, ROOM.halfD);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function emojiSprite(emoji: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '72px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.setScalar(0.6);
  return sprite;
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
