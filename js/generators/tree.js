import * as THREE from 'three';
import { SeededRandom, hashString } from '../utils/random.js';

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;

const SEASON_PALETTES = {
  spring: [0x8fbe52, 0x7bb34a, 0xa8cd67, 0x70a941, 0xb9d77a],
  summer: [0x5f8f3f, 0x719f48, 0x83aa55, 0x4f7d38, 0x95b864],
  autumn: [0xc76527, 0xdd9130, 0xad4924, 0xe6ad42, 0x98602c],
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? THREE.MathUtils.clamp(number, min, max) : fallback;
}

function normalizeOptions(options = {}) {
  const season = Object.hasOwn(SEASON_PALETTES, options.season)
    ? options.season
    : 'summer';

  return {
    seed: options.seed ?? 41237,
    age: clampNumber(options.age, 1, 0.75, 1.25),
    branchSpread: clampNumber(options.branchSpread, 1, 0.7, 1.3),
    leafDensity: clampNumber(options.leafDensity, 1, 0.4, 1.4),
    season,
    quality: options.quality === 'low' ? 'low' : 'high',
  };
}

function randomUnitVector(random) {
  const y = random.range(-1, 1);
  const angle = random.range(0, TAU);
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius,
  );
}

function setTextureColorSpace(texture) {
  if ('colorSpace' in texture && THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
}

function createBarkTextures(random, quality) {
  if (typeof document === 'undefined') {
    return {
      colorMap: null,
      normalMap: null,
      roughnessMap: null,
      sampleHeight: () => 0.5,
    };
  }

  const width = quality === 'high' ? 512 : 256;
  const height = quality === 'high' ? 1024 : 512;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughnessCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  normalCanvas.width = width;
  normalCanvas.height = height;
  roughnessCanvas.width = width;
  roughnessCanvas.height = height;

  const colorContext = colorCanvas.getContext('2d');
  const normalContext = normalCanvas.getContext('2d');
  const roughnessContext = roughnessCanvas.getContext('2d');
  const colorImage = colorContext.createImageData(width, height);
  const normalImage = normalContext.createImageData(width, height);
  const roughnessImage = roughnessContext.createImageData(width, height);
  const colorData = colorImage.data;
  const normalData = normalImage.data;
  const roughnessData = roughnessImage.data;
  const surfaceHeightField = new Float32Array(width * height);
  const shapeHeightField = new Float32Array(width * height);
  const seedValue = hashString(random.seed);
  const deepColor = [44, 40, 36];
  const middleColor = [92, 82, 72];
  const raisedColor = [134, 119, 101];
  const lichenColor = [112, 116, 96];

  const wrapIndex = (value, size) => ((value % size) + size) % size;
  const wrapUnit = (value) => value - Math.floor(value);
  const wrappedDistance = (first, second) => {
    const direct = Math.abs(first - second);
    return Math.min(direct, 1 - direct);
  };
  const hashUnit = (x, y, salt) => {
    let value = Math.imul((x + salt) | 0, 374761393)
      + Math.imul((y - salt) | 0, 668265263);
    value = Math.imul(value ^ value >>> 13, 1274126177);
    return ((value ^ value >>> 16) >>> 0) / 4294967295;
  };
  const periodicValueNoise = (u, v, cellsX, cellsY, salt) => {
    const wrappedU = wrapUnit(u);
    const wrappedV = wrapUnit(v);
    const px = wrappedU * cellsX;
    const py = wrappedV * cellsY;
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const tx = px - x0;
    const ty = py - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = hashUnit(wrapIndex(x0, cellsX), wrapIndex(y0, cellsY), salt);
    const b = hashUnit(wrapIndex(x0 + 1, cellsX), wrapIndex(y0, cellsY), salt);
    const c = hashUnit(wrapIndex(x0, cellsX), wrapIndex(y0 + 1, cellsY), salt);
    const d = hashUnit(wrapIndex(x0 + 1, cellsX), wrapIndex(y0 + 1, cellsY), salt);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(a, b, sx),
      THREE.MathUtils.lerp(c, d, sx),
      sy,
    ) * 2 - 1;
  };
  const periodicNoise1D = (v, cells, salt) => {
    const py = wrapUnit(v) * cells;
    const y0 = Math.floor(py);
    const ty = py - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const a = hashUnit(0, wrapIndex(y0, cells), salt);
    const b = hashUnit(0, wrapIndex(y0 + 1, cells), salt);
    return THREE.MathUtils.lerp(a, b, sy) * 2 - 1;
  };
  const periodicFbm = (u, v, cellsX, cellsY, salt, octaves) => {
    let value = 0;
    let amplitude = 0.56;
    let normalization = 0;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      value += periodicValueNoise(
        u,
        v,
        cellsX * frequency,
        cellsY * frequency,
        salt + octave * 977,
      ) * amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / normalization;
  };

  const fissureCount = quality === 'high' ? 16 : 11;
  const gapWeights = Array.from(
    { length: fissureCount },
    () => random.range(0.62, 1.42),
  );
  const totalGapWeight = gapWeights.reduce((sum, value) => sum + value, 0);
  const fissurePaths = [];
  let pathCursor = random.float();

  for (let pathIndex = 0; pathIndex < fissureCount; pathIndex += 1) {
    pathCursor += gapWeights[pathIndex] / totalGapWeight;
    fissurePaths.push({
      baseU: wrapUnit(pathCursor),
      slowDrift: random.range(0.018, 0.052),
      fineDrift: random.range(0.004, 0.014),
      slowCells: random.int(2, 4),
      fineCells: random.int(7, 12),
      baseWidth: random.range(0.0035, 0.0085),
      baseDepth: random.range(0.52, 0.96),
      continuityFloor: random.chance(0.42)
        ? random.range(0.04, 0.18)
        : random.range(0.38, 0.58),
      salt: seedValue + pathIndex * 1877 + 701,
    });
  }

  const pathCenters = new Float32Array(height * fissureCount);
  const pathWidths = new Float32Array(height * fissureCount);
  const pathDepths = new Float32Array(height * fissureCount);

  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let pathIndex = 0; pathIndex < fissureCount; pathIndex += 1) {
      const path = fissurePaths[pathIndex];
      const pathOffset = y * fissureCount + pathIndex;
      const slowDrift = periodicNoise1D(v, path.slowCells, path.salt);
      const fineDrift = periodicNoise1D(v, path.fineCells, path.salt + 307);
      const widthNoise = periodicNoise1D(v, path.fineCells + 3, path.salt + 613);
      const depthNoise = periodicNoise1D(v, path.slowCells + 2, path.salt + 919);
      const continuityNoise = periodicNoise1D(v, path.slowCells + 5, path.salt + 1229);
      pathCenters[pathOffset] = wrapUnit(
        path.baseU + slowDrift * path.slowDrift + fineDrift * path.fineDrift,
      );
      pathWidths[pathOffset] = path.baseWidth * THREE.MathUtils.lerp(
        0.72,
        1.34,
        widthNoise * 0.5 + 0.5,
      );
      const depthVariation = THREE.MathUtils.lerp(
        0.72,
        1.05,
        depthNoise * 0.5 + 0.5,
      );
      const continuity = THREE.MathUtils.lerp(
        path.continuityFloor,
        1,
        THREE.MathUtils.smoothstep(continuityNoise, -0.62, 0.42),
      );
      pathDepths[pathOffset] = path.baseDepth * depthVariation * continuity;
    }
  }

  const forkCount = quality === 'high' ? 18 : 10;
  const forkPaths = Array.from({ length: forkCount }, (_, forkIndex) => {
    const startV = random.range(0.05, 0.74);
    const maximumLength = Math.min(0.22, 0.94 - startV);
    return {
      parent: random.int(0, fissureCount - 1),
      startV,
      length: random.range(0.075, Math.max(0.085, maximumLength)),
      direction: (random.chance(0.5) ? -1 : 1) * random.range(0.028, 0.105),
      bend: random.signed(0.025),
      widthScale: random.range(0.48, 0.78),
      depth: random.range(0.38, 0.68),
      salt: seedValue + forkIndex * 1291 + 9103,
    };
  });
  const forkCenters = new Float32Array(height * forkCount);
  const forkWidths = new Float32Array(height * forkCount);
  const forkDepths = new Float32Array(height * forkCount);
  forkCenters.fill(Number.NaN);

  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let forkIndex = 0; forkIndex < forkCount; forkIndex += 1) {
      const fork = forkPaths[forkIndex];
      const t = (v - fork.startV) / fork.length;
      if (t <= 0 || t >= 1) continue;
      const forkOffset = y * forkCount + forkIndex;
      const parentOffset = y * fissureCount + fork.parent;
      const fadeIn = THREE.MathUtils.smoothstep(t, 0, 0.1);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(t, 0.72, 1);
      const activity = fadeIn * fadeOut;
      const easedT = t * t * (3 - 2 * t);
      const bend = fork.bend * 4 * t * (1 - t);
      const irregularity = periodicNoise1D(t, 3, fork.salt) * 0.004 * activity;
      forkCenters[forkOffset] = wrapUnit(
        pathCenters[parentOffset]
          + fork.direction * easedT
          + bend
          + irregularity,
      );
      forkWidths[forkOffset] = pathWidths[parentOffset] * fork.widthScale;
      forkDepths[forkOffset] = fork.depth * activity;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const fieldIndex = y * width + x;
      const u = x / width;
      const warpU = periodicFbm(u, v, 2, 7, seedValue + 401, 3) * 0.03
        + periodicFbm(u, v, 7, 3, seedValue + 809, 2) * 0.008;
      const warpV = periodicFbm(u, v, 3, 2, seedValue + 1201, 2) * 0.012;
      const warpedU = wrapUnit(u + warpU);
      const warpedV = wrapUnit(v + warpV);
      let fissure = 0;
      let shoulder = 0;

      for (let pathIndex = 0; pathIndex < fissureCount; pathIndex += 1) {
        const pathOffset = y * fissureCount + pathIndex;
        const distance = wrappedDistance(warpedU, pathCenters[pathOffset]);
        const pathWidth = pathWidths[pathOffset];
        const core = 1 - THREE.MathUtils.smoothstep(
          distance,
          0,
          pathWidth * 0.72,
        );
        const groove = 1 - THREE.MathUtils.smoothstep(
          distance,
          pathWidth * 0.28,
          pathWidth * 3.2,
        );
        const grooveDepth = pathDepths[pathOffset]
          * THREE.MathUtils.clamp(groove * 0.72 + core * 0.36, 0, 1);
        fissure = Math.max(fissure, grooveDepth);
        const outerShoulder = 1 - THREE.MathUtils.smoothstep(
          distance,
          pathWidth * 1.25,
          pathWidth * 4.6,
        );
        const innerShoulder = THREE.MathUtils.smoothstep(
          distance,
          pathWidth * 0.62,
          pathWidth * 1.95,
        );
        shoulder = Math.max(shoulder, outerShoulder * innerShoulder);
      }

      for (let forkIndex = 0; forkIndex < forkCount; forkIndex += 1) {
        const forkOffset = y * forkCount + forkIndex;
        const forkCenter = forkCenters[forkOffset];
        if (!Number.isFinite(forkCenter)) continue;
        const distance = wrappedDistance(warpedU, forkCenter);
        const forkWidth = forkWidths[forkOffset];
        const forkGroove = 1 - THREE.MathUtils.smoothstep(
          distance,
          forkWidth * 0.2,
          forkWidth * 2.6,
        );
        const forkDepth = forkGroove * forkDepths[forkOffset];
        fissure = Math.max(fissure, forkDepth);
        const forkShoulder = (
          1 - THREE.MathUtils.smoothstep(
            distance,
            forkWidth,
            forkWidth * 3.8,
          )
        ) * THREE.MathUtils.smoothstep(
          distance,
          forkWidth * 0.5,
          forkWidth * 1.6,
        );
        shoulder = Math.max(shoulder, forkShoulder * forkDepths[forkOffset]);
      }

      const longitudinal = periodicFbm(
        warpedU,
        warpedV,
        10,
        3,
        seedValue + 2203,
        4,
      );
      const ridgeField = periodicFbm(
        warpedU + longitudinal * 0.026,
        warpedV,
        23,
        7,
        seedValue + 3209,
        3,
      );
      const ridgeCrest = Math.pow(
        THREE.MathUtils.clamp(1 - Math.abs(ridgeField), 0, 1),
        2.3,
      );
      const macroSurface = periodicFbm(u, v, 4, 11, seedValue + 4211, 3);
      const grain = periodicFbm(u, v, 37, 17, seedValue + 5227, 2);
      const pores = periodicFbm(u, v, 83, 61, seedValue + 6211, 2);
      const shapeHeight = THREE.MathUtils.clamp(
        0.5
          + longitudinal * 0.12
          + macroSurface * 0.055
          + ridgeCrest * 0.055
          + shoulder * 0.035,
        0.22,
        0.78,
      );
      const heightValue = THREE.MathUtils.clamp(
        0.48
          + longitudinal * 0.13
          + ridgeCrest * 0.1
          + macroSurface * 0.07
          + grain * 0.035
          + pores * 0.012
          + shoulder * 0.16
          - fissure * 0.68,
        0,
        1,
      );
      shapeHeightField[fieldIndex] = shapeHeight;
      surfaceHeightField[fieldIndex] = heightValue;

      const lowerMix = THREE.MathUtils.smoothstep(heightValue, 0.055, 0.57);
      const raisedMix = THREE.MathUtils.smoothstep(heightValue, 0.43, 0.82);
      const colorVariation = macroSurface * 8 + grain * 3 + ridgeCrest * 3;
      const warmth = Math.max(0, longitudinal) * Math.max(0, ridgeCrest - 0.45) * 16;
      const lichenNoise = periodicFbm(u, v, 5, 13, seedValue + 7211, 3);
      const lichenMix = THREE.MathUtils.smoothstep(lichenNoise, 0.58, 0.82)
        * THREE.MathUtils.smoothstep(heightValue, 0.54, 0.8)
        * 0.18;

      for (let channel = 0; channel < 3; channel += 1) {
        const lower = THREE.MathUtils.lerp(
          deepColor[channel],
          middleColor[channel],
          lowerMix,
        );
        const bark = THREE.MathUtils.lerp(
          lower,
          raisedColor[channel],
          raisedMix * 0.86,
        );
        const warmChannel = channel === 0
          ? warmth
          : channel === 1
            ? warmth * 0.4
            : 0;
        const creviceShade = fissure * (channel === 0 ? 8 : channel === 1 ? 7 : 6);
        colorData[index + channel] = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(
            bark + colorVariation + warmChannel - creviceShade,
            lichenColor[channel],
            lichenMix,
          ),
          25,
          166,
        );
      }
      colorData[index + 3] = 255;

      const roughness = THREE.MathUtils.clamp(
        232
          - raisedMix * 18
          - shoulder * 10
          + fissure * 24
          + Math.abs(pores) * 5,
        198,
        254,
      );
      roughnessData[index] = roughness;
      roughnessData[index + 1] = roughness;
      roughnessData[index + 2] = roughness;
      roughnessData[index + 3] = 255;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const previousY = wrapIndex(y - 1, height);
    const nextY = wrapIndex(y + 1, height);
    for (let x = 0; x < width; x += 1) {
      const previousX = wrapIndex(x - 1, width);
      const nextX = wrapIndex(x + 1, width);
      const left = surfaceHeightField[y * width + previousX];
      const right = surfaceHeightField[y * width + nextX];
      const above = surfaceHeightField[previousY * width + x];
      const below = surfaceHeightField[nextY * width + x];
      let normalX = -(right - left) * 9.2;
      let normalY = -(below - above) * 2.6;
      let normalZ = 1;
      const normalLength = Math.hypot(normalX, normalY, normalZ);
      normalX /= normalLength;
      normalY /= normalLength;
      normalZ /= normalLength;
      const index = (y * width + x) * 4;
      normalData[index] = Math.round((normalX * 0.5 + 0.5) * 255);
      normalData[index + 1] = Math.round((normalY * 0.5 + 0.5) * 255);
      normalData[index + 2] = Math.round((normalZ * 0.5 + 0.5) * 255);
      normalData[index + 3] = 255;
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  normalContext.putImageData(normalImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  colorMap.name = 'Longitudinal procedural bark color';
  normalMap.name = 'Longitudinal procedural bark normals';
  roughnessMap.name = 'Longitudinal procedural bark roughness';
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  colorMap.flipY = false;
  normalMap.flipY = false;
  roughnessMap.flipY = false;
  colorMap.anisotropy = quality === 'high' ? 8 : 4;
  normalMap.anisotropy = quality === 'high' ? 8 : 4;
  roughnessMap.anisotropy = quality === 'high' ? 8 : 4;
  setTextureColorSpace(colorMap);

  const sampleHeight = (u, v) => {
    const px = wrapUnit(u) * width;
    const py = wrapUnit(v) * height;
    const x0 = Math.floor(px) % width;
    const y0 = Math.floor(py) % height;
    const x1 = (x0 + 1) % width;
    const y1 = (y0 + 1) % height;
    const tx = px - Math.floor(px);
    const ty = py - Math.floor(py);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(
        shapeHeightField[y0 * width + x0],
        shapeHeightField[y0 * width + x1],
        tx,
      ),
      THREE.MathUtils.lerp(
        shapeHeightField[y1 * width + x0],
        shapeHeightField[y1 * width + x1],
        tx,
      ),
      ty,
    );
  };

  return { colorMap, normalMap, roughnessMap, sampleHeight };
}

