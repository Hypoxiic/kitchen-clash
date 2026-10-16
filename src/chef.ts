import * as THREE from 'three';
import { centredModel, chefSource, cloneChef, itemModelName, model, tintItem } from './assets';
import type { Chef, Item } from './types';

const FADE = 0.22;
const RUN_THRESHOLD = 2.6;

/** Loops a chef settles into, picked from its state each frame. */
type BaseAnim = 'Idle' | 'Walking_A' | 'Running_A' | '1H_Melee_Attack_Chop' | 'Use_Item' | 'Interact' | 'Cheer' | 'Sit_Floor_Idle';

/**
 * One animated chef: a KayKit character with a chef's hat, an apron in the
 * player's colour, blended animations and whatever they're carrying.
 */
export class ChefModel {
  readonly root = new THREE.Group();
  private body: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private base: BaseAnim | null = null;
  private oneShot: THREE.AnimationAction | null = null;
  private lastEmote = -1;
  private apronMat: THREE.MeshStandardMaterial;
  private ring: THREE.Mesh;
  private handSlot: THREE.Object3D;
  private held: THREE.Object3D | null = null;
  private heldKey = '';
  private knife: THREE.Object3D;
  private handScale = 1;
  /** Smoothed render state. */
  x = 0;
  z = 0;
  dir = 0;
  private moveSpeed = 0;
  /** Set during judging to override the state-driven loop. */
  pose: BaseAnim | null = null;

  constructor(index: number, color: string, isMe: boolean) {
    this.body = cloneChef(index);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    this.root.add(this.body);

    this.mixer = new THREE.AnimationMixer(this.body);
    for (const clip of chefSource(index).animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.oneShot) {
        this.oneShot.fadeOut(FADE);
        this.oneShot = null;
        const base = this.base && this.actions.get(this.base);
        base?.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(FADE).play();
      }
    });

    const head = this.body.getObjectByName('head')!;
    const chest = this.body.getObjectByName('chest')!;
    // GLTFLoader strips dots from node names ("handslot.r" -> "handslotr").
    this.handSlot = this.body.getObjectByName('handslotr')!;

    this.body.updateMatrixWorld(true);
    let headMesh: THREE.Object3D = head;
    this.body.traverse((o) => {
      if (/_Head$/.test(o.name)) headMesh = o;
    });
    const headTop = new THREE.Box3().setFromObject(headMesh).max.y;
    attachAt(head, chefHat(), new THREE.Vector3(0, headTop - 0.14, 0));

    this.apronMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    attachAt(chest, apronMesh(this.apronMat), new THREE.Vector3(0, 0.8, 0.34));

    this.handScale = 1 / this.handSlot.getWorldScale(new THREE.Vector3()).x;
    this.knife = model('knife');
    this.knife.scale.setScalar(0.7 * this.handScale);
    this.knife.rotation.set(Math.PI / 2, 0, 0);
    this.knife.visible = false;
    this.handSlot.add(this.knife);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, isMe ? 0.62 : 0.56, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isMe ? 0.85 : 0.45, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);

    this.setBase('Idle');
  }

  setColor(color: string) {
    this.apronMat.color.set(color);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(color);
  }

  /** Smoothly follows the latest network state and picks animations. */
  update(dt: number, chef: Chef, age: number) {
    // Extrapolate a little along the reported motion to hide network gaps.
    const lead = Math.min(age, 0.12);
    const px = chef.x + Math.sin(chef.dir) * chef.speed * lead;
    const pz = chef.z + Math.cos(chef.dir) * chef.speed * lead;
    const k = 1 - Math.exp(-dt * 16);
    const dx = px - this.x;
    const dz = pz - this.z;
    if (Math.hypot(dx, dz) > 2.5) {
      this.x = px;
      this.z = pz;
    } else {
      this.x += dx * k;
      this.z += dz * k;
    }
    this.dir = lerpAngle(this.dir, chef.dir, 1 - Math.exp(-dt * 12));
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.dir;
    this.moveSpeed += (chef.speed - this.moveSpeed) * (1 - Math.exp(-dt * 10));

    if (chef.emote.seq !== this.lastEmote) {
      if (this.lastEmote >= 0 && chef.emote.name) this.playOnce(chef.emote.name);
      this.lastEmote = chef.emote.seq;
    }

    const chopping = chef.busy === 'chopping';
    // While chopping or torching, the food sits on the counter instead of in hand.
    const handsBusy = chopping || chef.busy === 'torching';
    this.knife.visible = chopping;
    let want: BaseAnim = 'Idle';
    if (this.pose) want = this.pose;
    else if (chopping) want = '1H_Melee_Attack_Chop';
    else if (chef.busy === 'reading' || chef.busy === 'torching') want = 'Use_Item';
    else if (chef.busy === 'store' || chef.busy === 'stirring') want = 'Interact';
    else if (this.moveSpeed > RUN_THRESHOLD) want = 'Running_A';
    else if (this.moveSpeed > 0.25) want = 'Walking_A';
    this.setBase(want);

    const act = this.base && this.actions.get(this.base);
    if (act) {
      if (want === 'Running_A') act.timeScale = THREE.MathUtils.clamp(this.moveSpeed / 4.2, 0.7, 1.2);
      else if (want === 'Walking_A') act.timeScale = THREE.MathUtils.clamp(this.moveSpeed / 1.6, 0.6, 1.4);
      else act.timeScale = 1;
    }

    this.setHeld(handsBusy ? null : chef.held);
    this.mixer.update(dt);
  }

  private setBase(name: BaseAnim) {
    if (this.base === name) return;
    const next = this.actions.get(name);
    const prev = this.base && this.actions.get(this.base);
    this.base = name;
    if (!next || this.oneShot) return;
    // One-shots can share a clip with a loop (e.g. Interact), so always restore looping.
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(FADE).play();
    prev?.fadeOut(FADE);
  }

  playOnce(name: string) {
    const act = this.actions.get(name);
    if (!act) return;
    const base = this.base && this.actions.get(this.base);
    this.oneShot?.fadeOut(0.1);
    act.reset().setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.timeScale = name === 'PickUp' || name === 'Interact' ? 1.6 : 1;
    act.fadeIn(0.12).play();
    base?.fadeOut(0.12);
    this.oneShot = act;
  }

  private setHeld(item: Item | null) {
    const key = item ? `${itemModelName(item)}:${item.melt >= 0}:${Math.round(item.doneness * 10)}` : '';
    if (key === this.heldKey) return;
    this.heldKey = key;
    if (this.held) this.handSlot.remove(this.held);
    this.held = null;
    if (!item) return;
    const m = centredModel(itemModelName(item), item.kind === 'stew' ? 0.8 : 0.55);
    tintItem(m, item);
    m.scale.multiplyScalar(this.handScale);
    m.position.set(0, 0.05 * this.handScale, 0.15 * this.handScale);
    this.handSlot.add(m);
    this.held = m;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}

