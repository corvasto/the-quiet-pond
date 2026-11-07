import * as THREE from 'three';

export function createSoilTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  const hash = (x, z, cells) => {
    const seed = Math.sin((x % cells) * 127.1 + (z % cells) * 311.7 + cells * 17.3) * 43758.5453;
    return seed - Math.floor(seed);
  };
  const noise = (x, z, cells) => {
    const px = x / size * cells, pz = z / size * cells;
    const ix = Math.floor(px), iz = Math.floor(pz);
    const tx = px - ix, tz = pz - iz;
    const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz, cells), hash(ix + 1, iz, cells), sx),
      THREE.MathUtils.lerp(hash(ix, iz + 1, cells), hash(ix + 1, iz + 1, cells), sx), sz);
  };
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const grain = noise(x, z, 64);
    const mottling = noise(x, z, 4) * 0.65 + noise(x, z, 13) * 0.35;
    const value = Math.round(241 + (grain - 0.5) * 5 + (mottling - 0.5) * 17);
    const offset = (z * size + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = 'Subtle packed soil grain';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function addSoilFloorUVs(geometry) {
  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uvs[i * 2] = positions.getX(i) * 0.42;
    uvs[i * 2 + 1] = positions.getZ(i) * 0.42;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}