function createLeafTexture(quality) {
  if (typeof document === 'undefined') {
    return null;
  }

  const width = quality === 'high' ? 256 : 128;
  const height = quality === 'high' ? 512 : 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const pseudoRandom = (value) => {
    const result = Math.sin(value * 91.733 + 17.17) * 43758.5453;
    return result - Math.floor(result);
  };

  const drawLeaflet = (centerX, centerY, angle, length, leafWidth, variant) => {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(angle);
    const path = new Path2D();
    path.moveTo(0, 0);

    const edgeSteps = quality === 'high' ? 18 : 12;
    for (let step = 1; step <= edgeSteps; step += 1) {
      const t = step / edgeSteps;
      const envelope = Math.pow(Math.sin(Math.PI * t), 0.72);
      const serration = 1 + Math.sin(t * Math.PI * 12 + variant * 1.7) * 0.075;
      path.lineTo(t * length, -leafWidth * envelope * serration);
    }
    for (let step = edgeSteps - 1; step >= 0; step -= 1) {
      const t = step / edgeSteps;
      const envelope = Math.pow(Math.sin(Math.PI * t), 0.72);
      const serration = 1 + Math.sin(t * Math.PI * 12 + variant * 1.7 + 0.9) * 0.075;
      path.lineTo(t * length, leafWidth * envelope * serration);
    }
    path.closePath();

    const gradient = context.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, '#aebd95');
    gradient.addColorStop(0.38, '#edf2dc');
    gradient.addColorStop(0.78, '#cad7ad');
    gradient.addColorStop(1, '#9eaf85');
    context.strokeStyle = 'rgba(166, 185, 137, 0.24)';
    context.lineWidth = Math.max(3, width / 55);
    context.stroke(path);
    context.fillStyle = gradient;
    context.fill(path);
    context.strokeStyle = 'rgba(58, 79, 42, 0.68)';
    context.lineWidth = Math.max(0.65, width / 220);
    context.stroke(path);

    context.save();
    context.clip(path);
    for (let speck = 0; speck < 24; speck += 1) {
      const x = pseudoRandom(variant * 53 + speck * 2) * length;
      const y = (pseudoRandom(variant * 71 + speck * 2 + 1) - 0.5) * leafWidth * 1.55;
      const radius = width * (0.0012 + pseudoRandom(variant + speck) * 0.0025);
      context.fillStyle = speck % 3 === 0
        ? 'rgba(245, 248, 226, 0.3)'
        : 'rgba(52, 79, 38, 0.18)';
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
    }
    context.restore();

    context.strokeStyle = 'rgba(64, 83, 43, 0.58)';
    context.lineWidth = Math.max(0.7, width / 180);
    context.beginPath();
    context.moveTo(0, 0);
    context.quadraticCurveTo(length * 0.48, variant % 2 === 0 ? -1 : 1, length * 0.94, 0);
    context.stroke();
    context.restore();
  };

  const stemX = width * 0.5;
  context.strokeStyle = 'rgba(75, 88, 48, 0.94)';
  context.lineWidth = Math.max(1.4, width / 86);
  context.beginPath();
  context.moveTo(stemX, height * 0.96);
  context.bezierCurveTo(width * 0.48, height * 0.68, width * 0.53, height * 0.34, stemX, height * 0.075);
  context.stroke();

  const pairYs = [0.79, 0.65, 0.51, 0.37, 0.24];
  pairYs.forEach((normalizedY, index) => {
    const centerY = height * normalizedY;
    const length = width * (0.3 + index * 0.018);
    const leafletWidth = width * (0.082 + index * 0.004);
    const lift = 0.43 + index * 0.035;
    drawLeaflet(stemX - width * 0.012, centerY, Math.PI + lift, length, leafletWidth, index * 2);
    drawLeaflet(stemX + width * 0.012, centerY - height * 0.012, -lift, length, leafletWidth, index * 2 + 1);
  });
  drawLeaflet(stemX, height * 0.19, -Math.PI * 0.5, width * 0.37, width * 0.095, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Procedural alpha-masked compound leaf spray';
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = quality === 'high' ? 8 : 4;
  setTextureColorSpace(texture);
  return texture;
}

function createLeafGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rowCount = 7;

  for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
    const angle = cardIndex * Math.PI * 0.5;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const baseIndex = positions.length / 3;

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const t = rowIndex / (rowCount - 1);
      const bend = Math.sin(t * Math.PI) * (cardIndex === 0 ? 0.065 : -0.055);
      for (const side of [-1, 1]) {
        const localX = side * 0.5;
        positions.push(
          localX * cosine + bend * sine,
          t,
          -localX * sine + bend * cosine,
        );
        uvs.push(side < 0 ? 0 : 1, t);
      }
    }

    for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex += 1) {
      const current = baseIndex + rowIndex * 2;
      const next = current + 2;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = 'Crossed compound leaf spray cards';
  return geometry;
}

function chooseInitialNormal(tangent) {
  const helper = Math.abs(tangent.y) < 0.88 ? UP : X_AXIS;
  const normal = new THREE.Vector3().crossVectors(helper, tangent).normalize();
  if (normal.lengthSq() < 0.5) {
    normal.set(0, 0, 1);
  }
  return normal;
}

function appendTube(branch, radialSegments, branchIndex, buffers, sampleBarkHeight) {
  const { points, radii, capStart = false, capEnd = true } = branch;
  if (points.length < 2) return;

  const ringCount = points.length;
  const tangents = new Array(ringCount);
  const normals = new Array(ringCount);
  const binormals = new Array(ringCount);
  const lengths = new Array(ringCount).fill(0);
  const transport = new THREE.Quaternion();
  const scratch = new THREE.Vector3();

  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    if (ringIndex === 0) {
      tangents[ringIndex] = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    } else if (ringIndex === ringCount - 1) {
      tangents[ringIndex] = new THREE.Vector3().subVectors(points[ringIndex], points[ringIndex - 1]).normalize();
    } else {
      tangents[ringIndex] = new THREE.Vector3().subVectors(points[ringIndex + 1], points[ringIndex - 1]).normalize();
    }

    if (ringIndex > 0) {
      lengths[ringIndex] = lengths[ringIndex - 1] + points[ringIndex].distanceTo(points[ringIndex - 1]);
    }
  }

  normals[0] = chooseInitialNormal(tangents[0]);
  binormals[0] = new THREE.Vector3().crossVectors(tangents[0], normals[0]).normalize();

  for (let ringIndex = 1; ringIndex < ringCount; ringIndex += 1) {
    transport.setFromUnitVectors(tangents[ringIndex - 1], tangents[ringIndex]);
    normals[ringIndex] = normals[ringIndex - 1].clone().applyQuaternion(transport);
    normals[ringIndex].addScaledVector(
      tangents[ringIndex],
      -normals[ringIndex].dot(tangents[ringIndex]),
    ).normalize();
    binormals[ringIndex] = new THREE.Vector3()
      .crossVectors(tangents[ringIndex], normals[ringIndex])
      .normalize();
  }

  const firstVertex = buffers.positions.length / 3;
  const ringStride = radialSegments + 1;
  const circumference = Math.max(radii[0], 0.05) * TAU;
  const uRepeats = Math.max(1, Math.round(circumference / 1.35));
  const phaseU = ((branchIndex + 1) * 0.61803398875) % 1;
  const phaseV = ((branchIndex + 1) * 0.41421356237) % 1;
  const verticalRepeatLength = THREE.MathUtils.lerp(7.5, 9, phaseU);
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const point = points[ringIndex];
    const radius = Math.max(0.0005, radii[ringIndex]);

    for (let sideIndex = 0; sideIndex <= radialSegments; sideIndex += 1) {
      const angle = (sideIndex / radialSegments) * TAU;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      scratch.copy(normals[ringIndex]).multiplyScalar(cosine)
        .addScaledVector(binormals[ringIndex], sine)
        .normalize();
      const u = sideIndex / radialSegments * uRepeats + phaseU;
      const v = lengths[ringIndex] / verticalRepeatLength + phaseV;
      const barkHeight = sampleBarkHeight ? sampleBarkHeight(u, v) : 0.5;
      const barkDisplacement = (barkHeight - 0.5)
        * Math.min(0.01, radius * 0.022);
      const surfaceRadius = radius + barkDisplacement;

      buffers.positions.push(
        point.x + scratch.x * surfaceRadius,
        point.y + scratch.y * surfaceRadius,
        point.z + scratch.z * surfaceRadius,
      );
      buffers.normals.push(scratch.x, scratch.y, scratch.z);
      buffers.uvs.push(u, v);
    }
    buffers.seams.push([
      firstVertex + ringIndex * ringStride,
      firstVertex + ringIndex * ringStride + radialSegments,
    ]);
  }

  for (let ringIndex = 0; ringIndex < ringCount - 1; ringIndex += 1) {
    const currentRing = firstVertex + ringIndex * ringStride;
    const nextRing = currentRing + ringStride;

    for (let sideIndex = 0; sideIndex < radialSegments; sideIndex += 1) {
      const a = currentRing + sideIndex;
      const b = nextRing + sideIndex;
      const c = nextRing + sideIndex + 1;
      const d = currentRing + sideIndex + 1;
      buffers.indices.push(a, d, b, b, d, c);
    }
  }

  if (capStart) {
    const centerIndex = buffers.positions.length / 3;
    const tangent = tangents[0];
    const point = points[0];
    buffers.positions.push(point.x, point.y, point.z);
    buffers.normals.push(-tangent.x, -tangent.y, -tangent.z);
    buffers.uvs.push(0.5, 0.5);
    const rimStart = buffers.positions.length / 3;

    for (let sideIndex = 0; sideIndex <= radialSegments; sideIndex += 1) {
      const sourceIndex = (firstVertex + sideIndex) * 3;
      const angle = sideIndex / radialSegments * TAU;
      buffers.positions.push(
        buffers.positions[sourceIndex],
        buffers.positions[sourceIndex + 1],
        buffers.positions[sourceIndex + 2],
      );
      buffers.normals.push(-tangent.x, -tangent.y, -tangent.z);
      buffers.uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    }

    for (let sideIndex = 0; sideIndex < radialSegments; sideIndex += 1) {
      buffers.indices.push(centerIndex, rimStart + sideIndex + 1, rimStart + sideIndex);
    }
  }

  if (capEnd) {
    const centerIndex = buffers.positions.length / 3;
    const tangent = tangents[ringCount - 1];
    const point = points[ringCount - 1];
    const lastRing = firstVertex + (ringCount - 1) * ringStride;
    buffers.positions.push(point.x, point.y, point.z);
    buffers.normals.push(tangent.x, tangent.y, tangent.z);
    buffers.uvs.push(0.5, 0.5);
    const rimStart = buffers.positions.length / 3;

    for (let sideIndex = 0; sideIndex <= radialSegments; sideIndex += 1) {
      const sourceIndex = (lastRing + sideIndex) * 3;
      const angle = sideIndex / radialSegments * TAU;
      buffers.positions.push(
        buffers.positions[sourceIndex],
        buffers.positions[sourceIndex + 1],
        buffers.positions[sourceIndex + 2],
      );
      buffers.normals.push(tangent.x, tangent.y, tangent.z);
      buffers.uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    }

    for (let sideIndex = 0; sideIndex < radialSegments; sideIndex += 1) {
      buffers.indices.push(centerIndex, rimStart + sideIndex, rimStart + sideIndex + 1);
    }
  }
}

