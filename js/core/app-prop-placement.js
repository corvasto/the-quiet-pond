import * as THREE from 'three';
import { ANT_NIGHT_LIGHT, CAMERA_VIEWS, SCENE_PROPS } from '../config/index.js';
import {
  createObjectGroundFootprint,
  createTriangleSurfaceProxy,
} from '../props/model-surface-proxy.js';
import {
  createAnchorPosition,
  createGroundPosition,
  getModelPropSpot,
  placeGroundModelProp,
  placeModelPropInstances,
  yawToward,
} from '../props/model-placement.js';
import { createConfiguredAnimationClip } from '../props/model-animation.js';
import { getNightAmount } from '../utils/time-of-day.js';

function createLampGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255, 244, 194, 1)');
  gradient.addColorStop(0.16, 'rgba(255, 207, 112, 0.94)');
  gradient.addColorStop(0.5, 'rgba(255, 157, 61, 0.23)');
  gradient.addColorStop(1, 'rgba(255, 134, 42, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: '#ffd888',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(material);
  glow.name = 'Street lamp glow';
  glow.renderOrder = 1;
  glow.userData.dispose = () => {
    texture.dispose();
    material.dispose();
  };
  return glow;
}

const propPlacementMethods = {
  placeRadio(anchor, heroPosition = { x: 0, z: 0 }) {
    if (!this.radio || !anchor) return;
    this.radioAnchor = anchor;
    const authoredOffset = SCENE_PROPS.radio.offset;
    const offset = {
      x: authoredOffset.x + this.settings.radioOffsetX,
      y: authoredOffset.y + this.settings.radioOffsetY,
      z: authoredOffset.z + this.settings.radioOffsetZ,
    };
    const position = createAnchorPosition(anchor, {
      offset,
      lift: SCENE_PROPS.radio.lift,
    });
    const cameraPosition = {
      x: heroPosition.x + CAMERA_VIEWS.hero.position[0],
      z: heroPosition.z + CAMERA_VIEWS.hero.position[2],
    };
    this.radioBaseYaw = yawToward(position, cameraPosition)
      + THREE.MathUtils.degToRad(SCENE_PROPS.radio.yawOffset);
    this.radio.setTargetWidth(
      SCENE_PROPS.radio.targetWidth * this.settings.radioScale,
    );
    this.radio.placeAt(
      position,
      this.radioBaseYaw + THREE.MathUtils.degToRad(this.settings.radioRotation),
    );
    this.radio.group.updateWorldMatrix(true, true);
    this.radioSurfaceProxy = createTriangleSurfaceProxy(this.radio.group, {
      cellSize: SCENE_PROPS.radio.climbProxyCellSize,
      minimumTriangleArea: SCENE_PROPS.radio.climbProxyMinimumTriangleArea,
      groundCollisionHeight: SCENE_PROPS.radio.climbProxyGroundCollisionHeight,
    });
  },

  placeReader(heroPosition, ground) {
    if (!this.reader) return;
    const authoredOffset = SCENE_PROPS.reader.offset;
    const offset = {
      x: authoredOffset.x + this.settings.readerOffsetX,
      y: authoredOffset.y + this.settings.readerOffsetY,
      z: authoredOffset.z + this.settings.readerOffsetZ,
    };
    const position = createGroundPosition(ground, heroPosition, {
      offset,
      lift: SCENE_PROPS.reader.lift,
    });
    const cameraPosition = {
      x: heroPosition.x + CAMERA_VIEWS.hero.position[0],
      z: heroPosition.z + CAMERA_VIEWS.hero.position[2],
    };
    const facingYaw = yawToward(position, cameraPosition);
    this.readerBaseYaw = facingYaw
      + THREE.MathUtils.degToRad(SCENE_PROPS.reader.yawOffset);
    this.reader.setTargetWidth(
      SCENE_PROPS.reader.targetWidth * this.settings.readerScale,
    );
    this.reader.placeAt(
      position,
      this.readerBaseYaw + THREE.MathUtils.degToRad(this.settings.readerRotation),
    );
    this.readerHomePosition = new THREE.Vector3(position.x, position.y, position.z);
    this.readerHomeYaw = this.reader.group.rotation.y;
    this.reader.group.updateWorldMatrix(true, true);
    this.readerCollisionBounds.setFromObject(this.reader.group);
    this.readerSurfaceProxy?.removeFromParent();
    this.readerSurfaceProxy?.userData.dispose?.();
    this.readerSurfaceProxy = createTriangleSurfaceProxy(this.reader.group, {
      cellSize: SCENE_PROPS.reader.climbProxyCellSize,
      minimumTriangleArea: SCENE_PROPS.reader.climbProxyMinimumTriangleArea,
      groundCollisionHeight: SCENE_PROPS.reader.climbProxyGroundCollisionHeight,
    });
  },

  prepareReaderNightRoutine(ground, world) {
    if (!this.reader?.group || !this.tent?.group || !ground) return;
    this.tent.group.updateWorldMatrix(true, true);
    const tentPosition = this.tent.group.getWorldPosition(new THREE.Vector3());
    const tentQuaternion = this.tent.group.getWorldQuaternion(new THREE.Quaternion());
    const seatOffset = new THREE.Vector3(0, 0, -0.55).applyQuaternion(tentQuaternion);
    const x = tentPosition.x + seatOffset.x;
    const z = tentPosition.z + seatOffset.z;
    this.readerTentPosition = new THREE.Vector3(
      x,
      ground.heightAt(x, z) + SCENE_PROPS.reader.lift,
      z,
    );
    this.readerTentYaw = this.readerHomeYaw;
    this.readerNightBlend = 0;
    this.readerFadeMaterials = [];
    this.reader.group.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const fadeMaterials = sourceMaterials.map((source) => {
        const material = source.clone();
        material.transparent = true;
        // Keep nearer parts of this multi-mesh model from revealing surfaces behind them.
        material.depthWrite = true;
        this.readerFadeMaterials.push({ material, opacity: material.opacity });
        return material;
      });
      object.material = Array.isArray(object.material) ? fadeMaterials : fadeMaterials[0];
    });
    const light = new THREE.PointLight('#ffd58a', 0, 5.5, 2);
    light.name = 'Quiet reader tent light';
    const requestedWorldPosition = new THREE.Vector3(9.1, 3, 9.8);
    const relativeLightPosition = this.tent.group.worldToLocal(requestedWorldPosition.clone());
    light.position.copy(this.tent.group.localToWorld(relativeLightPosition));
    world.add(light);
    this.readerTentLight = light;
    this.readerTentLightLocalPosition = relativeLightPosition;
  },

  updateReaderNightRoutine(delta) {
    if (!this.reader?.group || !this.readerHomePosition || !this.readerTentPosition) return;
    const hour = ((Number(this.settings.sunHour) % 24) + 24) % 24;
    const evening = THREE.MathUtils.smoothstep(hour, 19.9, 20.25);
    const morning = 1 - THREE.MathUtils.smoothstep(hour, 5.1, 6.6);
    const target = Math.max(evening, morning);
    this.readerNightBlend = THREE.MathUtils.damp(this.readerNightBlend, target, 1.8, delta);
    if (this.readerNightBlend > 0.01 && this.readerClimbingController?.route?.id === 'reader') {
      this.readerClimbingController.abortRoute();
    }
    const fade = Math.min(1, Math.abs(this.readerNightBlend * 2 - 1));
    const insideTent = this.readerNightBlend >= 0.5;
    this.reader.group.position.copy(insideTent ? this.readerTentPosition : this.readerHomePosition);
    this.reader.group.rotation.y = insideTent ? this.readerTentYaw : this.readerHomeYaw;
    this.readerFadeMaterials.forEach(({ material, opacity }) => {
      material.opacity = opacity * fade;
    });
    this.reader.group.updateWorldMatrix(true, true);
    this.readerCollisionBounds.setFromObject(this.reader.group);
    if (this.readerSurfaceProxy) {
      this.readerSurfaceProxy.position.set(
        this.reader.group.position.x - this.readerHomePosition.x,
        this.reader.group.position.y - this.readerHomePosition.y,
        this.reader.group.position.z - this.readerHomePosition.z,
      );
    }
    if (this.readerTentLight) {
      this.readerTentLight.visible = this.readerNightBlend > 0.01;
      this.readerTentLight.intensity = 8 * this.readerNightBlend;
      this.readerTentLight.position.copy(
        this.tent.group.localToWorld(
          this.readerTentLightWorldPosition.copy(this.readerTentLightLocalPosition),
        ),
      );
    }
  },

  placeScatteredModelProps(ground, world) {
    Object.entries(this.sceneProps)
      .filter(([, config]) => Number.isFinite(config.count))
      .forEach(([propId, config]) => {
        this.modelPropInstances.push(...placeModelPropInstances({
          model: this.modelProps[propId],
          propId,
          config,
          name: config.modelName,
          ground,
          world,
        }));
      });
  },

  placeFixedModelProps(ground, world) {
    Object.entries(this.sceneProps)
      .filter(([, config]) => config.placementStrategy === 'fixed-ground')
      .forEach(([propId, config]) => {
        const model = this.modelProps[propId];
        const spot = getModelPropSpot(ground, propId);
        if (!model || !spot) return;
        placeGroundModelProp({ model, ground, anchor: spot, config });
        world.add(model.group);
        if (!config.animation || config.animation.autoplay === false) return;
        const clip = createConfiguredAnimationClip(
          model.animations,
          config.animation,
          `${propId} autoplay`,
        );
        if (!clip) {
          console.warn(`[the-quiet-pond] No configured animation clip was found for ${propId}.`);
          return;
        }
        const mixer = new THREE.AnimationMixer(model.group);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = Number(config.animation.speed) || 1;
        action.play();
        this.genericModelMixers.push(mixer);
      });
  },

  placeStreetLamp(ground, world) {
    const spot = getModelPropSpot(ground, 'streetLamp');
    if (!this.streetLamp || !spot || !world) return;
    const config = SCENE_PROPS.streetLamp;
    const position = placeGroundModelProp({
      model: this.streetLamp,
      ground,
      anchor: spot,
      config,
    });
    world.add(this.streetLamp.group);

    const height = this.streetLamp.nativeSize.y
      * (config.targetWidth / this.streetLamp.horizontalSize);
    const lightPosition = new THREE.Vector3(
      spot.x,
      position.y + height * config.lightHeightFraction,
      spot.z,
    );
    this.streetLampLight = new THREE.PointLight(
      '#ffd28a',
      0,
      config.lightDistance,
      2,
    );
    this.streetLampLight.name = 'Street lamp warm light';
    this.streetLampLight.position.copy(lightPosition);
    world.add(this.streetLampLight);

    this.streetLampGlow = createLampGlow();
    this.streetLampGlow.position.copy(lightPosition);
    world.add(this.streetLampGlow);
    this.updateStreetLampLight();
  },

  updateStreetLampLight(elapsed = 0) {
    if (!this.streetLampLight || !this.streetLampGlow) return;
    const night = getNightAmount(this.settings.sunHour, 18.75, 20.5);
    const flicker = 0.93 + Math.sin(elapsed * 7.2) * 0.045 + Math.sin(elapsed * 13.7) * 0.025;
    this.streetLampLight.visible = night > 0.01;
    this.streetLampLight.intensity = SCENE_PROPS.streetLamp.lightIntensity * night * flicker;
    this.streetLampGlow.visible = night > 0.01;
    this.streetLampGlow.material.opacity = night * 0.94;
    const glowSize = THREE.MathUtils.lerp(0.48, 0.92, night) * flicker;
    this.streetLampGlow.scale.set(glowSize, glowSize, 1);
  },

  updateAntNightLight() {
    if (!this.antNightLight) return;
    const night = getNightAmount(this.settings.sunHour);
    this.antNightLight.intensity = ANT_NIGHT_LIGHT.intensity * night;
    this.antNightLight.visible = night > 0.01;
  },

  placeTent(anchor, ground) {
    if (!this.tent || !anchor || !ground) return;
    const offset = {
      x: this.settings.tentOffsetX,
      y: this.settings.tentOffsetY,
      z: this.settings.tentOffsetZ,
    };
    this.tentBaseYaw = anchor.yaw;
    placeGroundModelProp({
      model: this.tent,
      ground,
      anchor,
      config: SCENE_PROPS.tent,
      offset,
      yaw: this.tentBaseYaw + THREE.MathUtils.degToRad(this.settings.tentRotation),
      targetWidth: SCENE_PROPS.tent.targetWidth * this.settings.tentScale,
    });
  },

  buildModelGroundColliders() {
    const definitions = [
      {
        id: 'streetLamp',
        model: this.streetLamp,
        config: SCENE_PROPS.streetLamp,
        blocksGround: true,
      },
      {
        id: 'tent',
        model: this.tent,
        config: SCENE_PROPS.tent,
        blocksGround: true,
      },
      {
        id: 'radio',
        model: this.radio,
        config: SCENE_PROPS.radio,
        // Keep the radio solid during normal ant movement. Its footprint is
        // still climbable because the climbing system uses the separate
        // radio surface proxy.
        blocksGround: true,
      },
    ];
    this.modelGroundColliders = definitions.flatMap((definition) => {
      const group = definition.model?.group;
      if (!group?.parent) return [];
      group.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(group, true);
      if (bounds.isEmpty()) return [];
      const footprint = createObjectGroundFootprint(group, {
        cellSize: 0.035,
        baseHeight: bounds.min.y - 0.004,
        maximumHeightAboveBase: definition.config.groundCollisionHeight,
      });
      if (!footprint) return [];
      const position = group.getWorldPosition(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      return [{
        id: definition.id,
        x: position.x,
        z: position.z,
        radius: Math.max(size.x, size.z) * 0.5,
        footprint,
        blocksGround: definition.blocksGround,
      }];
    });
  },

  placeFrog(anchor, ground) {
    if (!this.frog || !anchor || !ground) return;
    placeGroundModelProp({
      model: this.frog,
      ground,
      anchor,
      config: SCENE_PROPS.frog,
    });
  },

  placeAnt(heroPosition, ground) {
    if (!this.ant) return;
    const offset = SCENE_PROPS.ant.offset;
    const x = heroPosition.x + offset.x;
    const z = heroPosition.z + offset.z;
    if (ground.pondProfile) {
      const profile = ground.pondProfile;
      this.antMovementCenter.set(
        THREE.MathUtils.lerp(heroPosition.x, profile.center.x, 0.42),
        THREE.MathUtils.lerp(heroPosition.z, profile.center.z, 0.42),
      );
      this.antMovementRadius = this.antMovementRadiusOverride ?? 12;
    } else {
      this.antMovementCenter.set(heroPosition.x, heroPosition.z);
      this.antMovementRadius = SCENE_PROPS.ant.movementRadius;
    }
    this.antWaterStepDistance = 0;
    this.antWaterStepSide = 1;
    this.antWasOnWater = ground.containsPond?.(x, z, -0.045) ?? false;
    this.ant.setTargetWidth(SCENE_PROPS.ant.targetWidth);
    const supportHeight = this.antWasOnWater && this.activePondWater
      ? this.activePondWater.getSurfaceHeight(x, z) + 0.008
      : ground.heightAt(x, z);
    this.ant.placeAt(
      {
        x,
        y: supportHeight + SCENE_PROPS.ant.lift + offset.y,
        z,
      },
      THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset),
    );
    if (this.antWasOnWater) this.activePondWater?.addRipple(x, z, 0.008, 0.11);
    this.antAction?.reset();
    this.setAntAnimationPlaying(false);
  },

  placeCat(tree) {
    if (!this.cat || !tree?.perchAnchor) return;
    const anchor = tree.perchAnchor;
    this.cat.setTargetWidth(SCENE_PROPS.cat.targetWidth);
    this.cat.placeAt(
      createAnchorPosition(anchor, {
        lift: anchor.radius * 0.92,
        offset: { y: SCENE_PROPS.cat.lift },
      }),
      Math.atan2(anchor.direction.x, anchor.direction.z)
        + THREE.MathUtils.degToRad(SCENE_PROPS.cat.yawOffset),
    );
  },
};

export function installPondPropPlacementMethods(PondApp) {
  Object.entries(propPlacementMethods).forEach(([name, method]) => {
    Object.defineProperty(PondApp.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  });
}
