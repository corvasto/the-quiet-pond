import assert from 'node:assert/strict';
import fs from 'node:fs';

const bytes = fs.readFileSync(new URL('../assets/models/frog.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67);
assert.equal(bytes.readUInt32LE(8), bytes.length);
const jsonLength = bytes.readUInt32LE(12);
const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
assert.ok(model.materials.length > 0);
for (const material of model.materials) {
  assert.ok(!material.extensions?.KHR_materials_unlit, 'Frog materials must respond to scene lighting');
  assert.ok(material.pbrMetallicRoughness?.baseColorTexture, 'Retain the authored frog texture');
  assert.ok(!material.emissiveFactor?.some((value) => value > 0), 'The frog must not glow at night');
}
assert.ok(!model.extensionsRequired?.includes('KHR_materials_unlit'));
const binaryStart = 20 + jsonLength;
const binaryLength = bytes.readUInt32LE(binaryStart);
assert.ok(model.buffers[0].byteLength <= binaryLength);
for (const view of model.bufferViews) {
  assert.ok((view.byteOffset ?? 0) + view.byteLength <= binaryLength);
}
console.log('Model lighting checks passed: lit frog materials, original texture, no emission, and valid embedded buffer ranges.');