function appendBranchCollar(
  branch,
  radialSegments,
  branchIndex,
  buffers,
  sampleBarkHeight,
) {
  if (branch.kind !== 'branch' || branch.radii[0] < 0.026 || branch.points.length < 2) return;
  const segmentCount = Math.max(8, Math.min(14, radialSegments));
  const ringCount = 6;
  const stride = segmentCount + 1;
  const tangent = new THREE.Vector3()
    .subVectors(branch.points[1], branch.points[0])
    .normalize();
  const normal = chooseInitialNormal(tangent);
  const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
  const nominalRadius = branch.radii[0] / 0.9;
  const center = branch.points[0].clone().addScaledVector(tangent, nominalRadius * 0.22);
  const axisLength = nominalRadius * 1.48;
  const collarRadius = nominalRadius * 1.22;
  const circumference = Math.max(nominalRadius, 0.05) * TAU;
  const uRepeats = Math.max(1, Math.round(circumference / 1.35));
  const phaseU = ((branchIndex + 1) * 0.61803398875) % 1;
  const phaseV = ((branchIndex + 1) * 0.41421356237) % 1;
  const verticalRepeatLength = THREE.MathUtils.lerp(7.5, 9, phaseU);
  const collarSurfaceLength = Math.PI * (axisLength + collarRadius) * 0.5;
  const radialDirection = new THREE.Vector3();
  const surfaceNormal = new THREE.Vector3();
  const startPole = buffers.positions.length / 3;
  buffers.positions.push(
    center.x + tangent.x * axisLength,
    center.y + tangent.y * axisLength,
    center.z + tangent.z * axisLength,
  );
  buffers.normals.push(tangent.x, tangent.y, tangent.z);
  buffers.uvs.push(phaseU + uRepeats * 0.5, phaseV);
  const firstRing = buffers.positions.length / 3;

  for (let ringIndex = 1; ringIndex < ringCount; ringIndex += 1) {
    const v = ringIndex / ringCount;
    const phi = v * Math.PI;
    const axial = Math.cos(phi);
    const radial = Math.sin(phi);

    for (let sideIndex = 0; sideIndex <= segmentCount; sideIndex += 1) {
      const u = sideIndex / segmentCount;
      const theta = u * TAU;
      radialDirection.copy(normal).multiplyScalar(Math.cos(theta))
        .addScaledVector(binormal, Math.sin(theta));
      surfaceNormal.copy(tangent).multiplyScalar(axial / axisLength)
        .addScaledVector(radialDirection, radial / collarRadius)
        .normalize();
      const barkU = u * uRepeats + phaseU;
      const barkV = v * collarSurfaceLength / verticalRepeatLength + phaseV;
      const barkHeight = sampleBarkHeight ? sampleBarkHeight(barkU, barkV) : 0.5;
      const barkDisplacement = (barkHeight - 0.5)
        * Math.min(0.008, nominalRadius * 0.018);
      buffers.positions.push(
        center.x + tangent.x * axial * axisLength
          + radialDirection.x * radial * collarRadius
          + surfaceNormal.x * barkDisplacement,
        center.y + tangent.y * axial * axisLength
          + radialDirection.y * radial * collarRadius
          + surfaceNormal.y * barkDisplacement,
        center.z + tangent.z * axial * axisLength
          + radialDirection.z * radial * collarRadius
          + surfaceNormal.z * barkDisplacement,
      );
      buffers.normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
      buffers.uvs.push(barkU, barkV);
    }

    buffers.seams.push([
      firstRing + (ringIndex - 1) * stride,
      firstRing + (ringIndex - 1) * stride + segmentCount,
    ]);
  }

  for (let sideIndex = 0; sideIndex < segmentCount; sideIndex += 1) {
    buffers.indices.push(startPole, firstRing + sideIndex, firstRing + sideIndex + 1);
  }

  for (let ringIndex = 0; ringIndex < ringCount - 2; ringIndex += 1) {
    const currentRing = firstRing + ringIndex * stride;
    const nextRing = currentRing + stride;
    for (let sideIndex = 0; sideIndex < segmentCount; sideIndex += 1) {
      const a = currentRing + sideIndex;
      const b = nextRing + sideIndex;
      const c = b + 1;
      const d = a + 1;
      buffers.indices.push(a, b, d, b, c, d);
    }
  }

  const endPole = buffers.positions.length / 3;
  buffers.positions.push(
    center.x - tangent.x * axisLength,
    center.y - tangent.y * axisLength,
    center.z - tangent.z * axisLength,
  );
  buffers.normals.push(-tangent.x, -tangent.y, -tangent.z);
  buffers.uvs.push(
    phaseU + uRepeats * 0.5,
    phaseV + collarSurfaceLength / verticalRepeatLength,
  );
  const lastRing = firstRing + (ringCount - 2) * stride;
  for (let sideIndex = 0; sideIndex < segmentCount; sideIndex += 1) {
    buffers.indices.push(endPole, lastRing + sideIndex + 1, lastRing + sideIndex);
  }
}

