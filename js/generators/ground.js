import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIORAMA, PERFORMANCE, SEASONS, getHabitatArea } from '../config/index.js';
import { GRASS_VISIBILITY } from '../config/scene.js';
import { SeededRandom } from '../utils/random.js';
import { createNoise2D } from '../utils/noise.js';
import {
  createFixedModelPropSpots,
  createModelPropSpots,
  normalizeModelPropClearings,
} from '../props/model-placement.js';
import { createBushes } from './bushes.js';
import { createPondFeatures, createPondProfile } from './pond.js';
import { createRocks } from './rocks.js';

function colorFromPalette(random, palette, variation = 0.05) {
  const color = new THREE.Color(random.pick(palette));
  color.offsetHSL(random.signed(0.018), random.signed(variation), random.signed(variation));
  return color;
}

function applyWorldGroundUvs(geometry, warpDistantUvs = false) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const tileSize = DIORAMA.size / 2.35;
  const centerPhase = 2.35 * 0.5;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const warpX = warpDistantUvs
      ? Math.sin(z * 0.19) * 0.38 + Math.sin((x + z) * 0.071) * 0.27
      : 0;
    const warpZ = warpDistantUvs
      ? Math.sin(x * 0.17) * 0.35 + Math.cos((x - z) * 0.063) * 0.25
      : 0;
    uv.setXY(
      index,
      (x + warpX) / tileSize + centerPhase,
      -(z + warpZ) / tileSize + centerPhase,
    );
  }
  uv.needsUpdate = true;
}

