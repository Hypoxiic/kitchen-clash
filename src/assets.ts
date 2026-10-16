import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BURNT_AT } from './recipes';
import type { Theme } from './themes';
import type { Item } from './types';

const base = import.meta.env.BASE_URL;

let kitchen = new Map<string, THREE.Object3D>();
/** Bounding box of each model at the origin (used to centre and stack food). */
const bounds = new Map<string, THREE.Box3>();
let chefs: GLTF[] = [];
let atlasMaterial: THREE.MeshStandardMaterial | null = null;

/** Loads every model the game needs. Calls onProgress with 0..1. */
export async function loadAssets(onProgress: (p: number) => void) {
  const files = ['models/kitchen.glb', 'models/chef_a.glb', 'models/chef_b.glb'];
  const progress = files.map(() => 0);
  const loader = new GLTFLoader();
  const results = await Promise.all(
    files.map((f, i) =>
      loader.loadAsync(base + f, (e) => {
        if (e.total) progress[i] = e.loaded / e.total;
        onProgress(progress.reduce((a, b) => a + b, 0) / files.length);
      }),
    ),
  );

  kitchen = new Map();
  for (const node of results[0].scene.children) {
    node.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const mat = o.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.75;
        mat.metalness = 0;
        atlasMaterial ??= mat;
      }
    });
    kitchen.set(node.name, node);
    const saved = node.position.clone();
    node.position.set(0, 0, 0);
    node.updateMatrixWorld(true);
    bounds.set(node.name, new THREE.Box3().setFromObject(node));
    node.position.copy(saved);
  }
  chefs = [results[1], results[2]];
}

/** A fresh copy of a kitchen model by its KayKit name. */
export function model(name: string): THREE.Object3D {
  const src = kitchen.get(name);
  if (!src) throw new Error(`Unknown model ${name}`);
  const copy = src.clone();
  copy.position.set(0, 0, 0);
  copy.rotation.set(0, 0, 0);
  copy.scale.set(1, 1, 1);
  return copy;
}

export function modelBounds(name: string): THREE.Box3 {
  return bounds.get(name) ?? new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.2, 0.3));
}

/**
 * A model wrapped so its footprint is centred on the origin and it sits on y = 0.
 * Food models aren't all centred, which made burgers look lopsided.
 */
export function centredModel(name: string, scale = 1): THREE.Group {
  const b = modelBounds(name);
  const inner = model(name);
  inner.scale.setScalar(scale);
  inner.position.set(-((b.min.x + b.max.x) / 2) * scale, -b.min.y * scale, -((b.min.z + b.max.z) / 2) * scale);
  const g = new THREE.Group();
  g.add(inner);
  g.userData.height = (b.max.y - b.min.y) * scale;
  return g;
}

export function chefSource(index: number): GLTF {
  return chefs[index % chefs.length];
}

export function cloneChef(index: number): THREE.Object3D {
  return cloneSkinned(chefSource(index).scene);
}

/** Model to show for an item held in hand, on a station, or as a plated layer. */
export function itemModelName(item: Item, layer = false): string {
  const burnt = item.doneness >= BURNT_AT;
  switch (item.kind) {
    case 'bun':
      return layer ? 'food_ingredient_bun_bottom' : 'food_ingredient_bun';
    case 'patty':
      return burnt ? 'food_ingredient_burger_trash' : item.doneness >= 0.6 ? 'food_ingredient_burger_cooked' : 'food_ingredient_burger_uncooked';
    case 'vegpatty':
      return item.doneness >= 0.6 ? 'food_ingredient_vegetableburger_cooked' : 'food_ingredient_vegetableburger_uncooked';
    case 'steak':
      return 'food_ingredient_steak';
    case 'cheese':
      return item.sliced ? 'food_ingredient_cheese_slice' : 'food_ingredient_cheese';
    case 'lettuce':
      return item.sliced ? 'food_ingredient_lettuce_slice' : 'food_ingredient_lettuce';
    case 'tomato':
      return item.sliced ? (layer ? 'food_ingredient_tomato_slice' : 'food_ingredient_tomato_slices') : 'food_ingredient_tomato';
    case 'onion':
      return item.sliced ? (layer ? 'food_ingredient_onion_rings' : 'food_ingredient_onion_chopped') : 'food_ingredient_onion';
    case 'potato':
      return item.sliced ? 'food_ingredient_potato_chopped' : 'food_ingredient_potato';
    case 'carrot':
      return item.sliced ? 'food_ingredient_carrot_chopped' : 'food_ingredient_carrot';
    case 'mash':
      return 'food_ingredient_potato_mashed';
    case 'stew':
      return 'stew_bowl';
  }
}

