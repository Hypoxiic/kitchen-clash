import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { centredModel, counterMaterial, itemModelName, model, tintItem, wallMaterial } from './assets';
import { ChefModel } from './chef';
import { blowtorch, chalkboard, fridgeCurtain, roomFrontWall, sacks, themeDecor } from './decor';
import { Fx } from './fx';
import { makeStations, PROPS, ROOMS, SIGNS, SPOT_COLORS, STATION_SPOTS } from './layout';
import { BURNT_AT, RECIPES, type Recipe } from './recipes';
import { drawFloor, drawIceTiles, drawPlanks, THEMES, type Theme } from './themes';
import type { Chef, GameState, Item, PlayerId, Station } from './types';

export interface Pick {
  x: number;
  z: number;
  station: string | null;
}

const PLAYERS: PlayerId[] = ['host', 'guest'];
const FOOD_COLORS: Record<string, string> = {
  tomato: '#e5483b', lettuce: '#7cc355', cheese: '#f6c445', onion: '#e9d4f2', carrot: '#f08a2c', potato: '#e3c48c',
};

interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** Vertical lens shift in NDC units, so the subject can sit above/below centre. */
  shift: number;
}

interface SignView {
  sprite: THREE.Sprite;
  stations: string[];
  baseY: number;
  baseScale: THREE.Vector2;
  phase: number;
  glow: number;
}

interface Slot {
  obj: THREE.Object3D | null;
  key: string;
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
  private floorPick: THREE.Mesh;
  private chefs = new Map<PlayerId, ChefModel>();
  private fx = new Fx();
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private stoveLight: THREE.PointLight;
  private marker: THREE.Mesh;
  private markerT = 0;
  private built = false;
  private time = 0;
  private emitT = 0;

  // Theme-dependent parts.
  private themeId = '';
  private kitchenFloor!: THREE.MeshStandardMaterial;
  private counterMeshes: THREE.Mesh[] = [];
  private wallMeshes: THREE.Mesh[] = [];
  private lowWallMat = new THREE.MeshStandardMaterial({ color: '#fff2dc', roughness: 0.9 });
  private decor: THREE.Group | null = null;

  // Dynamic station visuals.
  private signs: SignView[] = [];
  private spots = new Map<string, THREE.Mesh>();
  private grill = new Map<string, Slot & { bar: GaugeBar }>();
  private pots = new Map<string, { empty: THREE.Object3D; full: THREE.Object3D; bar: GaugeBar }>();
  private boards = new Map<string, Slot>();
  private torchSlot: Slot = { obj: null, key: '' };
  private torchProp: THREE.Object3D | null = null;
  private plates = new Map<PlayerId, { group: THREE.Group; dish: THREE.Group; mat: THREE.MeshStandardMaterial; tag: NameTag; sig: string }>();
  private passDishes = new Map<PlayerId, { group: THREE.Group; dish: THREE.Group; sig: string }>();
  private curtain: THREE.Mesh[] = [];
  private board = chalkboard();
  private recipeId = '';
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

