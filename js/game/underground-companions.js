import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { SCENE_PROPS } from '../config/index.js';
import { UNDERGROUND_CONFIG } from '../config/underground.js';
import { createFrameAnimationClip, resolveAnimationClip } from '../props/model-animation.js';

export class UndergroundCompanions {
  constructor(session) {
    this.session = session; this.app = session.app; this.layout = session.getBurrowLevel().layout;
    this.root = new THREE.Group(); this.root.name = 'Underground companion ants';
    this.app.addWorldObject(this.root);
    const recipe = SCENE_PROPS.ant.animation;
    const clip = createFrameAnimationClip(resolveAnimationClip(this.app.ant.animations, recipe.clip ?? 0), {
      framesPerSecond: recipe.framesPerSecond, frames: recipe.ranges?.walk,
      removeTracks: ['ant.position', 'ant.quaternion'], name: 'underground-walk',
    });
    this.ants = ['nest', 'store', 'quiet'].map((name, index) => {
      const anchor = this.layout.landmarks[name];
      const group = cloneSkeleton(this.app.ant.group);
      const lights = []; group.traverse((object) => { if (object.isLight) lights.push(object); });
      for (const light of lights) light.removeFromParent();
      group.name = `Underground companion ${index + 1}`; group.scale.multiplyScalar(0.85);
      group.position.set(anchor.x, anchor.y + SCENE_PROPS.ant.lift, anchor.z);
      this.root.add(group);
      const mixer = new THREE.AnimationMixer(group);
      const action = clip ? mixer.clipAction(clip).play() : null;
      if (action) { action.timeScale = 0.82; action.paused = true; }
      return { group, mixer, action, anchor, target: group.position.clone(), remaining: index + 0.5, walking: false };
    });
    this.app.undergroundAnts = this.ants;
    this.unsubscribe = this.app.onFrame(({ delta }) => this.update(delta));
  }

  chooseTarget(ant) {
    const radius = UNDERGROUND_CONFIG.antRadius;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = Math.random() * Math.PI * 2, distance = 0.2 + Math.random() * (UNDERGROUND_CONFIG.companionWanderRadius - 0.2);
      const x = ant.anchor.x + Math.cos(angle) * distance, z = ant.anchor.z + Math.sin(angle) * distance;
      let clear = true;
      for (let step = 1; step <= 16; step++) {
        const t = step / 16;
        if (!this.layout.isWalkable(THREE.MathUtils.lerp(ant.group.position.x, x, t),
          THREE.MathUtils.lerp(ant.group.position.z, z, t), radius)) { clear = false; break; }
      }
      if (!clear) continue;
      ant.target.set(x, this.layout.heightAt(x, z) + SCENE_PROPS.ant.lift, z);
      ant.walking = true;
      if (ant.action) ant.action.paused = false;
      return;
    }
    ant.remaining = 1;
  }

  update(delta) {
    if (this.session.paused || this.session.exploreActive) return;
    const dt = Math.max(0, Math.min(delta, 0.05));
    const player = this.app.ant.group.position;
    for (const ant of this.ants) {
      const p = ant.group.position;
      if (!ant.walking) {
        ant.remaining -= dt;
        if (ant.remaining <= 0) this.chooseTarget(ant);
      } else {
        const dx = ant.target.x - p.x, dz = ant.target.z - p.z, distance = Math.hypot(dx, dz);
        if (distance < 0.015) {
          ant.walking = false; ant.remaining = 1 + Math.random() * 2;
          if (ant.action) ant.action.paused = true;
        } else {
          const step = Math.min(distance, UNDERGROUND_CONFIG.companionSpeed * dt);
          p.x += dx / distance * step; p.z += dz / distance * step;
          p.y = this.layout.heightAt(p.x, p.z) + SCENE_PROPS.ant.lift;
          ant.group.rotation.y = Math.atan2(dx, dz) + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
        }
      }
      if (this.session.isBelowGround() && Math.hypot(player.x - p.x, player.z - p.z) < UNDERGROUND_CONFIG.companionAnimationDistance) ant.mixer.update(dt);
    }
  }

  dispose() {
    this.unsubscribe?.();
    for (const ant of this.ants) { ant.mixer.stopAllAction(); ant.mixer.uncacheRoot(ant.group); }
    this.app.removeWorldObject(this.root);
    this.app.undergroundAnts = [];
  }
}
