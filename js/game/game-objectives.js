import * as THREE from 'three';
import {
  GAME_OBJECTIVES,
  MANAGED_GAME_OBJECTIVES,
} from '../content/objectives.js';
import { POND_GAME } from '../config/game.js';
import { WorldSpeech } from './world-speech.js';

const NIGHT_START = 18.5;
const NIGHT_END = 6.5;

function isNight(hour) {
  return hour >= NIGHT_START || hour < NIGHT_END;
}

function isWithinTimeWindow(hour, startHour, endHour) {
  return startHour > endHour
    ? hour >= startHour || hour < endHour
    : hour >= startHour && hour < endHour;
}

function distanceToAny(point, positions) {
  if (!point) return Infinity;
  return positions.reduce((minimum, position) => Math.min(
    minimum,
    position ? Math.hypot(point.x - position.x, point.z - position.z) : Infinity,
  ), Infinity);
}

export class PondGameObjectives {
  constructor(app, { onChange = () => {}, onAllComplete = () => {}, language = 'en' } = {}) {
    this.app = app;
    this.onChange = onChange;
    this.onAllComplete = onAllComplete;
    this.unsubscribe = null;
    this.antPosition = new THREE.Vector3();
    this.catPosition = new THREE.Vector3();
    this.cockroachPosition = new THREE.Vector3();
    this.speechPosition = new THREE.Vector3();
    this.hour = 10.5;
    this.raining = false;
    this.seedSnapshot = {
      depositedSeeds: 0,
      totalSeeds: POND_GAME.seed.totalCount,
      offeringComplete: false,
    };
    this.landmarkPositions = {};
    this.shelterBounds = null;
    this.burrowShelterPosition = null;
    this.taskState = Object.fromEntries(MANAGED_GAME_OBJECTIVES.map(({ id }) => [
      id,
      { complete: false, elapsed: 0 },
    ]));
    this.cachedSnapshot = null;
    this.lastSnapshotSignature = -1;
    this.allCompleteNotified = false;
    this.paused = false;
    this.bookMarker = null;
    this.catMarker = null;
    this.lampMarker = null;
    this.lollipopMarker = null;
    this.debugEnabled = false;
    this.cockroachNear = false;
    this.worldSpeech = new WorldSpeech(app, {
      language,
      duration: POND_GAME.interactions?.worldSpeechSeconds,
    });
  }

  start() {
    const landmarks = this.app.getSceneLandmarks?.() ?? {};
    const worldPosition = (object) => {
      if (!object?.getWorldPosition) return null;
      return object.getWorldPosition(new THREE.Vector3());
    };
    const readerBookOffset = POND_GAME.objectives.readerBookOffset ?? {};
    const targetLampOffset = POND_GAME.objectives.targetLampOffset ?? {};
    const lollipopTargetOffset = POND_GAME.objectives.lollipopTargetOffset ?? {};
    this.burrowShelterPosition = this.app.getGroundWorldPosition(
      POND_GAME.burrow.position.x,
      POND_GAME.burrow.position.z,
    );
    const readerBookPosition = this.app.reader?.group?.localToWorld
      ? this.app.reader.group.localToWorld(new THREE.Vector3(
        Number(readerBookOffset.x) || 0,
        Number(readerBookOffset.y) || 0,
        Number(readerBookOffset.z) || 0,
      ))
      : landmarks.reader?.position ?? null;
    this.landmarkPositions = {
      reader: readerBookPosition,
      radio: landmarks.radio?.position ?? null,
      lamp: (() => {
        const position = this.app.streetLampGlow?.position?.clone()
          ?? landmarks.streetLamp?.position?.clone?.()
          ?? landmarks.streetLamp?.position
          ?? null;
        if (!position) return null;
        return position.add(new THREE.Vector3(
          Number(targetLampOffset.x) || 0,
          Number(targetLampOffset.y) || 0,
          Number(targetLampOffset.z) || 0,
        ));
      })(),
      shelter: [
        landmarks.tent?.position ?? landmarks.tree?.position ?? null,
        this.burrowShelterPosition,
      ],
      frog: worldPosition(this.app.frog?.group),
      cat: worldPosition(this.app.cat?.group),
      lollipop: (() => {
        const position = worldPosition(this.app.lollipop?.group);
        if (!position) return null;
        return position.add(new THREE.Vector3(
          Number(lollipopTargetOffset.x) || 0,
          Number(lollipopTargetOffset.y) || 0,
          Number(lollipopTargetOffset.z) || 0,
        ));
      })(),
    };
    if (landmarks.tent?.bounds?.min && landmarks.tent?.bounds?.max) {
      this.shelterBounds = {
        min: landmarks.tent.bounds.min.clone(),
        max: landmarks.tent.bounds.max.clone(),
      };
    }
    this.setDebugEnabled(POND_GAME.debug?.enabled === true);
    this.unsubscribe = this.app.onFrame((frame) => this.update(frame));
    this.emitChange(true);
  }

