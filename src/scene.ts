import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { itemModelName, model, modelHeight, tintPatty } from './assets';
import { ChefModel } from './chef';
import { Fx } from './fx';
import { PROPS, STATION_SPOTS } from './layout';
import { BURNT_AT } from './recipes';
import type { Chef, GameState, Item, PlayerId, StationKind } from './types';

export interface Pick {
  x: number;
  z: number;
  station: string | null;
}

const BADGES: Partial<Record<StationKind, string>> = { pantry: '🧺', board: '🔪', stove: '🔥', pass: '🛎️', bin: '🗑️' };
const PLAYERS: PlayerId[] = ['host', 'guest'];
const FOOD_COLORS: Record<string, string> = {
  tomato: '#e5483b', lettuce: '#7cc355', cheese: '#f6c445', onion: '#e9d4f2', ham: '#f29c9c', carrot: '#f08a2c',
};

interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** Vertical lens shift in NDC units, so the subject can sit above/below centre. */
  shift: number;
}

export class KitchenView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private camPose: CameraPose = { pos: new THREE.Vector3(0, 14, 12), target: new THREE.Vector3(), shift: 0 };
  private camWant: CameraPose = { pos: new THREE.Vector3(0, 14, 12), target: new THREE.Vector3(), shift: 0 };
  private judging = false;
  private raycaster = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private floor: THREE.Mesh;
  private chefs = new Map<PlayerId, ChefModel>();
  private fx = new Fx();
  private stoveLight: THREE.PointLight;
  private marker: THREE.Mesh;
  private markerT = 0;
  private badges: { sprite: THREE.Sprite; baseY: number; phase: number }[] = [];
  private stoveItems = new Map<string, { obj: THREE.Object3D | null; key: string; bar: DonenessBar }>();
  private boardItems = new Map<string, { obj: THREE.Object3D | null; key: string }>();
  private plates = new Map<PlayerId, { group: THREE.Group; stack: THREE.Group; mat: THREE.MeshStandardMaterial; sig: string }>();
  private passDishes = new Map<PlayerId, { group: THREE.Group; sig: string }>();
  private emitT = 0;
  private built = false;
  private lastServed = new Map<PlayerId, boolean>();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color('#2b2118');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;

    this.scene.add(new THREE.HemisphereLight('#fff1dc', '#7a5a44', 1.1));
    // Warm afternoon sun through the back windows.
    const sun = new THREE.DirectionalLight('#ffe0b5', 2.6);
    sun.position.set(6, 12, -7);
    sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#cfe0ff', 0.55);
    fill.position.set(-6, 8, 10);
    this.scene.add(fill);
    this.stoveLight = new THREE.PointLight('#ff8a3d', 0, 5, 1.6);
    this.stoveLight.position.set(0, 1.6, -3.4);
    this.scene.add(this.stoveLight);

    // Invisible floor plane for tap-to-walk.
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ visible: false }));
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.scene.add(this.marker, this.fx.group);

    this.resize();
    this.camPose.pos.copy(this.camWant.pos);
    this.camPose.target.copy(this.camWant.target);
    this.camPose.shift = this.camWant.shift;
    window.addEventListener('resize', () => this.resize());
  }

  /** Builds the kitchen once models are loaded. */
  build() {
    this.built = true;
    const tiles = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 11.5),
      new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.8 }),
    );
    tiles.rotation.x = -Math.PI / 2;
    tiles.position.set(0, 0, -0.25);
    tiles.receiveShadow = true;
    this.scene.add(tiles);
    // A wooden threshold along the open front edge.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(12, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: '#7a4f31', roughness: 0.7 }));
    lip.position.set(0, 0.04, 5.6);
    lip.receiveShadow = true;
    this.scene.add(lip);

    for (const p of PROPS) {
      const obj = model(p.model);
      obj.position.set(p.x, p.y ?? 0, p.z);
      obj.rotation.y = p.rot ?? 0;
      obj.scale.setScalar(p.scale ?? 1);
      if (p.station) {
        obj.traverse((o) => (o.userData.station = p.station));
        this.pickables.push(obj);
      }
      this.scene.add(obj);
    }

    // A simple pedal bin (there isn't one in the pack).
    const bin = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#8d969c', metalness: 0.6, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 1.0, 28), metal);
    body.position.y = 0.5;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 28), metal);
    lid.position.y = 1.04;
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.16), new THREE.MeshStandardMaterial({ color: '#444' }));
    pedal.position.set(0.36, 0.06, 0);
    bin.add(body, lid, pedal);
    bin.traverse((o) => {
      o.userData.station = 'bin';
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
    const spot = STATION_SPOTS.bin;
    bin.position.set(spot.x, 0, spot.z);
    this.scene.add(bin);
    this.pickables.push(bin);

    // Pans on the two front burners.
    for (const id of ['stove-l', 'stove-r']) {
      const s = STATION_SPOTS[id];
      const pan = model('pan_A');
      pan.position.set(s.x, s.y, s.z - 0.12);
      pan.scale.setScalar(0.8);
      this.scene.add(pan);
      const bar = new DonenessBar();
      bar.sprite.position.set(s.x, 2.35, s.z + 0.2);
      this.scene.add(bar.sprite);
      this.stoveItems.set(id, { obj: null, key: '', bar });
    }
    for (const id of ['board-l', 'board-r']) this.boardItems.set(id, { obj: null, key: '' });

    // A plate and colour-coded placemat for each chef on the island.
    for (const id of PLAYERS) {
      const s = STATION_SPOTS[`plate-${id}`];
      const group = new THREE.Group();
      group.position.set(s.x, s.y, s.z);
      const mat = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.9 });
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.5), mat);
      mattress.position.y = 0.01;
      mattress.receiveShadow = true;
      const plate = model('plate');
      plate.position.y = 0.02;
      const stack = new THREE.Group();
      stack.position.y = 0.1;
      group.add(mattress, plate, stack);
      group.traverse((o) => (o.userData.station = `plate-${id}`));
      this.scene.add(group);
      this.pickables.push(group);
      this.plates.set(id, { group, stack, mat, sig: '' });
    }

    // Floating station badges.
    const badgeSpots: [StationKind, number, number, number][] = [
      ['pantry', -3, 3.3, -3.5],
      ['board', -3.75, 2.0, -2],
      ['board', 3.75, 2.0, -2],
      ['stove', 0, 2.95, -3.4],
      ['pass', 0, 2.0, 3.8],
      ['bin', STATION_SPOTS.bin.x, 1.8, STATION_SPOTS.bin.z],
    ];
    for (const [kind, x, y, z] of badgeSpots) {
      const sprite = badgeSprite(BADGES[kind]!);
      sprite.position.set(x, y, z);
      this.scene.add(sprite);
      this.badges.push({ sprite, baseY: y, phase: Math.random() * 6 });
    }
  }

  update(state: GameState, me: PlayerId, dt: number, age: number) {
    const time = performance.now() / 1000;
    this.setJudging(state.phase === 'judging');

    // Chefs.
    PLAYERS.forEach((id, index) => {
      const chef = state.chefs[id];
      let view = this.chefs.get(id);
      if (!chef) {
        view?.dispose();
        this.chefs.delete(id);
        return;
      }
      if (!view) {
        view = new ChefModel(index, chef.color, id === me);
        view.x = chef.x;
        view.z = chef.z;
        view.dir = chef.dir;
        this.scene.add(view.root);
        this.chefs.set(id, view);
      }
      view.setColor(chef.color);
      if (this.judging) {
        // Line up behind the pass, facing the judge (camera).
        view.x = id === 'host' ? -1.5 : 1.5;
        view.z = 2.2;
        view.dir = 0;
        view.update(dt, { ...chef, x: view.x, z: view.z, dir: 0, speed: 0, busy: null, held: null }, 0);
      } else {
        view.pose = null;
        view.update(dt, chef, age);
        if (chef.speed > 3 && Math.random() < dt * 7) this.fx.emit('puff', new THREE.Vector3(view.x, 0.05, view.z));
      }
      if (chef.busy === 'chopping' && Math.random() < dt * 5 && chef.held) {
        const s = STATION_SPOTS[chef.busyAt!];
        this.fx.emitColored('bits', new THREE.Vector3(s.x, s.y + 0.15, s.z), 2, FOOD_COLORS[chef.held.kind] ?? '#f6c66b');
      }
      if (chef.served && !this.lastServed.get(id)) {
        const s = STATION_SPOTS.pass;
        this.fx.emit('sparkle', new THREE.Vector3(s.x, s.y + 0.6, s.z), 24);
      }
      this.lastServed.set(id, chef.served);
    });

    if (this.built) {
      this.updateStoves(state, dt);
      this.updateBoards(state);
      this.updatePlates(state);
      this.updatePassDishes(state);
    }

    for (const b of this.badges) b.sprite.position.y = b.baseY + Math.sin(time * 2 + b.phase) * 0.06;
    for (const b of this.badges) b.sprite.visible = !this.judging;

    if (this.markerT > 0) {
      this.markerT = Math.max(0, this.markerT - dt * 1.8);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = this.markerT * 0.9;
      this.marker.scale.setScalar(1 + (1 - this.markerT) * 0.7);
    }

    // Glide the camera between the kitchen view and the judging view.
    const k = 1 - Math.exp(-dt * 2.5);
    this.camPose.pos.lerp(this.camWant.pos, k);
    this.camPose.target.lerp(this.camWant.target, k);
    this.camPose.shift += (this.camWant.shift - this.camPose.shift) * k;
    this.camera.position.copy(this.camPose.pos);
    this.camera.lookAt(this.camPose.target);
    applyShift(this.camera, this.camPose.shift);

    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  celebrate() {
    for (let i = 0; i < 4; i++) setTimeout(() => this.fx.emit('confetti', new THREE.Vector3(0, 3.8, 3.2), 40), i * 250);
  }

  private updateStoves(state: GameState, dt: number) {
    let heat = 0;
    this.emitT += dt;
    const puffNow = this.emitT > 0.12;
    if (puffNow) this.emitT = 0;
    for (const [id, slot] of this.stoveItems) {
      const st = state.stations.find((s) => s.id === id)!;
      const item = st.item;
      const key = item ? itemModelName(item) : '';
      const spot = STATION_SPOTS[id];
      if (key !== slot.key) {
        if (slot.obj) this.scene.remove(slot.obj);
        slot.obj = null;
        slot.key = key;
        if (item) {
          slot.obj = model(key);
          slot.obj.position.set(spot.x, spot.y + 0.1, spot.z);
          slot.obj.scale.setScalar(0.85);
          this.scene.add(slot.obj);
        }
      }
      slot.bar.sprite.visible = !!item && !this.judging;
      if (!item || !slot.obj) continue;
      heat++;
      if (item.kind === 'patty') tintPatty(slot.obj, item.doneness);
      slot.bar.draw(item.doneness);
      if (puffNow) {
        const at = new THREE.Vector3(spot.x, spot.y + 0.3, spot.z);
        this.fx.emit(item.doneness > 1.2 ? 'smoke' : 'steam', at, 1);
      }
    }
    this.stoveLight.intensity += (heat * 3 * (0.85 + Math.random() * 0.3) - this.stoveLight.intensity) * Math.min(1, dt * 8);
  }

  private updateBoards(state: GameState) {
    for (const [id, slot] of this.boardItems) {
      const chef = Object.values(state.chefs).find((c) => c?.busy === 'chopping' && c.busyAt === id) as Chef | undefined;
      const key = chef?.held ? itemModelName(chef.held) : '';
      if (key === slot.key) continue;
      if (slot.obj) this.scene.remove(slot.obj);
      slot.obj = null;
      slot.key = key;
      if (!key) continue;
      const s = STATION_SPOTS[id];
      slot.obj = model(key);
      slot.obj.position.set(s.x, s.y + 0.08, s.z);
      slot.obj.scale.setScalar(0.8);
      this.scene.add(slot.obj);
    }
  }

  private updatePlates(state: GameState) {
    for (const id of PLAYERS) {
      const p = this.plates.get(id)!;
      const owner = state.chefs[id];
      p.group.visible = !!owner && !this.judging;
      if (owner) p.mat.color.set(owner.color).lerp(new THREE.Color('#ffffff'), 0.25);
      const items = state.plates[id];
      const sig = stackSignature(items, false);
      if (sig === p.sig) continue;
      const grew = items.length > (p.sig ? p.sig.split('|').length : 0);
      p.sig = sig;
      buildStack(p.stack, items, false);
      if (grew && !this.judging) {
        const top = p.stack.children[p.stack.children.length - 1];
        if (top) popIn(top);
        const s = STATION_SPOTS[`plate-${id}`];
        this.fx.emit('sparkle', new THREE.Vector3(s.x, s.y + 0.4, s.z), 8);
      }
    }
  }

  private updatePassDishes(state: GameState) {
    for (const id of PLAYERS) {
      let d = this.passDishes.get(id);
      if (!d) {
        const group = new THREE.Group();
        const plate = model('plate');
        const stack = new THREE.Group();
        stack.position.y = 0.1;
        group.add(plate, stack);
        group.position.set(id === 'host' ? -0.5 : 0.5, 1.0, 3.75);
        this.scene.add(group);
        d = { group, sig: '' };
        this.passDishes.set(id, d);
      }
      const chef = state.chefs[id];
      d.group.visible = !!chef && this.judging;
      if (!chef || !this.judging) continue;
      const items = state.plates[id];
      const sig = stackSignature(items, chef.served);
      if (sig === d.sig) continue;
      d.sig = sig;
      buildStack(d.group.children[1] as THREE.Group, items, chef.served);
    }
  }

  /** Chooses the judging pose once the scores are revealed. */
  setResultPose(id: PlayerId, pose: 'Cheer' | 'Sit_Floor_Idle' | 'Idle') {
    const v = this.chefs.get(id);
    if (!v) return;
    if (pose === 'Sit_Floor_Idle') v.playOnce('Sit_Floor_Down');
    v.pose = pose;
  }

  private setJudging(on: boolean) {
    if (on === this.judging) return;
    this.judging = on;
    if (!on) for (const v of this.chefs.values()) v.pose = null;
    this.resize();
  }

  /** Converts a screen tap into a floor position and (optionally) a station. */
  pick(clientX: number, clientY: number): Pick | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    if (hit) {
      let station: string = hit.object.userData.station;
      if (station === 'stove') station = hit.point.x < 0 ? 'stove-l' : 'stove-r';
      if (station === 'island') station = hit.point.x < 0 ? 'plate-host' : 'plate-guest';
      return { x: hit.point.x, z: hit.point.z, station };
    }
    const floorHit = this.raycaster.intersectObject(this.floor)[0];
    return floorHit ? { x: floorHit.point.x, z: floorHit.point.z, station: null } : null;
  }

  showMarker(x: number, z: number) {
    this.marker.position.x = x;
    this.marker.position.z = z;
    this.markerT = 1;
  }

  reset() {
    for (const v of this.chefs.values()) v.dispose();
    this.chefs.clear();
    this.lastServed.clear();
  }

  /** Screen position of a chef's head, for speech bubbles. */
  chefScreenPos(id: PlayerId): { x: number; y: number } | null {
    const v = this.chefs.get(id);
    if (!v) return null;
    const p = new THREE.Vector3(v.x, 2.9, v.z).project(this.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    if (this.judging) {
      // Close on the pass: both dishes in front, chefs behind, all above the scorecard.
      fitCamera(this.camera, this.camWant, 16, new THREE.Vector3(0, 1.5, 3.0), [
        [-2.3, 0.2, 2.2], [2.3, 0.2, 2.2], [-2.3, 3.0, 2.2], [2.3, 3.0, 2.2], [-1, 1, 4.2], [1, 1, 4.2],
      ], 0.07, judgeCardFraction());
    } else {
      const portrait = h > w;
      // On tall phones, trim the side walls a little so the kitchen is bigger.
      const sx = portrait ? 4.5 : 5.2;
      fitCamera(this.camera, this.camWant, portrait ? 62 : 52, new THREE.Vector3(0, 0, 0.2), [
        [-sx, 0, -5.2], [sx, 0, -5.2], [-sx, 0, 5], [sx, 0, 5], [-sx, 1.2, -5], [sx, 1.2, -5],
      ], portrait ? 0.14 : 0.12, 0.05);
    }
  }
}

