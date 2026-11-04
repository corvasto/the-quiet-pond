import * as THREE from 'three';
import { BUILDING_CONFIG as CONFIG } from '../config/building.js';
import { POND_GAME } from '../config/game.js';
import { SCENE_PROPS } from '../config/index.js';
import { MaterialState } from './material-state.js';
import { createBuildingVisuals } from '../generators/building-materials.js';

const up = new THREE.Vector3(0, 1, 0);
const footprint = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i * Math.PI / 4), z: Math.sin(i * Math.PI / 4) }));

export class BurrowBuilding {
  constructor(session, saved) {
    this.session = session; this.app = session.app;
    this.surface = new THREE.Group(); this.surface.name = 'Building materials - surface';
    this.burrow = new THREE.Group(); this.burrow.name = 'Building materials - burrow';
    this.app.addWorldObject(this.surface);
    this.position = new THREE.Vector3(); this.facing = new THREE.Vector3(); this.candidate = new THREE.Vector3();
    this.normal = new THREE.Vector3(); this.scale = new THREE.Vector3();
    this.planning = false; this.attachedArea = null; this.meshes = new Map(); this.lastCheck = 0;
    const sources = [];
    const origin = POND_GAME.burrow.position;
    for (let attempt = 0; attempt < 180 && sources.length < CONFIG.leafCount; attempt++) {
      const angle = attempt * 2.3999632297, distance = 1.2 + Math.floor(attempt / 12) * 0.3;
      const x = origin.x + Math.cos(angle) * distance, z = origin.z + Math.sin(angle) * distance;
      if (this.floorClear('surface', x, z, CONFIG.leafRadius)
        && sources.every((point) => Math.hypot(point.x - x, point.z - z) > 0.55)) {
        sources.push({ id: `leaf-${sources.length}`, x, z });
      }
    }
    this.state = new MaterialState(sources, saved);
    for (const item of this.state.items) {
      if (item.state === 'loose' && item.area === 'surface' && !this.floorClear('surface',item.x,item.z,CONFIG.leafRadius)) {
        const source=sources.find((point)=>point.id===item.id); item.x=source.x; item.z=source.z;
      }
    }
    this.savedSeeds = Array.isArray(saved?.droppedSeeds) ? saved.droppedSeeds : [];
    for (const record of this.savedSeeds.slice(0, this.session.game.activeSeeds.length)) {
      if (!record || !Number.isInteger(record.slot) || record.slot < 0 || record.slot >= this.session.game.activeSeeds.length) continue;
      const seed = this.session.game.activeSeeds[record.slot];
      if (!seed || !['surface', 'burrow'].includes(record.area) || !Number.isFinite(record.x) || !Number.isFinite(record.z)
        || Math.abs(record.x) > 100 || Math.abs(record.z) > 100) continue;
      if (record.area === 'surface' && !this.floorClear('surface', record.x, record.z, 0.08)) continue;
      seed.area = record.area; seed.dropped = true;
      seed.position.set(record.x, record.area === 'surface' ? this.height('surface', record.x, record.z) + 0.055 : -5, record.z);
      seed.baseY = seed.position.y; seed.visual.position.copy(seed.position);
      if (record.area === 'burrow') this.burrow.add(seed.visual);
    }
    this.unsubscribe = this.app.onFrame((frame) => this.update(frame));
  }

