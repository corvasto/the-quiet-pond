import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ANT_LOCATOR,
  ANT_NIGHT_LIGHT,
  CAMERA_VIEWS,
  DEFAULTS,
  PERFORMANCE,
  SCENE_PROPS,
  SEASONS,
  getHabitatArea,
} from '../config/index.js';
import { selectSceneProps } from '../content/assets.js';

import { createTree } from '../generators/tree.js';
import { createGround } from '../generators/ground.js';
import { PondWater, createPondProfile } from '../generators/pond.js';
import {
  createGroveTrees,
  createPondGroveLayout,
} from '../generators/forest.js';
import { Environment } from './environment.js';
import { Fireflies } from './fireflies.js';
import { LampMoths } from './moths.js';
import { RainWeather } from './rain.js';
import { loadModelProps } from '../props/model-prop.js';
import { createObjectGroundFootprint } from '../props/model-surface-proxy.js';
import {
  createModelPropPlacement,
  getModelPropSpot,
  placeGroundModelProp,
} from '../props/model-placement.js';
import { installPondActorAnimationMethods } from './app-actor-animation.js';
import { installPondAntNavigationMethods } from './app-ant-navigation.js';
import { installPondCameraMethods } from './app-camera.js';
import { installPondInteractionMethods } from './app-interactions.js';
import { installPondPropPlacementMethods } from './app-prop-placement.js';
import { installPondWandererMethods } from './app-wanderers.js';
import { installPondWorldQueryMethods } from './app-world-query.js';
import { AntLocator } from './ant-locator.js';

const SPECIALIZED_MODEL_PROP_IDS = Object.freeze([
  'radio',
  'reader',
  'ant',
  'cat',
  'streetLamp',
  'tent',
  'frog',
  'cockroach',
  'lollipop',
]);

