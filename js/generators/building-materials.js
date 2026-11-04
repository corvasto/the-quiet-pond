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
    const endT = Math.min(0.98,t+0.08);
    const endY = (0.025+0.012*0.82)*Math.sin(endT*Math.PI)+0.001;
    for (const side of [-1, 1]) lines.push(0,y,z,
      side*Math.sin(endT*Math.PI)*0.075*0.82,endY,(endT-0.5)*0.28);
  }
  for(let i=0;i<segments;i++) {
    const a=i/segments,b=(i+1)/segments;
    lines.push(0,0.025*Math.sin(a*Math.PI)+0.001,(a-0.5)*0.28,
      0,0.025*Math.sin(b*Math.PI)+0.001,(b-0.5)*0.28);
  }
  const veins = new THREE.BufferGeometry(); veins.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const previewMaterial = leafMaterial.clone(); previewMaterial.transparent = true; previewMaterial.opacity = 0.6; previewMaterial.depthWrite = false;
  function leaf(preview = false) {
    const group = new THREE.Group();
    group.userData.buildingLeaf = true;
    group.userData.gripZ = -0.14;
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
  const stickGeometry = new THREE.CylinderGeometry(.009, .014, .3, 7, 2);
  stickGeometry.rotateX(Math.PI / 2); stickGeometry.translate(0, .014, 0);
  const barkMaterial = new THREE.MeshStandardMaterial({color: '#715039', roughness: 1});
  function stick(preview = false) {
    const group = new THREE.Group(); group.name = 'Fallen twig'; group.userData.gripZ = -.15;
    group.add(new THREE.Mesh(stickGeometry, preview ? previewMaterial : barkMaterial));
    return group;
  }
  function stickFrame(preview = false) {
    const group = new THREE.Group(); group.name = 'Three-twig frame';
    // Two leaning uprights and a crosspiece form a small decorative burrow frame.
    for (const side of [-1, 1]) {
      const part = stick(preview); part.rotation.x = Math.PI / 2;
      part.rotation.z = side * .35; part.position.set(side * .11, .15, 0); group.add(part);
    }
    const crosspiece = stick(preview); crosspiece.rotation.y = Math.PI / 2;
    crosspiece.position.y = .28; group.add(crosspiece);
    return group;
  }
  function shelter(preview = false) {
    const group = new THREE.Group(); group.name = 'Three-leaf shelter';
    for (let i = 0; i < 3; i++) {
      const part = leaf(preview); part.scale.setScalar(2.3);
      part.rotation.z = (i - 1) * .7; part.rotation.y = i * .3;
      part.position.set((i - 1) * .12, .19 - Math.abs(i - 1) * .04, 0);
      group.add(part);
    }
    return group;
  }
  const basinGeometry = new THREE.CylinderGeometry(0.23, 0.2, 0.03, 24);
  const rimGeometry = new THREE.TorusGeometry(0.24, 0.022, 6, 24);
  const basinMaterial = new THREE.MeshStandardMaterial({ color: '#6e5036', roughness: 1 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#9a7852', roughness: 1 });
  function deposit() {
    const group = new THREE.Group(); group.name = 'Round material deposit';
    const basin = new THREE.Mesh(basinGeometry, basinMaterial); basin.position.y = 0.005;
    const rim = new THREE.Mesh(rimGeometry, rimMaterial); rim.rotation.x = Math.PI / 2; rim.position.y = 0.022;
    group.add(basin, rim); return group;
  }
  return { materialFactories: { leaf, stick }, buildFactories: { bed, shelter, stickFrame }, leaf, bed, deposit, leafGripZ: -0.14, previewMaterial, dispose() {
    stickGeometry.dispose(); barkMaterial.dispose();
    geometry.dispose(); veins.dispose(); leafMaterial.dispose(); veinMaterial.dispose(); previewMaterial.dispose();
    basinGeometry.dispose(); rimGeometry.dispose(); basinMaterial.dispose(); rimMaterial.dispose();
  } };
}