/** Share of the screen height covered by the scorecard (it sits at the bottom). */
function judgeCardFraction() {
  const card = document.querySelector('.judge-card');
  const h = card?.getBoundingClientRect().height || window.innerHeight * 0.55;
  return Math.min(0.62, h / window.innerHeight + 0.03);
}

/**
 * Places the camera at `elevDeg` looking at `target`, pulled back until all
 * `points` fit on screen with room for the HUD at the top and bottom.
 */
function fitCamera(
  camera: THREE.PerspectiveCamera,
  out: CameraPose,
  elevDeg: number,
  target: THREE.Vector3,
  points: [number, number, number][],
  topMargin: number,
  bottomMargin: number,
) {
  const elev = THREE.MathUtils.degToRad(elevDeg);
  const dirV = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
  const test = camera.clone();
  // Centre the subject in the free band between the top and bottom margins.
  const shift = bottomMargin - topMargin;
  applyShift(test, shift);
  const fits = (d: number) => {
    test.position.copy(target).addScaledVector(dirV, d);
    test.lookAt(target);
    test.updateMatrixWorld();
    return points.every(([x, y, z]) => {
      const p = new THREE.Vector3(x, y, z).project(test);
      return Math.abs(p.x) <= 0.97 && p.y <= 1 - topMargin * 2 && p.y >= -1 + bottomMargin * 2;
    });
  };
  let lo = 2;
  let hi = 80;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  out.pos.copy(target).addScaledVector(dirV, hi);
  out.target.copy(target);
  out.shift = shift;
}

