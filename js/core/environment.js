import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  ENVIRONMENT,
  PERFORMANCE,
  TIME_OF_DAY,
  getHabitatArea,
} from '../config/index.js';
import { getNightAmount, normalizeDayHour } from '../utils/time-of-day.js';

function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const random = (index) => {
    const value = Math.sin(index * 92.147 + 71.31) * 43758.5453;
    return value - Math.floor(value);
  };

  for (let index = 0; index < 58; index += 1) {
    const x = 55 + random(index * 3) * 402;
    const y = 82 + random(index * 3 + 1) * 94;
    const radiusX = 28 + random(index * 3 + 2) * 62;
    const radiusY = radiusX * (0.28 + random(index + 90) * 0.26);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radiusX);
    const opacity = 0.045 + random(index + 160) * 0.085;
    gradient.addColorStop(0, `rgba(255, 255, 250, ${opacity})`);
    gradient.addColorStop(0.55, `rgba(245, 248, 242, ${opacity * 0.76})`);
    gradient.addColorStop(1, 'rgba(235, 241, 235, 0)');
    context.save();
    context.translate(x, y);
    context.scale(1, radiusY / radiusX);
    context.translate(-x, -y);
    context.fillStyle = gradient;
    context.fillRect(x - radiusX, y - radiusX, radiusX * 2, radiusX * 2);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createClouds() {
  const group = new THREE.Group();
  const texture = createCloudTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: '#f8f5e8',
    opacity: 0.62,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });

  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2 + 0.22;
    const radius = 76 + (index % 4) * 8;
    const cloudMaterial = material.clone();
    cloudMaterial.rotation = index * 0.07;
    const cloud = new THREE.Sprite(cloudMaterial);
    cloud.position.set(Math.cos(angle) * radius, 20 + (index % 5) * 4.8, Math.sin(angle) * radius);
    const width = 30 + (index % 3) * 9;
    cloud.scale.set(width, width * 0.34, 1);
    group.add(cloud);
  }

  group.name = 'Distant procedural clouds';
  group.userData.texture = texture;
  material.dispose();
  return group;
}

