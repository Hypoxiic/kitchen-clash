// Builds the optimized game models in public/models from the CC0 source packs
// in assets-src. Run with `npm run assets` after changing what's included.
//
// - kitchen.glb: every KayKit Restaurant Bits model merged into one file, so
//   they share a single texture. Each model is a top-level node named after
//   its source file (e.g. "stove_multi").
// - chef_a.glb / chef_b.glb: KayKit Adventurers characters with weapons and
//   armour removed and only the animations the game uses.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, getBounds, mergeDocuments, resample, unpartition } from '@gltf-transform/functions';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const KEEP_ANIMS = [
  'Idle', 'Unarmed_Idle', 'Walking_A', 'Running_A', 'PickUp', 'Interact', 'Use_Item',
  '1H_Melee_Attack_Chop', 'Cheer', 'Hit_A', 'Sit_Floor_Down', 'Sit_Floor_Idle',
];

async function buildKitchen() {
  const dir = path.join(ROOT, 'assets-src', 'restaurant-bits');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.gltf')).sort();
  const doc = await io.read(path.join(dir, files[0]));
  nameRoot(doc, files[0]);
  for (const f of files.slice(1)) {
    const other = await io.read(path.join(dir, f));
    nameRoot(other, f);
    const map = mergeDocuments(doc, other);
    // Move the merged model into the first scene so everything lives in one.
    const mainScene = doc.getRoot().listScenes()[0];
    for (const scene of other.getRoot().listScenes()) {
      const merged = map.get(scene);
      for (const child of merged.listChildren()) mainScene.addChild(child);
      merged.dispose();
    }
  }
  await doc.transform(unpartition(), dedup(), prune());

  const sizes = {};
  for (const node of doc.getRoot().listScenes()[0].listChildren()) {
    const b = getBounds(node);
    const r = (v) => +v.toFixed(2);
    sizes[node.getName()] = { min: b.min.map(r), max: b.max.map(r) };
  }
  await io.write(path.join(OUT, 'kitchen.glb'), doc);
  fs.writeFileSync(path.join(ROOT, 'scripts', 'kitchen-sizes.json'), JSON.stringify(sizes, null, 1));
  console.log(`kitchen.glb: ${files.length} models, ${doc.getRoot().listTextures().length} texture(s)`);
}

/** Wraps a file's scene contents in one node named after the file. */
function nameRoot(doc, file) {
  const scene = doc.getRoot().listScenes()[0];
  const wrapper = doc.createNode(file.replace('.gltf', ''));
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
}

async function buildChef(src, out, dropNodes) {
  const doc = await io.read(path.join(ROOT, 'assets-src', 'adventurers', src));
  const root = doc.getRoot();
  for (const anim of root.listAnimations()) {
    if (!KEEP_ANIMS.includes(anim.getName())) anim.dispose();
  }
  for (const node of root.listNodes()) {
    if (dropNodes.includes(node.getName())) node.dispose();
  }
  // resample() drops redundant keyframes, which is most of the file size.
  await doc.transform(resample(), dedup(), prune());
  await io.write(path.join(OUT, out), doc);
  console.log(`${out}: ${root.listAnimations().map((a) => a.getName()).join(', ')}`);
}

fs.mkdirSync(OUT, { recursive: true });
await buildKitchen();
await buildChef('Knight.glb', 'chef_a.glb', [
  '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield',
  '1H_Sword', '2H_Sword', 'Knight_Helmet', 'Knight_Cape',
]);
await buildChef('Rogue.glb', 'chef_b.glb', [
  'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape',
]);
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB');