function addLeafWind(material, sharedUniforms = null) {
  const uniforms = sharedUniforms || {
    uTime: { value: 0 },
    uWind: { value: DEFAULTS.wind },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float leafPhase = instanceMatrix[3].x * 0.39 + instanceMatrix[3].y * 0.17 + instanceMatrix[3].z * 0.33;
        #else
          float leafPhase = 0.0;
        #endif
        float leafTip = smoothstep(-0.1, 1.0, position.y);
        float leafWave = sin(uTime * 1.35 + leafPhase) + sin(uTime * 0.58 + leafPhase * 1.9) * 0.4;
        vec3 meshWind = vec3(
          leafWave * leafTip * leafTip * uWind * 0.24,
          0.0,
          cos(uTime * 1.1 + leafPhase) * leafTip * leafTip * uWind * 0.09
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
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'procedural-leaf-wind-v2';
  material.userData.windUniforms = uniforms;
  material.needsUpdate = true;
  return uniforms;
}

function createDisabledWeather() {
  return {
    amount: 0,
    setEnabled() {},
    setIntensity() {},
    setQuality() {},
    update() {},
    dispose() {},
  };
}

function normalizeGroundReservations(reservations) {
  if (!Array.isArray(reservations)) return [];
  return reservations.flatMap((reservation) => {
    const position = reservation?.position;
    const radius = Number(reservation?.radius);
    if (
      !Number.isFinite(position?.x)
      || !Number.isFinite(position?.z)
      || !Number.isFinite(radius)
      || radius < 0
    ) return [];
    return [Object.freeze({
      id: String(reservation.id ?? 'reserved-ground'),
      position: Object.freeze({ x: position.x, z: position.z }),
      radius,
    })];
  });
}

function normalizeCameraViews(cameraViews) {
  if (!cameraViews || typeof cameraViews !== 'object') return Object.freeze({});
  const normalized = {};
  Object.entries(cameraViews).forEach(([name, view]) => {
    if (
      !Array.isArray(view?.position)
      || !Array.isArray(view?.target)
      || view.position.length !== 3
      || view.target.length !== 3
      || !view.position.every(Number.isFinite)
      || !view.target.every(Number.isFinite)
    ) return;
    normalized[name] = Object.freeze({
      position: Object.freeze([...view.position]),
      target: Object.freeze([...view.target]),
      controls: view.controls && typeof view.controls === 'object'
        ? Object.freeze({ ...view.controls })
        : null,
    });
  });
  return Object.freeze(normalized);
}

function normalizeAntCameraFollow(options) {
  if (!options || typeof options !== 'object') return Object.freeze({ enabled: false });
  const number = (key, fallback, minimum, maximum) => {
    const value = Number(options[key]);
    return Number.isFinite(value)
      ? THREE.MathUtils.clamp(value, minimum, maximum)
      : fallback;
  };
  return Object.freeze({
    enabled: Boolean(options.enabled),
    followFacing: options.followFacing === true,
    assistEnabled: options.assistEnabled === true,
    assistDelay: number('assistDelay', 0.45, 0, 3),
    assistResumeDelay: number('assistResumeDelay', 2.5, 0, 10),
    assistResponsiveness: number('assistResponsiveness', 1.2, 0.1, 5),
    assistMaxSpeed: number('assistMaxSpeed', 0.8, 0.1, 2),
    distance: number('distance', 0.68, 0.1, 2.5),
    height: number('height', 0.48, 0.05, 2.5),
    lookAhead: number('lookAhead', 0.24, 0, 1.2),
    responsiveness: number('responsiveness', 11, 1, 30),
    orbitResponsiveness: number('orbitResponsiveness', 10, 1, 30),
    rotateSpeed: number('rotateSpeed', 0.7, 0.1, 2),
    enableZoom: options.enableZoom === true,
    minDistance: number('minDistance', 0.45, 0.25, 1.2),
    maxDistance: number('maxDistance', 1.8, 1.2, 3),
  });
}

function normalizeAntMovement(options = {}) {
  const number = (key, fallback, minimum, maximum) => (
    Number.isFinite(options?.[key])
      ? THREE.MathUtils.clamp(options[key], minimum, maximum)
      : fallback
  );
  return Object.freeze({
    acceleration: number('acceleration', 18, 1, 60),
    braking: number('braking', 26, 1, 60),
    turnResponsiveness: number('turnResponsiveness', 18, 1, 60),
    analogDeadzone: number('analogDeadzone', 0.12, 0, 0.5),
  });
}

export class PondApp {
  constructor(container, {
    mode = 'game',
    groundReservations = [],
    enablePondStoneInteraction = true,
    cameraViews = {},
    antCameraFollow = null,
    antMovement = null,
    antMovementRadius = null,
    sunHour = null,
    season = DEFAULTS.season,
  } = {}) {
    this.container = container;
    if (mode !== 'game') throw new RangeError('Only game mode is supported.');
    this.mode = 'game';
    this.groundReservations = normalizeGroundReservations(groundReservations);
    this.enablePondStoneInteraction = Boolean(enablePondStoneInteraction);
    this.cameraViews = normalizeCameraViews(cameraViews);
    this.antCameraFollow = normalizeAntCameraFollow(antCameraFollow);
    this.antMovement = normalizeAntMovement(antMovement);
    this.antMovementRadiusOverride = Number.isFinite(antMovementRadius)
      ? Math.max(1, Number(antMovementRadius))
      : null;
    this.settings = {
      ...DEFAULTS,
      season: Object.hasOwn(SEASONS, season) ? season : DEFAULTS.season,
      ...(Number.isFinite(sunHour) ? { sunHour: Number(sunHour) } : {}),
    };
    this.world = null;
    this.tree = null;
    this.ground = null;
    this.forest = null;
    this.pondWater = null;
    this.activePondWater = null;
    this.modelProps = {};
    this.sceneProps = Object.freeze({});
    this.radio = null;
    this.reader = null;
    this.ant = null;
    this.antMixer = null;
    this.antIdleAction = null;
    this.antAction = null;
    this.antEatAction = null;
    this.antCockroachAction = null;
    this.antAnimationBusy = false;
    this.antAnimationMode = null;
    this.antAnimationFinishListener = null;
    this.backgroundAnts = [];
    this.backgroundAntMixers = [];
    this.antRunEnabled = false;
    this.cat = null;
    this.catMixer = null;
    this.catAction = null;
    this.cockroach = null;
    this.cockroachMixer = null;
    this.cockroachActions = null;
    this.cockroachState = null;
    this.cockroachMoveDirection = new THREE.Vector3();
    this.antMovementInput = new Set();
    this.antMovementAxes = new THREE.Vector2();
    this.antResolvedAxes = { x: 0, y: 0, magnitude: 0 };
    this.antVelocity = new THREE.Vector3();
    this.antDisplacement = new THREE.Vector3();
    this.antFlightEnabled = false;
    this.antFlightSpeedMultiplier = 3;
    this.antMovementCenter = new THREE.Vector2();
    this.antMovementRadius = SCENE_PROPS.ant.movementRadius;
    this.readerCollisionBounds = new THREE.Box3();
    this.readerSurfaceProxy = null;
    this.radioSurfaceProxy = null;
    this.antWaterStepDistance = 0;
    this.antWaterStepSide = 1;
    this.antWasOnWater = false;
    this.modelPropInstances = [];
    this.genericModelMixers = [];
    this.worldAdditions = new Set();
    this.gameGroundBlockers = new Map();
    this.frameUpdateListeners = new Set();
    this.frameEvent = { delta: 0, elapsed: 0 };
    this.streetLamp = null;
    this.streetLampLight = null;
    this.streetLampGlow = null;
    this.readerTentLight = null;
    this.antNightLight = null;
    this.tent = null;
    this.tentAnchor = null;
    this.tentBaseYaw = 0;
    this.frog = null;
    this.companionTreeColliders = [];
    this.treeGroundColliders = [];
    this.modelGroundColliders = [];
    this.activeView = 'hero';
    this.radioAnchor = null;
    this.radioBaseYaw = 0;
    this.readerBaseYaw = 0;
    this.readerHomePosition = null;
    this.readerHomeYaw = 0;
    this.readerTentPosition = null;
    this.readerNightBlend = 0;
    this.readerFadeMaterials = [];
    this.readerTentLightLocalPosition = null;
    this.readerTentLightWorldPosition = new THREE.Vector3();
    this.propHeroPosition = { x: 0, z: 0 };
    this.cameraTween = null;
    this.viewOffset = new THREE.Vector3();
    this.antForward = new THREE.Vector3();
    this.antRight = new THREE.Vector3();
    this.antMoveDirection = new THREE.Vector3();
    this.antCameraTarget = new THREE.Vector3();
    this.antCameraPosition = new THREE.Vector3();
    this.antCameraAnchor = new THREE.Vector3();
    this.antCameraHeading = new THREE.Vector3(0, 0, 1);
    this.antCameraFacing = new THREE.Vector3();
    this.antCameraLocalForward = new THREE.Vector3();
    this.antCameraWorldQuaternion = new THREE.Quaternion();
    this.antCameraLastPosition = new THREE.Vector3();
    this.antCameraDelta = new THREE.Vector3();
    this.antCameraHasLastPosition = false;
    this.antCameraAssistTravelTime = 0;
    this.antCameraAssistPause = 0;
    this.antCameraManualActive = false;
    this.antCameraMovementYaw = 0;
    this.antCameraInputAngle = null;
    this.antCameraPose = Object.freeze({
      position: this.antCameraPosition,
      target: this.antCameraTarget,
    });
    this.antCameraFollowPoseOptions = Object.freeze({ followFacing: true });
    this.antAttachmentScale = new THREE.Vector3();
    this.antDebugPosition = new THREE.Vector3();
    this.grassVisibilityPosition = new THREE.Vector3();
    this.antLocatorPosition = new THREE.Vector3();
    this.antPoseLocal = new THREE.Vector3();
    this.antPoseNormal = new THREE.Vector3();
    this.antPoseForward = new THREE.Vector3();
    this.antPoseRight = new THREE.Vector3();
    this.antPoseMatrix = new THREE.Matrix4();
    this.antPoseWorldQuaternion = new THREE.Quaternion();
    this.antPoseParentQuaternion = new THREE.Quaternion();
    this.antPoseYawQuaternion = new THREE.Quaternion();
    this.antPoseUp = new THREE.Vector3(0, 1, 0);
    this.rockSurfaceLocal = new THREE.Vector3();
    this.surfaceRaycaster = new THREE.Raycaster();
    this.surfaceRayOrigin = new THREE.Vector3();
    this.surfaceRayDirection = new THREE.Vector3();
    this.surfaceRayNormalMatrix = new THREE.Matrix3();
    this.surfaceRayInstanceMatrix = new THREE.Matrix4();
    this.antMotionLocked = false;
    this.draggablePondStone = null;
    this.draggedPondStone = null;
    this.pondStoneRaycaster = new THREE.Raycaster();
    this.pondStonePointer = new THREE.Vector2();
    this.pondDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pondDragPoint = new THREE.Vector3();
    this.pondDragLocalPoint = new THREE.Vector3();
    this.lastStoneRipplePoint = new THREE.Vector2();
    this.pondRippleProbe = new THREE.Vector2();
    this.stoneWasInPond = false;
    this.clock = new THREE.Timer();
    this.clock.connect(document);
    this.frameAccumulator = 0;
    this.rainAccumulator = 0;
    this.shadowAccumulator = 0;
    this.rainImpactHandler = (x, z, intensity) => this.sampleRainImpact(x, z, intensity);
    this.running = false;
    this.disposed = false;
    this.eventDisposers = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b6ced1');
    this.antLocator = new AntLocator(this.scene, ANT_LOCATOR);

    this.camera = new THREE.PerspectiveCamera(this.settings.cameraFov, 1, 0.1, 700);
    const heroView = CAMERA_VIEWS.hero;
    this.camera.position.fromArray(heroView.position);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: PERFORMANCE.preserveDrawingBuffer,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = PERFORMANCE.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = PERFORMANCE.shadowUpdateInterval === 0;
    this.renderer.shadowMap.needsUpdate = PERFORMANCE.shadows;
    this.renderer.setAnimationLoop(null);
    this.renderer.domElement.setAttribute('aria-label', 'The Quiet Pond rendered in 3D');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.onCameraManualStart = () => {
      this.antCameraMovementYaw = 0;
      this.antCameraInputAngle = null;
      this.antCameraManualActive = true;
      this.antCameraAssistTravelTime = 0;
    };
    this.onCameraManualEnd = () => {
      this.antCameraManualActive = false;
      this.antCameraAssistPause = this.antCameraFollow.assistResumeDelay ?? 2.5;
    };
    this.controls.addEventListener('start', this.onCameraManualStart);
    this.controls.addEventListener('end', this.onCameraManualEnd);
    this.controls.target.fromArray(heroView.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.rotateSpeed = 0.52;
    this.controls.zoomSpeed = 0.72;
    this.controls.panSpeed = 0.68;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 4.6;
    this.controls.maxDistance = 43;
    this.controls.minPolarAngle = 0.14;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.controls.autoRotateSpeed = 0.38;
    this.controls.update();
    this.setupExploreTouchControls();
    this.listen(this.controls, 'start', () => {
      this.cameraTween = null;
    });
    if (this.enablePondStoneInteraction) this.setupPondStoneInteraction();

    this.environment = new Environment(this.scene, this.renderer);
    this.fireflies = PERFORMANCE.fireflies ? new Fireflies(this.scene) : null;
    this.moths = PERFORMANCE.fireflies ? new LampMoths(this.scene) : null;
    this.weather = PERFORMANCE.rain
      ? new RainWeather(this.scene, this.settings.quality)
      : createDisabledWeather();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.listen(this.renderer.domElement, 'webglcontextlost', (event) => {
      event.preventDefault();
      this.running = false;
      const error = document.getElementById('error-message');
      if (!error) return;
      error.hidden = false;
      error.querySelector('strong').textContent = 'The graphics context was interrupted.';
      error.querySelector('span').textContent = 'Reload the page to restore the diorama.';
    });
  }

  listen(target, type, listener, options) {
    if (!target?.addEventListener || typeof listener !== 'function') return () => {};
    target.addEventListener(type, listener, options);
    const remove = () => target.removeEventListener(type, listener, options);
    this.eventDisposers.push(remove);
    return remove;
  }

  async start() {
    const anisotropy = Math.min(
      PERFORMANCE.modelAnisotropy,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.sceneProps = selectSceneProps(SCENE_PROPS, this.mode);
    this.modelProps = await loadModelProps(this.sceneProps, { anisotropy });
    SPECIALIZED_MODEL_PROP_IDS.forEach((id) => {
      this[id] = this.modelProps[id] ?? null;
    });
    this.setupAntAnimation();
    this.setupCatAnimation();
    this.setupCockroachAnimation();
    await this.buildPond(this.settings);
    this.running = true;
    this.clock.reset();
    this.renderer.setAnimationLoop(() => this.animate());
  }

  disposeWorld() {
    if (!this.world) return;
    this.draggedPondStone = null;
    this.draggablePondStone = null;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = '';
    this.worldAdditions.forEach((object) => object.removeFromParent());
    this.worldAdditions.clear();
    this.gameGroundBlockers.clear();
    this.readerSurfaceProxy?.removeFromParent();
    this.readerSurfaceProxy?.userData.dispose?.();
    this.readerSurfaceProxy = null;
    this.radioSurfaceProxy?.removeFromParent();
    this.radioSurfaceProxy?.userData.dispose?.();
    this.radioSurfaceProxy = null;
    this.backgroundAntMixers.forEach((mixer) => mixer.stopAllAction());
    this.backgroundAntMixers = [];
    this.backgroundAnts.forEach((wanderer) => wanderer.group.removeFromParent());
    this.backgroundAnts = [];
    this.genericModelMixers.forEach((mixer) => {
      mixer.stopAllAction();
      mixer.uncacheRoot(mixer.getRoot());
    });
    this.genericModelMixers = [];
    Object.values(this.modelProps).forEach((model) => {
      model?.group.removeFromParent();
    });
    this.modelPropInstances.forEach((instance) => instance.removeFromParent());
    this.modelPropInstances = [];
    this.streetLampLight?.removeFromParent();
    this.streetLampGlow?.removeFromParent();
    this.streetLampGlow?.userData.dispose?.();
    this.streetLampLight = null;
    this.streetLampGlow = null;
    this.readerTentLight?.removeFromParent();
    this.readerTentLight = null;
    this.antNightLight?.removeFromParent();
    this.antNightLight = null;
    this.readerFadeMaterials.forEach(({ material }) => material.dispose());
    this.readerFadeMaterials = [];
    this.pondWater?.water.removeFromParent();
    this.world.removeFromParent();
    this.environment.setSunGlareOccluder(null);
    this.tree?.leafDepthMaterial?.dispose();
    this.tree?.group.userData.dispose?.();
    this.forest?.group.userData.dispose?.();
    this.ground?.group.userData.dispose?.();
    this.world = null;
    this.tree = null;
    this.ground = null;
    this.forest = null;
    this.activePondWater = null;
    this.antMotionLocked = false;
    this.companionTreeColliders = [];
    this.treeGroundColliders = [];
    this.modelGroundColliders = [];
    this.radioAnchor = null;
    this.tentAnchor = null;
    this.readerCollisionBounds.makeEmpty();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.clock.disconnect?.();
    this.resizeObserver.disconnect();
    this.eventDisposers.splice(0).reverse().forEach((remove) => remove());
    if (this.antAnimationFinishListener) {
      this.antMixer?.removeEventListener('finished', this.antAnimationFinishListener);
      this.antAnimationFinishListener = null;
    }
    this.antMixer?.stopAllAction();
    this.catMixer?.stopAllAction();
    this.cockroachMixer?.stopAllAction();
    this.backgroundAntMixers.forEach((mixer) => mixer.stopAllAction());
    this.disposeWorld();
    this.pondWater?.dispose();
    this.pondWater = null;
    Object.values(this.modelProps).forEach((model) => model?.group?.userData?.dispose?.());
    this.modelProps = {};
    this.sceneProps = Object.freeze({});
    this.weather.dispose();
    this.fireflies?.dispose();
    this.moths?.dispose();
    this.environment.dispose();
    this.antLocator.dispose();
    this.frameUpdateListeners.clear();
    this.controls.removeEventListener('start', this.onCameraManualStart);
    this.controls.removeEventListener('end', this.onCameraManualEnd);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.scene.clear();
  }

  async buildPond(nextSettings = DEFAULTS) {
    const safeSeed = String(nextSettings.seed || DEFAULTS.seed).slice(0, 32);
    const habitat = getHabitatArea();
    this.settings = {
      ...DEFAULTS,
      ...nextSettings,
      seed: safeSeed,
      area: habitat.id,
    };
    const groveLayout = createPondGroveLayout({ seed: this.settings.seed });
    const heroPosition = groveLayout.hero;
    const habitatClearings = groveLayout.clearings;
    const antOffset = SCENE_PROPS.ant.offset;
    const groundTreeClearings = [
      ...habitatClearings,
      {
        x: heroPosition.x + antOffset.x,
        z: heroPosition.z + antOffset.z,
        radius: SCENE_PROPS.ant.clearingRadius,
      },
    ];
    this.viewOffset.set(
      groveLayout.hero.x,
      0,
      groveLayout.hero.z,
    );
    this.controls.autoRotate = this.settings.autoRotate;
    this.applyAreaMode(habitat.id);
    this.disposeWorld();
    this.companionTreeColliders = groveLayout.companions.map((companion) => ({
      x: companion.x,
      z: companion.z,
      radius: SCENE_PROPS.ant.treeCollisionRadius * (companion.scale ?? 1),
    }));

    const world = new THREE.Group();
    world.name = `Diorama specimen ${safeSeed}`;
    const lampCorner = habitat.detailSize * 0.5 - SCENE_PROPS.streetLamp.cornerInset;
    const tentPlacement = SCENE_PROPS.tent.placement;
    const tentPosition = {
      x: lampCorner + tentPlacement.offset.x,
      z: lampCorner + tentPlacement.offset.z,
    };
    const frogPlacement = SCENE_PROPS.frog.placement;
    const frogPosition = createPondProfile({ seed: this.settings.seed }).pointAt(
      frogPlacement.pondAngle,
      frogPlacement.pondInset,
    );
    const scatteredModelPropPlacements = Object.entries(this.sceneProps)
      .filter(([id, config]) => Number.isFinite(config.count) && this.modelProps[id])
      .map(([id, config]) => createModelPropPlacement(id, config));
    const fixedModelPropPlacements = Object.entries(this.sceneProps)
      .filter(([id, config]) => (
        config.placementStrategy === 'fixed-ground'
        && this.modelProps[id]
        && config.placement?.position
      ))
      .map(([id, config]) => createModelPropPlacement(id, config, {
        position: config.placement.position,
        yaw: THREE.MathUtils.degToRad(config.yaw + config.yawOffset),
      }));
    const reservedGroundClearings = this.groundReservations.map((reservation) => (
      createModelPropPlacement(reservation.id, {}, {
        position: reservation.position,
        radius: reservation.radius,
      })
    ));
    const ground = createGround({
      ...this.settings,
      grassDensity: this.settings.grassDensity * PERFORMANCE.grassDensityScale,
      treeClearings: groundTreeClearings,
      modelPropClearings: [
        ...scatteredModelPropPlacements,
        ...fixedModelPropPlacements,
        ...reservedGroundClearings,
        ...(this.tent ? [createModelPropPlacement('tent', SCENE_PROPS.tent, {
          position: tentPosition,
          yaw: THREE.MathUtils.degToRad(SCENE_PROPS.tent.yaw),
        })] : []),
        ...(this.streetLamp ? [createModelPropPlacement('streetLamp', SCENE_PROPS.streetLamp, {
          position: { x: lampCorner, z: lampCorner },
          yaw: THREE.MathUtils.degToRad(SCENE_PROPS.streetLamp.yaw),
        })] : []),
        ...(this.frog ? [createModelPropPlacement('frog', SCENE_PROPS.frog, {
          position: frogPosition,
          yaw: THREE.MathUtils.degToRad(SCENE_PROPS.frog.yaw),
        })] : []),
      ],
    });
    const tree = createTree(this.settings);
    let activePondWater = null;
    if (ground.pondProfile) {
      if (!this.pondWater) {
        this.pondWater = new PondWater(
          this.renderer,
          this.scene,
          this.environment.sunDirection,
        );
        this.pondWater.reflectionsEnabled = PERFORMANCE.pondReflections;
        this.pondWater.ripplesEnabled = PERFORMANCE.pondRipples;
      }
      activePondWater = this.pondWater;
      activePondWater.configure(
        ground.pondProfile,
        this.settings.season,
        this.settings.quality,
      );
    }
    this.activePondWater = activePondWater;
    this.draggablePondStone = ground.pondStone;
    this.propHeroPosition = { x: heroPosition.x, z: heroPosition.z };
    tree.group.position.set(
      heroPosition.x,
      ground.heightAt(heroPosition.x, heroPosition.z) - 0.015,
      heroPosition.z,
    );
    const leafWindUniforms = PERFORMANCE.leafWind
      ? addLeafWind(tree.leafMaterial)
      : null;
    const leafMesh = tree.group.getObjectByName('Instanced ash canopy');
    const leafDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: tree.leafMaterial.map,
      alphaTest: tree.leafMaterial.alphaTest,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
    });
    if (leafWindUniforms) addLeafWind(leafDepthMaterial, leafWindUniforms);
    leafMesh.customDepthMaterial = leafDepthMaterial;
    tree.leafWindUniforms = leafWindUniforms;
    tree.leafDepthMaterial = leafDepthMaterial;
    const forest = createGroveTrees({
      seed: this.settings.seed,
      season: this.settings.season,
      quality: this.settings.quality,
      heroAge: this.settings.age,
      heroBranchSpread: this.settings.branchSpread,
      heroLeafDensity: this.settings.leafDensity,
      heightAt: ground.heightAt,
      layout: groveLayout,
    });
    const sourceTrees = [tree, ...(forest?.trees ?? [])];
    this.treeGroundColliders = sourceTrees.map((sourceTree, index) => {
      const position = sourceTree.group.getWorldPosition(new THREE.Vector3());
      const fallback = index === 0
        ? {
          x: heroPosition.x,
          z: heroPosition.z,
          radius: SCENE_PROPS.ant.treeCollisionRadius,
        }
        : this.companionTreeColliders[index - 1];
      const footprint = createObjectGroundFootprint(sourceTree.woodMesh, {
        cellSize: 0.05,
        baseHeight: ground.heightAt(position.x, position.z),
        maximumHeightAboveBase: 0.42,
      });
      return {
        ...fallback,
        footprint,
      };
    });
    if (leafWindUniforms) {
      forest?.leafMaterials.forEach((leafMaterial) => {
        addLeafWind(leafMaterial, leafWindUniforms);
      });
    }
    world.add(ground.group, tree.group);
    if (this.cat && tree.perchAnchor) {
      this.placeCat(tree);
      tree.group.add(this.cat.group);
    }
    if (forest) world.add(forest.group);
    if (activePondWater) world.add(activePondWater.water);
    if (this.radio && ground.rockAnchor) {
      this.placeRadio(ground.rockAnchor, heroPosition);
      world.add(this.radio.group);
      if (this.radioSurfaceProxy) world.add(this.radioSurfaceProxy);
    }
    if (this.reader) {
      this.placeReader(heroPosition, ground);
      world.add(this.reader.group);
      if (this.readerSurfaceProxy) world.add(this.readerSurfaceProxy);
    }
    const tentAnchor = getModelPropSpot(ground, 'tent');
    if (this.tent && tentAnchor) {
      this.tentAnchor = tentAnchor;
      this.placeTent(tentAnchor, ground);
      world.add(this.tent.group);
    }
    this.prepareReaderNightRoutine(ground, world);
    const frogAnchor = getModelPropSpot(ground, 'frog');
    if (this.frog && frogAnchor) {
      this.placeFrog(frogAnchor, ground);
      world.add(this.frog.group);
    }
    const lollipopAnchor = getModelPropSpot(ground, 'lollipop');
    if (this.lollipop && lollipopAnchor) {
      placeGroundModelProp({
        model: this.lollipop,
        ground,
        anchor: lollipopAnchor,
        config: SCENE_PROPS.lollipop,
      });
      world.add(this.lollipop.group);
    }
    if (this.ant) {
      this.placeAnt(heroPosition, ground);
      this.antNightLight = new THREE.PointLight(
        ANT_NIGHT_LIGHT.color,
        0,
        ANT_NIGHT_LIGHT.distance,
        ANT_NIGHT_LIGHT.decay,
      );
      this.antNightLight.name = 'Faint ant night light';
      this.ant.group.updateWorldMatrix(true, true);
      const antBounds = new THREE.Box3().setFromObject(this.ant.group, true);
      const antCenter = antBounds.getCenter(new THREE.Vector3());
      const lightWorldPosition = new THREE.Vector3(
        antCenter.x,
        antBounds.max.y + ANT_NIGHT_LIGHT.height,
        antCenter.z,
      );
      this.ant.group.worldToLocal(lightWorldPosition);
      this.antNightLight.position.copy(lightWorldPosition);
      this.ant.group.add(this.antNightLight);
      world.add(this.ant.group);
    }
    this.placeScatteredModelProps(ground, world);
    this.placeFixedModelProps(ground, world);
    this.placeStreetLamp(ground, world);
    this.buildModelGroundColliders();
    if (this.placeCockroach(heroPosition, ground)) world.add(this.cockroach.group);
    this.placeBackgroundAnts(ground, world);
    this.scene.add(world);

    this.world = world;
    this.ground = ground;
    this.tree = tree;
    this.environment.setSunGlareOccluder(tree.group);
    this.forest = forest;
    this.activePondWater = activePondWater;
    this.setWind(this.settings.wind);
    this.weather.setIntensity(this.settings.rainIntensity);
    this.setRainEnabled(this.settings.rainEnabled);
    this.weather.setQuality(this.settings.quality);
    this.environment.update(
      this.settings.sunHour,
      this.settings.season,
      this.settings.quality,
      this.settings.area,
    );
    if (PERFORMANCE.shadows) this.renderer.shadowMap.needsUpdate = true;
    this.updateStreetLampLight();
    this.updateAntNightLight();
    this.setRenderQuality(this.settings.quality);
  }

  setRenderQuality(quality) {
    const maximumRatio = quality === 'high'
      ? PERFORMANCE.maximumPixelRatio
      : Math.min(PERFORMANCE.maximumPixelRatio, 1.25);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maximumRatio));
    this.resize();
  }

  applyAreaMode(area, resetView = false) {
    const habitat = getHabitatArea(area);
    const antView = this.isAntViewActive();
    this.controls.enablePan = antView ? false : !habitat.infinite;
    this.controls.enableZoom = !antView;
    this.controls.zoomToCursor = antView ? false : !habitat.infinite;
    this.controls.minDistance = antView ? 0.25 : 4.6;
    this.controls.maxDistance = antView ? 1.2 : habitat.cameraMaxDistance;
    this.controls.minPolarAngle = antView ? 0.3 : 0.14;
    this.controls.maxPolarAngle = antView
      ? Math.PI * 0.48
      : (habitat.infinite ? Math.PI * 0.495 : Math.PI * 0.53);
    this.controls.autoRotate = antView ? false : this.settings.autoRotate;

    if (resetView) {
      this.setView('hero', true);
    } else {
      this.controls.update();
    }
  }

  setAntLocatorActive(active) {
    this.antLocator.setActive(active);
  }

  setWind(value) {
    this.settings.wind = THREE.MathUtils.clamp(Number(value), 0, 1);
    this.updateWeatherWind();
  }

  setRainEnabled(enabled) {
    this.settings.rainEnabled = PERFORMANCE.rain && Boolean(enabled);
    this.weather.setEnabled(this.settings.rainEnabled);
  }

  setRainIntensity(value) {
    this.settings.rainIntensity = THREE.MathUtils.clamp(Number(value), 0.15, 1);
    this.weather.setIntensity(this.settings.rainIntensity);
  }

  setCameraFov(value) {
    this.settings.cameraFov = THREE.MathUtils.clamp(Number(value), 24, 70);
    this.camera.fov = this.settings.cameraFov;
    this.camera.updateProjectionMatrix();
  }

  setWeatherPreset({ hour = this.settings.sunHour, storm = 0, rain = false, rainIntensity = 0.7 }) {
    this.setSunHour(hour);
    this.settings.presetStormAmount = THREE.MathUtils.clamp(Number(storm), 0, 1);
    this.setRainIntensity(rainIntensity);
    this.setRainEnabled(rain);
  }

  clearWeatherPreset() {
    this.settings.presetStormAmount = 0;
  }

  setStormAmount(amount) {
    this.settings.presetStormAmount = THREE.MathUtils.clamp(Number(amount), 0, 1);
  }

  getStormAmount() {
    return this.settings.presetStormAmount ?? 0;
  }

  updateWeatherWind() {
    const weatherWind = this.weather?.amount ?? 0;
    const effectiveWind = THREE.MathUtils.clamp(this.settings.wind + weatherWind * 0.48, 0, 1);
    if (this.tree?.leafWindUniforms) this.tree.leafWindUniforms.uWind.value = effectiveWind;
    return effectiveWind;
  }

  sampleRainImpact(x, z, intensity) {
    if (!this.ground) return null;
    const isWater = this.ground.containsPond?.(x, z, -0.025) ?? false;
    if (isWater && this.activePondWater) {
      this.activePondWater.addRipple(x, z, 0.0025 + intensity * 0.0035, 0.055 + intensity * 0.035);
      return { y: this.activePondWater.getSurfaceHeight(x, z), isWater: true };
    }
    return { y: this.ground.surfaceHeightAt?.(x, z) ?? this.ground.heightAt(x, z), isWater: false };
  }

  setSunHour(hour) {
    this.settings.sunHour = Number(hour);
    this.environment.update(
      this.settings.sunHour,
      this.settings.season,
      this.settings.quality,
      this.settings.area,
    );
    this.updateStreetLampLight();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate() {
    if (!this.running) return;
    this.clock.update();
    let delta = this.clock.getDelta();
    this.frameAccumulator += delta;
    if (
      PERFORMANCE.frameInterval > 0
      && this.frameAccumulator < PERFORMANCE.frameInterval
    ) return;
    if (PERFORMANCE.frameInterval > 0) {
      delta = this.frameAccumulator;
      this.frameAccumulator = 0;
    }
    if (PERFORMANCE.shadowUpdateInterval > 0) {
      this.shadowAccumulator += delta;
      if (this.shadowAccumulator >= PERFORMANCE.shadowUpdateInterval) {
        this.shadowAccumulator %= PERFORMANCE.shadowUpdateInterval;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    const elapsed = this.clock.getElapsed();
    this.updateAntMovement(delta);
    this.antMixer?.update(delta);
    this.catMixer?.update(delta);
    this.updateCockroach(delta);
    this.cockroachMixer?.update(delta);
    this.updateBackgroundAnts(delta);
    for (const mixer of this.backgroundAntMixers) mixer.update(delta);
    for (const mixer of this.genericModelMixers) mixer.update(delta);
    this.updateStreetLampLight(elapsed);
    this.updateAntNightLight();
    this.updateReaderNightRoutine(delta);
    const effectiveWind = this.updateWeatherWind();
    this.rainAccumulator += delta;
    if (
      PERFORMANCE.rainUpdateInterval === 0
      || this.rainAccumulator >= PERFORMANCE.rainUpdateInterval
    ) {
      const rainDelta = this.rainAccumulator;
      this.rainAccumulator = 0;
      this.weather.update(rainDelta, this.camera, effectiveWind, this.rainImpactHandler);
    }
    this.environment.setStormAmount(Math.max(this.weather.amount, this.settings.presetStormAmount ?? 0));
    this.ground?.update(elapsed, effectiveWind);
    this.activePondWater?.update(
      delta,
      elapsed,
      effectiveWind,
      this.environment.sun.color,
    );
    this.updateAntSurfaceHeight();
    this.notifyFrameUpdateListeners(delta, elapsed);
    this.enforceGameGroundBlockers();
    // Surface traversal and blockers can move the player in frame listeners.
    // Follow their final position so the camera does not lag an extra frame.
    this.updateCameraTween();
    if (this.isAntViewActive()) {
      if (!this.cameraTween) this.updateAntCamera(delta);
    } else {
      this.controls.update(delta);
    }
    this.updatePondStone(delta);
    this.ground?.setGrassVisibility(
      this.isAntViewActive() ? this.getAntWorldPosition(this.grassVisibilityPosition) : null,
      this.camera.position,
      delta,
    );
    this.antLocator.update(
      this.antLocator.active ? this.getAntWorldPosition(this.antLocatorPosition) : null,
      elapsed,
    );
    if (this.tree?.leafWindUniforms) this.tree.leafWindUniforms.uTime.value = elapsed;
    this.environment.animate(elapsed, this.camera, delta);
    this.fireflies?.update(elapsed, this.settings.sunHour);
    this.moths?.update(elapsed, this.settings.sunHour, this.streetLampGlow?.position);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  }
}

installPondWorldQueryMethods(PondApp);
installPondActorAnimationMethods(PondApp);
installPondPropPlacementMethods(PondApp);
installPondWandererMethods(PondApp);
installPondAntNavigationMethods(PondApp);
installPondCameraMethods(PondApp);
installPondInteractionMethods(PondApp);