/** Shifts the image vertically by `shift` NDC units (an off-centre lens). */
function applyShift(camera: THREE.PerspectiveCamera, shift: number) {
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = -shift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function stackSignature(items: Item[], served: boolean) {
  return items.map((i) => itemModelName(i, true)).join('|') + (served ? '|top' : '');
}

/** Stacks plated items on top of each other like a real burger. */
function buildStack(group: THREE.Group, items: Item[], served: boolean) {
  group.clear();
  const names = items.map((i) => itemModelName(i, true));
  if (served && items.some((i) => i.kind === 'bun')) names.push('food_ingredient_bun_top');
  let y = 0;
  names.forEach((name, i) => {
    const h = modelHeight(name);
    const scale = 0.85;
    const obj = model(name);
    obj.scale.setScalar(scale);
    obj.position.y = y - h.min * scale;
    obj.rotation.y = (i * 0.7) % (Math.PI * 2);
    const item = items[i];
    if (item?.kind === 'patty') tintPatty(obj, item.doneness);
    group.add(obj);
    y += (h.max - h.min) * scale * 0.8;
  });
}

function popIn(obj: THREE.Object3D) {
  const target = obj.scale.x;
  const startY = obj.position.y;
  const t0 = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - t0) / 280);
    const e = 1 - Math.pow(1 - t, 3);
    obj.position.y = startY + (1 - e) * 0.5;
    obj.scale.setScalar(target * (0.6 + 0.4 * e + Math.sin(e * Math.PI) * 0.15));
    if (t < 1) requestAnimationFrame(tick);
  };
  tick();
}

