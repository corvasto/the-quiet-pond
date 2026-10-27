import * as THREE from 'three';
import { POND_GAME } from '../config/game.js';

function disposeObject3D(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    objectMaterials.forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.add(material);
      material.dispose();
    });
  });
}

function getSeedGlowRadius(debug) {
  return (debug ? 0.27 : 0.16) * 1.3;
}

function createSeedVisual({ debug = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Game seed';

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 14, 10),
    new THREE.MeshStandardMaterial({
      color: '#b78035',
      emissive: '#4b2608',
      emissiveIntensity: debug ? 1.15 : 0.42,
      roughness: 0.6,
      metalness: 0.02,
    }),
  );
  body.scale.set(0.72, 1.16, 0.72);
  body.rotation.z = 0.2;
  body.name = 'Seed body';
  body.castShadow = true;
  body.receiveShadow = true;

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(getSeedGlowRadius(debug), 14, 10),
    new THREE.MeshBasicMaterial({
      color: '#ffc96e',
      transparent: true,
      opacity: debug ? 0.42 : 0.2,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.renderOrder = 2;

  group.add(glow, body);
  group.userData.glow = glow;
  group.userData.body = body;
  group.userData.debug = debug;
  return group;
}

function createBurrowVisual() {
  const group = new THREE.Group();
  group.name = 'Game burrow';
  const createRock = (name, position, scale, color, variation) => {
    const geometry = new THREE.DodecahedronGeometry(1, 1);
    const rock = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.96,
        metalness: 0,
        flatShading: true,
      }),
    );
    rock.name = name;
    rock.position.copy(position);
    rock.scale.copy(scale);
    rock.rotation.set(variation * 0.12, variation * 0.19, variation * 0.08);
    rock.castShadow = true;
    rock.receiveShadow = true;
    return rock;
  };
  const rockPieces = new THREE.Group();
  rockPieces.name = 'Rounded burrow boulder cave';
  rockPieces.add(
    createRock('Burrow cave roof', new THREE.Vector3(0, 0.36, 0.08), new THREE.Vector3(0.8, 0.24, 0.42), '#82785a', 0.4),
    createRock('Burrow cave left wall', new THREE.Vector3(-0.54, 0.16, -0.015), new THREE.Vector3(0.28, 0.2, 0.3), '#72694f', 1.7),
    createRock('Burrow cave right wall', new THREE.Vector3(0.54, 0.15, 0.02), new THREE.Vector3(0.28, 0.19, 0.29), '#786e52', 3.2),
    createRock('Burrow cave rear', new THREE.Vector3(0.02, 0.17, 0.28), new THREE.Vector3(0.62, 0.19, 0.2), '#625d46', 5.1),
  );

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 28),
    new THREE.MeshBasicMaterial({
      color: '#eac778',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.018;
  glow.renderOrder = 2;

  const exploreMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.51, 40),
    new THREE.MeshBasicMaterial({
      color: '#ffd978',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  exploreMarker.name = 'Burrow explore marker';
  exploreMarker.rotation.x = -Math.PI / 2;
  exploreMarker.position.y = 0.04;
  exploreMarker.renderOrder = 4;
  exploreMarker.visible = false;

  const response = new THREE.Group();
  response.name = 'Burrow response';
  response.visible = false;
  response.position.y = 0.025;
  const sproutStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.016, 0.22, 6),
    new THREE.MeshStandardMaterial({ color: '#8fb361', roughness: 0.88 }),
  );
  sproutStem.position.y = 0.11;
  const sproutLeaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 10, 8),
    new THREE.MeshStandardMaterial({
      color: '#bdd57a',
      emissive: '#3d5b22',
      emissiveIntensity: 0.24,
      roughness: 0.76,
    }),
  );
  sproutLeaf.scale.set(1.65, 0.45, 0.72);
  sproutLeaf.position.set(0.045, 0.205, 0);
  sproutLeaf.rotation.z = -0.38;
  response.add(sproutStem, sproutLeaf);

  group.add(
    rockPieces,
    glow,
    exploreMarker,
    response,
  );
  group.userData = {
    glow,
    exploreMarker,
    response,
    rockPieces,
  };
  return group;
}

