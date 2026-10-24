import * as THREE from 'three';

function createGlowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export class AntLocator {
  constructor(scene, config) {
    this.config = config;
    this.active = false;
    this.group = new THREE.Group();
    this.group.name = 'Ant Explore locator';
    this.group.visible = false;

    this.outerMaterial = createGlowMaterial(config.color, config.outerOpacity);
    this.coreMaterial = createGlowMaterial(config.coreColor, config.coreOpacity);
    this.sphereMaterial = createGlowMaterial(config.color, config.sphereOpacity);

    this.outerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(
        config.outerRadius * 0.58,
        config.outerRadius,
        config.height,
        16,
        1,
        true,
      ),
      this.outerMaterial,
    );
    this.coreBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(
        config.coreRadius,
        config.coreRadius * 1.35,
        config.height,
        10,
        1,
        true,
      ),
      this.coreMaterial,
    );
    this.markerSphere = new THREE.Mesh(
      new THREE.SphereGeometry(config.sphereRadius, 20, 14),
      this.sphereMaterial,
    );

    const beamCenter = config.baseOffset + config.height * 0.5;
    this.outerBeam.position.y = beamCenter;
    this.coreBeam.position.y = beamCenter;
    this.markerSphere.position.y = config.sphereOffsetY;

    for (const mesh of [this.outerBeam, this.coreBeam, this.markerSphere]) {
      mesh.frustumCulled = false;
      mesh.renderOrder = config.renderOrder;
      this.group.add(mesh);
    }
    scene.add(this.group);
  }

  setActive(active) {
    this.active = Boolean(active);
    this.group.visible = this.active;
  }

  update(position, elapsed) {
    if (!this.active) return;
    if (!position) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    this.group.position.copy(position);
    const pulse = 0.5 + Math.sin(elapsed * this.config.pulseSpeed) * 0.5;
    this.outerMaterial.opacity = this.config.outerOpacity * (0.72 + pulse * 0.28);
    this.coreMaterial.opacity = this.config.coreOpacity * (0.88 + pulse * 0.12);
    this.sphereMaterial.opacity = this.config.sphereOpacity * (0.68 + pulse * 0.32);
    this.markerSphere.scale.setScalar(0.9 + pulse * 0.16);
  }

  dispose() {
    this.group.removeFromParent();
    for (const mesh of [this.outerBeam, this.coreBeam, this.markerSphere]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.group.clear();
  }
}