function chefHat(): THREE.Object3D {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.9 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.26, 24), white);
  band.position.y = 0.13;
  g.add(band);
  const puffs: [number, number, number, number][] = [
    [0, 0.42, 0, 0.36],
    [0.2, 0.36, 0.1, 0.26],
    [-0.2, 0.36, 0.1, 0.26],
    [0.12, 0.38, -0.18, 0.26],
    [-0.12, 0.38, -0.18, 0.26],
  ];
  for (const [x, y, z, r] of puffs) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), white);
    p.position.set(x, y, z);
    g.add(p);
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

function apronMesh(mat: THREE.Material): THREE.Object3D {
  const g = new THREE.Group();
  // A gently curved bib + skirt.
  const shape = new THREE.Shape();
  shape.moveTo(-0.22, 0.32);
  shape.lineTo(0.22, 0.32);
  shape.lineTo(0.3, 0.02);
  shape.lineTo(0.42, -0.45);
  shape.quadraticCurveTo(0, -0.55, -0.42, -0.45);
  shape.lineTo(-0.3, 0.02);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) - x * x * 0.55);
  }
  geo.computeVertexNormals();
  const apron = new THREE.Mesh(geo, mat);
  apron.castShadow = true;
  g.add(apron);
  const pocket = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.14, 0.02),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.35 }),
  );
  pocket.position.set(0, -0.18, 0.06);
  g.add(pocket);
  return g;
}

/** Parents `obj` to a bone so it sits at `worldPos`, upright, in the bind pose. */
function attachAt(bone: THREE.Object3D, obj: THREE.Object3D, worldPos: THREE.Vector3) {
  bone.add(obj);
  obj.position.copy(bone.worldToLocal(worldPos.clone()));
  obj.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  const s = bone.getWorldScale(new THREE.Vector3());
  obj.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