/** Shows cooking progress (darker as it cooks) and melted cheese (golden). */
export function tintItem(obj: THREE.Object3D, item: Item) {
  let color: THREE.Color | null = null;
  if (item.kind === 'patty' || item.kind === 'steak' || item.kind === 'vegpatty') {
    const d = item.doneness;
    const k = d < 0.6 ? 1 - d * 0.35 : d < BURNT_AT ? 1 - (d - 0.6) * 0.45 : 0.5;
    color = new THREE.Color().setScalar(Math.max(0.42, k));
    if (item.kind === 'steak' && d < 0.4) color.setRGB(1, 0.75, 0.75);
  } else if (item.kind === 'cheese' && item.melt >= 0) {
    color = new THREE.Color(1.15, 0.92, 0.55);
  } else if ((item.kind === 'stew' || item.kind === 'mash') && item.doneness >= BURNT_AT) {
    color = new THREE.Color(0.55, 0.45, 0.4);
  }
  if (!color) return;
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.userData.ownMat) {
      o.material = (o.material as THREE.Material).clone();
      o.userData.ownMat = true;
    }
    (o.material as THREE.MeshStandardMaterial).color.copy(color!);
  });
  if (item.kind === 'cheese' && item.melt >= 0) obj.scale.y *= 0.7;
}

// ---------------------------------------------------------------- Theme materials

const counterCache = new Map<string, THREE.MeshStandardMaterial>();

/** The KayKit atlas with its coloured areas hue-shifted, for the theme's counters. */
export function counterMaterial(theme: Theme): THREE.Material | null {
  if (!atlasMaterial) return null;
  const { hue, sat, light } = theme.counter;
  if (!hue && sat === 1 && !light) return atlasMaterial;
  const cached = counterCache.get(theme.id);
  if (cached) return cached;
  const src = atlasMaterial.map?.image as CanvasImageSource & { width: number; height: number };
  if (!src) return atlasMaterial;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hsl = { h: 0, s: 0, l: 0 };
  const col = new THREE.Color();
  for (let i = 0; i < d.length; i += 4) {
    col.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
    col.getHSL(hsl, THREE.SRGBColorSpace);
    if (hsl.s < 0.2) continue; // leave whites, greys and steel alone
    col.setHSL((hsl.h + hue / 360 + 1) % 1, Math.min(1, hsl.s * sat), Math.max(0, Math.min(1, hsl.l + light)), THREE.SRGBColorSpace);
    const rgb = col.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    d[i] = rgb.r * 255;
    d[i + 1] = rgb.g * 255;
    d[i + 2] = rgb.b * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = atlasMaterial.clone();
  mat.map = tex;
  counterCache.set(theme.id, mat);
  return mat;
}

const wallCache = new Map<string, THREE.MeshStandardMaterial>();

/** The KayKit atlas tinted with the theme's paint colour, for walls. */
export function wallMaterial(theme: Theme): THREE.Material | null {
  if (!atlasMaterial) return null;
  let mat = wallCache.get(theme.id);
  if (!mat) {
    mat = atlasMaterial.clone();
    mat.color.set(theme.wall);
    wallCache.set(theme.id, mat);
  }
  return mat;
}

export function atlas(): THREE.Material | null {
  return atlasMaterial;
}
