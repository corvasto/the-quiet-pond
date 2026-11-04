import * as THREE from 'three';
import { SCENE_PROPS } from '../config/index.js';
import { ANT_TRAIL_CONFIG as CONFIG } from '../config/ant-trail.js';

// A fixed pool of paired soil marks shares one mesh and one material.
export class AntGroundTrail {
  constructor(session) {
    this.session = session;
    this.app = session.app;
    this.position = new THREE.Vector3();
    this.previous = new THREE.Vector3();
    this.tracking = false;
    this.distance = 0;
    this.time = 0;
    this.cursor = 0;
    this.activeCount = 0;
    this.emittedMarks = 0;
    this.expires = new Float64Array(CONFIG.capacity);
    const positions = new Float32Array(CONFIG.capacity * 4 * 3);
    const colors = new Float32Array(CONFIG.capacity * 4 * 4);
    const indices = new Uint16Array(CONFIG.capacity * 6);
    const color = new THREE.Color(CONFIG.color);
    for (let mark = 0; mark < CONFIG.capacity; mark++) {
      const vertex = mark * 4, offset = mark * 6;
      indices.set([vertex,vertex+1,vertex+2,vertex,vertex+2,vertex+3],offset);
      for (let corner = 0; corner < 4; corner++) {
        const base = (vertex + corner) * 4;
        colors[base] = color.r; colors[base+1] = color.g; colors[base+2] = color.b;
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);
    this.colors = new THREE.BufferAttribute(colors,4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position',this.positions);
    this.geometry.setAttribute('color',this.colors);
    this.geometry.setIndex(new THREE.BufferAttribute(indices,1));
    this.material = new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true,
      depthWrite:false, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-1 });
    this.mesh = new THREE.Mesh(this.geometry,this.material);
    this.mesh.name = 'Temporary ant soil trail';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.app.addWorldObject(this.mesh);
    this.unsubscribe = this.app.onFrame((frame) => this.update(frame));
  }

  isDrySoil(x,z) {
    return !this.app.ground.containsPond(x,z,CONFIG.waterMargin) && this.app.canAntOccupy(x,z);
  }

  writeMark(x,z,forwardX,forwardZ,side) {
    x += forwardZ * side * CONFIG.sideOffset;
    z -= forwardX * side * CONFIG.sideOffset;
    const slot = this.cursor;
    this.cursor = (slot+1) % CONFIG.capacity;
    if (this.expires[slot] <= this.time) this.activeCount++;
    this.expires[slot] = this.time + CONFIG.lifetime;
    for (let corner = 0; corner < 4; corner++) {
      const length = (corner < 2 ? -1 : 1) * CONFIG.halfLength;
      const width = (corner === 0 || corner === 3 ? -1 : 1) * CONFIG.halfWidth;
      const px = x + forwardX*length + forwardZ*width;
      const pz = z + forwardZ*length - forwardX*width;
      const vertex = slot*4+corner;
      this.positions.setXYZ(vertex,px,this.app.ground.heightAt(px,pz)+CONFIG.groundOffset,pz);
      this.colors.setW(vertex,CONFIG.opacity);
    }
    this.emittedMarks++;
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  update({delta = 0} = {}) {
    this.time += Number.isFinite(delta) ? Math.max(0,delta) : 0;
    if (this.activeCount) {
      let remaining = 0;
      for (let slot = 0; slot < CONFIG.capacity; slot++) {
        if (!this.expires[slot]) continue;
        const life = Math.max(0,(this.expires[slot]-this.time)/CONFIG.lifetime);
        if (life) remaining++; else this.expires[slot] = 0;
        for (let corner = 0; corner < 4; corner++) this.colors.setW(slot*4+corner,CONFIG.opacity*life);
      }
      this.activeCount = remaining;
      this.colors.needsUpdate = true;
    }
    const session = this.session;
    this.mesh.visible = this.activeCount > 0 && !session.isUnderground();
    if (session.paused || session.exploreActive || session.isUnderground() || session.isBirdActive()
      || session.isFlightEnabled() || session.isClimbing() || this.app.isAntAnimationBusy()
      || !this.app.getAntWorldPosition(this.position)) {
      this.tracking = false; this.distance = 0; return;
    }
    const {x,y,z} = this.position;
    const floor = this.app.ground.heightAt(x,z);
    const support = floor + SCENE_PROPS.ant.lift + SCENE_PROPS.ant.offset.y;
    if (Math.abs(y-support) > CONFIG.supportTolerance || !this.isDrySoil(x,z)) {
      this.tracking = false; this.distance = 0; return;
    }
    if (!this.tracking) {
      this.previous.copy(this.position); this.tracking = true; return;
    }
    const dx = x-this.previous.x, dz = z-this.previous.z, step = Math.hypot(dx,dz);
    if (step > CONFIG.teleportDistance) {
      this.previous.copy(this.position); this.distance = 0; return;
    }
    if (step < 1e-6) return;
    const forwardX = dx/step, forwardZ = dz/step;
    let stamps = 0;
    for (let distance = CONFIG.spacing-this.distance; distance <= step && stamps < CONFIG.maximumStampsPerFrame; distance += CONFIG.spacing) {
      const px = this.previous.x + forwardX*distance, pz = this.previous.z + forwardZ*distance;
      if (this.isDrySoil(px,pz)) {
        this.writeMark(px,pz,forwardX,forwardZ,-1);
        this.writeMark(px,pz,forwardX,forwardZ,1);
      }
      stamps++;
    }
    this.distance = (this.distance+step) % CONFIG.spacing;
    this.previous.copy(this.position);
    this.mesh.visible = this.activeCount > 0;
  }

  dispose() {
    this.unsubscribe?.();
    this.app.removeWorldObject(this.mesh);
    this.geometry.dispose(); this.material.dispose();
  }
}