    this.hemi = new THREE.HemisphereLight('#fff1dc', '#7a5a44', 1.1);
    this.sun = new THREE.DirectionalLight('#ffe0b5', 2.6);
    this.sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    Object.assign(this.sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 });
    this.sun.target.position.set(0, 0, -2);
    this.fill = new THREE.DirectionalLight('#cfe0ff', 0.55);
    this.fill.position.set(-6, 8, 10);
    this.stoveLight = new THREE.PointLight('#ff8a3d', 0, 5, 1.6);
    this.stoveLight.position.set(0, 1.7, -2.9);
    // Cool light in the walk-in fridge, warm in the pantry.
    const fridgeLight = new THREE.PointLight('#9fd8ff', 7, 7, 1.4);
    fridgeLight.position.set(2.6, 3, -7);
    const pantryLight = new THREE.PointLight('#ffd49a', 3.5, 7, 1.4);
    pantryLight.position.set(-2.6, 3, -7);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.stoveLight, fridgeLight, pantryLight);

    // Invisible floor plane for tap-to-walk.
    this.floorPick = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ visible: false }));
    this.floorPick.rotation.x = -Math.PI / 2;
    this.scene.add(this.floorPick);

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
    const add = (o: THREE.Object3D, station?: string) => {
      if (station) {
        o.traverse((c) => (c.userData.station = station));
        this.pickables.push(o);
      }
      this.scene.add(o);
      return o;
    };

    // Floors: themed tiles in the kitchen, planks in the pantry, icy tiles in the fridge.
    this.kitchenFloor = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const kitchen = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 10.3), this.kitchenFloor);
    kitchen.rotation.x = -Math.PI / 2;
    kitchen.position.set(0, 0, 0.6);
    kitchen.receiveShadow = true;
    this.scene.add(kitchen);
    const roomFloor = (canvas: HTMLCanvasElement, x: number, room: string) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2.5, 2.5);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 5.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x, 0.001, -7.05);
      floor.receiveShadow = true;
      add(floor, room);
    };
    roomFloor(drawPlanks(), -2.55, 'store-pantry');
    roomFloor(drawIceTiles(), 2.55, 'store-fridge');
    const lip = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: '#7a4f31', roughness: 0.7 }));
    lip.position.set(0, 0.04, 5.75);
    this.scene.add(lip);

    for (const p of PROPS) {
      const obj = model(p.model);
      obj.position.set(p.x, p.y ?? 0, p.z);
      obj.rotation.y = p.rot ?? 0;
      obj.scale.setScalar(p.scale ?? 1);
      if (p.role) {
        obj.traverse((o) => {
          if (o instanceof THREE.Mesh) (p.role === 'counter' ? this.counterMeshes : this.wallMeshes).push(o);
        });
      }
      add(obj, p.station);
    }

    add(roomFrontWall(this.lowWallMat));
    const curtain = fridgeCurtain();
    this.curtain = curtain.strips;
    add(curtain.group);
    const flour = sacks();
    flour.position.set(-4.45, 0, -8.1);
    add(flour, 'store-pantry');

    // Blowtorch station.
    const torch = blowtorch();
    const ts = STATION_SPOTS.torch;
    torch.position.set(ts.x, ts.y, ts.z - 0.1);
    torch.rotation.y = Math.PI / 2;
    this.torchProp = torch.userData.torch as THREE.Object3D;
    add(torch, 'torch');

    // Pedal bin.
    const bin = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#8d969c', metalness: 0.6, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 1.0, 28), metal);
    body.position.y = 0.5;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 28), metal);
    lid.position.y = 1.04;
    bin.add(body, lid);
    bin.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
    bin.position.set(STATION_SPOTS.bin.x, 0, STATION_SPOTS.bin.z);
    add(bin, 'bin');

    // Pans on the two front burners, with doneness gauges.
    for (const id of ['stove-l', 'stove-r']) {
      const s = STATION_SPOTS[id];
      const pan = model('pan_A');
      pan.position.set(s.x, s.y, s.z - 0.12);
      pan.scale.setScalar(0.8);
      add(pan, id);
      const bar = new GaugeBar();
      bar.sprite.position.set(s.x, 2.05, s.z + 0.3);
      this.scene.add(bar.sprite);
      this.grill.set(id, { obj: null, key: '', bar });
    }

    // Two stew pots on the cooktop (an empty one, and one with stew in it shown when full).
    for (const id of ['pot-a', 'pot-b']) {
      const s = STATION_SPOTS[id];
      const empty = model('pot_A');
      const full = model('pot_A_stew');
      for (const p of [empty, full]) {
        p.scale.setScalar(0.72);
        p.position.set(s.x, s.y, s.z);
        p.rotation.y = Math.PI / 2;
        add(p, id);
      }
      full.visible = false;
      const bar = new GaugeBar();
      bar.sprite.position.set(s.x - 0.5, 2.05, s.z);
      bar.sprite.scale.multiplyScalar(0.8);
      this.scene.add(bar.sprite);
      this.pots.set(id, { empty, full, bar });
    }
    for (const id of ['board-l', 'board-r']) this.boards.set(id, { obj: null, key: '' });

    // A plate, colour-coded placemat and name tag for each chef on the island.
    for (const id of PLAYERS) {
      const s = STATION_SPOTS[`plate-${id}`];
      const group = new THREE.Group();
      group.position.set(s.x, s.y, s.z);
      const mat = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.9 });
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.02, 1.6), mat);
      mattress.position.y = 0.01;
      mattress.receiveShadow = true;
      const plate = model('plate');
      plate.position.y = 0.02;
      const dish = new THREE.Group();
      dish.position.y = 0.1;
      group.add(mattress, plate, dish);
      add(group, 'island');
      const tag = new NameTag();
      tag.sprite.position.set(s.x, 1.85, s.z);
      this.scene.add(tag.sprite);
      this.plates.set(id, { group, dish, mat, tag, sig: '' });
    }

    // Floating signs and floor work spots so every station is easy to find.
    for (const sign of SIGNS) {
      const sprite = signSprite(sign.label, sign.emoji, sign.color);
      // Bigger on tall phone screens, where the whole kitchen is drawn smaller.
      if (window.innerHeight > window.innerWidth) sprite.scale.multiplyScalar(1.3);
      sprite.position.set(sign.x, sign.y, sign.z);
      this.scene.add(sprite);
      this.signs.push({ sprite, stations: sign.stations, baseY: sign.y, baseScale: new THREE.Vector2(sprite.scale.x, sprite.scale.y), phase: Math.random() * 6, glow: 0 });
    }
    for (const st of makeStations()) {
      if (st.kind === 'plate') continue;
      const decal = spotDecal(SPOT_COLORS[st.kind] ?? '#ffffff');
      decal.position.set(st.ax, 0.012, st.az);
      this.scene.add(decal);
      this.spots.set(st.id, decal);
    }

    // Today's dish on a chalkboard at the front.
    this.board.group.position.set(4.35, 0, 3.9);
    this.board.group.rotation.y = -0.5;
    this.scene.add(this.board.group);

    this.applyTheme('cottage');
  }

  /** Repaints the kitchen for a theme: floor, walls, counters, lighting and decor. */
  applyTheme(id: string) {
    if (!this.built || id === this.themeId) return;
    const theme: Theme = THEMES[id] ?? THEMES.cottage;
    this.themeId = theme.id;

    const { canvas, units } = drawFloor(theme.floor);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10.6 / units, 10.3 / units);
    tex.anisotropy = 4;
    this.kitchenFloor.map?.dispose();
    this.kitchenFloor.map = tex;
    this.kitchenFloor.roughness = theme.floorRoughness;
    this.kitchenFloor.needsUpdate = true;

    const counter = counterMaterial(theme);
    if (counter) for (const m of this.counterMeshes) m.material = counter;
    const wall = wallMaterial(theme);
    if (wall) for (const m of this.wallMeshes) m.material = wall;
    this.lowWallMat.color.set(theme.wall).multiplyScalar(0.95);

    this.scene.background = new THREE.Color(theme.background);
    this.renderer.toneMappingExposure = theme.exposure;
    this.hemi.color.set(theme.hemi.sky);
    this.hemi.groundColor.set(theme.hemi.ground);
    this.hemi.intensity = theme.hemi.intensity;
    this.sun.color.set(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    this.sun.position.set(theme.sun.x, theme.sun.y, theme.sun.z);
    this.fill.color.set(theme.fill.color);
    this.fill.intensity = theme.fill.intensity;

    if (this.decor) this.scene.remove(this.decor);
    this.decor = themeDecor(theme).group;
    this.scene.add(this.decor);
  }

  update(state: GameState, me: PlayerId, dt: number, age: number, highlights: string[] = []) {
    this.time += dt;
    if (state.theme) this.applyTheme(state.theme);
    if (this.built && state.recipe && state.recipe !== this.recipeId) {
      this.recipeId = state.recipe;
      const r = RECIPES[state.recipe];
      if (r) this.board.setDish(r.emoji, r.name);
    }
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
        view.z = 2.7;
        view.dir = 0;
        view.update(dt, { ...chef, x: view.x, z: view.z, dir: 0, speed: 0, busy: null, held: null }, 0);
      } else {
        view.pose = null;
        view.update(dt, chef, age);
        if (chef.speed > 3 && Math.random() < dt * 7) this.fx.emit('puff', new THREE.Vector3(view.x, 0.05, view.z));
      }
      if (chef.busy === 'chopping' && chef.held && Math.random() < dt * 5) {
        const s = STATION_SPOTS[chef.busyAt!];
        this.fx.emitColored('bits', new THREE.Vector3(s.x, s.y + 0.15, s.z), 2, FOOD_COLORS[chef.held.kind] ?? '#f6c66b');
      }
      if (chef.busy === 'torching' && Math.random() < dt * 14) {
        const s = STATION_SPOTS.torch;
        this.fx.emitColored('sparkle', new THREE.Vector3(s.x, s.y + 0.25, s.z), 1, Math.random() < 0.5 ? '#8fc4ff' : '#ffb347');
      }
      if (chef.served && !this.lastServed.get(id)) {
        const s = STATION_SPOTS.pass;
        this.fx.emit('sparkle', new THREE.Vector3(s.x, s.y + 0.6, s.z), 24);
      }
      this.lastServed.set(id, chef.served);
    });

    if (this.built) {
      this.updateGrill(state, dt);
      this.updatePots(state);
      this.updateBoards(state);
      this.updateTorch(state);
      this.updatePlates(state, me);
      this.updatePassDishes(state);
      this.updateSigns(highlights);
      this.updateCurtain(dt);
      if (Math.random() < dt * 3) {
        this.fx.emit('steam', new THREE.Vector3(0.8 + Math.random() * 3.6, 0.05, -7.6 + Math.random() * 2.4), 1);
      }
    }

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
    for (let i = 0; i < 4; i++) setTimeout(() => this.fx.emit('confetti', new THREE.Vector3(0, 3.8, 3.8), 40), i * 250);
  }

  private station(state: GameState, id: string): Station | undefined {
    return state.stations.find((s) => s.id === id);
  }

  private updateGrill(state: GameState, dt: number) {
    let heat = 0;
    this.emitT += dt;
    const puffNow = this.emitT > 0.12;
    if (puffNow) this.emitT = 0;
    for (const [id, slot] of this.grill) {
      const item = this.station(state, id)?.item ?? null;
      const spot = STATION_SPOTS[id];
      const key = item ? `${itemModelName(item)}:${Math.round(item.doneness * 20)}` : '';
      if (key !== slot.key) {
        if (slot.obj) this.scene.remove(slot.obj);
        slot.obj = null;
        slot.key = key;
        if (item) {
          slot.obj = centredModel(itemModelName(item), item.kind === 'steak' ? 0.6 : 0.8);
          tintItem(slot.obj, item);
          slot.obj.position.set(spot.x, spot.y + 0.1, spot.z);
          this.scene.add(slot.obj);
        }
      }
      slot.bar.sprite.visible = !!item && !this.judging;
      if (!item) continue;
      heat++;
      slot.bar.draw(item.doneness);
      if (puffNow) this.fx.emit(item.doneness > 1.2 ? 'smoke' : 'steam', new THREE.Vector3(spot.x, spot.y + 0.3, spot.z), 1);
    }
    for (const [id, pot] of this.pots) {
      const st = this.station(state, id);
      if (st?.pot.length) {
        heat += 0.5;
        if (puffNow && Math.random() < 0.6) {
          const s = STATION_SPOTS[id];
          this.fx.emit(st.cook > 1.25 ? 'smoke' : 'steam', new THREE.Vector3(s.x, s.y + 0.35, s.z), 1);
        }
      }
      void pot;
    }
    this.stoveLight.intensity += (heat * 3 * (0.85 + Math.random() * 0.3) - this.stoveLight.intensity) * Math.min(1, dt * 8);
  }

  private updatePots(state: GameState) {
    for (const [id, pot] of this.pots) {
      const st = this.station(state, id);
      const has = !!st?.pot.length;
      pot.empty.visible = !has;
      pot.full.visible = has;
      pot.bar.sprite.visible = has && !this.judging;
      if (has) pot.bar.draw(st!.cook);
    }
  }

  private updateBoards(state: GameState) {
    for (const [id, slot] of this.boards) {
      const chef = Object.values(state.chefs).find((c) => c?.busy === 'chopping' && c.busyAt === id) as Chef | undefined;
      this.showOnSpot(slot, chef?.held ?? null, STATION_SPOTS[id], 0.75);
    }
  }

  private updateTorch(state: GameState) {
    const chef = Object.values(state.chefs).find((c) => c?.busy === 'torching') as Chef | undefined;
    this.showOnSpot(this.torchSlot, chef?.held ?? null, STATION_SPOTS.torch, 0.7);
    if (this.torchProp) this.torchProp.visible = !chef;
  }

  /** Keeps one food model on a counter spot in sync with an item. */
  private showOnSpot(slot: Slot, item: Item | null, spot: { x: number; y: number; z: number }, scale: number) {
    const key = item ? itemModelName(item) : '';
    if (key === slot.key) return;
    if (slot.obj) this.scene.remove(slot.obj);
    slot.obj = null;
    slot.key = key;
    if (!item) return;
    slot.obj = centredModel(key, scale);
    tintItem(slot.obj, item);
    slot.obj.position.set(spot.x, spot.y + 0.06, spot.z);
    this.scene.add(slot.obj);
  }

  private updatePlates(state: GameState, me: PlayerId) {
    const recipe = RECIPES[state.recipe];
    for (const id of PLAYERS) {
      const p = this.plates.get(id)!;
      const owner = state.chefs[id];
      p.group.visible = !!owner && !this.judging;
      p.tag.sprite.visible = !!owner && !this.judging;
      if (owner) {
        p.mat.color.set(owner.color).lerp(new THREE.Color('#ffffff'), 0.2);
        p.tag.set(id === me ? 'Your plate' : `${owner.name}'s`, owner.color);
      }
      const items = state.plates[id];
      const sig = dishSignature(items, false);
      if (sig === p.sig || !recipe) continue;
      const grew = items.length > (p.sig ? p.sig.split('|').length - 1 : 0);
      p.sig = sig;
      buildDish(p.dish, items, recipe, false);
      if (grew && !this.judging) {
        const top = p.dish.children[p.dish.children.length - 1];
        if (top) popIn(top);
        const s = STATION_SPOTS[`plate-${id}`];
        this.fx.emit('sparkle', new THREE.Vector3(s.x, s.y + 0.4, s.z), 8);
      }
    }
  }

  private updatePassDishes(state: GameState) {
    const recipe = RECIPES[state.recipe];
    for (const id of PLAYERS) {
      let d = this.passDishes.get(id);
      if (!d) {
        const group = new THREE.Group();
        const plate = model('plate');
        const dish = new THREE.Group();
        dish.position.y = 0.1;
        group.add(plate, dish);
        group.position.set(id === 'host' ? -0.5 : 0.5, 1.0, 4.3);
        this.scene.add(group);
        d = { group, dish, sig: '' };
        this.passDishes.set(id, d);
      }
      const chef = state.chefs[id];
      d.group.visible = !!chef && this.judging;
      if (!chef || !this.judging || !recipe) continue;
      const sig = dishSignature(state.plates[id], chef.served);
      if (sig === d.sig) continue;
      d.sig = sig;
      buildDish(d.dish, state.plates[id], recipe, chef.served);
    }
  }

  private updateSigns(highlights: string[]) {
    for (const s of this.signs) {
      const on = !this.judging && s.stations.some((id) => highlights.includes(id));
      s.glow += ((on ? 1 : 0) - s.glow) * 0.15;
      const pulse = 1 + s.glow * (0.18 + Math.sin(this.time * 6) * 0.08);
      s.sprite.scale.set(s.baseScale.x * pulse, s.baseScale.y * pulse, 1);
      s.sprite.position.y = s.baseY + Math.sin(this.time * 2 + s.phase) * 0.05 + s.glow * 0.15;
      (s.sprite.material as THREE.SpriteMaterial).opacity = this.judging ? 0 : 0.82 + s.glow * 0.18;
    }
    for (const [id, decal] of this.spots) {
      const on = !this.judging && highlights.includes(id);
      const m = decal.material as THREE.MeshBasicMaterial;
      m.opacity = this.judging ? 0 : on ? 0.75 + Math.sin(this.time * 6) * 0.2 : 0.35;
      decal.scale.setScalar(on ? 1.08 : 1);
    }
  }

  /** Fridge curtain strips swing aside when a chef walks through. */
  private updateCurtain(dt: number) {
    for (const strip of this.curtain) {
      let want = 0;
      for (const v of this.chefs.values()) {
        const dx = Math.abs(v.x - strip.position.x);
        const dz = v.z - strip.position.z;
        if (dx < 0.55 && Math.abs(dz) < 0.7) want = (dz > 0 ? 1 : -1) * 0.9 * (1 - dx / 0.55);
      }
      strip.rotation.x += (want - strip.rotation.x) * Math.min(1, dt * 8);
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
      if (station === 'pot') station = hit.point.z < 0.65 ? 'pot-a' : 'pot-b';
      return { x: hit.point.x, z: hit.point.z, station };
    }
    const floorHit = this.raycaster.intersectObject(this.floorPick)[0];
    if (!floorHit) return null;
    const { x, z } = floorHit.point;
    // Tapping the floor of a walk-in room means "go to its shelves".
    for (const [id, r] of Object.entries(ROOMS)) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return { x, z, station: `store-${id}` };
    }
    return { x, z, station: null };
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

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    if (this.judging) {
      // Close on the pass: both dishes in front, chefs behind, all above the scorecard.
      fitCamera(this.camera, this.camWant, 16, new THREE.Vector3(0, 1.5, 3.6), [
        [-2.3, 0.2, 2.7], [2.3, 0.2, 2.7], [-2.3, 3.0, 2.7], [2.3, 3.0, 2.7], [-1, 1, 4.8], [1, 1, 4.8],
      ], 0.07, judgeCardFraction());
    } else {
      const portrait = h > w;
      // On tall phones, trim the side walls a little so the kitchen is bigger.
      const sx = portrait ? 4.6 : 5.3;
      fitCamera(this.camera, this.camWant, portrait ? 60 : 52, new THREE.Vector3(0, 0, -1.8), [
        [-sx, 0, -9.6], [sx, 0, -9.6], [-sx, 0, 5.6], [sx, 0, 5.6], [-sx, 1.0, -9.6], [sx, 1.0, -9.6],
      ], portrait ? 0.13 : 0.11, portrait ? 0.1 : 0.06);
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
  let hi = 90;
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

function dishSignature(items: Item[], served: boolean) {
  return items.map((i) => `${itemModelName(i, true)}:${i.melt >= 0 ? 'm' : ''}${Math.round(i.doneness * 10)}`).join('|') + (served ? '|top' : '|');
}

/** Where each part of a plated (non-stacked) dish sits on the plate. */
const PLATE_SLOTS: Partial<Record<string, [number, number]>> = {
  mash: [-0.12, 0.08],
  steak: [0.05, -0.02],
  carrot: [0.2, 0.22],
};

/** Builds a dish on a plate: a neat centred stack (burgers), arranged parts, or a bowl. */
function buildDish(group: THREE.Group, items: Item[], recipe: Recipe, served: boolean) {
  group.clear();
  if (recipe.plating === 'stack') {
    const layers: { name: string; item: Item | null }[] = items.map((i) => ({ name: itemModelName(i, true), item: i }));
    if (served && recipe.topBun && items.some((i) => i.kind === 'bun')) layers.push({ name: 'food_ingredient_bun_top', item: null });
    let y = 0;
    layers.forEach(({ name, item }, i) => {
      const obj = centredModel(name, 0.85);
      if (item) tintItem(obj, item);
      obj.position.y = y;
      // A tiny twist per layer looks hand-made without going lopsided.
      obj.rotation.y = ((i * 37) % 7) * 0.06 - 0.18;
      group.add(obj);
      y += (obj.userData.height as number) * obj.scale.y * 0.78;
    });
    return;
  }
  // Plated or bowl dishes: known parts go to their spot, anything else piles in the middle.
  const heights = new Map<string, number>();
  for (const item of items) {
    const name = itemModelName(item, true);
    const scale = item.kind === 'stew' ? 1 : item.kind === 'steak' ? 0.5 : item.kind === 'carrot' || item.kind === 'onion' || item.kind === 'potato' ? 0.35 : 0.6;
    const obj = centredModel(name, scale);
    tintItem(obj, item);
    const slot = recipe.plating === 'plate' ? PLATE_SLOTS[item.kind] : undefined;
    const key = slot ? item.kind : 'centre';
    const [x, z] = slot ?? [0, 0];
    const base = heights.get(key) ?? (item.kind === 'steak' ? (heights.get('mash') ?? 0) * 0.6 : 0);
    obj.position.set(x, base, z);
    heights.set(key, base + (obj.userData.height as number) * 0.8);
    group.add(obj);
  }
}

function popIn(obj: THREE.Object3D) {
  const target = obj.scale.clone();
  const startY = obj.position.y;
  const t0 = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - t0) / 280);
    const e = 1 - Math.pow(1 - t, 3);
    obj.position.y = startY + (1 - e) * 0.5;
    obj.scale.copy(target).multiplyScalar(0.6 + 0.4 * e + Math.sin(e * Math.PI) * 0.15);
    if (t < 1) requestAnimationFrame(tick);
    else {
      obj.position.y = startY;
      obj.scale.copy(target);
    }
  };
  tick();
}

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