  get area() { return this.session.isUnderground() ? 'burrow' : 'surface'; }
  get actor() { return this.session.isUnderground() ? this.session.underground.player.group : this.app.ant.group; }
  get busyHands() { return Boolean(this.state.carried || this.session.game.carriedSeed || this.session.game.phase === 'offeringCarrying'); }
  get blocked() { return this.session.paused || this.session.exploreActive || this.session.isBirdActive() || this.session.isFlightEnabled() || this.session.birdPreparing; }
  get grounded() { return !this.blocked && !this.session.isClimbing() && !this.app.isAntAnimationBusy(); }
  height(area, x, z) {
    return area === 'surface' ? this.app.ground.heightAt(x, z) : this.session.underground?.level.layout.heightAt(x, z) ?? -5;
  }
  floorClear(area, x, z, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const layout = this.session.underground?.level.layout;
    if (area === 'burrow') return Boolean(layout?.isWalkable(x, z, radius));
    if (this.app.ground.containsPond?.(x, z, radius + 0.06)) return false;
    for (let i = -1; i < footprint.length; i++) {
      const px = x + (i < 0 ? 0 : footprint[i].x * radius), pz = z + (i < 0 ? 0 : footprint[i].z * radius);
      if (!this.app.canAntOccupy(px, pz)) return false;
      for (const blocker of this.app.gameGroundBlockers.values()) {
        if (((px - blocker.x) / blocker.radiusX) ** 2 + ((pz - blocker.z) / blocker.radiusZ) ** 2 < 1) return false;
      }
    }
    return this.slopeClear(area, x, z, radius);
  }
  slopeClear(area, x, z, radius) {
    const h = this.height(area, x, z);
    return footprint.every((point) => Math.abs(this.height(area, x + point.x * radius, z + point.z * radius) - h)
      <= radius * CONFIG.maximumSlope);
  }
  facingDirection() {
    const yaw = this.actor.rotation.y - THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
    this.facing.set(Math.sin(yaw), 0, Math.cos(yaw)); return yaw;
  }
  placement(build = false) {
    if (!this.grounded) return 'building.groundOnly';
    const position = this.session.getPlayerWorldPosition();
    const yaw = this.facingDirection(), area = this.area;
    this.candidate.copy(position).addScaledVector(this.facing, build ? 0.48 : CONFIG.dropDistance);
    const radius = build ? CONFIG.bedRadius : CONFIG.leafRadius;
    if (build && area !== 'burrow') return 'building.burrowOnly';
    // Sweep the full footprint from the ant to the landing point, rejecting walls and water edges.
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      if (!this.floorClear(area, position.x + (this.candidate.x - position.x) * t,
        position.z + (this.candidate.z - position.z) * t, radius)) return 'building.noRoom';
    }
    if (!this.slopeClear(area, this.candidate.x, this.candidate.z, radius)) return 'building.noRoom';
    const entrance = area === 'burrow' ? this.session.underground.level.exit : POND_GAME.burrow.position;
    if (Math.hypot(this.candidate.x - entrance.x, this.candidate.z - entrance.z) < radius + 0.85) return 'building.entranceClear';
    if (build && !this.floorClear(area, this.candidate.x, this.candidate.z, CONFIG.bedClearance)) return 'building.chamberOnly';
    if (area === 'burrow' && this.storePosition && Math.hypot(this.candidate.x - this.storePosition.x, this.candidate.z - this.storePosition.z) < radius + 0.35) return 'building.noRoom';
    if (area === 'burrow' && this.state.bed && Math.hypot(this.candidate.x - this.state.bed.x, this.candidate.z - this.state.bed.z) < radius + CONFIG.bedRadius) return 'building.noRoom';
    if (this.state.items.some((item) => item.state === 'loose' && item.area === area
      && Math.hypot(item.x - this.candidate.x, item.z - this.candidate.z) < radius + CONFIG.leafRadius)) return 'building.noRoom';
    if (this.session.game.activeSeeds.some((seed) => (seed.area ?? 'surface') === area
      && Math.hypot(seed.position.x - this.candidate.x, seed.position.z - this.candidate.z) < radius + 0.06)) return 'building.noRoom';
    this.candidate.y = this.height(area, this.candidate.x, this.candidate.z);
    this.placementYaw = yaw; return null;
  }
  nearStore() {
    const p = this.session.getPlayerWorldPosition();
    return this.area === 'burrow' && this.storePosition && Math.hypot(p.x - this.storePosition.x, p.z - this.storePosition.z) < CONFIG.interactionRadius;
  }
  nearestSeed() {
    const p = this.session.getPlayerWorldPosition();
    return this.session.game.phase === 'discovering' ? this.session.game.activeSeeds.find((seed) =>
      (seed.area ?? 'surface') === this.area && p.distanceTo(seed.position) <= POND_GAME.seed.collectRadius) : null;
  }
  nearestLeaf() {
    const p = this.session.getPlayerWorldPosition();
    return this.state.unlocked && this.grounded ? this.state.items.find((item) => item.state === 'loose' && item.area === this.area
      && Math.hypot(item.x - p.x, item.z - p.z) <= CONFIG.pickupRadius) : null;
  }
  actions() {
    if (this.blocked) return [];
    if (this.planning) {
      const reason = this.placement(true);
      return [{ id: 'place', label: 'building.place', disabled: Boolean(reason), reason }, { id: 'cancel', label: 'building.cancel' }];
    }
    if (this.state.carried || this.session.game.carriedSeed) {
      const reason = this.placement();
      const drop = { id: 'drop', label: 'building.drop', disabled: Boolean(reason), reason };
      return this.state.carried && this.nearStore() && this.grounded ? [{ id: 'deposit', label: 'building.deposit' }, drop] : [drop];
    }
    if (this.busyHands) return [];
    if (this.nearestSeed()) return [{ id: 'seed', label: 'building.pickSeed' }];
    if (this.nearestLeaf()) return [{ id: 'leaf', label: 'building.pickLeaf' }];
    if (this.state.unlocked && this.nearStore() && this.grounded) return [{ id: 'storage', label: 'building.storage' }];
    if (this.area === 'burrow' && this.state.bed && this.grounded
      && Math.hypot(this.actor.position.x-this.state.bed.x,this.actor.position.z-this.state.bed.z)<0.5) return [{id:'rest',label:'building.rest'}];
    if (this.state.unlocked && this.area === 'burrow' && !this.state.bed && this.grounded) return [{ id: 'plan', label: 'building.build', disabled: this.state.stored < CONFIG.bedCost, reason: this.state.stored < CONFIG.bedCost ? 'building.needLeaves' : null }];
    return [];
  }
  act(id) {
    const action = this.actions().find((entry) => entry.id === id);
    if (!action || action.disabled) return false;
    if (id === 'storage') return 'storage';
    if (id === 'rest') {
      const bed=this.state.bed;
      this.actor.position.set(bed.x,this.height('burrow',bed.x,bed.z)+0.055,bed.z);
      this.session.clearMovementInput();
      return 'sleep';
    }
    if (id === 'cancel') { this.planning = false; this.preview.visible = false; return true; }
    if (id === 'plan') { this.startPlan(); return true; }
    if (id === 'seed') this.session.game.collectSeed(this.nearestSeed());
    if (id === 'leaf') this.state.pick(this.nearestLeaf().id);
    if (id === 'deposit') this.state.deposit();
    if (id === 'place') {
      if (this.placement(true) || !this.state.build(this.candidate, this.placementYaw)) return false;
      this.planning = false;
    }
    if (id === 'drop') {
      if (this.placement()) return false;
      if (this.state.carried) this.state.drop(this.area, this.candidate, this.placementYaw);
      else {
        const seed = this.session.game.carriedSeed;
        seed.area = this.area; seed.dropped = true;
        seed.position.copy(this.candidate); seed.position.y += 0.055; seed.baseY = seed.position.y;
        seed.visual.removeFromParent(); seed.visual.scale.setScalar(1); seed.visual.position.copy(seed.position);
        (this.area === 'burrow' ? this.burrow : this.session.game.root).add(seed.visual);
        this.session.game.activeSeeds.push(seed);
        this.session.game.carriedSeed = null; this.session.game.seed = null; this.session.game.phase = 'discovering';
        this.session.game.emitState();
      }
    }
    this.changed(); return true;
  }
  take() { if (this.busyHands || !this.state.unlocked || !this.nearStore() || !this.state.take()) return false; this.changed(); return true; }
  startPlan() {
    if (this.area !== 'burrow' || !this.state.unlocked || this.state.bed || this.state.stored < 2 || this.busyHands) return false;
    this.planning = true; this.ensureVisuals(); this.updatePreview(); return true;
  }
  changed() { this.ensureVisuals(); this.sync(); this.session.emitGameState(); }

  ensureVisuals() {
    if (!this.visuals && this.state.unlocked) {
      this.visuals = createBuildingVisuals();
      for (const item of this.state.items) this.meshes.set(item.id, this.visuals.leaf());
      this.preview = this.visuals.bed(true); this.preview.visible = false; this.burrow.add(this.preview);
      this.bed = this.visuals.bed(); this.bed.visible = false; this.burrow.add(this.bed);
      this.store = new THREE.Group(); this.store.name = 'Shared leaf material store';
      this.burrow.add(this.store);
      this.storeLeaves = this.state.items.map((_, i) => { const leaf = this.visuals.leaf(); leaf.rotation.y = i * 0.7; leaf.position.set((i % 2) * 0.06, i * 0.013, Math.floor(i / 2) * 0.025); this.store.add(leaf); return leaf; });
    }
  }
  pose(mesh, area, x, z, rotation) {
    mesh.position.set(x, this.height(area, x, z) + 0.004, z); mesh.scale.setScalar(1);
    const delta = 0.03;
    this.normal.set(this.height(area, x - delta, z) - this.height(area, x + delta, z), delta * 2,
      this.height(area, x, z - delta) - this.height(area, x, z + delta)).normalize();
    mesh.quaternion.setFromUnitVectors(up, this.normal); mesh.rotateY(rotation);
  }
  attach(mesh, seed = false) {
    const actor = this.actor; actor.getWorldScale(this.scale);
    actor.add(mesh); mesh.scale.set(1 / this.scale.x, 1 / this.scale.y, 1 / this.scale.z);
    const offset = seed ? POND_GAME.seed.carryOffset : { x: 0, y: 0.08, z: 0.065 };
    mesh.position.set(offset.x/this.scale.x,offset.y/this.scale.y,offset.z/this.scale.z);
    mesh.rotation.set(seed ? 0 : -0.8, 0, seed ? 0 : 0.25);
  }
  sync() {
    if (this.session.underground && this.burrow.parent !== this.session.underground.scene) {
      this.session.underground.scene.add(this.burrow);
      this.storePosition = this.session.underground.level.landmarks.store;
      for (const item of this.state.items) if(item.state==='loose' && item.area==='burrow'
        && !this.floorClear('burrow',item.x,item.z,CONFIG.leafRadius)) item.state='stored';
      if(this.state.bed && !this.floorClear('burrow',this.state.bed.x,this.state.bed.z,CONFIG.bedClearance)) {
        this.state.bed=null;
        for(const item of this.state.items) if(item.state==='used') item.state='stored';
      }
      for(const seed of this.session.game.activeSeeds) if(seed.area==='burrow') {
        if(!this.floorClear('burrow',seed.position.x,seed.position.z,0.08)) seed.position.copy(this.session.underground.level.spawn);
        seed.position.y=this.height('burrow',seed.position.x,seed.position.z)+0.055;
        seed.baseY=seed.position.y; seed.visual.position.copy(seed.position); this.burrow.add(seed.visual);
      }
    }
    this.ensureVisuals();
    for (const item of this.state.items) {
      const mesh = this.meshes.get(item.id); if (!mesh) continue;
      mesh.visible = item.state === 'loose' || item.state === 'carried';
      if (item.state === 'carried') this.attach(mesh);
      else { (item.area === 'surface' ? this.surface : this.burrow).add(mesh); this.pose(mesh, item.area, item.x, item.z, item.rotation); }
    }
    const seed = this.session.game.carriedSeed;
    if (seed) this.attach(seed.visual, true);
    if (this.visuals && this.storePosition) {
      this.pose(this.store, 'burrow', this.storePosition.x, this.storePosition.z, 0);
      // A single empty leaf pad makes an empty store findable without extra props.
      for (let i = 0; i < this.storeLeaves.length; i++) this.storeLeaves[i].visible = i < Math.max(1, this.state.stored);
      this.bed.visible = Boolean(this.state.bed);
      if (this.state.bed) this.pose(this.bed, 'burrow', this.state.bed.x, this.state.bed.z, this.state.bed.rotation);
    }
    if (this.area !== 'burrow') this.planning = false;
    this.attachedArea = this.area;
    this.preview && (this.preview.visible = this.planning && this.area === 'burrow');
  }
  updatePreview() {
    if (!this.planning || !this.preview || this.area !== 'burrow') return;
    if (this.blocked) { this.preview.visible=false; return; }
    const reason = this.placement(true);
    this.preview.visible = true;
    if (Number.isFinite(this.candidate.x)) this.pose(this.preview, 'burrow', this.candidate.x, this.candidate.z, this.placementYaw ?? 0);
    this.visuals.previewMaterial.color.set(reason ? '#bf6b56' : '#a8c16b');
  }
  update({ delta = 0 } = {}) {
    if (!this.state.unlocked && this.session.game.depositedSeedCount >= POND_GAME.seed.totalCount) {
      this.state.unlocked = true; this.changed();
    }
    if (this.attachedArea !== this.area) this.sync();
    this.lastCheck += delta;
    if (this.lastCheck >= 0.1) { this.lastCheck = 0; if (!this.blocked) this.updatePreview(); }
  }
  save() {
    const saved = this.state.save();
    saved.droppedSeeds = this.session.game.activeSeeds.flatMap((seed, slot) => seed.dropped
      ? [{ slot, area: seed.area ?? 'surface', x: seed.position.x, z: seed.position.z }] : []);
    return saved;
  }
  markers() { return this.state.unlocked && this.storePosition ? { store: this.storePosition, bed: this.state.bed } : null; }
  dispose() {
    this.unsubscribe?.();
    for (const seed of this.session.game.activeSeeds) {
      if (seed.visual.parent !== this.session.game.root) this.session.game.root.add(seed.visual);
    }
    for (const mesh of this.meshes.values()) mesh.removeFromParent();
    this.surface.removeFromParent(); this.burrow.removeFromParent(); this.visuals?.dispose();
    this.app.worldAdditions?.delete(this.surface);
  }
}
