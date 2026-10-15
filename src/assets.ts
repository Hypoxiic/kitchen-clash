import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BURNT_AT } from './recipes';
import type { Item } from './types';

const base = import.meta.env.BASE_URL;

let kitchen = new Map<string, THREE.Object3D>();
const heights = new Map<string, { min: number; max: number }>();
let chefs: GLTF[] = [];

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
      }
    });
    kitchen.set(node.name, node);
    const box = new THREE.Box3().setFromObject(node);
    heights.set(node.name, { min: box.min.y, max: box.max.y });
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

export function modelHeight(name: string) {
  return heights.get(name) ?? { min: 0, max: 0.2 };
}

export function chefSource(index: number): GLTF {
  return chefs[index % chefs.length];
}

export function cloneChef(index: number): THREE.Object3D {
  return cloneSkinned(chefSource(index).scene);
}

/** Model to show for an item held in hand or sitting on a station. */
export function itemModelName(item: Item, layer = false): string {
  switch (item.kind) {
    case 'bun':
      return layer ? 'food_ingredient_bun_bottom' : 'food_ingredient_bun';
    case 'patty':
      return item.doneness >= BURNT_AT
        ? 'food_ingredient_burger_trash'
        : item.doneness >= 0.6
          ? 'food_ingredient_burger_cooked'
          : 'food_ingredient_burger_uncooked';
    case 'cheese':
      return item.sliced ? 'food_ingredient_cheese_slice' : 'food_ingredient_cheese';
    case 'lettuce':
      return item.sliced ? 'food_ingredient_lettuce_slice' : 'food_ingredient_lettuce';
    case 'tomato':
      return item.sliced ? (layer ? 'food_ingredient_tomato_slice' : 'food_ingredient_tomato_slices') : 'food_ingredient_tomato';
    case 'onion':
      return item.sliced ? 'food_ingredient_onion_rings' : 'food_ingredient_onion';
    case 'ham':
      return item.sliced ? 'food_ingredient_ham_cooked' : 'food_ingredient_ham';
    case 'carrot':
      return item.sliced ? 'food_ingredient_carrot_chopped' : 'food_ingredient_carrot';
  }
}

/** Patties darken gradually on the grill instead of jumping between models. */
export function tintPatty(obj: THREE.Object3D, d: number) {
  const k = d < 0.6 ? 1 - d * 0.35 : d < BURNT_AT ? 1 - (d - 0.6) * 0.45 : 0.55;
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.userData.ownMat) {
      o.material = (o.material as THREE.Material).clone();
      o.userData.ownMat = true;
    }
    (o.material as THREE.MeshStandardMaterial).color.setScalar(Math.max(0.45, k));
  });
}