function chooseWoodRadialSegments(branch, quality) {
  const radius = branch.radii[0] || 0;
  if (quality === 'high') {
    if (branch.kind === 'trunk') return 30;
    if (branch.kind === 'root') return radius > 0.18 ? 20 : 16;
    if (radius >= 0.28) return 24;
    if (radius >= 0.14) return 20;
    if (radius >= 0.07) return 16;
    if (radius >= 0.03) return 12;
    return 8;
  }
  if (branch.kind === 'trunk') return 18;
  if (branch.kind === 'root') return 12;
  if (radius >= 0.16) return 14;
  if (radius >= 0.055) return 10;
  return 7;
}

function buildWoodGeometry(branches, quality, sampleBarkHeight) {
  const buffers = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    seams: [],
  };

  for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
    const branch = branches[branchIndex];
    const radialSegments = chooseWoodRadialSegments(branch, quality);
    appendTube(branch, radialSegments, branchIndex, buffers, sampleBarkHeight);
    appendBranchCollar(
      branch,
      radialSegments,
      branchIndex,
      buffers,
      sampleBarkHeight,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  const normalAttribute = geometry.getAttribute('normal');
  const seamNormal = new THREE.Vector3();
  for (const [firstIndex, lastIndex] of buffers.seams) {
    seamNormal.set(
      normalAttribute.getX(firstIndex) + normalAttribute.getX(lastIndex),
      normalAttribute.getY(firstIndex) + normalAttribute.getY(lastIndex),
      normalAttribute.getZ(firstIndex) + normalAttribute.getZ(lastIndex),
    ).normalize();
    normalAttribute.setXYZ(firstIndex, seamNormal.x, seamNormal.y, seamNormal.z);
    normalAttribute.setXYZ(lastIndex, seamNormal.x, seamNormal.y, seamNormal.z);
  }
  normalAttribute.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'Merged procedural ash wood';
  return geometry;
}

function curveThrough(points, segmentCount) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
  return curve.getPoints(segmentCount);
}