function createStars() {
  const count = 360;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const random = (index) => {
    const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  for (let index = 0; index < count; index += 1) {
    const azimuth = random(index * 3) * Math.PI * 2;
    const elevation = THREE.MathUtils.lerp(0.1, 1.38, random(index * 3 + 1));
    const radius = 380 + random(index * 3 + 2) * 18;
    const horizontalRadius = Math.cos(elevation) * radius;
    positions[index * 3] = Math.cos(azimuth) * horizontalRadius;
    positions[index * 3 + 1] = Math.sin(elevation) * radius;
    positions[index * 3 + 2] = Math.sin(azimuth) * horizontalRadius;
    phases[index] = random(index * 3 + 3) * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('starPhase', new THREE.BufferAttribute(phases, 1));
  const starCanvas = document.createElement('canvas');
  starCanvas.width = 48;
  starCanvas.height = 48;
  const starContext = starCanvas.getContext('2d');
  const starGradient = starContext.createRadialGradient(24, 24, 0, 24, 24, 24);
  starGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  starGradient.addColorStop(0.18, 'rgba(224, 237, 255, 0.94)');
  starGradient.addColorStop(0.48, 'rgba(180, 205, 255, 0.24)');
  starGradient.addColorStop(1, 'rgba(180, 205, 255, 0)');
  starContext.fillStyle = starGradient;
  starContext.fillRect(0, 0, 48, 48);
  const starTexture = new THREE.CanvasTexture(starCanvas);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.PointsMaterial({
    color: '#d6e4ff',
    map: starTexture,
    size: 5.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    alphaTest: 0.02,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const twinkleUniforms = { uTwinkleTime: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTwinkleTime = twinkleUniforms.uTwinkleTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float starPhase;
        varying float vStarPhase;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vStarPhase = starPhase;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTwinkleTime;
        varying float vStarPhase;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float twinkle = 0.58
          + sin(uTwinkleTime * 2.1 + vStarPhase) * 0.24
          + sin(uTwinkleTime * 4.7 + vStarPhase * 1.73) * 0.12;
        diffuseColor.a *= clamp(twinkle, 0.2, 1.0);`,
      );
  };
  material.customProgramCacheKey = () => 'night-star-twinkle-v1';
  material.needsUpdate = true;
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Seeded night stars';
  stars.renderOrder = -1;
  stars.userData.texture = starTexture;
  stars.userData.twinkleUniforms = twinkleUniforms;
  return stars;
}

function createNightSky() {
  const material = new THREE.MeshBasicMaterial({
    color: '#06142d',
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(440, 32, 16), material);
  sky.name = 'Deep blue night sky';
  sky.renderOrder = -2;
  return sky;
}

function createSunGlare() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const center = 256;
  const halo = context.createRadialGradient(center, center, 0, center, center, center);
  halo.addColorStop(0, 'rgba(255, 255, 244, 1)');
  halo.addColorStop(0.025, 'rgba(255, 252, 222, 0.98)');
  halo.addColorStop(0.075, 'rgba(255, 231, 155, 0.66)');
  halo.addColorStop(0.21, 'rgba(255, 218, 125, 0.18)');
  halo.addColorStop(0.5, 'rgba(255, 197, 100, 0.035)');
  halo.addColorStop(1, 'rgba(255, 184, 86, 0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, 512, 512);
  context.globalCompositeOperation = 'screen';
  for (let index = 0; index < 12; index += 1) {
    const angle = index * Math.PI / 6 + 0.14;
    const length = index % 2 === 0 ? 218 : 128;
    const width = index % 2 === 0 ? 3.8 : 1.6;
    context.save();
    context.translate(center, center);
    context.rotate(angle);
    const ray = context.createLinearGradient(0, 0, length, 0);
    ray.addColorStop(0, 'rgba(255, 255, 230, 0.45)');
    ray.addColorStop(0.35, 'rgba(255, 237, 184, 0.12)');
    ray.addColorStop(1, 'rgba(255, 225, 158, 0)');
    context.fillStyle = ray;
    context.fillRect(0, -width, length, width * 2);
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = 256;
  ringCanvas.height = 256;
  const ringContext = ringCanvas.getContext('2d');
  const ringGradient = ringContext.createRadialGradient(128, 128, 52, 128, 128, 116);
  ringGradient.addColorStop(0, 'rgba(255, 241, 188, 0)');
  ringGradient.addColorStop(0.52, 'rgba(255, 239, 187, 0)');
  ringGradient.addColorStop(0.64, 'rgba(255, 231, 166, 0.07)');
  ringGradient.addColorStop(0.72, 'rgba(255, 231, 166, 0.27)');
  ringGradient.addColorStop(0.78, 'rgba(255, 250, 215, 0.38)');
  ringGradient.addColorStop(0.87, 'rgba(244, 193, 115, 0.13)');
  ringGradient.addColorStop(1, 'rgba(244, 193, 115, 0)');
  ringContext.fillStyle = ringGradient;
  ringContext.fillRect(0, 0, 256, 256);
  const ringTexture = new THREE.CanvasTexture(ringCanvas);
  ringTexture.colorSpace = THREE.SRGBColorSpace;
  const coreMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Sprite(coreMaterial);
  core.name = 'Occluded canopy sun core';
  core.scale.setScalar(23);
  const bloomMaterial = coreMaterial.clone();
  bloomMaterial.depthTest = false;
  bloomMaterial.opacity = 0;
  const bloom = new THREE.Sprite(bloomMaterial);
  bloom.name = 'Canopy sun bloom';
  bloom.scale.setScalar(42);
  bloom.renderOrder = 2;
  const rings = [0, 1, 2].map((index) => {
    const ringMaterial = new THREE.SpriteMaterial({
      map: ringTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Sprite(ringMaterial);
    ring.name = `Sun flare lens ring ${index + 1}`;
    ring.renderOrder = 2;
    return ring;
  });
  core.userData.texture = texture;
  const glare = new THREE.Group();
  glare.name = 'Occluded canopy sun glare';
  glare.add(core, bloom, ...rings);
  glare.userData.coreMaterial = coreMaterial;
  glare.userData.bloomMaterial = bloomMaterial;
  glare.userData.rings = rings;
  return glare;
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunDirection = new THREE.Vector3();
    this.hour = 10.5;
    this.season = 'summer';
    this.area = 'standard';
    this.shadowSize = 0;
    this.stormAmount = 0;
    this.lightningFlash = 0;
    this.nextLightningAt = 0;
    this.lightningEchoAt = 0;
    this.stormColors = {
      sun: new THREE.Color('#a9b5c1'),
      fog: new THREE.Color('#4a5762'),
      flash: new THREE.Color('#dce9f1'),
      sky: new THREE.Color('#6f7f88'),
      ground: new THREE.Color('#1c252b'),
      cloud: new THREE.Color('#3d4953'),
      flashCloud: new THREE.Color('#d9e7f0'),
    };
    this.sunGlare = null;
    if (ENVIRONMENT.sunGlare) {
      this.glareScreenPosition = new THREE.Vector3();
      this.cameraDirection = new THREE.Vector3();
      this.sunGlareRaycaster = new THREE.Raycaster();
      this.sunGlareOccluder = null;
      this.sunGlareVisibility = 0;
      this.sunGlareNextOcclusionCheck = 0;
      this.sunGlare = createSunGlare();
      this.scene.add(this.sunGlare);
    }

    this.sky = new Sky();
    this.sky.scale.setScalar(450);
    this.sky.name = 'Physical atmosphere';
    scene.add(this.sky);
    this.nightSky = createNightSky();
    scene.add(this.nightSky);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms.turbidity.value = 7.4;
    skyUniforms.rayleigh.value = 1.75;
    skyUniforms.mieCoefficient.value = 0.0045;
    skyUniforms.mieDirectionalG.value = 0.82;

    this.hemisphere = new THREE.HemisphereLight('#bfdcea', '#4b3b2c', 1.35);
    this.hemisphere.name = 'Sky and earth fill';
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight('#fff3d0', 4.1);
    this.sun.name = 'Sunlight';
    this.sun.castShadow = PERFORMANCE.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.camera.left = -14;
    this.sun.shadow.camera.right = 14;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -7;
    this.sun.shadow.bias = -0.00022;
    this.sun.shadow.normalBias = 0.026;
    this.sun.target.position.set(0, 4.3, 0);
    scene.add(this.sun, this.sun.target);

    this.rim = new THREE.DirectionalLight('#9ab7c7', 0.55);
    this.rim.position.set(-14, 10, -12);
    this.rim.name = 'Cool canopy rim light';
    scene.add(this.rim);

    this.clouds = createClouds();
    scene.add(this.clouds);
    this.stars = createStars();
    scene.add(this.stars);

    scene.fog = new THREE.FogExp2('#b9ced0', 0.0085);
    this.update(10.5, 'summer', 'high', 'standard');
  }

  update(
    hour = this.hour,
    season = this.season,
    quality = 'high',
    area = this.area,
  ) {
    this.hour = normalizeDayHour(hour);
    this.season = season;
    const habitat = getHabitatArea(area);
    this.area = habitat.id;
    const noonDistance = Math.abs(this.hour - 13) / 6;
    const daylight = THREE.MathUtils.clamp(1 - noonDistance, 0, 1);
    const night = getNightAmount(this.hour);
    const nightSkyFade = getNightAmount(
      this.hour,
      TIME_OF_DAY.starDuskStartHour,
      TIME_OF_DAY.starDuskEndHour,
    );
    const daylightElevation = THREE.MathUtils.lerp(
      9,
      66,
      Math.sin(daylight * Math.PI * 0.5),
    );
    const elevationDegrees = THREE.MathUtils.lerp(daylightElevation, -24, night);
    const azimuthDegrees = THREE.MathUtils.lerp(112, 304, (this.hour - 7) / 17);
    const elevation = THREE.MathUtils.degToRad(elevationDegrees);
    const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);

    this.sunDirection.set(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    ).normalize();

    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
    this.sky.material.uniforms.rayleigh.value = THREE.MathUtils.lerp(2.65, 2.15, daylight);
    this.sky.material.uniforms.turbidity.value = THREE.MathUtils.lerp(9.6, 3.8, daylight);
    this.sky.material.uniforms.mieCoefficient.value = THREE.MathUtils.lerp(0.006, 0.0028, daylight);
    this.sun.position.copy(this.sunDirection).multiplyScalar(46).add(new THREE.Vector3(0, 4, 0));
    const daytimeSkyVisible = this.hour >= TIME_OF_DAY.dawnStartHour
      && this.hour <= TIME_OF_DAY.nightSkyStartHour;
    this.sky.visible = daytimeSkyVisible;
    this.nightSky.visible = !daytimeSkyVisible;
    this.nightSky.material.opacity = nightSkyFade;

    const warm = new THREE.Color('#f0a864');
    const daylightColor = new THREE.Color('#fff2d1');
    const nightLight = new THREE.Color('#5f7eba');
    const sunColor = warm.clone().lerp(daylightColor, daylight).lerp(nightLight, night);
    this.sun.color.copy(sunColor);
    this.sun.intensity = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(2.6, 4.4, daylight),
      0.08,
      night,
    );

    const skyDawn = new THREE.Color('#caa993');
    const skyDay = new THREE.Color(season === 'autumn' ? '#b8cad0' : '#afced8');
    const nightSky = new THREE.Color('#06142d');
    const fogColor = skyDawn
      .lerp(skyDay, daylight * 0.92)
      .lerp(nightSky, nightSkyFade);
    this.scene.fog.color.copy(fogColor);
    const fogDensity = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.0115, 0.0073, daylight),
      0.016,
      night,
    );
    this.scene.fog.density = fogDensity * (habitat.infinite ? 1.4 : 1);
    this.renderer.setClearColor(fogColor, 1);

    this.hemisphere.color
      .set(season === 'autumn' ? '#c9d6d4' : '#bddce8')
      .lerp(new THREE.Color('#173a70'), night);
    this.hemisphere.groundColor
      .set(season === 'autumn' ? '#756149' : '#667652')
      .lerp(new THREE.Color('#10182a'), night);
    this.hemisphere.intensity = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(1.2, 1.72, daylight),
      0.34,
      night,
    );
    this.rim.intensity = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.38, 0.72, daylight),
      0.16,
      night,
    );
    this.clouds.children.forEach((cloud) => {
      cloud.material.color
        .set('#f8f5e8')
        .lerp(new THREE.Color('#7892c0'), night);
      cloud.material.opacity = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(0.42, 0.66, daylight),
        0.3,
        night,
      );
    });
    this.stars.material.opacity = nightSkyFade;

    const requestedShadowSize = PERFORMANCE.shadowMapSize;
    if (this.shadowSize !== requestedShadowSize) {
      this.shadowSize = requestedShadowSize;
      this.sun.shadow.mapSize.setScalar(requestedShadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const expandedShadowArea = habitat.detailSize > 18;
    this.sun.shadow.camera.left = expandedShadowArea ? -22 : -14;
    this.sun.shadow.camera.right = expandedShadowArea ? 22 : 14;
    this.sun.shadow.camera.top = expandedShadowArea ? 23 : 18;
    this.sun.shadow.camera.bottom = expandedShadowArea ? -12 : -7;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.94, 1.12, daylight),
      0.78,
      night,
    );
    this.captureWeatherBase();
    this.applyStorm();
  }

  captureWeatherBase() {
    this.weatherBase = {
      rayleigh: this.sky.material.uniforms.rayleigh.value,
      turbidity: this.sky.material.uniforms.turbidity.value,
      mieCoefficient: this.sky.material.uniforms.mieCoefficient.value,
      sunColor: this.sun.color.clone(),
      sunIntensity: this.sun.intensity,
      fogColor: this.scene.fog.color.clone(),
      fogDensity: this.scene.fog.density,
      hemisphereColor: this.hemisphere.color.clone(),
      hemisphereGround: this.hemisphere.groundColor.clone(),
      hemisphereIntensity: this.hemisphere.intensity,
      rimIntensity: this.rim.intensity,
      cloudColors: this.clouds.children.map((cloud) => cloud.material.color.clone()),
      cloudOpacities: this.clouds.children.map((cloud) => cloud.material.opacity),
      starsOpacity: this.stars.material.opacity,
      exposure: this.renderer.toneMappingExposure,
    };
  }

  setStormAmount(amount) {
    this.stormAmount = THREE.MathUtils.clamp(Number(amount), 0, 1);
  }

  applyStorm() {
    if (!this.weatherBase) return;
    const base = this.weatherBase;
    const storm = this.stormAmount;
    const flash = this.lightningFlash;
    const skyUniforms = this.sky.material.uniforms;
    skyUniforms.rayleigh.value = THREE.MathUtils.lerp(base.rayleigh, 0.42, storm);
    skyUniforms.turbidity.value = THREE.MathUtils.lerp(base.turbidity, 17.5, storm);
    skyUniforms.mieCoefficient.value = THREE.MathUtils.lerp(base.mieCoefficient, 0.012, storm);

    this.sun.color.copy(base.sunColor).lerp(this.stormColors.sun, storm);
    this.sun.intensity = THREE.MathUtils.lerp(base.sunIntensity, 0.42, storm) + flash * 4.8;
    this.scene.fog.color.copy(base.fogColor).lerp(this.stormColors.fog, storm);
    this.scene.fog.color.lerp(this.stormColors.flash, flash * 0.45);
    this.scene.fog.density = THREE.MathUtils.lerp(base.fogDensity, base.fogDensity + 0.008, storm);
    this.renderer.setClearColor(this.scene.fog.color, 1);

    this.hemisphere.color.copy(base.hemisphereColor).lerp(this.stormColors.sky, storm);
    this.hemisphere.groundColor.copy(base.hemisphereGround).lerp(this.stormColors.ground, storm);
    this.hemisphere.intensity = THREE.MathUtils.lerp(base.hemisphereIntensity, 0.68, storm) + flash * 1.45;
    this.rim.intensity = THREE.MathUtils.lerp(base.rimIntensity, 0.48, storm) + flash * 0.35;
    this.clouds.children.forEach((cloud, index) => {
      cloud.material.color.copy(base.cloudColors[index]).lerp(this.stormColors.cloud, storm);
      cloud.material.color.lerp(this.stormColors.flashCloud, flash * 0.38);
      cloud.material.opacity = THREE.MathUtils.lerp(base.cloudOpacities[index], 0.9, storm);
    });
    this.stars.material.opacity = base.starsOpacity * (1 - storm);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(base.exposure, 0.66, storm) + flash * 0.42;
    if (this.sunGlare) this.sunGlare.visible = storm < 0.04;
  }

  animate(elapsed, camera, delta = 0) {
    if (this.stormAmount > 0.2 && elapsed >= this.nextLightningAt) {
      this.lightningFlash = THREE.MathUtils.lerp(0.48, 1, this.stormAmount);
      this.lightningEchoAt = elapsed + THREE.MathUtils.lerp(0.055, 0.14, Math.random());
      this.nextLightningAt = elapsed + THREE.MathUtils.lerp(9.5, 2.6, this.stormAmount)
        * THREE.MathUtils.lerp(0.65, 1.35, Math.random());
    }
    if (this.lightningEchoAt && elapsed >= this.lightningEchoAt) {
      this.lightningFlash = Math.max(this.lightningFlash, 0.46);
      this.lightningEchoAt = 0;
    }
    this.lightningFlash = Math.max(0, this.lightningFlash - Math.min(delta, 0.05) * 10);
    this.applyStorm();
    this.clouds.rotation.y = elapsed * 0.0018;
    this.stars.userData.twinkleUniforms.uTwinkleTime.value = elapsed;
    if (this.sunGlare) this.updateSunGlare(camera, elapsed);
  }

  setSunGlareOccluder(object) {
    if (!this.sunGlare) return;
    this.sunGlareOccluder = object;
    this.sunGlareVisibility = 0;
    this.sunGlareNextOcclusionCheck = 0;
  }

  updateSunGlare(camera, elapsed) {
    if (!camera || !this.sunGlare) return;

    camera.getWorldDirection(this.cameraDirection);
    const alignment = this.cameraDirection.dot(this.sunDirection);
    const facingSun = THREE.MathUtils.smoothstep(alignment, 0.76, 0.965);
    this.glareScreenPosition
      .copy(camera.position)
      .addScaledVector(this.sunDirection, 1000)
      .project(camera);

    const edgeDistance = Math.max(Math.abs(this.glareScreenPosition.x), Math.abs(this.glareScreenPosition.y));
    const onScreen = THREE.MathUtils.smoothstep(1.08 - edgeDistance, 0, 0.28);
    const daylight = THREE.MathUtils.smoothstep(this.sunDirection.y, -0.02, 0.16);
    if (elapsed >= this.sunGlareNextOcclusionCheck) {
      this.sunGlareNextOcclusionCheck = elapsed + 0.12;
      this.sunGlareRaycaster.set(camera.position, this.sunDirection);
      this.sunGlareRaycaster.far = 298;
      const blocked = this.sunGlareOccluder
        && this.sunGlareRaycaster.intersectObject(this.sunGlareOccluder, true).length > 0;
      const targetVisibility = blocked ? 0 : 1;
      this.sunGlareVisibility = THREE.MathUtils.lerp(
        this.sunGlareVisibility,
        targetVisibility,
        0.62,
      );
    }
    const intensity = facingSun * onScreen * daylight * this.sunGlareVisibility;
    const scale = THREE.MathUtils.lerp(14, 27, intensity);

    this.sunGlare.position.copy(camera.position).addScaledVector(this.sunDirection, 300);
    this.sunGlare.quaternion.copy(camera.quaternion);
    this.sunGlare.children[0].scale.setScalar(scale);
    this.sunGlare.children[1].scale.setScalar(scale * 2.1);
    this.sunGlare.userData.coreMaterial.opacity = intensity;
    this.sunGlare.userData.bloomMaterial.opacity = intensity * 0.42;
    this.sunGlare.userData.rings.forEach((ring, index) => {
      const phase = elapsed * (0.42 + index * 0.09) + index * 2.4;
      const distance = 34 + index * 24 + Math.sin(phase) * 8;
      ring.position.set(
        -distance * (0.74 + index * 0.14),
        Math.cos(phase * 0.72) * (10 + index * 5),
        0,
      );
      const ringSize = 10 + index * 5.5 + Math.sin(phase * 1.3) * 1.6;
      ring.scale.set(ringSize * 1.9, ringSize * 0.62, 1);
      ring.material.rotation = phase * 0.18 + index * 0.52;
      ring.material.opacity = intensity * (0.34 - index * 0.075);
    });
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const roots = [this.sky, this.nightSky, this.clouds, this.stars, this.sunGlare]
      .filter(Boolean);
    roots.forEach((root) => {
      root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
      });
      root.removeFromParent();
    });
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
      material.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    this.sun.shadow.map?.dispose();
    [this.hemisphere, this.sun, this.sun.target, this.rim]
      .forEach((object) => object?.removeFromParent());
    this.sunGlareOccluder = null;
  }
}
