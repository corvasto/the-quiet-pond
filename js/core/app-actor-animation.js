import * as THREE from 'three';
import { SCENE_PROPS } from '../config/index.js';
import {
  cloneAnimationClip,
  createFrameAnimationClip,
  resolveAnimationClip,
} from '../props/model-animation.js';

const actorAnimationMethods = {
  setupAntAnimation() {
    if (this.antAnimationFinishListener) {
      this.antMixer?.removeEventListener('finished', this.antAnimationFinishListener);
      this.antAnimationFinishListener = null;
    }
    this.antMixer?.stopAllAction();
    this.antMixer = null;
    this.antIdleAction = null;
    this.antAction = null;
    this.antAnimationMode = null;
    const recipe = SCENE_PROPS.ant.animation ?? {};
    const sourceClip = resolveAnimationClip(this.ant?.animations, recipe.clip ?? 0);
    if (!this.ant || !sourceClip) return;
    const sharedOptions = {
      framesPerSecond: recipe.framesPerSecond,
      removeTracks: ['ant.position', 'ant.quaternion'],
    };
    const walkClip = createFrameAnimationClip(sourceClip, {
      ...sharedOptions,
      name: 'walk',
      frames: recipe.ranges?.walk,
    });
    const idleClip = createFrameAnimationClip(sourceClip, {
      ...sharedOptions,
      name: 'idle',
      frames: recipe.ranges?.idle,
    });
    if (!walkClip || !idleClip) return;
    this.antMixer = new THREE.AnimationMixer(this.ant.group);
    this.antIdleAction = this.antMixer.clipAction(idleClip);
    this.antAction = this.antMixer.clipAction(walkClip);
    this.antIdleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.antAction.setLoop(THREE.LoopRepeat, Infinity);
    this.antIdleAction.timeScale = Number(recipe.speed) || 1;
    this.antAction.timeScale = Number(recipe.speed) || 1;
    const eatClip = createFrameAnimationClip(sourceClip, {
      ...sharedOptions,
      name: 'eat lollipop',
      frames: recipe.ranges?.eat,
    });
    const cockroachClip = createFrameAnimationClip(sourceClip, {
      ...sharedOptions,
      name: 'inspect cockroach',
      frames: recipe.ranges?.cockroach,
    });
    this.antEatAction = eatClip ? this.antMixer.clipAction(eatClip) : null;
    this.antCockroachAction = cockroachClip ? this.antMixer.clipAction(cockroachClip) : null;
    this.playAntAction('idle');
  },

  setupCatAnimation() {
    this.catMixer?.stopAllAction();
    this.catMixer = null;
    this.catAction = null;
    const recipe = SCENE_PROPS.cat?.animation ?? {};
    const sourceClip = resolveAnimationClip(this.cat?.animations, recipe.clip ?? 0);
    if (!this.cat || !sourceClip) return;
    const clip = cloneAnimationClip(sourceClip, {
      name: `${sourceClip.name} tree perch`,
      removeTracks: recipe.removeTracks,
    });
    this.catMixer = new THREE.AnimationMixer(this.cat.group);
    this.catAction = this.catMixer.clipAction(clip);
    this.catAction.setLoop(THREE.LoopRepeat, Infinity);
    this.catAction.timeScale = Number(recipe.speed) || 1;
    this.catAction.play();
  },

  setupCockroachAnimation() {
    this.cockroachMixer?.stopAllAction();
    this.cockroachMixer = null;
    this.cockroachActions = null;
    if (!this.cockroach) return;
    const clips = this.cockroach.animations ?? [];
    const recipe = SCENE_PROPS.cockroach.animation ?? {};
    const prepareClip = (clip) => {
      if (!clip) return null;
      const prepared = clip.clone();
      prepared.tracks = prepared.tracks.filter((track) => !track.name.endsWith('_rootJoint.position'));
      prepared.resetDuration();
      return prepared;
    };
    const idleClip = prepareClip(resolveAnimationClip(clips, recipe.clips?.idle ?? 'idle'));
    const walkClip = prepareClip(resolveAnimationClip(clips, recipe.clips?.walk ?? 'walking'));
    if (!idleClip || !walkClip) {
      console.warn('The cockroach needs both idle and walking clips.');
      return;
    }
    this.cockroachMixer = new THREE.AnimationMixer(this.cockroach.group);
    this.cockroachActions = {
      idle: this.cockroachMixer.clipAction(idleClip),
      walk: this.cockroachMixer.clipAction(walkClip),
    };
    Object.values(this.cockroachActions).forEach((action) => {
      action.setLoop(THREE.LoopRepeat, Infinity);
    });
    this.cockroachActions.idle.timeScale = Number(recipe.speeds?.idle) || 1;
    this.cockroachActions.walk.timeScale = Number(recipe.speeds?.walk) || 1;
    this.cockroachActions.idle.play();
  },

  setAntMotionLocked(locked) {
    this.antMotionLocked = Boolean(locked);
    if (this.antMotionLocked) this.clearAntMovement();
    return this.antMotionLocked;
  },

  isAntMotionLocked() {
    return this.antMotionLocked;
  },

  setAntAnimationPlaying(playing) {
    if (this.antAnimationBusy) return;
    this.playAntAction(playing ? 'walk' : 'idle');
  },

  getAntAnimationAction(mode) {
    return {
      idle: this.antIdleAction,
      walk: this.antAction,
      eat: this.antEatAction,
      cockroach: this.antCockroachAction,
    }[mode] ?? null;
  },

  playAntAction(mode, { loop = THREE.LoopRepeat, repetitions = Infinity } = {}) {
    const action = this.getAntAnimationAction(mode);
    if (!action || !this.antMixer) return null;
    if (this.antAnimationMode === mode) return action;
    this.antMixer.stopAllAction();
    [
      this.antIdleAction,
      this.antAction,
      this.antEatAction,
      this.antCockroachAction,
    ].filter(Boolean).forEach((candidate) => {
      candidate.reset();
      candidate.enabled = true;
      candidate.setEffectiveWeight(1);
      candidate.setEffectiveTimeScale(
        (Number(SCENE_PROPS.ant.animation?.speed) || 1)
        * (mode === 'walk' && candidate === this.antAction && this.antRunEnabled
          ? SCENE_PROPS.ant.runAnimationMultiplier
          : 1),
      );
      candidate.clampWhenFinished = false;
    });
    action.setLoop(loop, repetitions);
    action.play();
    this.antAnimationMode = mode;
    return action;
  },

  isAntAnimationBusy() {
    return this.antAnimationBusy;
  },

  playAntAnimationRange(range, { onFinished = () => {} } = {}) {
    if (!this.getAntAnimationAction(range) || !this.antMixer || this.antAnimationBusy) return false;
    this.antAnimationBusy = true;
    this.setAntMotionLocked(true);
    this.antAnimationMode = null;
    const action = this.playAntAction(range, {
      loop: THREE.LoopOnce,
      repetitions: 1,
    });
    if (!action) {
      this.antAnimationBusy = false;
      this.setAntMotionLocked(false);
      return false;
    }
    const finish = (event) => {
      if (event.action !== action) return;
      this.antMixer.removeEventListener('finished', finish);
      this.antAnimationFinishListener = null;
      this.antAnimationBusy = false;
      this.antAnimationMode = null;
      this.playAntAction('idle');
      this.setAntMotionLocked(false);
      onFinished();
    };
    this.antAnimationFinishListener = finish;
    this.antMixer.addEventListener('finished', finish);
    return true;
  },

  setAntRunning(enabled) {
    this.antRunEnabled = Boolean(enabled) && !this.antFlightEnabled && !this.antMotionLocked;
    if (this.antAction) {
      this.antAction.setEffectiveTimeScale((Number(SCENE_PROPS.ant.animation?.speed) || 1)
        * (this.antRunEnabled ? SCENE_PROPS.ant.runAnimationMultiplier : 1));
    }
  },
};

export function installPondActorAnimationMethods(PondApp) {
  Object.entries(actorAnimationMethods).forEach(([name, method]) => {
    Object.defineProperty(PondApp.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  });
}