function makeTrunk(random, height, baseRadius, quality) {
  const controlCount = quality === 'high' ? 9 : 7;
  const controls = [new THREE.Vector3(0, 0, 0)];
  const lean = new THREE.Vector2(random.signed(0.17), random.signed(0.17));
  let x = 0;
  let z = 0;

  for (let controlIndex = 1; controlIndex < controlCount; controlIndex += 1) {
    const t = controlIndex / (controlCount - 1);
    const step = height / (controlCount - 1);
    const sway = (0.032 + t * 0.045) * step;
    x += lean.x * step * 0.1 + random.signed(sway);
    z += lean.y * step * 0.1 + random.signed(sway);
    controls.push(new THREE.Vector3(x, height * t, z));
  }

  const segmentCount = quality === 'high' ? 30 : 20;
  const points = curveThrough(controls, segmentCount);
  points.unshift(new THREE.Vector3(
    points[0].x,
    -Math.max(0.2, baseRadius * 0.45),
    points[0].z,
  ));
  const radii = points.map((point, index) => {
    const t = index / (points.length - 1);
    const taper = 0.012 + 0.988 * Math.pow(1 - t, 0.74);
    const swell = 1 + Math.exp(-t * 16) * 0.24;
    return baseRadius * taper * swell;
  });
  if (radii.length >= 3) {
    radii[radii.length - 3] *= 0.32;
    radii[radii.length - 2] = Math.min(radii[radii.length - 2] * 0.12, 0.002);
    radii[radii.length - 1] = 0.0005;
  }

  return { curve: new THREE.CatmullRomCurve3(points), points, radii };
}

function createRootBranches(random, trunkCenter, baseRadius, count, quality) {
  const roots = [];
  const segments = quality === 'high' ? 8 : 6;
  const angleOffset = random.range(0, TAU);

  for (let rootIndex = 0; rootIndex < count; rootIndex += 1) {
    const rootRandom = random.fork(`root-${rootIndex}`);
    const angle = angleOffset + (rootIndex / count) * TAU + rootRandom.signed(0.18);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const sideways = new THREE.Vector3(-radial.z, 0, radial.x);
    const length = baseRadius * rootRandom.range(3.8, 6.2);
    const startHeight = rootRandom.range(0.28, 0.5);
    const bend = rootRandom.signed(length * 0.12);
    const points = [];
    const radii = [];

    for (let segmentIndex = 0; segmentIndex <= segments; segmentIndex += 1) {
      const t = segmentIndex / segments;
      const distance = length * t;
      const point = trunkCenter.clone()
        .addScaledVector(radial, distance)
        .addScaledVector(sideways, Math.sin(t * Math.PI) * bend);
      point.y = THREE.MathUtils.lerp(startHeight, -baseRadius * 0.12, Math.pow(t, 0.58));
      point.y += Math.sin(t * Math.PI) * baseRadius * 0.08;
      points.push(point);
      radii.push(baseRadius * rootRandom.range(0.42, 0.58) * Math.pow(1 - t, 1.2) + 0.004);
    }

    if (radii.length >= 3) {
      radii[radii.length - 3] *= 0.3;
      radii[radii.length - 2] = Math.min(radii[radii.length - 2] * 0.12, 0.002);
      radii[radii.length - 1] = 0.0005;
    }
    roots.push({ points, radii, capStart: false, capEnd: true, kind: 'root' });
  }

  return roots;
}

function localBranchFrame(tangent) {
  const side = new THREE.Vector3().crossVectors(
    Math.abs(tangent.y) > 0.91 ? X_AXIS : UP,
    tangent,
  ).normalize();
  const around = new THREE.Vector3().crossVectors(tangent, side).normalize();
  return { side, around };
}

