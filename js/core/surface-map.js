import * as THREE from 'three';

export function createSurfaceMapCamera(bounds, cutHeight = 2) {
  const camera = new THREE.OrthographicCamera(-bounds.width / 2, bounds.width / 2,
    bounds.height / 2, -bounds.height / 2, Math.max(0.1, Math.min(199, 80 - cutHeight)), 200);
  camera.position.set(bounds.x + bounds.width / 2, 80, bounds.z + bounds.height / 2);
  camera.up.set(0, 0, -1);
  camera.lookAt(camera.position.x, 0, camera.position.z);
  camera.updateMatrixWorld();
  return camera;
}

function encodePixels(pixels, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const stride = width * 4;
  for (let row = 0; row < height; row += 1) {
    image.data.set(pixels.subarray((height - row - 1) * stride, (height - row) * stride), row * stride);
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

// Capture synchronously between frames; restore live scene and renderer state
// even when rendering, pixel readback, or image encoding fails.
export function captureSurfaceMap(app, bounds, resolution = 768, encode = encodePixels, cutHeight = 2) {
  const { renderer, scene, world } = app;
  // A top-down near plane slices every surface object above the chosen height.
  const camera = createSurfaceMapCamera(bounds, cutHeight);
  const aspect = bounds.width / bounds.height;
  const width = Math.max(1, Math.round(aspect >= 1 ? resolution : resolution * aspect));
  const height = Math.max(1, Math.round(aspect >= 1 ? resolution / aspect : resolution));
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const previous = {
    target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
    viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(), clearColor: renderer.getClearColor(new THREE.Color()),
    clearAlpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, xr: renderer.xr.enabled,
    shadows: renderer.shadowMap.enabled, background: scene.background, fog: scene.fog,
  };
  const hidden = new Map();
  const hide = (object) => {
    if (!object || hidden.has(object)) return;
    hidden.set(object, object.visible); object.visible = false;
  };
  const hemisphere = new THREE.HemisphereLight('#eff4e2', '#b1a488', 2.2);
  const sun = new THREE.DirectionalLight('#fff0d6', 2);
  sun.position.set(-20, 40, 10);
  const water = app.activePondWater?.water;
  const waterMaterial = water?.material;
  const waterBeforeRender = water?.onBeforeRender;
  const flatWater = water ? new THREE.MeshStandardMaterial({ color: '#6eaaa5', roughness: 0.8 }) : null;
  try {
    for (const object of scene.children) if (object !== world) hide(object);
    world.traverse((object) => {
      if (object.isLight || object.name === 'Instanced ash canopy') hide(object);
    });
    hide(app.ant?.group);
    if (water) {
      water.material = flatWater;
      water.onBeforeRender = () => {};
    }
    scene.background = null; scene.fog = null;
    scene.add(hemisphere, sun);
    renderer.xr.enabled = false;
    renderer.shadowMap.enabled = false;
    renderer.autoClear = true;
    renderer.setClearColor('#d8d8bb', 0);
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return { url: encode(pixels, width, height), bounds: { ...bounds } };
  } finally {
    if (water) { water.material = waterMaterial; water.onBeforeRender = waterBeforeRender; }
    for (const [object, visible] of hidden) object.visible = visible;
    hemisphere.removeFromParent(); sun.removeFromParent();
    scene.background = previous.background; scene.fog = previous.fog;
    renderer.xr.enabled = previous.xr;
    renderer.shadowMap.enabled = previous.shadows;
    renderer.autoClear = previous.autoClear;
    renderer.setRenderTarget(previous.target, previous.face, previous.mip);
    renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
    renderer.setScissorTest(previous.scissorTest);
    renderer.setClearColor(previous.clearColor, previous.clearAlpha);
    target.dispose(); flatWater?.dispose();
  }
}