function addGroundMacroVariation(material, macroUniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundMacroOffset = macroUniforms.uGroundMacroOffset;
    shader.uniforms.uGroundSoilColor = macroUniforms.uGroundSoilColor;
    shader.uniforms.uGroundMossColor = macroUniforms.uGroundMossColor;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGroundMacroPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGroundMacroPosition = transformed.xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uGroundMacroOffset;
        uniform vec3 uGroundSoilColor;
        uniform vec3 uGroundMossColor;
        varying vec2 vGroundMacroPosition;

        float arborGroundHash(vec2 point) {
          return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float arborGroundNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 fraction = fract(point);
          fraction = fraction * fraction * (3.0 - 2.0 * fraction);
          float lower = mix(
            arborGroundHash(cell),
            arborGroundHash(cell + vec2(1.0, 0.0)),
            fraction.x
          );
          float upper = mix(
            arborGroundHash(cell + vec2(0.0, 1.0)),
            arborGroundHash(cell + vec2(1.0, 1.0)),
            fraction.x
          );
          return mix(lower, upper, fraction.y);
        }

        float arborGroundFbm(vec2 point) {
          float value = arborGroundNoise(point) * 0.58;
          value += arborGroundNoise(point * 2.03 + vec2(9.7)) * 0.28;
          value += arborGroundNoise(point * 4.11 - vec2(5.3)) * 0.14;
          return value;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 arborGroundPoint = vGroundMacroPosition + uGroundMacroOffset;
        float arborBroad = arborGroundFbm(arborGroundPoint * 0.045);
        float arborMedium = arborGroundFbm(arborGroundPoint * 0.13 + vec2(13.2, -7.4));
        float arborFine = arborGroundNoise(arborGroundPoint * 0.92 + vec2(-18.1, 6.4));
        float arborSpeckle = arborGroundNoise(arborGroundPoint * 2.7 + vec2(4.8, 21.6));
        float arborMoss = smoothstep(
          0.31,
          0.76,
          arborBroad * 0.67 + arborMedium * 0.33
        );
        float arborSampleBrightness = mix(0.94, 1.055, arborMoss);
        vec3 arborSampledGround = diffuseColor.rgb * vec3(
          arborSampleBrightness * mix(0.985, 1.018, arborMedium),
          arborSampleBrightness,
          arborSampleBrightness * mix(0.965, 1.0, arborBroad)
        );
        vec3 arborProceduralGround = mix(
          uGroundSoilColor,
          uGroundMossColor,
          arborMoss
        );
        arborProceduralGround *= mix(0.91, 1.09, arborFine);
        float arborLitter = smoothstep(0.82, 0.965, arborSpeckle)
          * smoothstep(0.38, 0.72, arborMedium);
        arborProceduralGround = mix(
          arborProceduralGround,
          uGroundSoilColor * 1.22,
          arborLitter * 0.24
        );
        float arborProceduralFade = smoothstep(
          14.5,
          33.0,
          length(vGroundMacroPosition)
        );
        diffuseColor.rgb = mix(
          arborSampledGround,
          arborProceduralGround,
          arborProceduralFade
        );`,
      );
  };
  material.customProgramCacheKey = () => 'procedural-ground-macro-v2';
  material.userData.groundMacroUniforms = macroUniforms;
  material.needsUpdate = true;
}

function makeSoilTexture(random) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);

  for (let index = 0; index < image.data.length; index += 4) {
    const grain = random.range(-20, 18);
    const fleck = random.chance(0.025) ? random.range(-42, 38) : 0;
    image.data[index] = 70 + grain + fleck;
    image.data[index + 1] = 51 + grain * 0.67 + fleck * 0.45;
    image.data[index + 2] = 33 + grain * 0.38;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  context.globalAlpha = 0.22;
  for (let index = 0; index < 220; index += 1) {
    context.fillStyle = random.chance(0.5) ? '#20190f' : '#a18a64';
    context.beginPath();
    context.arc(random.range(0, size), random.range(0, size), random.range(0.3, 1.5), 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 2);
  texture.anisotropy = 4;
  return texture;
}

function parseHexColor(value) {
  const hex = Number.parseInt(value.replace('#', ''), 16);
  return {
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255,
  };
}

function blendCanvasEdges(context, width, height) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const horizontalBorder = Math.max(6, Math.round(width * 0.055));
  const verticalBorder = Math.max(6, Math.round(height * 0.055));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < horizontalBorder; x += 1) {
      const oppositeX = width - 1 - x;
      const leftIndex = (y * width + x) * 4;
      const rightIndex = (y * width + oppositeX) * 4;
      const weight = 1 - x / horizontalBorder;
      for (let channel = 0; channel < 3; channel += 1) {
        const average = (data[leftIndex + channel] + data[rightIndex + channel]) * 0.5;
        data[leftIndex + channel] = THREE.MathUtils.lerp(data[leftIndex + channel], average, weight);
        data[rightIndex + channel] = THREE.MathUtils.lerp(data[rightIndex + channel], average, weight);
      }
    }
  }

  for (let y = 0; y < verticalBorder; y += 1) {
    const oppositeY = height - 1 - y;
    const weight = 1 - y / verticalBorder;
    for (let x = 0; x < width; x += 1) {
      const topIndex = (y * width + x) * 4;
      const bottomIndex = (oppositeY * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const average = (data[topIndex + channel] + data[bottomIndex + channel]) * 0.5;
        data[topIndex + channel] = THREE.MathUtils.lerp(data[topIndex + channel], average, weight);
        data[bottomIndex + channel] = THREE.MathUtils.lerp(data[bottomIndex + channel], average, weight);
      }
    }
  }

  context.putImageData(image, 0, 0);
}

function makeForestFloorTextures(random, season, quality) {
  const size = quality === 'high' ? 512 : 256;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d');
  const bumpContext = bumpCanvas.getContext('2d');
  const colorImage = colorContext.createImageData(size, size);
  const bumpImage = bumpContext.createImageData(size, size);
  const groundColors = SEASONS[season].ground.map(parseHexColor);
  const mossColors = SEASONS[season].grass.map(parseHexColor);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const broad = Math.sin(x * 0.024 + Math.sin(y * 0.013) * 2.3) * 0.42
        + Math.sin(y * 0.035 - x * 0.009) * 0.28;
      const detail = Math.sin((x + y) * 0.19) * 0.12
        + Math.sin(x * 0.41 - y * 0.27) * 0.06;
      const mossField = Math.sin(x * 0.017 + y * 0.011) * 0.52
        + Math.sin(x * 0.047 - y * 0.029) * 0.31
        + broad * 0.36;
      const mossMix = THREE.MathUtils.smoothstep(mossField, -0.34, 0.52) * 0.72;
      const groundT = THREE.MathUtils.clamp(broad * 0.5 + 0.5, 0, 1);
      const mossT = THREE.MathUtils.clamp(detail * 1.8 + 0.5, 0, 1);
      const groundA = groundColors[0];
      const groundB = groundColors[groundColors.length - 1];
      const mossA = mossColors[0];
      const mossB = mossColors[mossColors.length - 1];
      const grain = random.signed(5.5);
      const soilR = THREE.MathUtils.lerp(groundA.r, groundB.r, groundT);
      const soilG = THREE.MathUtils.lerp(groundA.g, groundB.g, groundT);
      const soilB = THREE.MathUtils.lerp(groundA.b, groundB.b, groundT);
      const mossR = THREE.MathUtils.lerp(mossA.r, mossB.r, mossT);
      const mossG = THREE.MathUtils.lerp(mossA.g, mossB.g, mossT);
      const mossBValue = THREE.MathUtils.lerp(mossA.b, mossB.b, mossT);

      colorImage.data[index] = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(soilR, mossR, mossMix) + grain,
        34,
        220,
      );
      colorImage.data[index + 1] = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(soilG, mossG, mossMix) + grain,
        38,
        226,
      );
      colorImage.data[index + 2] = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(soilB, mossBValue, mossMix) + grain * 0.65,
        26,
        195,
      );
      colorImage.data[index + 3] = 255;

      const bump = THREE.MathUtils.clamp(128 + broad * 24 + detail * 42 + grain * 1.4, 54, 208);
      bumpImage.data[index] = bump;
      bumpImage.data[index + 1] = bump;
      bumpImage.data[index + 2] = bump;
      bumpImage.data[index + 3] = 255;
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  colorContext.lineCap = 'round';
  bumpContext.lineCap = 'round';
  const paintedLitter = quality === 'high' ? 430 : 210;
  const litterColors = ['#d0bf9a', '#b6a27f', '#8d795d', '#d8c9a8', '#655a46'];

  for (let index = 0; index < paintedLitter; index += 1) {
    const x = random.range(0, size);
    const y = random.range(0, size);
    const length = random.range(size * 0.006, size * 0.024);
    const width = random.range(size * 0.0012, size * 0.0045);
    const rotation = random.range(0, Math.PI * 2);
    colorContext.save();
    colorContext.translate(x, y);
    colorContext.rotate(rotation);
    colorContext.fillStyle = random.pick(litterColors);
    colorContext.globalAlpha = random.range(0.44, 0.82);
    colorContext.fillRect(-length * 0.5, -width * 0.5, length, width);
    colorContext.restore();

    bumpContext.save();
    bumpContext.translate(x, y);
    bumpContext.rotate(rotation);
    bumpContext.fillStyle = `rgba(181, 181, 181, ${random.range(0.35, 0.65)})`;
    bumpContext.fillRect(-length * 0.5, -width * 0.5, length, width);
    bumpContext.restore();
  }

  colorContext.globalAlpha = 1;
  blendCanvasEdges(colorContext, size, size);
  blendCanvasEdges(bumpContext, size, size);
  const colorMap = new THREE.CanvasTexture(colorCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  colorMap.name = 'Layered forest floor color';
  bumpMap.name = 'Layered forest floor relief';
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(2.35, 2.35);
  bumpMap.repeat.copy(colorMap.repeat);
  colorMap.anisotropy = quality === 'high' ? 8 : 4;
  bumpMap.anisotropy = quality === 'high' ? 8 : 4;
  return { colorMap, bumpMap };
}

function createGrassGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const levels = [0, 0.34, 0.68, 1];
  const halfWidths = [0.023, 0.021, 0.016, 0.007];
  const height = 0.58;

  for (let level = 0; level < levels.length; level += 1) {
    const t = levels[level];
    const bend = t * t * 0.065;
    const lateral = Math.sin(t * Math.PI) * 0.006;
    const halfWidth = halfWidths[level];
    positions.push(-halfWidth + lateral, height * t, bend);
    positions.push(halfWidth + lateral, height * t, bend);
    const normalY = THREE.MathUtils.lerp(0.62, 0.7, t);
    const normalZ = Math.sqrt(Math.max(0, 1 - normalY * normalY));
    normals.push(0, normalY, normalZ, 0, normalY, normalZ);
    uvs.push(0, t, 1, t);
    const baseLift = THREE.MathUtils.lerp(0.88, 1.1, t);
    colors.push(
      baseLift * 0.96, baseLift, baseLift * 0.88,
      baseLift * 0.96, baseLift, baseLift * 0.88,
    );
  }

  for (let level = 0; level < levels.length - 1; level += 1) {
    const row = level * 2;
    indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'Single thin forest grass ribbon';
  return geometry;
}

function addWindToMaterial(material) {
  const windUniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.35 },
    uGrassPlayer: { value: new THREE.Vector3() },
    uGrassCamera: { value: new THREE.Vector3() },
    uGrassVisibility: { value: 0 },
    uGrassPlayerRadius: { value: GRASS_VISIBILITY.playerRadius },
    uGrassCorridorRadius: { value: GRASS_VISIBILITY.cameraCorridorRadius },
    uGrassMinimumHeight: { value: GRASS_VISIBILITY.minimumHeightScale },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    for (const name of ['uGrassPlayer', 'uGrassCamera', 'uGrassVisibility',
      'uGrassPlayerRadius', 'uGrassCorridorRadius', 'uGrassMinimumHeight']) {
      shader.uniforms[name] = windUniforms[name];
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        uniform vec3 uGrassPlayer;
        uniform vec3 uGrassCamera;
        uniform float uGrassVisibility;
        uniform float uGrassPlayerRadius;
        uniform float uGrassCorridorRadius;
        uniform float uGrassMinimumHeight;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3].x * 0.43 + instanceMatrix[3].z * 0.31;
        #else
          float windPhase = 0.0;
        #endif
        float bladeFactor = smoothstep(0.0, 0.58, position.y);
        float windWave = sin(uTime * 1.55 + windPhase) + sin(uTime * 0.71 + windPhase * 1.7) * 0.35;
        vec3 meshWind = vec3(
          windWave * bladeFactor * bladeFactor * uWind * 0.058,
          0.0,
          cos(uTime * 1.18 + windPhase) * bladeFactor * bladeFactor * uWind * 0.026
        );
        #ifdef USE_INSTANCING
          vec3 instanceX = instanceMatrix[0].xyz;
          vec3 instanceY = instanceMatrix[1].xyz;
          vec3 instanceZ = instanceMatrix[2].xyz;
          float instanceScaleX = max(length(instanceX), 0.0001);
          float instanceScaleY = max(length(instanceY), 0.0001);
          float instanceScaleZ = max(length(instanceZ), 0.0001);
          instanceX /= instanceScaleX;
          instanceY /= instanceScaleY;
          instanceZ /= instanceScaleZ;
          transformed += vec3(
            dot(meshWind, instanceX) / instanceScaleX,
            dot(meshWind, instanceY) / instanceScaleY,
            dot(meshWind, instanceZ) / instanceScaleZ
          );
        #else
          transformed += meshWind;
        #endif
        #ifdef USE_INSTANCING
          vec3 bladeBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 viewSegment = uGrassCamera - uGrassPlayer;
          float segmentLengthSquared = max(dot(viewSegment, viewSegment), 0.0001);
          float alongView = clamp(dot(bladeBase - uGrassPlayer, viewSegment) / segmentLengthSquared, 0.0, 1.0);
          float corridorDistance = distance(bladeBase, uGrassPlayer + viewSegment * alongView);
          float playerClearing = 1.0 - smoothstep(uGrassPlayerRadius * 0.35, uGrassPlayerRadius, distance(bladeBase, uGrassPlayer));
          float cameraClearing = 1.0 - smoothstep(uGrassCorridorRadius * 0.35, uGrassCorridorRadius, corridorDistance);
          float clearing = max(playerClearing, cameraClearing) * uGrassVisibility;
          transformed.y *= mix(1.0, uGrassMinimumHeight, clearing);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      #ifdef DOUBLE_SIDED
        if (!gl_FrontFacing) normal = -normal;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'procedural-grass-wind-visibility-v5';
  material.userData.windUniforms = windUniforms;
}

function createFallenLeaves(random, heightAt, season, quality, habitat, rejectPoint = null) {
  const countBase = season === 'autumn' ? 380 : 120;
  const qualityCount = quality === 'high' ? countBase : Math.round(countBase * 0.58);
  const count = Math.round(qualityCount * habitat.populationScale);
  const geometry = new THREE.CircleGeometry(0.14, 5);
  geometry.scale(1, 0.48, 1);
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  const leaves = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const half = habitat.detailSize * 0.46;

  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const angle = random.range(0, Math.PI * 2);
    const radius = Math.sqrt(random.float()) * half;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (rejectPoint?.(x, z, 0.08)) continue;
    const scale = random.range(0.55, 1.3);
    dummy.position.set(x, heightAt(x, z) + 0.025, z);
    dummy.rotation.set(-Math.PI / 2 + random.signed(0.16), random.range(0, Math.PI * 2), random.signed(0.12));
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    leaves.setMatrixAt(placed, dummy.matrix);
    leaves.setColorAt(placed, colorFromPalette(random, SEASONS[season].fallen, 0.08));
    placed += 1;
  }
  leaves.count = placed;
  leaves.receiveShadow = true;
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  leaves.name = 'Fallen leaf litter';
  return leaves;
}

function createWoodChips(random, heightAt, quality, habitat, rejectPoint = null) {
  const qualityCount = quality === 'high' ? 520 : 240;
  const count = Math.round(qualityCount * habitat.populationScale);
  const geometry = new THREE.PlaneGeometry(0.18, 0.038, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.name = 'Thin forest floor wood chip';
  const material = new THREE.MeshStandardMaterial({
    name: 'Dry forest floor litter',
    color: '#ffffff',
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const chips = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = ['#d8c9a8', '#c1ad88', '#9a8262', '#e0d2b2', '#79664e', '#b9b1a0'];
  const half = habitat.detailSize * 0.47;

  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const angle = random.range(0, Math.PI * 2);
    const radius = Math.sqrt(random.float()) * half;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (rejectPoint?.(x, z, 0.1)) continue;
    const scale = random.range(0.55, 1.75);
    dummy.position.set(x, heightAt(x, z) + random.range(0.012, 0.027), z);
    dummy.rotation.set(random.signed(0.08), random.range(0, Math.PI * 2), random.signed(0.08));
    dummy.scale.set(scale, 1, random.range(0.72, 1.3));
    dummy.updateMatrix();
    chips.setMatrixAt(placed, dummy.matrix);
    color.set(random.pick(palette));
    color.offsetHSL(random.signed(0.008), random.signed(0.015), random.signed(0.04));
    chips.setColorAt(placed, color);
    placed += 1;
  }

  chips.count = placed;
  chips.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  chips.instanceMatrix.needsUpdate = true;
  chips.instanceColor.needsUpdate = true;
  chips.castShadow = false;
  chips.receiveShadow = true;
  chips.name = 'Scattered bark flakes and wood chips';
  return chips;
}

function createWildflowers(random, heightAt, season, quality, habitat, rejectPoint = null) {
  const qualityCount = season === 'spring'
    ? (quality === 'high' ? 85 : 42)
    : (quality === 'high' ? 34 : 18);
  const flowerCount = Math.round(qualityCount * habitat.populationScale);
  const group = new THREE.Group();
  const stemGeometry = new THREE.CylinderGeometry(0.008, 0.012, 0.34, 5);
  stemGeometry.translate(0, 0.17, 0);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#35572c', roughness: 0.9 });
  const headGeometry = new THREE.IcosahedronGeometry(0.048, 1);
  const headMaterial = new THREE.MeshStandardMaterial({ color: '#f1e4bf', roughness: 0.78 });
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, flowerCount);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, flowerCount);
  const dummy = new THREE.Object3D();
  const headDummy = new THREE.Object3D();
  const half = habitat.detailSize * 0.43;
  const flowerColors = season === 'spring'
    ? ['#f5edcf', '#d8c6ed', '#e8c6d0', '#d4e3b8']
    : ['#eee2b9', '#cabfdf'];

  let placed = 0;
  let attempts = 0;
  while (placed < flowerCount && attempts < flowerCount * 12) {
    attempts += 1;
    let x;
    let z;
    do {
      x = random.range(-half, half);
      z = random.range(-half, half);
    } while (x * x + z * z < 5 || random.chance(0.3));
    if (rejectPoint?.(x, z, 0.18)) continue;
    const baseY = heightAt(x, z);
    const scale = random.range(0.72, 1.25);
    dummy.position.set(x, baseY, z);
    dummy.rotation.y = random.range(0, Math.PI * 2);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    stems.setMatrixAt(placed, dummy.matrix);

    headDummy.position.set(x, baseY + 0.34 * scale, z);
    headDummy.rotation.set(random.range(0, Math.PI), random.range(0, Math.PI), 0);
    headDummy.scale.setScalar(scale);
    headDummy.updateMatrix();
    heads.setMatrixAt(placed, headDummy.matrix);
    heads.setColorAt(placed, colorFromPalette(random, flowerColors, 0.035));
    placed += 1;
  }
  stems.count = placed;
  heads.count = placed;
  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
  stems.castShadow = false;
  heads.castShadow = false;
  group.add(stems, heads);
  group.name = 'Tiny woodland flowers';
  return group;
}

export function createGround({
  seed = 'ancient-oak',
  grassDensity = 1,
  season = 'summer',
  quality = 'high',
  area = 'standard',
  treeClearings = [],
  modelPropClearing = null,
  modelPropClearings = [],
} = {}) {
  const group = new THREE.Group();
  group.name = 'Procedural diorama ground';
  const random = new SeededRandom(`${seed}:ground`);
  const noise = createNoise2D(`${seed}:terrain`);
  const habitat = getHabitatArea(area);
  const half = habitat.detailSize / 2;
  const segments = quality === 'high'
    ? habitat.terrainSegmentsHigh
    : habitat.terrainSegmentsLow;
  const farGroundHeight = 0.12;
  const normalizedTreeClearings = Array.isArray(treeClearings)
    ? treeClearings.filter((clearing) => (
      Number.isFinite(clearing?.x)
      && Number.isFinite(clearing?.z)
      && Number.isFinite(clearing?.radius)
    ))
    : [];
  const isInsideTreeClearing = (x, z, extraRadius = 0) => (
    normalizedTreeClearings.some((clearing) => {
      const radius = clearing.radius + extraRadius;
      const deltaX = x - clearing.x;
      if (Math.abs(deltaX) >= radius) return false;
      const deltaZ = z - clearing.z;
      return Math.abs(deltaZ) < radius
        && deltaX * deltaX + deltaZ * deltaZ < radius * radius;
    })
  );

  const rawHeightAt = (x, z) => {
    const broad = noise(x * 0.105 + 2.1, z * 0.105 - 1.7, 4) * 0.16;
    const detail = noise(x * 0.34 - 4.2, z * 0.34 + 0.8, 3) * 0.055;
    const centralRise = Math.max(0, 1 - Math.hypot(x, z) / 8) * 0.08;
    return 0.15 + broad + detail + centralRise;
  };
  const pondProfile = habitat.hasPond
    ? createPondProfile({ seed, rawHeightAt })
    : null;
  const containsPond = (x, z, padding = 0) => (
    pondProfile?.contains(x, z, padding) ?? false
  );
  const terrainTreeClearings = habitat.infinite ? [] : normalizedTreeClearings;
  const treeClearingHeights = terrainTreeClearings.map((clearing) => ({
    ...clearing,
    height: rawHeightAt(clearing.x, clearing.z),
  }));
  const heightAt = (x, z) => {
    let terrainHeight = rawHeightAt(x, z);
    for (const clearing of treeClearingHeights) {
      const distance = Math.hypot(x - clearing.x, z - clearing.z);
      const flattening = 1 - THREE.MathUtils.smoothstep(
        distance,
        clearing.radius * 0.5,
        clearing.radius + 0.95,
      );
      terrainHeight = THREE.MathUtils.lerp(
        terrainHeight,
        clearing.height,
        flattening,
      );
    }
    if (pondProfile) terrainHeight = pondProfile.shapeTerrain(x, z, terrainHeight);
    if (!habitat.infinite) return terrainHeight;
    const edgeDistance = Math.max(Math.abs(x), Math.abs(z));
    const edgeBlend = THREE.MathUtils.smoothstep(edgeDistance, half - 2.8, half);
    return THREE.MathUtils.lerp(terrainHeight, farGroundHeight, edgeBlend);
  };

  const forestFloorTextures = makeForestFloorTextures(
    random.fork('forest-floor-textures'),
    season,
    quality,
  );
  forestFloorTextures.colorMap.repeat.set(1, 1);
  forestFloorTextures.bumpMap.repeat.set(1, 1);

  if (!habitat.infinite) {
    const soilTexture = makeSoilTexture(random.fork('soil-texture'));
    soilTexture.repeat.set(5 * habitat.detailSize / DIORAMA.size, 2);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: '#6a5032',
      map: soilTexture,
      roughness: 1,
      metalness: 0,
    });
    if (pondProfile) {
      const soilShell = new THREE.Group();
      const outerSize = habitat.detailSize + 0.72;
      const wallThickness = 0.42;
      const wallHeight = DIORAMA.baseDepth;
      const wallY = -wallHeight / 2 + 0.02;
      const wallOffset = (outerSize - wallThickness) / 2;
      const wallGeometries = [
        new THREE.BoxGeometry(outerSize, wallHeight, wallThickness),
        new THREE.BoxGeometry(outerSize, wallHeight, wallThickness),
        new THREE.BoxGeometry(wallThickness, wallHeight, outerSize - wallThickness * 2),
        new THREE.BoxGeometry(wallThickness, wallHeight, outerSize - wallThickness * 2),
        new THREE.BoxGeometry(outerSize, 0.3, outerSize),
      ];
      const wallPositions = [
        [0, wallY, wallOffset],
        [0, wallY, -wallOffset],
        [wallOffset, wallY, 0],
        [-wallOffset, wallY, 0],
        [0, -DIORAMA.baseDepth + 0.15, 0],
      ];
      wallGeometries.forEach((geometry, index) => {
        const wall = new THREE.Mesh(geometry, baseMaterial);
        wall.position.fromArray(wallPositions[index]);
        wall.receiveShadow = true;
        wall.castShadow = true;
        soilShell.add(wall);
      });
      soilShell.name = 'Open soil block around carved pond basin';
      group.add(soilShell);
    } else {
      const baseGeometry = new RoundedBoxGeometry(
        habitat.detailSize + 0.72,
        DIORAMA.baseDepth,
        habitat.detailSize + 0.72,
        quality === 'high' ? 6 : 3,
        0.5,
      );
      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.y = -DIORAMA.baseDepth / 2 + 0.02;
      base.receiveShadow = true;
      base.castShadow = true;
      base.name = 'Visible soil block';
      group.add(base);
    }

    const footGeometry = new RoundedBoxGeometry(
      habitat.detailSize + 1.35,
      0.36,
      habitat.detailSize + 1.35,
      4,
      0.28,
    );
    const footMaterial = new THREE.MeshStandardMaterial({
      color: '#263028',
      roughness: 0.72,
      metalness: 0.06,
    });
    const foot = new THREE.Mesh(footGeometry, footMaterial);
    foot.position.y = -DIORAMA.baseDepth - 0.1;
    foot.castShadow = true;
    foot.receiveShadow = true;
    foot.name = 'Diorama plinth';
    group.add(foot);
  }

  const terrainGeometry = new THREE.PlaneGeometry(
    habitat.detailSize,
    habitat.detailSize,
    segments,
    segments,
  );
  terrainGeometry.rotateX(-Math.PI / 2);
  const positions = terrainGeometry.attributes.position;
  const terrainColors = pondProfile
    ? new Float32Array(positions.count * 3)
    : null;
  const terrainColor = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const y = heightAt(x, z);
    positions.setY(index, y);
    if (terrainColors) {
      const distance = pondProfile.signedDistance(x, z);
      if (distance < -0.18) {
        const depth = THREE.MathUtils.clamp(-distance / 1.8, 0, 1);
        terrainColor.set('#675a43').lerp(new THREE.Color('#33443a'), depth * 0.72);
      } else if (distance < 0.85) {
        const bank = THREE.MathUtils.clamp((distance + 0.18) / 1.03, 0, 1);
        terrainColor.set('#806d50').lerp(new THREE.Color('#d9d2bc'), bank * 0.58);
      } else {
        terrainColor.set('#ffffff');
      }
      terrainColors[index * 3] = terrainColor.r;
      terrainColors[index * 3 + 1] = terrainColor.g;
      terrainColors[index * 3 + 2] = terrainColor.b;
    }
  }
  if (terrainColors) {
    terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  }
  applyWorldGroundUvs(terrainGeometry, habitat.infinite);
  terrainGeometry.computeVertexNormals();
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: forestFloorTextures.colorMap,
    bumpMap: forestFloorTextures.bumpMap,
    bumpScale: quality === 'high' ? 0.075 : 0.05,
    roughness: 0.96,
    metalness: 0,
    vertexColors: Boolean(terrainColors),
  });
  const macroRandom = random.fork('ground-macro-variation');
  const macroSoilColor = new THREE.Color(SEASONS[season].ground[0])
    .lerp(new THREE.Color('#74684d'), 0.46)
    .offsetHSL(0, -0.025, 0.035);
  const macroMossColor = new THREE.Color(SEASONS[season].ground[2])
    .lerp(new THREE.Color(SEASONS[season].grass[0]), 0.26)
    .offsetHSL(0, -0.035, 0.035);
  const groundMacroUniforms = habitat.infinite
    ? {
      uGroundMacroOffset: {
        value: new THREE.Vector2(
          macroRandom.range(-240, 240),
          macroRandom.range(-240, 240),
        ),
      },
      uGroundSoilColor: { value: macroSoilColor },
      uGroundMossColor: { value: macroMossColor },
    }
    : null;
  if (groundMacroUniforms) {
    addGroundMacroVariation(terrainMaterial, groundMacroUniforms);
  }
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  terrain.name = 'Uneven living ground';
  group.add(terrain);
  let pondFeatures = null;
  if (pondProfile) {
    pondFeatures = createPondFeatures({
      profile: pondProfile,
      seed,
      season,
      quality,
      heightAt,
    });
    group.add(pondFeatures);
  }
  let horizonTriangleCount = 0;

  if (habitat.infinite) {
    const addHorizonRing = ({
      innerRadius,
      outerRadius,
      radialSegments,
      name,
      heightForPoint,
      useBump = true,
    }) => {
      const geometry = new THREE.RingGeometry(
        innerRadius,
        outerRadius,
        quality === 'high' ? 192 : 128,
        radialSegments,
      );
      geometry.rotateX(-Math.PI / 2);
      const ringPositions = geometry.getAttribute('position');

      for (let index = 0; index < ringPositions.count; index += 1) {
        const x = ringPositions.getX(index);
        const z = ringPositions.getZ(index);
        ringPositions.setY(index, heightForPoint(x, z));
      }

      applyWorldGroundUvs(geometry, true);
      geometry.computeVertexNormals();
      horizonTriangleCount += geometry.index.count / 3;
      const material = terrainMaterial.clone();
      material.name = `${name} material`;
      if (useBump) {
        material.bumpScale *= 0.55;
      } else {
        material.bumpMap = null;
        material.bumpScale = 0;
      }
      addGroundMacroVariation(material, groundMacroUniforms);
      const ring = new THREE.Mesh(geometry, material);
      ring.receiveShadow = true;
      ring.castShadow = false;
      ring.name = name;
      group.add(ring);
    };

    addHorizonRing({
      innerRadius: half * 0.62,
      outerRadius: half + 8,
      radialSegments: quality === 'high' ? 40 : 24,
      name: 'Infinite forest floor transition',
      heightForPoint: (x, z) => {
        const edgeDistance = Math.max(Math.abs(x), Math.abs(z));
        const edgeAlignment = THREE.MathUtils.smoothstep(edgeDistance, half - 1, half);
        const overlapOffset = 0.008 * (1 - edgeAlignment);
        return heightAt(x, z) - overlapOffset;
      },
    });
    addHorizonRing({
      innerRadius: half + 6,
      outerRadius: habitat.horizonRadius,
      radialSegments: quality === 'high' ? 8 : 6,
      name: 'Fog blended distant forest floor',
      heightForPoint: () => farGroundHeight - 0.006,
      useBump: false,
    });
  }

  const normalizedModelPropClearings = normalizeModelPropClearings(
    modelPropClearing,
    modelPropClearings,
  );
  const fixedModelPropSpots = createFixedModelPropSpots(
    normalizedModelPropClearings,
  );
  const placementExclusions = pondProfile
    ? [...normalizedTreeClearings, ...pondProfile.exclusionZones, ...fixedModelPropSpots]
    : [...normalizedTreeClearings, ...fixedModelPropSpots];
  const rocks = createRocks({
    seed,
    season,
    quality,
    heightAt,
    habitatSize: habitat.detailSize,
    populationScale: habitat.populationScale,
    exclusionZones: placementExclusions,
  });
  const outerRocks = habitat.infinite
    ? createRocks({
      seed,
      season,
      quality: 'low',
      heightAt,
      habitatSize: habitat.detailSize,
      exclusionZones: normalizedTreeClearings,
      placement: {
        minRadius: 17,
        maxRadius: 50,
        requestedCount: quality === 'high' ? 18 : 10,
        patchCount: quality === 'high' ? 4 : 3,
        seedSalt: 'infinite-understory',
        castShadow: false,
        receiveShadow: true,
      },
    })
    : null;
  if (outerRocks) outerRocks.group.name = 'Sparse infinite woodland rocks';
  const rockCollections = outerRocks ? [rocks, outerRocks] : [rocks];
  const containsAnyRock = (x, z, padding = 0) => (
    rockCollections.some((collection) => collection.containsGroundPoint(x, z, padding))
    || (pondFeatures?.userData.containsGroundPoint?.(x, z, padding) ?? false)
  );
  const surfaceHeightAt = (x, z) => rockCollections.reduce(
    (highest, collection) => Math.max(highest, collection.surfaceHeightAt(x, z)),
    heightAt(x, z),
  );

  const modelPropSpots = createModelPropSpots({
    clearings: normalizedModelPropClearings,
    fixedSpots: fixedModelPropSpots,
    halfSize: half,
    random,
    isInsideTreeClearing,
    containsRock: containsAnyRock,
    containsPond,
  });
  const vegetationClearings = [...normalizedTreeClearings, ...modelPropSpots];
  const isInsideVegetationClearing = (x, z, padding = 0) => (
    vegetationClearings.some((clearing) => (
      Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius + padding
    ))
  );

  const grassQualityBase = quality === 'high' ? 15000 : 6500;
  const grassCountBase = Math.round(grassQualityBase * habitat.populationScale);
  const grassCapacity = Math.max(600, Math.round(grassCountBase * 1.4));
  const requestedGrassCount = Math.max(600, Math.round(grassCountBase * grassDensity));
  const grassGeometry = createGrassGeometry();
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.92,
    emissive: '#263d1e',
    emissiveIntensity: 0.14,
    side: THREE.DoubleSide,
  });
  addWindToMaterial(grassMaterial);
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCapacity);
  const dummy = new THREE.Object3D();
  const grassPalette = SEASONS[season].grass;
  const grassPatchBase = quality === 'high' ? 28 : 18;
  const grassPatchCount = Math.round(
    grassPatchBase * Math.sqrt(habitat.populationScale),
  );
  const grassPatches = [];
  let patchAttempts = 0;

  while (grassPatches.length < grassPatchCount && patchAttempts < grassPatchCount * 12) {
    patchAttempts += 1;
    const radius = random.range(0.65, 1.65);
    const centerLimit = half - radius - 0.28;
    const x = random.range(-centerLimit, centerLimit);
    const z = random.range(-centerLimit, centerLimit);
    if (
      normalizedTreeClearings.length === 0
      && Math.hypot(x, z) < 1.4 + radius * 0.35
    ) continue;
    if (isInsideVegetationClearing(x, z, radius * 0.2)) continue;
    if (containsPond(x, z, radius * 0.42 + 0.18)) continue;
    grassPatches.push({
      x,
      z,
      radius,
      heightFactor: random.chance(0.3)
        ? random.range(1.25, 1.5)
        : random.range(0.88, 1.12),
    });
  }

  let placed = 0;
  let attempts = 0;

  while (placed < grassCapacity && attempts < grassCapacity * 10) {
    attempts += 1;
    const selectedPatch = grassPatches.length > 0 && random.chance(0.78)
      ? random.pick(grassPatches)
      : null;
    let x;
    let z;

    if (selectedPatch) {
      const angle = random.range(0, Math.PI * 2);
      const distance = Math.sqrt(random.float()) * selectedPatch.radius;
      x = selectedPatch.x + Math.cos(angle) * distance;
      z = selectedPatch.z + Math.sin(angle) * distance;
    } else {
      x = random.range(-half + 0.25, half - 0.25);
      z = random.range(-half + 0.25, half - 0.25);
    }

    if (containsAnyRock(x, z, 0.085)) continue;
    if (containsPond(x, z, 0.22)) continue;
    const radiusFromTree = Math.hypot(x, z);
    const coverage = noise(x * 0.2 + 8, z * 0.2 - 5, 3);
    const insideDefaultTreeClearing = normalizedTreeClearings.length === 0
      && radiusFromTree < random.range(1.15, 1.7);
    if (
      insideDefaultTreeClearing
      || isInsideVegetationClearing(x, z)
      || coverage < -0.62
      || random.chance(0.02)
    ) continue;

    const heightPatch = noise(x * 0.105 + 17, z * 0.105 - 11, 4) * 0.5 + 0.5;
    const regionalHeight = THREE.MathUtils.lerp(0.9, 1.18, heightPatch);
    const patchHeight = selectedPatch?.heightFactor
      ?? THREE.MathUtils.lerp(0.9, 1.1, heightPatch);
    const heightScale = random.range(0.92, 1.08) * regionalHeight * patchHeight;
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(random.signed(0.035), random.range(0, Math.PI * 2), random.signed(0.035));
    dummy.scale.set(random.range(0.9, 1.15), heightScale, random.range(0.9, 1.15));
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    const grassColor = colorFromPalette(random, grassPalette, 0.018);
    grassColor.offsetHSL(0, 0, 0.018 + heightPatch * 0.012);
    grass.setColorAt(placed, grassColor);
    placed += 1;
  }
  grass.count = Math.min(placed, requestedGrassCount);
  grass.instanceMatrix.needsUpdate = true;
  grass.instanceColor.needsUpdate = true;
  grass.receiveShadow = true;
  grass.castShadow = false;
  grass.frustumCulled = false;
  grass.name = 'Instanced clustered forest grass';
  group.add(grass);

  let outerGrass = null;
  let outerGrassPlaced = 0;
  let outerGrassCountBase = 0;

  if (habitat.infinite) {
    const outerRandom = random.fork('infinite-outer-grass');
    outerGrassCountBase = quality === 'high' ? 64000 : 28000;
    const outerGrassCapacity = Math.round(outerGrassCountBase * 1.4);
    const requestedOuterGrassCount = Math.round(outerGrassCountBase * grassDensity);
    const innerRadius = half * 0.88;
    const outerRadius = 72;
    let outerAttempts = 0;
    outerGrass = new THREE.InstancedMesh(
      grassGeometry,
      grassMaterial,
      outerGrassCapacity,
    );

    while (
      outerGrassPlaced < outerGrassCapacity
      && outerAttempts < outerGrassCapacity * 12
    ) {
      outerAttempts += 1;
      const radialT = Math.pow(outerRandom.float(), 1.6);
      const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, radialT);
      const angle = outerRandom.range(0, Math.PI * 2);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const coverage = noise(x * 0.16 + 31, z * 0.16 - 23, 3);
      if (coverage < -0.56 || outerRandom.chance(0.035 + radialT * 0.22)) continue;
      if (containsAnyRock(x, z, 0.085)) continue;
      if (isInsideVegetationClearing(x, z, 0.14)) continue;

      const heightPatch = noise(x * 0.09 - 13, z * 0.09 + 19, 4) * 0.5 + 0.5;
      const distanceHeight = THREE.MathUtils.lerp(1, 0.72, radialT);
      const heightScale = outerRandom.range(0.82, 1.08)
        * THREE.MathUtils.lerp(0.88, 1.15, heightPatch)
        * distanceHeight;
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.set(
        outerRandom.signed(0.035),
        outerRandom.range(0, Math.PI * 2),
        outerRandom.signed(0.035),
      );
      dummy.scale.set(
        outerRandom.range(0.86, 1.1),
        heightScale,
        outerRandom.range(0.86, 1.1),
      );
      dummy.updateMatrix();
      outerGrass.setMatrixAt(outerGrassPlaced, dummy.matrix);
      const grassColor = colorFromPalette(outerRandom, grassPalette, 0.016);
      grassColor.offsetHSL(0, -0.015, 0.012 + heightPatch * 0.01);
      outerGrass.setColorAt(outerGrassPlaced, grassColor);
      outerGrassPlaced += 1;
    }

    outerGrass.count = Math.min(outerGrassPlaced, requestedOuterGrassCount);
    outerGrass.instanceMatrix.needsUpdate = true;
    outerGrass.instanceColor.needsUpdate = true;
    outerGrass.receiveShadow = false;
    outerGrass.castShadow = false;
    outerGrass.frustumCulled = false;
    outerGrass.name = 'Dense infinite forest grass transition';
    group.add(outerGrass);
  }

  const fallenLeaves = createFallenLeaves(
    random.fork('fallen-leaves'),
    heightAt,
    season,
    quality,
    habitat,
    containsPond,
  );
  const woodChips = createWoodChips(
    random.fork('wood-chips'),
    heightAt,
    quality,
    habitat,
    containsPond,
  );
  const flowers = createWildflowers(
    random.fork('flowers'),
    heightAt,
    season,
    quality,
    habitat,
    (x, z, padding) => containsAnyRock(x, z, padding) || containsPond(x, z, padding),
  );
  const bushes = createBushes({
    seed,
    season,
    quality,
    heightAt,
    populationScale: PERFORMANCE.bushPopulationScale,
    placementRadius: habitat.shrubRadius,
    exclusionZones: [...placementExclusions, ...modelPropSpots],
    placement: {
      rejectPoint: (x, z, padding) => (
        containsAnyRock(x, z, padding) || containsPond(x, z, padding + 0.2)
      ),
    },
  });
  const outerBushes = habitat.infinite
    ? createBushes({
      seed,
      season,
      quality: 'low',
      heightAt,
      exclusionZones: [...normalizedTreeClearings, ...modelPropSpots],
      placement: {
        mode: 'annulus',
        minRadius: 17,
        maxRadius: 46,
        count: quality === 'high' ? 24 : 14,
        variant: 'infinite-understory',
        castShadow: false,
        receiveShadow: false,
        exclusionPadding: 1.4,
        rejectPoint: containsAnyRock,
      },
    })
    : null;
  if (outerBushes) outerBushes.group.name = 'Infinite forest understory bushes';
  group.add(fallenLeaves, woodChips, flowers, rocks.group, bushes.group);
  if (outerRocks) group.add(outerRocks.group);
  if (outerBushes) group.add(outerBushes.group);

  const update = (elapsed, windStrength) => {
    const uniforms = grassMaterial.userData.windUniforms;
    uniforms.uTime.value = elapsed;
    uniforms.uWind.value = windStrength;
  };

  const setGrassVisibility = (playerPosition, cameraPosition, delta) => {
    const uniforms = grassMaterial.userData.windUniforms;
    const enabled = GRASS_VISIBILITY.enabled && playerPosition && cameraPosition;
    if (enabled) {
      uniforms.uGrassPlayer.value.copy(playerPosition);
      uniforms.uGrassCamera.value.copy(cameraPosition);
    }
    const blend = 1 - Math.exp(-GRASS_VISIBILITY.transitionRate * Math.max(0, Math.min(delta, 0.1)));
    uniforms.uGrassVisibility.value += ((enabled ? 1 : 0) - uniforms.uGrassVisibility.value) * blend;
  };

  const stats = {
    area: habitat.id,
    areaLabel: habitat.label,
    grass: grass.count + (outerGrass?.count ?? 0),
    stones: rocks.count + (outerRocks?.count ?? 0),
    mossyStones: rocks.mossCount + (outerRocks?.mossCount ?? 0),
    woodChips: woodChips.count,
    fallenLeaves: fallenLeaves.count,
    bushes: bushes.count + (outerBushes?.count ?? 0),
    terrainTriangles: terrainGeometry.index.count / 3 + horizonTriangleCount,
    pond: Boolean(pondProfile),
  };

  const setGrassDensity = (density) => {
    const normalizedDensity = THREE.MathUtils.clamp(Number(density) || 1, 0.25, 1.4);
    grass.count = Math.min(
      placed,
      Math.max(600, Math.round(grassCountBase * normalizedDensity)),
    );
    if (outerGrass) {
      outerGrass.count = Math.min(
        outerGrassPlaced,
        Math.round(outerGrassCountBase * normalizedDensity),
      );
    }
    stats.grass = grass.count + (outerGrass?.count ?? 0);
    return stats.grass;
  };

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

  return {
    group,
    terrainSurface: terrain,
    heightAt,
    surfaceHeightAt,
    rockAnchor: rocks.propAnchor,
    rockSurfaceAnchors: rocks.surfaceAnchors,
    rockSurfaceMesh: rocks.surfaceMesh,
    pondRockSurfaceAnchors: pondFeatures?.userData.shorelineRockAnchors ?? [],
    pondRockSurfaceMesh: pondFeatures?.userData.shorelineRockSurfaceMesh ?? null,
    getRockSurfacePoint: rocks.getSurfacePoint,
    containsRock: containsAnyRock,
    containsPond,
    modelPropSpots,
    pondProfile,
    pondStone: pondFeatures?.userData.interactiveStone ?? null,
    update,
    setGrassDensity,
    setGrassVisibility,
    stats,
  };
}