function generateSkeleton(config, random) {
  const highQuality = config.quality === 'high';
  const height = 10.6 * config.age;
  const baseRadius = 0.61 * Math.pow(config.age, 1.35);
  const trunk = makeTrunk(random.fork('trunk'), height, baseRadius, config.quality);
  const branches = [{
    points: trunk.points,
    radii: trunk.radii,
    capStart: true,
    capEnd: true,
    kind: 'trunk',
  }];
  const terminalPoints = [];
  const rootCount = highQuality ? 10 : 7;
  branches.push(...createRootBranches(
    random.fork('roots'),
    trunk.points[0],
    baseRadius,
    rootCount,
    config.quality,
  ));

  const maxBranchCount = highQuality ? 620 : 240;
  const recursionDepth = highQuality ? 5 : 3;
  const segmentBase = highQuality ? 12 : 8;
  const crownRadius = height * 0.43 * config.branchSpread;
  let limbCount = 0;

  function growBranch(start, initialDirection, length, radius, depth, level, branchRandom) {
    if (branches.length >= maxBranchCount) {
      terminalPoints.push({ point: start.clone(), direction: initialDirection.clone(), scale: length * 0.18 });
      return;
    }

    const segmentCount = Math.max(5, segmentBase - Math.floor(level * 0.7));
    const controls = [start.clone()];
    const direction = initialDirection.clone().normalize();
    let point = start.clone();
    const phase = branchRandom.range(0, TAU);
    const curlAxis = new THREE.Vector3(-direction.z, 0, direction.x).normalize();

    for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex += 1) {
      const t = segmentIndex / segmentCount;
      const stepLength = length / segmentCount;
      const noise = randomUnitVector(branchRandom).multiplyScalar(
        THREE.MathUtils.lerp(0.045, 0.018, t) + level * 0.006,
      );
      noise.y *= 0.55;
      direction.add(noise);
      direction.addScaledVector(UP, 0.028 + level * 0.012);
      direction.addScaledVector(curlAxis, Math.sin(t * Math.PI * 1.4 + phase) * 0.012);

      if (t > 0.58) {
        const droop = (t - 0.58) * (level === 0 ? 0.045 : 0.085);
        direction.y -= droop;
      }

      const radialDistance = Math.hypot(point.x, point.z);
      const normalizedHeight = THREE.MathUtils.clamp(point.y / height, 0, 1);
      const allowedRadius = crownRadius * (0.72 + Math.sin(normalizedHeight * Math.PI) * 0.28);
      if (radialDistance > allowedRadius && radialDistance > 0.001) {
        direction.x -= (point.x / radialDistance) * 0.07;
        direction.z -= (point.z / radialDistance) * 0.07;
        direction.y += 0.055;
      }

      direction.normalize();
      point = point.clone().addScaledVector(direction, stepLength);
      point.y = Math.max(point.y, baseRadius * 0.22);
      controls.push(point);
    }

    const samples = curveThrough(controls, segmentCount + (highQuality ? 2 : 0));
    const tipRatio = 0.012;
    const radii = samples.map((sample, index) => {
      const t = index / (samples.length - 1);
      const taper = radius * THREE.MathUtils.lerp(1, tipRatio, Math.pow(t, 0.9));
      if (index === 0) return radius * 0.9;
      if (index === 1) return taper * 1.22;
      if (index === 2) return taper * 1.08;
      return taper;
    });
    if (radii.length >= 3) {
      radii[radii.length - 3] *= 0.3;
      radii[radii.length - 2] = Math.min(radii[radii.length - 2] * 0.12, 0.002);
      radii[radii.length - 1] = 0.0005;
    }
    branches.push({ points: samples, radii, capStart: false, capEnd: true, kind: 'branch' });
    limbCount += 1;

    const tip = samples[samples.length - 1];
    const beforeTip = samples[samples.length - 2];
    const tipDirection = new THREE.Vector3().subVectors(tip, beforeTip).normalize();

    if (depth <= 0 || radius < 0.0045 || branches.length >= maxBranchCount) {
      if (samples.length > 4) {
        const anchorFractions = depth <= 0
          ? [0.56, 0.72, 0.86, 1]
          : [0.64, 0.82, 1];
        const usedIndices = new Set();
        for (const anchorFraction of anchorFractions) {
          const anchorIndex = Math.min(
            samples.length - 1,
            Math.max(1, Math.round(anchorFraction * (samples.length - 1))),
          );
          if (usedIndices.has(anchorIndex)) continue;
          usedIndices.add(anchorIndex);
          const previousIndex = Math.max(0, anchorIndex - 1);
          const nextIndex = Math.min(samples.length - 1, anchorIndex + 1);
          const anchorDirection = new THREE.Vector3()
            .subVectors(samples[nextIndex], samples[previousIndex])
            .normalize();
          terminalPoints.push({
            point: samples[anchorIndex].clone(),
            direction: anchorDirection,
            scale: length * THREE.MathUtils.lerp(0.14, 0.22, anchorFraction),
          });
        }
      } else {
        terminalPoints.push({ point: tip.clone(), direction: tipDirection, scale: length * 0.24 });
      }
      return;
    }

    const childCount = depth >= 4 && branchRandom.chance(0.14) ? 3 : 2;
    for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
      const childRandom = branchRandom.fork(`child-${depth}-${childIndex}`);
      const attachmentT = THREE.MathUtils.clamp(
        0.48 + childIndex * (0.36 / Math.max(1, childCount - 1)) + childRandom.signed(0.055),
        0.4,
        0.91,
      );
      const attachmentIndex = Math.min(
        samples.length - 4,
        Math.max(1, Math.round(attachmentT * (samples.length - 1))),
      );
      const attachment = samples[attachmentIndex];
      const tangent = new THREE.Vector3()
        .subVectors(samples[attachmentIndex + 1], samples[attachmentIndex - 1])
        .normalize();
      const frame = localBranchFrame(tangent);
      const angle = childIndex * Math.PI + childRandom.range(-0.75, 0.75) + level * GOLDEN_ANGLE;
      const outward = frame.side.multiplyScalar(Math.cos(angle))
        .addScaledVector(frame.around, Math.sin(angle))
        .normalize();
      const childDirection = tangent.clone().multiplyScalar(0.5)
        .addScaledVector(outward, 0.72 * config.branchSpread)
        .addScaledVector(UP, 0.16 + level * 0.035)
        .normalize();
      const childLength = length * childRandom.range(0.5, 0.66)
        * THREE.MathUtils.lerp(1.03, 0.88, level / 5);
      const parentRadiusAtAttachment = radii[attachmentIndex];
      const childRadius = parentRadiusAtAttachment * childRandom.range(0.68, 0.74);
      growBranch(
        attachment,
        childDirection,
        childLength,
        childRadius,
        depth - 1,
        level + 1,
        childRandom,
      );
    }
  }

  const majorCount = Math.round((highQuality ? 7 : 6) * Math.pow(config.age, 0.42));
  const branchRandom = random.fork('crown-branches');
  const angleOffset = branchRandom.range(0, TAU);

  for (let branchIndex = 0; branchIndex < majorCount; branchIndex += 1) {
    const majorRandom = branchRandom.fork(`major-${branchIndex}`);
    const linearT = branchIndex / Math.max(1, majorCount - 1);
    const trunkT = THREE.MathUtils.clamp(
      0.29 + linearT * 0.46 + majorRandom.signed(0.035),
      0.26,
      0.78,
    );
    const start = trunk.curve.getPointAt(trunkT);
    const trunkTangent = trunk.curve.getTangentAt(trunkT).normalize();
    const angle = angleOffset + branchIndex * GOLDEN_ANGLE + majorRandom.signed(0.24);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const upward = THREE.MathUtils.lerp(0.14, 0.62, Math.pow(trunkT, 1.35));
    const direction = radial.multiplyScalar(config.branchSpread)
      .addScaledVector(UP, upward)
      .addScaledVector(trunkTangent, 0.13)
      .normalize();
    const crownProfile = 0.76 + Math.sin(linearT * Math.PI) * 0.3;
    const length = height * majorRandom.range(0.36, 0.49)
      * config.branchSpread * crownProfile;
    const trunkRadius = baseRadius * (0.075 + 0.925 * Math.pow(1 - trunkT, 0.74));
    const radius = trunkRadius * majorRandom.range(0.4, 0.52);
    growBranch(start, direction, length, radius, recursionDepth, 0, majorRandom);
  }

  const leaderRandom = random.fork('crown-leader');
  const leaderCount = highQuality ? 2 : 1;
  for (let leaderIndex = 0; leaderIndex < leaderCount; leaderIndex += 1) {
    const leaderT = 0.68 + leaderIndex * 0.12 + leaderRandom.signed(0.018);
    const leaderStart = trunk.curve.getPointAt(leaderT);
    const angle = angleOffset + leaderIndex * TAU / leaderCount + leaderRandom.signed(0.25);
    const direction = new THREE.Vector3(
      Math.cos(angle) * 0.34,
      leaderRandom.range(0.82, 1.1),
      Math.sin(angle) * 0.34,
    ).normalize();
    growBranch(
      leaderStart,
      direction,
      height * leaderRandom.range(0.31, 0.42),
      baseRadius * leaderRandom.range(0.11, 0.16),
      Math.max(2, recursionDepth - 1),
      1,
      leaderRandom.fork(`leader-${leaderIndex}`),
    );
  }

  if (terminalPoints.length === 0) {
    terminalPoints.push({
      point: trunk.points[trunk.points.length - 1].clone(),
      direction: UP.clone(),
      scale: height * 0.08,
    });
  }

  return {
    branches,
    terminalPoints,
    height,
    baseRadius,
    limbCount,
    rootCount,
  };
}

function selectPerchAnchor(branches, height) {
  let best = null;
  for (const branch of branches) {
    if (branch.kind !== 'branch' || branch.points.length < 7) continue;
    for (let index = 2; index < branch.points.length - 2; index += 1) {
      const point = branch.points[index];
      const radius = branch.radii[index] ?? 0;
      const heightRatio = point.y / Math.max(0.001, height);
      const radialDistance = Math.hypot(point.x, point.z);
      if (
        radius < 0.065
        || heightRatio < 0.36
        || heightRatio > 0.68
        || radialDistance < 0.75
      ) continue;

      const tangent = new THREE.Vector3()
        .subVectors(branch.points[index + 1], branch.points[index - 1])
        .normalize();
      const horizontality = 1 - Math.abs(tangent.y);
      const heightPreference = 1 - Math.abs(heightRatio - 0.48) / 0.2;
      const reachPreference = 1 - Math.min(1, Math.abs(radialDistance - 1.8) / 2.2);
      const cameraVisibility = (point.x + point.z) / Math.max(1, height);
      const score = horizontality * 5.5
        + radius * 13
        + heightPreference * 1.2
        + reachPreference * 0.8
        + cameraVisibility * 1.1;
      if (!best || score > best.score) {
        const direction = tangent.clone().setY(0);
        if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1);
        direction.normalize();
        best = {
          score,
          position: point.clone(),
          direction,
          radius,
        };
      }
    }
  }
  return best;
}

