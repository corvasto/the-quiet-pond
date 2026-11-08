import * as THREE from 'three';
import { ANT_BOOST_CONFIG } from '../config/ant-boost.js';

export class AntBoost {
  constructor(session, config = ANT_BOOST_CONFIG) {
    this.session = session; this.app = session.app; this.config = config;
    this.remaining = config.duration; this.cooldown = 0; this.multiplier = 1; this.held = false; this.disposed = false;
    if (!config.enabled) return;
    if (config.glowEnabled) {
      this.geometry = new THREE.SphereGeometry(config.glowRadius, 16, 10);
      this.material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { opacity: { value: 0 } },
        vertexShader: `varying vec3 n; varying vec3 v;
          void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
        fragmentShader: `uniform float opacity; varying vec3 n; varying vec3 v;
          void main(){float edge=pow(1.0-abs(dot(normalize(n),normalize(v))),1.2);gl_FragColor=vec4(0.2,0.62,1.0,edge*opacity);}`,
      });
      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.name = 'Faint blue ant sprint aura'; this.mesh.visible = false;
      this.app.addWorldObject(this.mesh);
    }
    this.unsubscribe = this.app.onFrame((frame) => this.update(frame));
  }

  get moving() {
    const app = this.app, velocity = app.antVelocity;
    const deadzone = app.antMovement?.analogDeadzone ?? 0.12;
    const input = app.antMovementInput?.size > 0 || (app.antMovementAxes?.lengthSq() ?? 0) > deadzone * deadzone;
    return input && velocity && velocity.x * velocity.x + velocity.z * velocity.z > 0.000001;
  }
  get active() { return Boolean(this.held && this.allowed && this.moving && this.cooldown === 0 && this.remaining > 0); }
  get allowed() {
    const s = this.session;
    return !this.disposed && this.config.enabled && !s.paused && !s.exploreActive
      && !s.isClimbing() && !s.isBirdActive() && !s.isFlightEnabled();
  }
  get progress() { return this.cooldown > 0 ? 1 - this.cooldown / this.config.cooldown : this.remaining / this.config.duration; }

  setHeld(held) {
    this.held = Boolean(held && this.config.enabled);
    if (this.active) this.session.setAntRunning(true);
    this.applyMultiplier(this.active ? this.config.speedMultiplier : 1);
    if (!this.active && this.mesh) this.mesh.visible = false;
  }

  applyMultiplier(value) {
    if (this.multiplier === value) return;
    this.multiplier = value; this.app.setAntBoostMultiplier(value);
  }

  update({ delta = 0 } = {}) {
    if (this.session.paused || this.session.exploreActive) {
      this.applyMultiplier(1);
      if (this.mesh) this.mesh.visible = false;
      return;
    }
    let dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.cooldown === 0) this.remaining = this.config.duration;
    } else if (this.active) {
      const consumed = Math.min(this.remaining, dt);
      this.remaining = Math.max(0, this.remaining - dt); dt -= consumed;
      if (this.remaining === 0) {
        this.cooldown = Math.max(0, this.config.cooldown - dt);
        if (this.cooldown === 0) this.remaining = this.config.duration;
      }
    }
    this.applyMultiplier(this.active ? this.config.speedMultiplier : 1);
    if (this.mesh) {
      this.mesh.visible = this.active;
      if (this.active && this.app.getAntWorldPosition(this.mesh.position)) {
        this.mesh.position.y += 0.04;
        const fade = Math.min(1, (this.config.duration - this.remaining) / 0.2, this.remaining / 0.35);
        this.material.uniforms.opacity.value = this.config.glowOpacity * fade;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.held = false;
    this.unsubscribe?.(); this.applyMultiplier(1);
    if (this.mesh) this.app.removeWorldObject(this.mesh);
    this.geometry?.dispose(); this.material?.dispose();
  }
}
