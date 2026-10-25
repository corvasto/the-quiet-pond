import * as THREE from 'three';
import { createTree } from './tree.js';
import { SeededRandom } from '../utils/random.js';

const TAU = Math.PI * 2;

function attachTreeCollectionDisposer(group) {
  group.userData.dispose = () => {
    const disposedTextures = new Set();
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    const disposeMaterial = (material) => {
      if (disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      for (const value of Object.values(material)) {
        if (!value?.isTexture || disposedTextures.has(value)) continue;
        disposedTextures.add(value);
        value.dispose();
      }
      material.dispose();
    };

    group.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry && !disposedGeometries.has(object.geometry)) {
        disposedGeometries.add(object.geometry);
        object.geometry.dispose();
      }
      if (Array.isArray(object.material)) {
        object.material.forEach(disposeMaterial);
      } else if (object.material) {
        disposeMaterial(object.material);
      }
    });
  };
}

export function createPondGroveLayout({
  seed = 'ancient-oak',
} = {}) {
  const random = new SeededRandom(`${seed}:pond-companion-layout`);
  const hero = Object.freeze({ x: 0, z: 0, radius: 1.75 });
  const companionAngles = [
    THREE.MathUtils.degToRad(148) + random.signed(0.13),
    THREE.MathUtils.degToRad(228) + random.signed(0.13),
  ];
  const companionScales = [
    random.range(0.88, 1.02),
    random.range(1.02, 1.16),
  ];
  if (random.chance(0.5)) companionScales.reverse();
  const companions = companionAngles.map((angle, index) => {
    const distance = random.range(8.25, 9.1);
    const scale = companionScales[index];
    return Object.freeze({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      radius: 1.65 * scale + 0.28,
      scale,
    });
  });

  return Object.freeze({
    variant: 'pond',
    hero,
    companions: Object.freeze(companions),
    clearings: Object.freeze([hero, ...companions]),
  });
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function createGroveTrees({
  seed = 'ancient-oak',
  season = 'summer',
  quality = 'high',
  heroAge = 1,
  heroBranchSpread = 1,
  heroLeafDensity = 1,
  heightAt,
  layout,
} = {}) {
  const group = new THREE.Group();
  const variant = layout?.variant === 'pond' ? 'pond' : 'grove';
  const variantLabel = variant === 'pond' ? 'Pond' : 'Grove';
  group.name = `Procedural ${variant} companion grove`;
  const random = new SeededRandom(`${seed}:finite-${variant}-trees`);
  const trees = [];

  for (let index = 0; index < layout.companions.length; index += 1) {
    const position = layout.companions[index];
    const treeRandom = random.fork(`companion-${index}`);
    const tree = createTree({
      seed: `${seed}:${variant}-companion:${index}:${treeRandom.int(1000, 9999)}`,
      season,
      quality,
      age: THREE.MathUtils.clamp(heroAge * treeRandom.range(0.92, 1.08), 0.72, 1.3),
      branchSpread: THREE.MathUtils.clamp(
        heroBranchSpread * treeRandom.range(0.9, 1.1),
        0.62,
        1.38,
      ),
      leafDensity: THREE.MathUtils.clamp(
        heroLeafDensity * treeRandom.range(0.78, 1.04),
        0.42,
        1.35,
      ),
    });
    tree.group.position.set(
      position.x,
      heightAt(position.x, position.z) - 0.015,
      position.z,
    );
    tree.group.rotation.y = treeRandom.range(0, TAU);
    tree.group.scale.setScalar(position.scale);
    tree.group.name = `${variantLabel} companion tree ${index + 1}`;
    group.add(tree.group);
    trees.push(tree);
    await yieldToBrowser();
  }

  attachTreeCollectionDisposer(group);
  return {
    group,
    trees,
    leafMaterials: trees.map((tree) => tree.leafMaterial),
    stats: Object.freeze({
      count: trees.length,
      totalTreeCount: trees.length + 1,
      leaves: trees.reduce((total, tree) => total + tree.stats.leafCount, 0),
    }),
  };
}