/** A rounded label sign: coloured pill with an emoji and the station's name. */
function signSprite(label: string, emoji: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 112;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.roundRect(8, 14, 304, 92, 46);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(6, 6, 304, 92, 46);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#fffaf2';
  ctx.beginPath();
  ctx.arc(54, 52, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `46px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 54, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 46px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 104, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.9, 0.665, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Soft rounded square on the floor marking where to stand. */
function spotDecal(color: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.roundRect(10, 10, 108, 108, 26);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.setLineDash([14, 10]);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.35 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Small floating tag over each plate ("Your plate" / "Sam's"). */
class NameTag {
  readonly sprite: THREE.Sprite;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private key = '';

  constructor() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.sprite.scale.set(1.0, 0.25, 1);
    this.sprite.renderOrder = 9;
  }

  set(text: string, color: string) {
    const key = text + color;
    if (key === this.key) return;
    this.key = key;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '700 30px system-ui, sans-serif';
    const w = Math.min(244, ctx.measureText(text).width + 34);
    ctx.fillStyle = 'rgba(30,22,16,0.8)';
    ctx.beginPath();
    ctx.roundRect(128 - w / 2, 8, w, 48, 24);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(128 - w / 2 + 20, 32, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128 + 8, 33);
    this.tex.needsUpdate = true;
  }
}

/** Floating raw → perfect → burnt gauge above a burner or pot. */
class GaugeBar {
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
    this.sprite.scale.set(1.3, 0.325, 1);
    this.sprite.renderOrder = 11;
    this.sprite.visible = false;
  }

  draw(d: number) {
    if (Math.abs(d - this.last) < 0.004) return;
    this.last = d;
    const ctx = this.ctx;
    const W = 256, pad = 12, top = 22, bh = 22;
    const max = 1.6;
    const x = (v: number) => pad + (Math.min(v, max) / max) * (W - pad * 2);
    ctx.clearRect(0, 0, W, 64);
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
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x(0.85), top - 2, x(1.15) - x(0.85), bh + 4);
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