function selectClimbAnchor(trunk, height) {
  if (!trunk?.points?.length) return null;
  const index = Math.min(
    trunk.points.length - 2,
    Math.max(1, Math.round((trunk.points.length - 1) * 0.44)),
  );
  const center = trunk.points[index];
  const direction = new THREE.Vector3(center.x, 0, center.z);
  if (direction.lengthSq() < 0.0001) {
    direction.subVectors(trunk.points[index + 1], trunk.points[index - 1]).setY(0);
    direction.set(-direction.z, 0, direction.x);
  }
  if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1);
  direction.normalize();
  const radius = trunk.radii[index] ?? height * 0.02;
  return {
    position: center.clone().addScaledVector(direction, radius * 1.08),
    direction,
    radius,
  };
}

function createLeafInstances(config, random, terminalPoints, height) {
  const highQuality = config.quality === 'high';
  const baseLeafCount = highQuality ? 6800 : 3600;
  const leafCount = Math.round(THREE.MathUtils.clamp(
    baseLeafCount * config.leafDensity * Math.pow(config.age, 0.72),
    highQuality ? 2800 : 1500,
    highQuality ? 9800 : 5400,
  ));
  const geometry = createLeafGeometry();
  const texture = createLeafTexture(config.quality);
  const material = new THREE.MeshPhysicalMaterial({
    name: `${config.season} ash leaf material`,
    color: 0xffffff,
    map: texture,
    roughness: 0.82,
    metalness: 0,
    sheen: 0.12,
    sheenRoughness: 0.86,
    sheenColor: 0x7f9165,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    alphaTest: 0.2,
    alphaToCoverage: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    emissive: 0x102108,
    emissiveIntensity: 0.045,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, leafCount);
  mesh.name = 'Instanced ash canopy';
  mesh.castShadow = highQuality;
  mesh.receiveShadow = highQuality;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const palette = SEASON_PALETTES[config.season];
  const position = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const leafDirection = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const alignQuaternion = new THREE.Quaternion();
  const rollQuaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const localY = new THREE.Vector3(0, 1, 0);
  const crownCore = new THREE.Vector3(0, height * 0.67, 0);

  for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
    const terminal = terminalPoints[random.int(0, terminalPoints.length - 1)];
    const clusterRadius = THREE.MathUtils.clamp(
      terminal.scale * random.range(0.65, 1.05),
      height * 0.015,
      height * 0.045,
    );
    offset.copy(randomUnitVector(random));
    offset.y *= 0.72;
    const radialFill = random.chance(0.34) ? random.range(0.12, 0.68) : Math.cbrt(random.float());
    offset.multiplyScalar(clusterRadius * radialFill);
    position.copy(terminal.point)
      .add(offset)
      .addScaledVector(terminal.direction, random.range(-0.08, 0.34) * clusterRadius);
    if (random.chance(0.38)) {
      position.lerp(crownCore, random.range(0.045, 0.19));
    }

    leafDirection.copy(terminal.direction)
      .multiplyScalar(random.range(0.35, 0.75))
      .add(randomUnitVector(random).multiplyScalar(random.range(0.45, 0.9)))
      .addScaledVector(UP, random.range(0.02, 0.25))
      .normalize();
    alignQuaternion.setFromUnitVectors(localY, leafDirection);
    rollQuaternion.setFromAxisAngle(localY, random.range(0, TAU));
    quaternion.copy(alignQuaternion).multiply(rollQuaternion);

    const leafLength = random.range(0.56, 0.84) * Math.pow(config.age, 0.12);
    scale.set(
      leafLength * random.range(0.46, 0.62),
      leafLength * random.range(0.88, 1.12),
      leafLength * random.range(0.46, 0.62),
    );
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(leafIndex, matrix);

    color.setHex(palette[random.int(0, palette.length - 1)]);
    color.offsetHSL(random.signed(0.01), random.signed(0.028), random.signed(0.026));
    mesh.setColorAt(leafIndex, color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
  if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
  material.userData.season = config.season;
  material.userData.instanceCount = leafCount;

  return { mesh, material, leafCount };
}

/**
 * Builds a deterministic, mature deciduous ash at ground level y = 0.
 * @param {object} options Tree generation controls.
 * @returns {{group: THREE.Group, leafMaterial: THREE.MeshPhysicalMaterial, stats: object}}
 */
export function createTree(options = {}) {
  const config = normalizeOptions(options);
  const random = new SeededRandom(config.seed);
  const skeleton = generateSkeleton(config, random.fork('skeleton'));
  const barkTextures = createBarkTextures(random.fork('bark-texture'), config.quality);
  const woodGeometry = buildWoodGeometry(
    skeleton.branches,
    config.quality,
    barkTextures.sampleHeight,
  );
  const woodMaterial = new THREE.MeshStandardMaterial({
    name: 'Layered procedural woodland bark',
    color: 0xffffff,
    map: barkTextures.colorMap,
    normalMap: barkTextures.normalMap,
    normalScale: new THREE.Vector2(
      config.quality === 'high' ? 1.25 : 1.05,
      config.quality === 'high' ? 0.68 : 0.58,
    ),
    roughnessMap: barkTextures.roughnessMap,
    roughness: 0.92,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    dithering: true,
  });
  const woodMesh = new THREE.Mesh(woodGeometry, woodMaterial);
  woodMesh.name = 'Merged trunk branches and roots';
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;

  const foliage = createLeafInstances(
    config,
    random.fork('foliage'),
    skeleton.terminalPoints,
    skeleton.height,
  );
  const perchAnchor = selectPerchAnchor(skeleton.branches, skeleton.height);
  const climbAnchor = selectClimbAnchor(skeleton.branches[0], skeleton.height);

  const group = new THREE.Group();
  group.name = 'Procedural realistic ash';
  group.add(woodMesh, foliage.mesh);

  const stats = Object.freeze({
    seed: config.seed,
    quality: config.quality,
    season: config.season,
    height: skeleton.height,
    baseRadius: skeleton.baseRadius,
    woodParts: skeleton.branches.length,
    branchCount: skeleton.limbCount,
    rootCount: skeleton.rootCount,
    terminalCount: skeleton.terminalPoints.length,
    leafCount: foliage.leafCount,
    woodVertices: woodGeometry.getAttribute('position').count,
    woodTriangles: woodGeometry.index ? woodGeometry.index.count / 3 : 0,
    drawCalls: 2,
  });

  group.userData.treeStats = stats;
  group.userData.perchAnchor = perchAnchor;
  group.userData.climbAnchor = climbAnchor;
  group.userData.dispose = () => {
    woodGeometry.dispose();
    woodMaterial.dispose();
    barkTextures.colorMap?.dispose();
    barkTextures.normalMap?.dispose();
    barkTextures.roughnessMap?.dispose();
    foliage.mesh.dispose();
    foliage.mesh.geometry.dispose();
    foliage.material.map?.dispose();
    foliage.material.dispose();
  };

  return {
    group,
    woodMesh,
    leafMaterial: foliage.material,
    stats,
    perchAnchor,
    climbAnchor,
  };
}
