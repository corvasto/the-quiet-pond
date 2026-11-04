import * as THREE from 'three';

export function createBuildingVisuals() {
  const positions = [], indices = [];
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const width = Math.sin(Math.PI * t) * 0.075;
    for (const side of [-1, 0, 1]) positions.push(side * width,
      0.025 * Math.sin(t * Math.PI) + Math.abs(side) * 0.012 * Math.sin(t * Math.PI), (t - 0.5) * 0.28);
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#8c9c42', roughness: 0.95, side: THREE.DoubleSide });
  const veinMaterial = new THREE.LineBasicMaterial({ color: '#c1ba72' });
  const lines = [];
  for (let i = 1; i < 8; i++) {
    const t = i / 8, z = (t - 0.5) * 0.28, y = 0.025 * Math.sin(t * Math.PI) + 0.001;
    for (const side of [-1, 1]) lines.push(0, y, z, side * Math.sin(t * Math.PI) * 0.065, y + 0.009, z + 0.025);
  }
  lines.push(0, 0.002, -0.14, 0, 0.025, 0, 0, 0.025, 0, 0, 0.002, 0.14);
  const veins = new THREE.BufferGeometry(); veins.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const previewMaterial = leafMaterial.clone(); previewMaterial.transparent = true; previewMaterial.opacity = 0.6; previewMaterial.depthWrite = false;
  function leaf(preview = false) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, preview ? previewMaterial : leafMaterial));
    if (!preview) group.add(new THREE.LineSegments(veins, veinMaterial));
    return group;
  }
  function bed(preview = false) {
    const group = new THREE.Group(); group.name = preview ? 'Leaf bed preview' : 'Two-leaf resting bed';
    for (let i = 0; i < 2; i++) {
      const part = leaf(preview); part.scale.setScalar(1.65);
      part.position.set(i ? 0.055 : -0.055, i * 0.008, i ? 0.04 : -0.04);
      part.rotation.y = i ? -0.3 : 0.3; group.add(part);
    }
    return group;
  }
  return { leaf, bed, previewMaterial, dispose() { geometry.dispose(); veins.dispose(); leafMaterial.dispose(); veinMaterial.dispose(); previewMaterial.dispose(); } };
}