  createDebugMarker(property, name, position, radius, color, { opacity = 1 } = {}) {
    if (this[property] || !position) return;
    const material = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
      transparent: opacity < 1,
      opacity,
    });
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      material,
    );
    marker.name = name;
    marker.position.copy(position);
    marker.renderOrder = 1002;
    this[property] = marker;
    this.app.addWorldObject(marker);
  }

  disposeDebugMarker(property) {
    const marker = this[property];
    if (!marker) return;
    this.app.removeWorldObject(marker);
    marker.geometry.dispose();
    marker.material.dispose();
    this[property] = null;
  }

  setDebugEnabled(enabled) {
    this.debugEnabled = Boolean(enabled);
    if (!this.debugEnabled || POND_GAME.debug?.showObjectiveMarkers === false) {
      ['bookMarker', 'catMarker', 'lampMarker', 'lollipopMarker']
        .forEach((property) => this.disposeDebugMarker(property));
      return;
    }
    this.createDebugMarker(
      'bookMarker',
      'Debug reader book objective marker',
      this.landmarkPositions.reader,
      POND_GAME.objectives.readerBookRadius,
      '#ff4d9a',
    );
    this.createDebugMarker(
      'catMarker',
      'Debug cat objective marker',
      this.landmarkPositions.cat,
      0.2,
      '#75c7ff',
    );
    this.createDebugMarker(
      'lampMarker',
      'Debug lamp objective marker',
      this.landmarkPositions.lamp,
      POND_GAME.objectives.lampRadius,
      '#ffd36e',
      { opacity: 0.28 },
    );
    if (this.app.lollipop?.group?.parent) {
      this.createDebugMarker(
        'lollipopMarker',
        'Debug lollipop objective marker',
        this.landmarkPositions.lollipop,
        POND_GAME.objectives.lollipopRadius,
        '#ff70c9',
        { opacity: 0.42 },
      );
    }
  }

  setSeedSnapshot(snapshot) {
    this.seedSnapshot = {
      ...this.seedSnapshot,
      ...snapshot,
    };
    this.emitChange();
  }

  setWorldState({ hour = this.hour, raining = this.raining } = {}) {
    this.hour = Number(hour);
    this.raining = Boolean(raining);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
  }

  getSaveState() {
    return {
      completedTaskIds: Object.entries(this.taskState)
        .filter(([, state]) => state.complete)
        .map(([id]) => id),
    };
  }

  restoreSaveState(state) {
    const completedTaskIds = new Set(
      Array.isArray(state?.completedTaskIds) ? state.completedTaskIds : [],
    );
    Object.entries(this.taskState).forEach(([id, task]) => {
      task.complete = completedTaskIds.has(id);
      task.elapsed = 0;
    });
    if (this.taskState.lollipop?.complete && this.app.lollipop?.group?.parent) {
      this.app.removeWorldObject(this.app.lollipop.group);
    }
    this.allCompleteNotified = false;
    this.emitChange(true);
  }

  setLanguage(language) {
    this.worldSpeech?.setLanguage(language);
  }

  update({ delta = 0 } = {}) {
    if (this.paused) return;
    const antPosition = this.app.getAntWorldPosition(this.antPosition);
    if (!antPosition) return;
    if (this.catMarker && this.app.cat?.group) {
      this.catMarker.position.copy(this.app.cat.group.getWorldPosition(this.catPosition));
      this.landmarkPositions.cat.copy(this.catMarker.position);
    }
    if (this.lollipopMarker && !this.app.lollipop?.group?.parent) {
      this.disposeDebugMarker('lollipopMarker');
    }
    const safeDelta = Math.max(0, Math.min(Number(delta) || 0, 0.25));
    this.worldSpeech?.update(safeDelta);
    const config = POND_GAME.objectives;
    const fireflyConfig = config.fireflies ?? {};
    let onPondSurface = false;
    if (!this.taskState.fireflies.complete) {
      const onPond = this.app.ground?.containsPond?.(antPosition.x, antPosition.z, -0.045) ?? false;
      const pondSurfaceY = this.app.activePondWater?.getSurfaceHeight?.(antPosition.x, antPosition.z);
      onPondSurface = onPond
        && Number.isFinite(pondSurfaceY)
        && Math.abs(antPosition.y - pondSurfaceY) <= (Number(fireflyConfig.surfaceTolerance) || 0.12);
    }
    const cockroachPosition = this.app.getCockroachWorldPosition?.(this.cockroachPosition);
    this.landmarkPositions.cockroach = cockroachPosition ?? null;
    for (const objective of MANAGED_GAME_OBJECTIVES) {
      if (this.taskState[objective.id].complete) continue;
      const available = this.isObjectiveAvailable(objective, fireflyConfig);
      const nearby = this.isObjectiveNearby(objective, antPosition, onPondSurface, config);
      this.updateTask(objective.id, available, nearby, safeDelta);
    }
    const cockroachDistance = cockroachPosition
      ? antPosition.distanceTo(cockroachPosition)
      : Infinity;
    if (cockroachDistance <= config.cockroachRadius) {
      if (!this.cockroachNear && this.app.playAntAnimationRange?.('cockroach')) {
        this.cockroachNear = true;
      }
    } else if (cockroachDistance > config.cockroachRadius * 1.8) {
      this.cockroachNear = false;
    }
    this.emitChange();
  }

  isObjectiveAvailable(objective, fireflyConfig) {
    if (objective.availability === 'raining') return this.raining;
    if (objective.availability === 'night') return isNight(this.hour);
    if (objective.availability === 'fireflyWindow') {
      return isWithinTimeWindow(
        this.hour,
        Number(fireflyConfig.startHour) || 20,
        Number(fireflyConfig.endHour) || NIGHT_END,
      );
    }
    return true;
  }

  isObjectiveNearby(objective, antPosition, onPondSurface, config) {
    if (objective.evaluator === 'shelter') return this.isNearShelter(antPosition);
    if (objective.evaluator === 'pondSurface') return onPondSurface;
    if (objective.target === 'companionAnt') {
      const radius = Number(config[objective.radiusKey]) || 0;
      return (this.app.backgroundAnts ?? []).some(({ group }) => (
        group?.parent && antPosition.distanceTo(group.position) <= radius
      ));
    }
    const target = this.landmarkPositions[objective.target];
    if (!target) return false;
    const radius = Number(config[objective.radiusKey]) || 0;
    const distance = objective.evaluator === 'proximity3d'
      ? antPosition.distanceTo(target)
      : Math.hypot(antPosition.x - target.x, antPosition.z - target.z);
    return distance <= radius;
  }

  updateTask(id, available, nearby, delta) {
    const state = this.taskState[id];
    if (!state || state.complete) return;
    if (!available || !nearby) {
      state.elapsed = 0;
      return;
    }
    state.elapsed += delta;
    if (state.elapsed >= POND_GAME.objectives.lingerSeconds) {
      state.complete = true;
      this.showDiscoverySpeech(id);
      if (id === 'lollipop') {
        this.app.playAntAnimationRange?.('eat', {
          onFinished: () => {
            if (this.app.lollipop?.group) this.app.removeWorldObject(this.app.lollipop.group);
          },
        });
      }
    }
  }

  showDiscoverySpeech(id) {
    const messageKey = POND_GAME.interactions?.messageKeys?.[id];
    if (!messageKey) return;
    this.worldSpeech?.show(id, messageKey, () => {
      const position = this.app.getAntWorldPosition(this.speechPosition);
      if (position) position.y += 0.16;
      return position;
    });
  }

  isNearShelter(position) {
    const padding = Math.max(0, Number(POND_GAME.objectives.shelterPadding) || 0);
    const nearBurrow = this.burrowShelterPosition
      && Math.hypot(
        position.x - this.burrowShelterPosition.x,
        position.z - this.burrowShelterPosition.z,
      ) <= (Number(POND_GAME.burrow.shelterRadius) || POND_GAME.objectives.shelterRadius);
    if (this.shelterBounds) {
      const insideTent = position.x >= this.shelterBounds.min.x - padding
        && position.x <= this.shelterBounds.max.x + padding
        && position.z >= this.shelterBounds.min.z - padding
        && position.z <= this.shelterBounds.max.z + padding;
      return insideTent || nearBurrow;
    }
    return nearBurrow || distanceToAny(position, this.landmarkPositions.shelter)
      <= POND_GAME.objectives.shelterRadius;
  }

  buildSnapshot() {
    const fireflyConfig = POND_GAME.objectives.fireflies ?? {};
    const debugIncompleteId = POND_GAME.debug?.enabled === true
      ? POND_GAME.debug.completeChecklistExcept
      : null;
    const withDebugCompletion = (task) => ({
      ...task,
      complete: typeof debugIncompleteId === 'string' && debugIncompleteId.length > 0
        ? task.id !== debugIncompleteId
        : task.complete,
    });
    const tasks = GAME_OBJECTIVES.map((objective) => {
      const coreComplete = objective.id === 'seeds'
        ? (this.seedSnapshot.depositedSeeds ?? 0) >= (this.seedSnapshot.totalSeeds ?? 1)
        : Boolean(this.seedSnapshot.offeringComplete);
      const label = objective.id === 'seeds'
        ? `Seeds ${this.seedSnapshot.depositedSeeds ?? 0} / ${this.seedSnapshot.totalSeeds ?? 0}`
        : objective.labelKey;
      const available = this.isObjectiveAvailable(objective, fireflyConfig);
      return withDebugCompletion({
        id: objective.id,
        label,
        hint: objective.hintKey,
        complete: objective.managed ? this.taskState[objective.id].complete : coreComplete,
        status: objective.status === 'core'
          ? 'core'
          : objective.availability === 'always'
            ? objective.status
            : available ? 'active' : 'waiting',
      });
    });
    const completed = tasks.filter((task) => task.complete).length;
    return Object.freeze({
      tasks: Object.freeze(tasks.map((task) => Object.freeze(task))),
      completed,
      total: tasks.length,
    });
  }

  getSnapshot() {
    if (!this.cachedSnapshot) this.cachedSnapshot = this.buildSnapshot();
    return this.cachedSnapshot;
  }

  getSnapshotSignature() {
    const deposited = Math.min(255, Math.max(0, Math.floor(Number(this.seedSnapshot.depositedSeeds) || 0)));
    const total = Math.min(255, Math.max(0, Math.floor(Number(this.seedSnapshot.totalSeeds) || 0)));
    const progress = deposited + total * 256 + (this.seedSnapshot.offeringComplete ? 65536 : 0);
    let completed = 0;
    for (let index = 0; index < MANAGED_GAME_OBJECTIVES.length; index += 1) {
      const { id } = MANAGED_GAME_OBJECTIVES[index];
      if (this.taskState[id].complete) completed |= (1 << index);
    }
    const fireflyConfig = POND_GAME.objectives.fireflies ?? {};
    const status = (this.raining ? 1 : 0)
      | (isNight(this.hour) ? 2 : 0)
      | (isWithinTimeWindow(this.hour, fireflyConfig.startHour, fireflyConfig.endHour) ? 4 : 0);
    return progress + completed * 131072
      + status * 131072 * (2 ** MANAGED_GAME_OBJECTIVES.length);
  }

  emitChange(force = false) {
    const signature = this.getSnapshotSignature();
    if (!force && signature === this.lastSnapshotSignature) return;
    this.lastSnapshotSignature = signature;
    const snapshot = this.buildSnapshot();
    this.cachedSnapshot = snapshot;
    const allComplete = snapshot.completed === snapshot.total;
    if (allComplete && !this.allCompleteNotified) {
      this.allCompleteNotified = true;
      this.onAllComplete(snapshot);
    } else if (!allComplete) {
      this.allCompleteNotified = false;
    }
    this.onChange(snapshot);
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.worldSpeech?.dispose();
    this.worldSpeech = null;
    ['bookMarker', 'catMarker', 'lampMarker', 'lollipopMarker']
      .forEach((property) => this.disposeDebugMarker(property));
  }
}
