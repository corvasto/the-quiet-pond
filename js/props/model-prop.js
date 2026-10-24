import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

function disposeModel(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const images = new Set();

  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });

  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture) textures.add(value);
    });
    material.dispose();
  });
  textures.forEach((texture) => {
    if (texture.source?.data) images.add(texture.source.data);
    texture.dispose();
  });
  images.forEach((image) => image.close?.());
  geometries.forEach((geometry) => geometry.dispose());
}

export async function loadModelProp({
  url,
  name = 'Imported model prop',
  targetWidth = 1,
  anisotropy = 4,
} = {}) {
  if (!url) throw new Error('A model URL is required.');
  const loader = new GLTFLoader();
  let gltf;
  if (url.endsWith('.glb.gz')) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot decompress the optimized model asset.');
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The compressed model could not be loaded (${response.status}).`);
    const decompressed = await new Response(
      response.body.pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
    gltf = await loader.parseAsync(decompressed, new URL('./', url).href);
  } else {
    gltf = await loader.loadAsync(url);
  }
  const model = gltf.scene;
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model, true);
  if (bounds.isEmpty()) {
    disposeModel(model);
    throw new Error(`The model at ${url} has no visible geometry.`);
  }
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const horizontalSize = Math.max(size.x, size.z);
  if (!Number.isFinite(horizontalSize) || horizontalSize <= 0) {
    disposeModel(model);
    throw new Error(`The model at ${url} has invalid dimensions.`);
  }

  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
  model.updateMatrixWorld(true);

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.anisotropy = anisotropy;
      });
    });
  });

  const group = new THREE.Group();
  group.name = name;
  group.add(model);
  group.userData.sourceUrl = url;
  group.userData.nativeSize = size.clone();
  group.userData.dispose = () => disposeModel(model);

  const setTargetWidth = (width) => {
    const normalizedWidth = Math.max(0.001, Number(width) || targetWidth);
    group.scale.setScalar(normalizedWidth / horizontalSize);
    return normalizedWidth;
  };
  const placeAt = (position, yaw = 0) => {
    group.position.set(position.x, position.y, position.z);
    group.rotation.set(0, yaw, 0);
  };
  const clone = () => (
    gltf.animations.length > 0 ? cloneSkeleton(group) : group.clone(true)
  );

  setTargetWidth(targetWidth);
  return {
    group,
    animations: gltf.animations,
    nativeSize: size,
    horizontalSize,
    setTargetWidth,
    placeAt,
    clone,
  };
}

export async function loadModelProps(configs, { anisotropy = 4 } = {}) {
  const entries = Object.entries(configs ?? {});
  const loadedEntries = await Promise.all(entries.map(async ([id, config]) => {
    try {
      const model = await loadModelProp({
        url: config.url,
        name: config.modelName ?? id,
        targetWidth: config.targetWidth,
        anisotropy,
      });
      return { id, model, config, error: null };
    } catch (error) {
      const message = config.loadErrorMessage
        ?? `The ${id} model could not be loaded:`;
      console.warn(message, error);
      return { id, model: null, config, error };
    }
  }));

  const requiredFailures = loadedEntries.filter((entry) => entry.error && entry.config.required);
  if (requiredFailures.length > 0) {
    loadedEntries.forEach((entry) => entry.model?.group?.userData?.dispose?.());
    const ids = requiredFailures.map((entry) => entry.id).join(', ');
    const error = new Error(`Required 3D assets could not be loaded: ${ids}.`);
    error.causes = requiredFailures.map((entry) => entry.error);
    throw error;
  }

  return Object.fromEntries(loadedEntries.map(({ id, model }) => [id, model]));
}
