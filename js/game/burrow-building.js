import * as THREE from 'three';
import { BUILDING_CONFIG as CONFIG } from '../config/building.js';
import { POND_GAME } from '../config/game.js';
import { SCENE_PROPS } from '../config/index.js';
import { MATERIAL_DEFINITIONS, BUILD_RECIPES } from '../content/building.js';
import { scatterMaterialSources } from './material-spawns.js';
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
    this.gripPoint = new THREE.Vector3(); this.headBones = new WeakMap();
    this.planning = false; this.planningRecipeId = 'leaf-bed'; this.buildMeshes = new Map(); this.previews = new Map(); this.attachedArea = null; this.meshes = new Map(); this.lastCheck = 0;
    const sources = [];
    const origin = this.app.propHeroPosition ?? { x: 0, z: 0 };
    const radius = Math.min(CONFIG.scatter.radius, (this.app.antMovementRadius ?? 24) - 1);
    const savedItems = Array.isArray(saved?.items) ? saved.items : [];
    for (const definition of Object.values(MATERIAL_DEFINITIONS)) {
      sources.push(...scatterMaterialSources({ type: definition.id, count: definition.spawnCount,
        seed: this.app.settings?.seed ?? 'pond', center: origin, radius,
        minimumSpacing: CONFIG.scatter.minimumSpacing,
        anchors: [{ x: origin.x + SCENE_PROPS.ant.offset.x, z: origin.z + SCENE_PROPS.ant.offset.z }, POND_GAME.burrow.position],
        savedItems: [...savedItems, ...sources.map((item) => ({ ...item, area: 'surface', state: 'loose' }))],
        isClear: (x,z) => this.floorClear('surface',x,z,definition.radius),
      }));
    }
    this.state = new MaterialState(sources, saved);
    for (const item of this.state.items) {
      if (item.state === 'loose' && item.area === 'surface' && !this.floorClear('surface',item.x,item.z,MATERIAL_DEFINITIONS[item.type].radius)) {
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

  get area() { return this.session.isBelowGround() ? 'burrow' : 'surface'; }
  get actor() { return this.app.ant.group; }
  get busyHands() { return Boolean(this.state.carried || this.session.game.carriedSeed || this.session.game.phase === 'offeringCarrying'); }
  get blocked() { return this.session.paused || this.session.exploreActive || this.session.isBirdActive() || this.session.isFlightEnabled() || this.session.birdPreparing; }
  get grounded() { return !this.blocked && !this.session.isClimbing() && !this.app.isAntAnimationBusy(); }
  height(area, x, z) {
    return area === 'surface' ? this.app.ground.heightAt(x, z) : this.session.getBurrowLevel()?.layout.heightAt(x, z) ?? -5;
  }
  floorClear(area, x, z, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const layout = this.session.getBurrowLevel()?.layout;
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
    const recipe = BUILD_RECIPES[this.planningRecipeId];
    if (!this.grounded) return 'building.groundOnly';
    const position = this.session.getPlayerWorldPosition();
    const yaw = this.facingDirection(), area = this.area;
    this.candidate.copy(position).addScaledVector(this.facing, build ? 0.48 : CONFIG.dropDistance);
    const radius = build ? recipe.radius : MATERIAL_DEFINITIONS[this.state.carried?.type]?.radius ?? CONFIG.leafRadius;
    if (build && area !== 'burrow') return 'building.burrowOnly';
    // A build must be reachable, but its full footprint only needs to fit at the destination.
    // Dropped objects still sweep their whole footprint to avoid crossing water or walls.
    const sweepRadius = build || area === 'burrow' ? (this.session.getBurrowLevel()?.layout.antRadius ?? radius) : radius;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      if (!this.floorClear(area, position.x + (this.candidate.x - position.x) * t,
        position.z + (this.candidate.z - position.z) * t, sweepRadius)) return 'building.noRoom';
    }
    if (!this.floorClear(area, this.candidate.x, this.candidate.z, radius)) return 'building.noRoom';
    if (!this.slopeClear(area, this.candidate.x, this.candidate.z, radius)) return 'building.noRoom';
    const entrance = area === 'burrow' ? this.session.getBurrowLevel().exit : POND_GAME.burrow.position;
    if (Math.hypot(this.candidate.x - entrance.x, this.candidate.z - entrance.z) < radius + 0.85) return 'building.entranceClear';
    if (build && !this.floorClear(area, this.candidate.x, this.candidate.z, recipe.clearance)) return 'building.chamberOnly';
    if (area === 'burrow' && this.storePosition && Math.hypot(this.candidate.x - this.storePosition.x, this.candidate.z - this.storePosition.z) < radius + 0.35) return 'building.noRoom';
    if (area === 'burrow' && this.state.builds.some((entry) => Math.hypot(this.candidate.x-entry.x,this.candidate.z-entry.z) < radius+BUILD_RECIPES[entry.recipe].radius)) return 'building.noRoom';
    if (this.state.items.some((item) => item.state === 'loose' && item.area === area
      && Math.hypot(item.x - this.candidate.x, item.z - this.candidate.z) < radius + MATERIAL_DEFINITIONS[item.type].radius)) return 'building.noRoom';
    if (this.session.game.activeSeeds.some((seed) => (seed.area ?? 'surface') === area
      && Math.hypot(seed.position.x - this.candidate.x, seed.position.z - this.candidate.z) < radius + 0.06)) return 'building.noRoom';
    this.candidate.y = this.height(area, this.candidate.x, this.candidate.z);
    this.placementYaw = yaw; return null;
  }
  nearStore() {
    const p = this.session.getPlayerWorldPosition();
    return this.area === 'burrow' && this.storePosition && Math.abs(p.y - this.height('burrow', p.x, p.z)) < 0.18
      && Math.hypot(p.x - this.storePosition.x, p.z - this.storePosition.z) < CONFIG.interactionRadius;
  }
  nearestSeed() {
    const p = this.session.getPlayerWorldPosition();
    return this.session.game.phase === 'discovering' ? this.session.game.activeSeeds.find((seed) =>
      (seed.area ?? 'surface') === this.area && p.distanceTo(seed.position) <= POND_GAME.seed.collectRadius) : null;
  }
  nearestMaterial() {
    const p = this.session.getPlayerWorldPosition();
    return this.grounded ? this.state.items.find((item) => item.state === 'loose' && item.area === this.area
      && Math.abs(p.y - (this.meshes.get(item.id)?.position.y ?? this.height(item.area, item.x, item.z))) <= 0.18
      && Math.hypot(item.x - p.x, item.z - p.z) <= CONFIG.pickupRadius) : null;
  }
  nearestLeaf() { return this.nearestMaterial(); }
  recipeOptions() {
    return Object.values(BUILD_RECIPES).filter((recipe) => !recipe.hidden).map((recipe) => ({ ...recipe,
      canBuild: this.state.canBuild(recipe.id),
      built: this.state.builds.filter((build) => build.recipe === recipe.id).length,
    }));
  }
  inventory() {
    return Object.values(MATERIAL_DEFINITIONS).map((material) => ({ ...material, count: this.state.count(material.id) }));
  }
  actions() {
    if (this.blocked) return [];
    if (this.planning) {
      const reason = this.placement(true) ?? (this.state.canBuild(this.planningRecipeId) ? null : 'building.needMaterials');
      return [{ id: 'place', label: 'building.place', disabled: Boolean(reason), reason }, { id: 'cancel', label: 'building.cancel' }];
    }
    if (this.state.carried || this.session.game.carriedSeed) {
      const reason = this.placement();
      const drop = { id: 'drop', label: 'building.drop', disabled: Boolean(reason), reason };
      return this.state.carried && this.nearStore() && this.grounded ? [{ id: 'deposit', label: MATERIAL_DEFINITIONS[this.state.carried.type].depositLabelKey }, drop] : [drop];
    }
    if (this.busyHands) return [];
    if (this.nearestSeed()) return [{ id: 'seed', label: 'building.pickSeed' }];
    const material = this.nearestMaterial();
    if (material) return [{ id: 'material', label: MATERIAL_DEFINITIONS[material.type].pickLabelKey }];
    if (this.nearStore() && this.grounded) return [{ id: 'storage', label: 'building.storage' }];
    if (this.area === 'burrow' && this.grounded) {
      const rest = this.state.builds.find((build) => BUILD_RECIPES[build.recipe].rest
        && Math.hypot(this.actor.position.x-build.x,this.actor.position.z-build.z)<0.5);
      if (rest) return [{ id: 'rest', label: 'building.rest', buildId: rest.id }];
    }
    return [];
  }
  act(id) {
    if (id === 'leaf') id = 'material';
    const action = this.actions().find((entry) => entry.id === id);
    if (!action || action.disabled) return false;
    if (id === 'storage') return 'storage';
    if (id === 'rest') {
      const bed=this.state.builds.find((build)=>build.id===action.buildId);
      this.actor.position.set(bed.x,this.height('burrow',bed.x,bed.z)+SCENE_PROPS.ant.lift+this.walkLift(bed.x,bed.z),bed.z);
      this.session.clearMovementInput();
      return 'sleep';
    }
    if (id === 'cancel') { this.planning = false; this.preview.visible = false; return true; }
    if (id === 'plan') return this.startPlan(action.recipeId);
    if (id === 'seed') this.session.game.collectSeed(this.nearestSeed());
    if (id === 'material') this.state.pick(this.nearestMaterial().id);
    if (id === 'deposit') this.state.deposit();
    if (id === 'place') {
      if (this.placement(true) || !this.state.buildRecipe(this.planningRecipeId, this.candidate, this.placementYaw)) return false;
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
  take(type = 'leaf') { if (this.busyHands || !this.nearStore() || !this.state.take(type)) return false; this.changed(); return true; }
  startPlan(recipeId = 'leaf-bed') {
    if (this.area !== 'burrow' || !this.state.canBuild(recipeId) || this.busyHands) return false;
    this.planningRecipeId=recipeId;
    this.planning = true; this.ensureVisuals();
    for (const preview of this.previews.values()) preview.visible=false;
    this.preview=this.previews.get(recipeId); this.updatePreview(); return true;
  }
  changed() { this.ensureVisuals(); this.sync(); this.session.emitGameState(); }

  ensureVisuals() {
    if (this.visuals) return;
    this.visuals=createBuildingVisuals();
    for(const item of this.state.items) {
      const visual=MATERIAL_DEFINITIONS[item.type].visual;
      this.meshes.set(item.id,this.visuals.materialFactories[visual]());
    }
    for(const recipe of Object.values(BUILD_RECIPES)) {
      const preview=this.visuals.buildFactories[recipe.visual](true);
      preview.visible=false; this.burrow.add(preview); this.previews.set(recipe.id,preview);
    }
    this.preview=this.previews.get(this.planningRecipeId);
    this.store=this.visuals.deposit();this.burrow.add(this.store);
    this.storeLeaves=[];
    for(const item of this.state.items) {
      const visual=MATERIAL_DEFINITIONS[item.type].visual;
      const mesh=this.visuals.materialFactories[visual]();
      const i=this.storeLeaves.length;
      mesh.rotation.y=i*0.7;mesh.position.set((i%2)*0.04,Math.min(i,5)*0.012,Math.floor(i/2)%3*0.02);
      mesh.userData.storeType=item.type;this.store.add(mesh);this.storeLeaves.push(mesh);
    }
  }
  pose(mesh, area, x, z, rotation) {
    if (Number.isFinite(mesh.userData.gripZ)) for (const child of mesh.children) child.position.z = 0;
    mesh.position.set(x, this.height(area, x, z) + 0.004, z); mesh.scale.setScalar(1);
    const delta = 0.03;
    this.normal.set(this.height(area, x - delta, z) - this.height(area, x + delta, z), delta * 2,
      this.height(area, x, z - delta) - this.height(area, x, z + delta)).normalize();
    mesh.quaternion.setFromUnitVectors(up, this.normal); mesh.rotateY(rotation);
  }
  attach(mesh, seed = false) {
    const actor = this.actor; actor.getWorldScale(this.scale);
    actor.add(mesh); mesh.scale.set(1 / this.scale.x, 1 / this.scale.y, 1 / this.scale.z);
    const carry = MATERIAL_DEFINITIONS[this.state.carried?.type]?.carry;
    const offset = seed ? POND_GAME.seed.carryOffset : carry?.fallback ?? POND_GAME.seed.carryOffset;
    mesh.position.set(offset.x/this.scale.x,offset.y/this.scale.y,offset.z/this.scale.z);
    mesh.rotation.set(seed ? 0 : carry?.pitch ?? 0, 0, 0);
    if (!seed) {
      for (const child of mesh.children) child.position.z = -(mesh.userData.gripZ ?? 0);
      this.updateGrip(mesh);
    }
  }
  updateGrip(mesh) {
    if (!mesh) return;
    const actor = this.actor;
    const carry=MATERIAL_DEFINITIONS[this.state.carried?.type]?.carry;
    if (!carry?.headBone) return;
    if (!this.headBones.has(actor)) this.headBones.set(actor,new Map());
    const cache=this.headBones.get(actor);
    if (!cache.has(carry.headBone)) cache.set(carry.headBone,actor.getObjectByName(carry.headBone) ?? null);
    const head=cache.get(carry.headBone);
    if (head) {
      this.gripPoint.copy(carry.mouthOffset);head.localToWorld(this.gripPoint);
      actor.worldToLocal(this.gripPoint);mesh.position.copy(this.gripPoint);
    }
  }

  sync() {
    if (this.session.getBurrowLevel() && this.burrow.parent !== this.session.getBurrowScene()) {
      this.session.getBurrowScene().add(this.burrow);
      this.storePosition = this.session.getBurrowLevel().landmarks.store;
      for (const item of this.state.items) if(item.state==='loose' && item.area==='burrow'
        && !this.floorClear('burrow',item.x,item.z,MATERIAL_DEFINITIONS[item.type].radius)) item.state='stored';
      for(const build of [...this.state.builds]) {
        if(!this.floorClear('burrow',build.x,build.z,BUILD_RECIPES[build.recipe].clearance)) this.state.removeBuild(build.id);
      }
      for(const seed of this.session.game.activeSeeds) if(seed.area==='burrow') {
        if(!this.floorClear('burrow',seed.position.x,seed.position.z,0.08)) seed.position.copy(this.session.getBurrowLevel().spawn);
        seed.position.y=this.height('burrow',seed.position.x,seed.position.z)+0.055;
        seed.baseY=seed.position.y; seed.visual.position.copy(seed.position); this.burrow.add(seed.visual);
      }
    }
    this.app.ground.setMaterialClearings?.(this.state.items.filter((item) => item.area === 'surface' && item.state === 'loose'));
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
      const visibleCounts={};
      for(const mesh of this.storeLeaves) {
        const type=mesh.userData.storeType;const shown=visibleCounts[type]??0;
        mesh.visible=shown<Math.min(this.state.count(type),6);visibleCounts[type]=shown+1;
      }
      for(const [id,mesh] of this.buildMeshes) if(!this.state.builds.some((build)=>build.id===id)) {
        mesh.removeFromParent();this.buildMeshes.delete(id);
      }
      for(const build of this.state.builds) {
        if(!this.buildMeshes.has(build.id)) {
          const mesh=this.visuals.buildFactories[BUILD_RECIPES[build.recipe].visual]();
          this.burrow.add(mesh);this.buildMeshes.set(build.id,mesh);
        }
        this.pose(this.buildMeshes.get(build.id),'burrow',build.x,build.z,build.rotation);
      }
      this.bed=this.state.builds.find((build)=>build.recipe==='leaf-bed');
      this.bed=this.bed?this.buildMeshes.get(this.bed.id):null;
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
    if (this.attachedArea !== this.area) this.sync();
    if (!this.blocked && this.state.carried) this.updateGrip(this.meshes.get(this.state.carried.id));
    this.lastCheck += delta;
    if (this.lastCheck >= 0.1) { this.lastCheck = 0; if (!this.blocked) this.updatePreview(); }
  }
  save() {
    const saved = this.state.save();
    saved.droppedSeeds = this.session.game.activeSeeds.flatMap((seed, slot) => seed.dropped
      ? [{ slot, area: seed.area ?? 'surface', x: seed.position.x, z: seed.position.z }] : []);
    return saved;
  }
  walkLift(x,z) {
    let lift = 0;
    for (const build of this.state.builds) {
      if (build.recipe !== 'leaf-bed') continue;
      const t = Math.max(0, 1-Math.hypot(x-build.x,z-build.z)/.36);
      lift = Math.max(lift, .045*t*t*(3-2*t));
    }
    return lift;
  }
  markers() { return this.storePosition ? { store: this.storePosition, bed: this.state.bed, beds: this.state.builds.filter((build) => BUILD_RECIPES[build.recipe].rest) } : null; }
  dispose() {
    this.unsubscribe?.();
    this.app.ground.setMaterialClearings?.([]);
    for (const seed of this.session.game.activeSeeds) {
      if (seed.visual.parent !== this.session.game.root) this.session.game.root.add(seed.visual);
    }
    for (const mesh of this.meshes.values()) mesh.removeFromParent();
    this.surface.removeFromParent(); this.burrow.removeFromParent(); this.visuals?.dispose();
    this.app.worldAdditions?.delete(this.surface);
  }
}