/** Warm terracotta and cream tiles with grout and a little colour variation. */
function floorTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  const n = 8; // tiles per texture
  const px = 64;
  c.width = c.height = n * px;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b9a58c';
  ctx.fillRect(0, 0, c.width, c.height);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dark = (x + y) % 2 === 1;
      const v = (rand() - 0.5) * 14;
      const [r, g, b] = dark ? [196, 118, 82] : [240, 226, 202];
      ctx.fillStyle = `rgb(${r + v},${g + v},${b + v})`;
      ctx.beginPath();
      ctx.roundRect(x * px + 2, y * px + 2, px - 4, px - 4, 5);
      ctx.fill();
      // Soft sheen.
      const grad = ctx.createLinearGradient(x * px, y * px, x * px + px, y * px + px);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = grad;
      ctx.fillRect(x * px + 2, y * px + 2, px - 4, px - 4);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // One tile = 0.75 units.
  tex.repeat.set(12 / (n * 0.75), 11.5 / (n * 0.75));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function badgeSprite(emoji: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.arc(64, 68, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffaf2';
  ctx.beginPath();
  ctx.arc(64, 62, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '64px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.setScalar(0.62);
  sprite.renderOrder = 10;
  return sprite;
}

/** Floating raw → medium → burnt gauge above a burner. */
class DonenessBar {
  readonly sprite: THREE.Sprite;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private last = -1;

  constructor() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.sprite.scale.set(1.5, 0.375, 1);
    this.sprite.renderOrder = 11;
    this.sprite.visible = false;
  }

  draw(d: number) {
    if (Math.abs(d - this.last) < 0.004) return;
    this.last = d;
    const ctx = this.ctx;
    const W = 256, H = 64, pad = 12, top = 22, bh = 22;
    const max = 1.6;
    const x = (v: number) => pad + (Math.min(v, max) / max) * (W - pad * 2);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(30,20,14,0.85)';
    ctx.beginPath();
    ctx.roundRect(2, top - 8, W - 4, bh + 16, 16);
    ctx.fill();
    const g = ctx.createLinearGradient(pad, 0, W - pad, 0);
    g.addColorStop(0, '#d98a8a');
    g.addColorStop(0.45, '#c9a46b');
    g.addColorStop(0.62, '#59c06b');
    g.addColorStop(0.72, '#59c06b');
    g.addColorStop(0.88, '#d77a2a');
    g.addColorStop(1, '#3a2a22');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(pad, top, W - pad * 2, bh, 10);
    ctx.fill();
    // Perfect window.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x(0.85), top - 2, x(1.15) - x(0.85), bh + 4);
    // Needle.
    const nx = x(d);
    ctx.fillStyle = d >= BURNT_AT ? '#ff5a4a' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(nx - 9, 2);
    ctx.lineTo(nx + 9, 2);
    ctx.lineTo(nx, top + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(nx - 2, top, 4, bh);
    this.tex.needsUpdate = true;
  }
}