function createOfferingVisual() {
  const group = new THREE.Group();
  group.name = 'Pond offering leaf';
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 12, 8),
    new THREE.MeshStandardMaterial({
      color: '#6e9d55',
      emissive: '#203b16',
      emissiveIntensity: 0.22,
      roughness: 0.84,
    }),
  );
  leaf.scale.set(1.7, 0.16, 0.7);
  leaf.rotation.y = -0.35;
  leaf.castShadow = true;
  group.add(leaf);
  group.userData.leaf = leaf;
  return group;
}

class ToneFeedback {
  constructor() {
    this.enabled = true;
    this.context = null;
  }

  unlock() {
    if (!this.enabled || this.context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.context.resume?.();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.context?.suspend?.();
    if (this.enabled) this.context?.resume?.();
    return this.enabled;
  }

  play(notes) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const start = this.context.currentTime + 0.012;
    notes.forEach(({ frequency, delay = 0, duration = 0.13, gain = 0.045 }) => {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      const noteStart = start + delay;
      const noteEnd = noteStart + duration;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      envelope.gain.setValueAtTime(0.0001, noteStart);
      envelope.gain.linearRampToValueAtTime(gain, noteStart + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(envelope).connect(this.context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
  }

  dispose() {
    this.context?.close?.();
    this.context = null;
  }
}

const OBJECTIVES = Object.freeze({
  discovering: 'Find an active seed.',
  carrying: 'Carry the seed to the quiet burrow.',
  offeringPickup: 'Offer the leaf to the pond.',
  offeringCarrying: 'Offer the leaf to the pond.',
  complete: 'The pond has answered.',
});

export class SeedToBurrowGame {
  constructor(app, { onStateChange = () => {}, onPromptChange = () => {} } = {}) {
    this.app = app;
    this.onStateChange = onStateChange;
    this.onPromptChange = onPromptChange;
    this.phase = 'discovering';
    this.paused = false;
    this.root = null;
    this.seed = null;
    this.activeSeeds = [];
    this.carriedSeed = null;
    this.seedCandidates = [];
    this.depositedSeedCount = 0;
    this.burrow = null;
    this.offering = null;
    this.offeringPosition = new THREE.Vector3();
    this.offeringBaseY = 0;
    this.offeringCompleted = false;
    this.seedPosition = new THREE.Vector3();
    this.burrowPosition = new THREE.Vector3();
    this.storedSeeds = [];
    this.antPosition = new THREE.Vector3();
    this.seedBaseY = 0;
    this.elapsed = 0;
    this.completionStartedAt = 0;
    this.unsubscribe = null;
    this.currentPrompt = '';
    this.exploreActive = false;
    this.debugLighting = POND_GAME.debug?.enabled === true;
    this.sound = new ToneFeedback();
  }

  start() {
    const burrowPosition = this.app.getGroundWorldPosition(
      POND_GAME.burrow.position.x,
      POND_GAME.burrow.position.z,
      this.burrowPosition,
    );
    if (!burrowPosition || !this.app.canAntOccupy(burrowPosition.x, burrowPosition.z)) {
      throw new Error('The Quiet Pond burrow is outside the current ant route.');
    }

    this.root = new THREE.Group();
    this.root.name = 'Pond game interactions';
    this.burrow = createBurrowVisual();
    this.burrow.position.set(burrowPosition.x, burrowPosition.y + 0.01, burrowPosition.z);
    this.root.add(this.burrow);
    this.seedCandidates = this.createSeedCandidates();
    this.spawnSeeds();
    this.createPondOffering();

    if (!this.app.addWorldObject(this.root)) {
      disposeObject3D(this.root);
      this.root = null;
      throw new Error('The Quiet Pond interactions could not join the scene.');
    }
    const addBurrowBlocker = (id, offsetX, offsetZ, radiusX, radiusZ) => {
      this.app.addGameGroundBlocker(
        id,
        new THREE.Vector3(
          burrowPosition.x + offsetX,
          burrowPosition.y,
          burrowPosition.z + offsetZ,
        ),
        { radiusX, radiusZ },
      );
    };
    addBurrowBlocker('gameBurrowLeft', -0.5, -0.01, 0.3, 0.34);
    addBurrowBlocker('gameBurrowRight', 0.5, 0.01, 0.3, 0.33);
    addBurrowBlocker('gameBurrowRear', 0.02, 0.3, 0.6, 0.18);
    this.unsubscribe = this.app.onFrame((frame) => this.update(frame));
    this.emitState();
    this.setPrompt('Find an active seed.');
    return this.getSnapshot();
  }

  getSnapshot() {
    const totalCount = Math.max(1, Math.round(POND_GAME.seed.totalCount || 1));
    const step = this.phase === 'complete'
      ? 3
      : this.phase === 'offeringPickup' || this.phase === 'offeringCarrying'
        ? 2
        : 1;
    return Object.freeze({
      phase: this.phase,
      objective: OBJECTIVES[this.phase],
      step,
      complete: this.phase === 'complete',
      depositedSeeds: this.depositedSeedCount,
      totalSeeds: totalCount,
      activeSeeds: this.activeSeeds.length,
      offeringComplete: this.offeringCompleted,
    });
  }

  getSaveState() {
    return {
      depositedSeeds: this.depositedSeedCount,
      offeringComplete: this.offeringCompleted,
      // Carrying items are deliberately not saved. They return to their safe
      // starting point when the world is loaded again.
      phase: this.phase === 'carrying'
        ? 'discovering'
        : this.phase === 'offeringCarrying'
          ? 'offeringPickup'
          : this.phase,
    };
  }

  restoreSaveState(state) {
    if (!state || !this.root) return false;
    const totalCount = Math.max(1, Math.round(POND_GAME.seed.totalCount || 1));
    const depositedSeeds = THREE.MathUtils.clamp(
      Math.round(Number(state.depositedSeeds) || 0),
      0,
      totalCount,
    );
    const requestedPhase = state.phase;
    const complete = state.offeringComplete === true || requestedPhase === 'complete';

    this.activeSeeds.forEach((seed) => {
      seed.visual?.removeFromParent();
      if (seed.visual) disposeObject3D(seed.visual);
    });
    this.activeSeeds = [];
    this.carriedSeed = null;
    this.seed = null;
    this.seedCandidates.forEach((candidate) => { candidate.used = false; });
    this.storedSeeds.forEach((seed) => {
      seed.removeFromParent();
      disposeObject3D(seed);
    });
    this.storedSeeds = [];

    this.depositedSeedCount = depositedSeeds;
    this.offeringCompleted = complete;
    this.completionStartedAt = this.elapsed;
    this.rebuildStoredSeeds(depositedSeeds);

    if (complete) {
      this.phase = 'complete';
      this.offering?.removeFromParent();
      if (this.offering) disposeObject3D(this.offering);
      this.offering = null;
    } else if (depositedSeeds >= totalCount || requestedPhase === 'offeringPickup') {
      this.phase = 'offeringPickup';
      this.storedSeeds.forEach((seed) => { seed.visible = false; });
      if (this.offering) this.offering.visible = true;
    } else {
      this.phase = 'discovering';
      this.spawnSeeds();
      if (this.offering) this.offering.visible = false;
    }
    this.updateVisuals();
    this.emitState();
    this.setPrompt(OBJECTIVES[this.phase]);
    return true;
  }

  debugSkipToOffering() {
    if (!['discovering', 'carrying'].includes(this.phase) || !this.offering) return false;
    if (this.carriedSeed?.visual) {
      this.app.removeWorldObject(this.carriedSeed.visual);
      disposeObject3D(this.carriedSeed.visual);
      this.carriedSeed = null;
      this.seed = null;
    }
    return this.restoreSaveState({ depositedSeeds: POND_GAME.seed.totalCount, offeringComplete: false, phase: 'offeringPickup' });
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    if (this.paused) {
      this.app.clearAntMovement();
      this.setPrompt('Paused.');
    }
  }

  unlockSound() {
    this.sound.unlock();
  }

  setSoundEnabled(enabled) {
    return this.sound.setEnabled(enabled);
  }

  setExploreActive(active) {
    this.exploreActive = Boolean(active);
    this.updateVisuals();
  }

  setDebugMode(enabled) {
    this.debugLighting = Boolean(enabled);
    this.activeSeeds.forEach((seed) => {
      const body = seed.visual?.userData.body;
      const glow = seed.visual?.userData.glow;
      if (body?.material?.emissiveIntensity !== undefined) {
        body.material.emissiveIntensity = this.debugLighting ? 1.15 : 0.42;
      }
      if (glow) {
        glow.geometry.dispose();
        glow.geometry = new THREE.SphereGeometry(getSeedGlowRadius(this.debugLighting), 14, 10);
      }
    });
  }

  update({ delta = 0, elapsed = 0 } = {}) {
    if (!this.root || this.paused) return;
    this.elapsed = elapsed;
    this.updateVisuals();
    const antPosition = this.app.getAntWorldPosition(this.antPosition);
    if (!antPosition) return;

    if (this.phase === 'discovering') {
      const nearbySeed = this.activeSeeds.find((seed) => (
        antPosition.distanceTo(seed.position) <= POND_GAME.seed.collectRadius
      ));
      if (nearbySeed) {
        this.collectSeed(nearbySeed);
      } else {
        this.setPrompt(`Find an active seed. ${this.activeSeeds.length} nearby.`);
      }
      return;
    }

    if (this.phase === 'carrying') {
      const distance = antPosition.distanceTo(this.burrowPosition);
      if (distance <= POND_GAME.burrow.depositRadius) {
        this.depositSeed();
      } else if (distance <= 1.15) {
        this.setPrompt('The burrow is close.');
      } else {
        this.setPrompt('Carry the seed to the quiet burrow.');
      }
      return;
    }

    if (this.phase === 'offeringPickup') {
      const distance = antPosition.distanceTo(this.burrowPosition);
      if (distance <= POND_GAME.burrow.depositRadius) {
        this.collectOffering();
      } else {
        this.setPrompt('Return to the burrow for the pond offering.');
      }
      return;
    }

    if (this.phase === 'offeringCarrying') {
      const distance = antPosition.distanceTo(this.offeringPosition);
      if (distance <= POND_GAME.offering.depositRadius) {
        this.depositOffering();
      } else if (distance <= 1.1) {
        this.setPrompt('The pond is close. Offer the leaf at the water.');
      } else {
        this.setPrompt('Carry the leaf to the pond.');
      }
      return;
    }

    this.setPrompt('The pond has answered.');
  }

  createSeedCandidates() {
    const candidates = [];
    const totalCount = Math.max(1, Math.round(POND_GAME.seed.totalCount || 1));
    const enabled = POND_GAME.seed.spawnSurfaces ?? {};
    const landmarks = this.app.getSceneLandmarks();
    const tent = landmarks?.tent;
    const isInsideTent = (x, z) => {
      if (tent?.groundFootprint?.containsGroundPoint?.(x, z, 0)) return true;
      const bounds = tent?.bounds;
      return Boolean(bounds
        && x >= bounds.min.x
        && x <= bounds.max.x
        && z >= bounds.min.z
        && z <= bounds.max.z);
    };
    const addCandidate = (surface, position) => {
      if (!enabled[surface] || !position) return;
      candidates.push({ surface, position: position.clone(), used: false });
    };
    const isAllowedGroundSpawn = (x, z) => (
      !this.app.ground?.containsPond?.(x, z, 0.3)
      && !this.app.ground?.containsRock?.(x, z, 0.3)
      && !isInsideTent(x, z)
      && this.app.canAntOccupy(x, z)
    );
    const configuredSeed = POND_GAME.seed.position;
    if (configuredSeed && isAllowedGroundSpawn(configuredSeed.x, configuredSeed.z)) {
      addCandidate(
        'ground',
        this.app.getGroundWorldPosition(configuredSeed.x, configuredSeed.z),
      );
    }

    const groundRadius = Number(POND_GAME.seed.groundSpawnRadius) || 11;
    // Generate enough ground candidates for the configured total so every
    // batch still completes when an elevated anchor needs a ground fallback.
    const groundAttemptLimit = Math.max(160, totalCount * 80);
    for (
      let attempt = 0;
      attempt < groundAttemptLimit
        && candidates.filter((item) => item.surface === 'ground').length < totalCount;
      attempt += 1
    ) {
      const x = (Math.random() * 2 - 1) * groundRadius;
      const z = (Math.random() * 2 - 1) * groundRadius;
      if (!isAllowedGroundSpawn(x, z)) continue;
      addCandidate('ground', this.app.getGroundWorldPosition(x, z));
    }

    const profile = this.app.ground?.pondProfile;
    if (profile && enabled.water) {
      const radiusX = profile.surfaceRadiusX ?? profile.radiusX;
      const radiusZ = profile.surfaceRadiusZ ?? profile.radiusZ;
      for (let attempt = 0; attempt < 40 && candidates.filter((item) => item.surface === 'water').length < 4; attempt += 1) {
        const x = profile.center.x + (Math.random() * 2 - 1) * radiusX * 0.72;
        const z = profile.center.z + (Math.random() * 2 - 1) * radiusZ * 0.72;
        if (!this.app.ground.containsPond(x, z, -0.12) || !this.app.canAntOccupy(x, z)) continue;
        addCandidate('water', this.app.getAntSupportPosition(x, z));
      }
    }

    if (enabled.rocks) {
      const minimumRockRadius = Math.max(
        0.06,
        Number(POND_GAME.seed.minimumRockRadius) || 0.18,
      );
      landmarks?.rocks?.forEach((rock) => {
        if (
          rock?.source !== 'ground'
          || !Number.isInteger(rock.rockIndex)
          || rock.usableRadius < minimumRockRadius
          || rock === landmarks.radio?.supportRock
        ) return;
        const position = this.app.getRockSurfacePosition(
          rock.rockIndex,
          rock.position.x,
          rock.position.z,
        );
        addCandidate('rocks', position);
      });
    }
    if (enabled.branches) {
      // The hero-tree perch is occupied by the cat. Companion perches provide
      // a visible branch target while retaining an ordinary tree-climb route.
      (landmarks?.trees ?? []).slice(1).forEach((tree) => {
        if (!tree?.surfaceObject || !tree.climb || !tree.perch) return;
        const position = tree.perch.position.clone();
        position.y += Math.max(0.02, Number(tree.perch.radius) || 0);
        addCandidate('branches', position);
      });
    }
    return candidates;
  }

  spawnSeeds() {
    const totalCount = Math.max(1, Math.round(POND_GAME.seed.totalCount || 1));
    const activeCount = Math.max(1, Math.round(POND_GAME.seed.activeCount || 1));
    while (this.activeSeeds.length < activeCount && this.depositedSeedCount + this.activeSeeds.length < totalCount) {
      const available = this.seedCandidates.filter((candidate) => !candidate.used);
      if (!available.length) {
        console.warn(
          `[the-quiet-pond] No unused seed candidate remains for seed ${this.depositedSeedCount + this.activeSeeds.length + 1} of ${totalCount}.`,
        );
        break;
      }
      const seedIndex = this.depositedSeedCount + this.activeSeeds.length;
      const preferredSurfaces = POND_GAME.seed.spawnSurfacePattern ?? [];
      const preferredSurface = preferredSurfaces[seedIndex % preferredSurfaces.length];
      const preferredCandidates = preferredSurface
        ? available.filter((candidate) => candidate.surface === preferredSurface)
        : [];
      const groundCandidates = available.filter((candidate) => candidate.surface === 'ground');
      const candidatePool = preferredCandidates.length > 0
        ? preferredCandidates
        : groundCandidates.length > 0 ? groundCandidates : available;
      const candidate = candidatePool[Math.floor(Math.random() * candidatePool.length)];
      candidate.used = true;
      const visual = createSeedVisual({ debug: this.debugLighting });
      const position = candidate.position.clone();
      position.y += Number(POND_GAME.seed.spawnHeightOffset) || 0.055;
      visual.position.copy(position);
      this.root.add(visual);
      this.activeSeeds.push({
        visual,
        position,
        baseY: position.y,
        surface: candidate.surface,
      });
    }
  }

  createPondOffering() {
    const profile = this.app.ground?.pondProfile;
    const configuredPosition = POND_GAME.offering.position;
    const x = configuredPosition?.x ?? profile?.center.x ?? 0;
    const z = configuredPosition?.z ?? profile?.center.z ?? 0;
    const target = this.app.getAntSupportPosition(x, z, this.offeringPosition)
      ?? this.app.getGroundWorldPosition(x, z, this.offeringPosition);
    if (!target) throw new Error('The Pond offering area could not be placed.');
    const targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.58, 40),
      new THREE.MeshBasicMaterial({
        color: '#b8f5df',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    targetRing.name = 'Pond offering target';
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.copy(target);
    targetRing.position.y += 0.012;
    targetRing.renderOrder = 6;
    this.offering = createOfferingVisual();
    this.offering.position.copy(this.burrowPosition);
    this.offering.position.y += 0.08;
    this.offering.visible = false;
    this.offeringTarget = targetRing;
    this.root.add(this.offering, targetRing);
    this.offeringBaseY = this.offering.position.y;
  }

  updateVisuals() {
    this.activeSeeds.forEach((seed, index) => {
      const seedGlow = seed.visual?.userData.glow;
      if (!seedGlow) return;
      const pulse = 0.5 + Math.sin(this.elapsed * 2.6 + index) * 0.5;
      seed.visual.position.y = seed.baseY + Math.sin(this.elapsed * 2.1 + index) * 0.012;
      seed.visual.rotation.y = this.elapsed * 0.74 + index;
      const debugBoost = this.debugLighting ? 1.8 : 1;
      seedGlow.material.opacity = (0.15 + pulse * 0.17) * debugBoost;
      seedGlow.scale.setScalar((0.9 + pulse * 0.28) * debugBoost);
    });
    if (this.carriedSeed?.visual) {
      const seedGlow = this.carriedSeed.visual.userData.glow;
      this.carriedSeed.visual.rotation.y = this.elapsed * 2.1;
      seedGlow.material.opacity = 0.24;
      seedGlow.scale.setScalar(1.06);
    }
    if (this.offering?.visible && this.phase === 'offeringPickup') {
      this.offering.position.y = this.offeringBaseY + Math.sin(this.elapsed * 2.1) * 0.01;
      this.offering.rotation.y = this.elapsed * 0.7;
    }
    if (this.offeringTarget) {
      const targetVisible = this.phase === 'offeringCarrying';
      const pulse = 0.5 + Math.sin(this.elapsed * 2.2) * 0.5;
      this.offeringTarget.material.opacity = targetVisible ? 0.58 + pulse * 0.26 : 0;
      this.offeringTarget.scale.setScalar(0.98 + pulse * 0.16);
    }

    const burrowGlow = this.burrow?.userData.glow;
    const exploreMarker = this.burrow?.userData.exploreMarker;
    const response = this.burrow?.userData.response;
    if (!burrowGlow || !response) return;
    const pulse = 0.5 + Math.sin(this.elapsed * 2.4) * 0.5;
    if (exploreMarker) {
      const visible = this.exploreActive;
      exploreMarker.visible = visible;
      exploreMarker.material.opacity = visible ? 0.52 + pulse * 0.3 : 0;
      exploreMarker.scale.setScalar(0.92 + pulse * 0.18);
    }
    if (this.phase === 'carrying' || this.phase === 'offeringCarrying') {
      burrowGlow.material.opacity = 0.08 + pulse * 0.13;
      burrowGlow.scale.setScalar(0.94 + pulse * 0.17);
    } else if (this.phase === 'complete') {
      const reveal = Math.min(1, (this.elapsed - this.completionStartedAt) * 1.6);
      burrowGlow.material.opacity = 0.26 + pulse * 0.16;
      burrowGlow.scale.setScalar(1.05 + pulse * 0.2);
      response.visible = true;
      response.scale.setScalar(0.35 + reveal * 0.65);
    } else {
      burrowGlow.material.opacity = 0;
    }
  }

  collectSeed(seed) {
    if (this.phase !== 'discovering' || !seed?.visual) return;
    if (!this.app.attachObjectToAnt(seed.visual, POND_GAME.seed.carryOffset)) return;
    this.activeSeeds = this.activeSeeds.filter((candidate) => candidate !== seed);
    this.carriedSeed = seed;
    this.seed = seed.visual;
    this.phase = 'carrying';
    this.sound.play([
      { frequency: 523.25, duration: 0.11, gain: 0.035 },
      { frequency: 659.25, delay: 0.1, duration: 0.16, gain: 0.045 },
    ]);
    this.emitState();
    this.setPrompt('Carry the seed to the quiet burrow.');
  }

  depositSeed() {
    if (this.phase !== 'carrying' || !this.carriedSeed?.visual) return;
    this.carriedSeed.visual.visible = false;
    this.app.removeWorldObject(this.carriedSeed.visual);
    disposeObject3D(this.carriedSeed.visual);
    this.addStoredSeed();
    this.depositedSeedCount += 1;
    this.carriedSeed = null;
    this.seed = null;
    this.completionStartedAt = this.elapsed;
    this.sound.play([
      { frequency: 392, duration: 0.16, gain: 0.045 },
      { frequency: 523.25, delay: 0.14, duration: 0.18, gain: 0.048 },
      { frequency: 783.99, delay: 0.29, duration: 0.28, gain: 0.038 },
    ]);
    if (this.depositedSeedCount >= Math.max(1, Math.round(POND_GAME.seed.totalCount || 1))) {
      this.storedSeeds.forEach((seed) => { seed.visible = false; });
      this.phase = 'offeringPickup';
      this.offering.visible = true;
      this.setPrompt('Return to the burrow for the pond offering.');
    } else {
      this.phase = 'discovering';
      if (this.activeSeeds.length === 0) {
        this.spawnSeeds();
      }
      this.setPrompt(`Find an active seed. ${this.activeSeeds.length} nearby.`);
    }
    this.emitState();
  }

  rebuildStoredSeeds(count) {
    for (let index = 0; index < count; index += 1) this.addStoredSeed();
  }

  addStoredSeed() {
    const storedSeed = createSeedVisual({ debug: this.debugLighting });
    const index = this.storedSeeds.length;
    const storedSeedSlots = POND_GAME.seed.storedSeedSlots ?? [];
    const configuredSlot = storedSeedSlots[index % storedSeedSlots.length];
    if (configuredSlot) {
      storedSeed.position.set(configuredSlot.x, configuredSlot.y, configuredSlot.z);
    } else {
      const overflowIndex = index - storedSeedSlots.length;
      const ring = Math.floor(overflowIndex / 8) + 1;
      const slot = overflowIndex % 8;
      const angle = (slot / 8) * Math.PI * 2;
      const radius = 0.32 + (ring - 1) * 0.14;
      storedSeed.position.set(Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius);
    }
    storedSeed.scale.setScalar(0.62);
    const storedGlow = storedSeed.userData.glow;
    if (storedGlow) {
      storedGlow.visible = false;
      storedGlow.material.opacity = 0;
    }
    const storedBody = storedSeed.userData.body;
    if (storedBody?.material?.emissiveIntensity !== undefined) {
      storedBody.material.emissiveIntensity = 0.08;
    }
    this.burrow?.add(storedSeed);
    this.storedSeeds.push(storedSeed);
  }

  collectOffering() {
    if (this.phase !== 'offeringPickup' || !this.offering) return;
    if (!this.app.attachObjectToAnt(this.offering, POND_GAME.offering.carryOffset)) return;
    this.phase = 'offeringCarrying';
    this.sound.play([
      { frequency: 392, duration: 0.14, gain: 0.035 },
      { frequency: 523.25, delay: 0.12, duration: 0.18, gain: 0.042 },
    ]);
    this.emitState();
    this.setPrompt('Carry the leaf to the pond.');
  }

  depositOffering() {
    if (this.phase !== 'offeringCarrying' || !this.offering) return;
    this.offering.visible = false;
    this.app.removeWorldObject(this.offering);
    disposeObject3D(this.offering);
    this.offeringCompleted = true;
    this.phase = 'complete';
    this.completionStartedAt = this.elapsed;
    this.app.activePondWater?.addRipple(
      this.offeringPosition.x,
      this.offeringPosition.z,
      0.012,
      0.16,
    );
    this.sound.play([
      { frequency: 523.25, duration: 0.16, gain: 0.04 },
      { frequency: 659.25, delay: 0.14, duration: 0.2, gain: 0.045 },
      { frequency: 783.99, delay: 0.3, duration: 0.3, gain: 0.04 },
    ]);
    this.emitState();
    this.setPrompt('The pond has answered.');
  }

  emitState() {
    this.onStateChange(this.getSnapshot());
  }

  setPrompt(prompt) {
    if (prompt === this.currentPrompt) return;
    this.currentPrompt = prompt;
    this.onPromptChange(prompt);
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    const carriedSeedVisual = this.carriedSeed?.visual ?? null;
    if (carriedSeedVisual) {
      this.app.removeWorldObject(carriedSeedVisual);
      disposeObject3D(carriedSeedVisual);
    }
    if (this.phase === 'offeringCarrying' && this.offering) {
      this.app.removeWorldObject(this.offering);
      disposeObject3D(this.offering);
      this.offering = null;
    }
    if (this.root) {
      this.app.removeWorldObject(this.root);
      disposeObject3D(this.root);
    }
    this.sound.dispose();
    this.root = null;
    this.seed = null;
    this.activeSeeds = [];
    this.carriedSeed = null;
    this.offering = null;
    this.offeringTarget = null;
    this.burrow = null;
    this.app.removeGameGroundBlocker('gameBurrowLeft');
    this.app.removeGameGroundBlocker('gameBurrowRight');
    this.app.removeGameGroundBlocker('gameBurrowRear');
    this.storedSeeds = [];
  }
}
