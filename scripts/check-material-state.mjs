import assert from 'node:assert/strict';
import { MaterialState } from '../js/game/material-state.js';
import { MATERIAL_DEFINITIONS, BUILD_RECIPES } from '../js/content/building.js';

const leaves = Array.from({ length: 18 }, (_, i) => ({ id: `leaf-${i}`, x: i / 2, z: 0, rotation: i * 0.1 }));
const fresh = new MaterialState(leaves);
assert.equal(fresh.unlocked, true, 'Materials are available before any seed objective.');
assert.equal(fresh.items[3].rotation, leaves[3].rotation, 'Authored scatter rotation is retained.');
assert.equal(fresh.items[0].type, 'leaf', 'Legacy source definitions infer leaf type.');
assert.equal(fresh.canBuild('leaf-bed'), false);
fresh.pick('leaf-0'); fresh.deposit();
assert.equal(fresh.canBuild('leaf-bed'), false, 'One stored leaf cannot build a two-leaf bed.');
fresh.pick('leaf-1'); fresh.deposit();
assert.equal(fresh.canBuild('leaf-bed'), true, 'Exactly two leaves satisfy the recipe.');
assert.equal(fresh.buildRecipe('leaf-bed', { x: 1, z: 2 }, 0.4), true);
assert.equal(fresh.count('leaf'), 0);
assert.equal(fresh.canBuild('leaf-bed'), false, 'Another bed still needs its full material cost.');

const oldSave = { version: 1, unlocked: false, items: [
  { id: 'leaf-0', state: 'used' }, { id: 'leaf-1', state: 'used' },
  { id: 'leaf-2', state: 'stored' },
  { id: 'leaf-3', state: 'loose', area: 'burrow', x: -3, z: 4, rotation: 0.8 },
  { id: 'leaf-4', state: 'carried' },
], bed: { x: 3, z: 2, rotation: 0.2 } };
const migrated = new MaterialState(leaves, oldSave);
assert.equal(migrated.unlocked, true);
assert.equal(migrated.items.length, 18, 'Old leaf IDs survive expansion of the scatter population.');
assert.equal(migrated.count('leaf'), 1);
assert.equal(migrated.carried.id, 'leaf-4');
assert.deepEqual(migrated.bed, oldSave.bed);
assert.equal(migrated.items[3].area, 'burrow');
assert.equal(migrated.items[3].x, -3);
assert.ok(migrated.items.slice(6).every((item) => item.state === 'loose'));
assert.equal(migrated.save().version, 2);
assert.deepEqual(new MaterialState(leaves, JSON.parse(JSON.stringify(migrated.save()))).save(), migrated.save());
migrated.bed = null;
assert.equal(migrated.bed, null);
assert.equal(migrated.count('leaf'), 3, 'Removing an invalid legacy bed refunds its own consumed leaves.');

const materials = { ...MATERIAL_DEFINITIONS, twig: { id: 'twig', visual: 'twig' } };
const recipes = { ...BUILD_RECIPES,
  basket: { id: 'basket', cost: { leaf: 1, twig: 2 }, maximum: 2, visual: 'basket' },
  stool: { id: 'stool', cost: { twig: 1 }, maximum: 1, visual: 'stool' },
};
const sources = [
  { id: 'l0', type: 'leaf', x: 0, z: 0 }, { id: 'l1', type: 'leaf', x: 1, z: 0 },
  { id: 't0', type: 'twig', x: 2, z: 0 }, { id: 't1', type: 'twig', x: 3, z: 0 },
  { id: 't2', type: 'twig', x: 4, z: 0 },
];
const mixed = new MaterialState(sources, null, { materials, recipes });
for (const id of ['l0', 't0']) { mixed.pick(id); mixed.deposit(); }
const before = JSON.stringify(mixed.save());
assert.equal(mixed.buildRecipe('basket', { x: 0, z: 0 }, 0), false);
assert.equal(JSON.stringify(mixed.save()), before, 'Insufficient multi-material costs spend nothing.');
mixed.pick('t1'); mixed.deposit();
assert.deepEqual(mixed.storageCounts(), { leaf: 1, stick: 0, twig: 2 });
assert.equal(mixed.take('twig'), true);
assert.equal(mixed.carried.type, 'twig');
assert.equal(mixed.take('leaf'), false, 'Material types still share one carry slot.');
assert.equal(mixed.canBuild('basket'), false, 'A carried twig is not in storage.');
mixed.deposit();
assert.equal(mixed.buildRecipe('basket', { x: 2, z: 3 }, 0), true);
assert.deepEqual(mixed.storageCounts(), { leaf: 0, stick: 0, twig: 0 });
assert.equal(mixed.builds[0].itemIds.length, 3);
mixed.pick('t2'); mixed.deposit(); mixed.buildRecipe('stool', { x: 3, z: 4 }, 0.5);
assert.equal(mixed.builds.length, 2);
const restored = new MaterialState(sources, JSON.parse(JSON.stringify(mixed.save())), { materials, recipes });
assert.deepEqual(restored.save(), mixed.save(), 'New material types and recipes round-trip without leaf-specific save logic.');
assert.equal(restored.removeBuild(restored.builds.find((build) => build.recipe === 'basket').id), true);
assert.deepEqual(restored.storageCounts(), { leaf: 1, stick: 0, twig: 2 });
assert.equal(restored.builds[0].recipe, 'stool');
assert.equal(restored.items.find((item) => item.id === 't2').state, 'used', 'Refunding one recipe preserves another building ownership.');

const corrupted = mixed.save();
corrupted.builds.push({ ...corrupted.builds[0], id: 'duplicate', x: 8 });
corrupted.items[1].state = 'carried';
corrupted.items[0].type = 'twig';
const recovered = new MaterialState(sources, corrupted, { materials, recipes });
assert.equal(recovered.builds.length, 2, 'A second building cannot claim already-consumed IDs.');
assert.equal(recovered.items[0].type, 'leaf', 'The save cannot change a source material type.');
const removedRecipe = new MaterialState(sources, mixed.save(), { materials, recipes: { stool: recipes.stool } });
assert.equal(removedRecipe.builds.length, 1);
assert.equal(removedRecipe.count('leaf'), 1);
assert.equal(removedRecipe.count('twig'), 2, 'Removed/invalid recipes refund only their orphaned consumed items.');
const duplicateSource = new MaterialState([...sources, sources[0]], null, { materials, recipes });
assert.equal(duplicateSource.items.length, sources.length, 'Duplicated source definitions cannot duplicate inventory.');
const invalidPosition = JSON.stringify(mixed.save());
assert.equal(mixed.buildRecipe('basket', { x: Infinity, z: 0 }, 0), false);
assert.equal(JSON.stringify(mixed.save()), invalidPosition);
console.log('Material state checks passed: typed inventory, configurable costs, atomic multi-material builds, ownership, v1 migration, and corruption recovery.');

const shelterState = new MaterialState(leaves);
for (let i=0;i<2;i++) { shelterState.pick(`leaf-${i}`); shelterState.deposit(); }
assert.equal(shelterState.canBuild('leaf-shelter'),false);
shelterState.pick('leaf-2'); shelterState.deposit();
assert.equal(shelterState.buildRecipe('leaf-shelter',{x:2,z:3},.2),true);
const shelterReload = new MaterialState(leaves,JSON.parse(JSON.stringify(shelterState.save())));
assert.equal(shelterReload.builds[0].recipe,'leaf-shelter');
assert.equal(shelterReload.count('leaf'),0);
assert.equal(shelterReload.canBuild('leaf-shelter'),false);

const sticks = Array.from({length: 3}, (_,i) => ({id: `stick-${i}`, type: 'stick', x: i, z: 1}));
const frameState = new MaterialState([...leaves,...sticks]);
for (let i=0;i<3;i++) { frameState.pick(`leaf-${i}`); frameState.deposit(); }
assert.equal(frameState.canBuild('stick-frame'),false,'Leaves cannot pay a stick recipe.');
for (let i=0;i<2;i++) { frameState.pick(`stick-${i}`); frameState.deposit(); }
assert.equal(frameState.canBuild('stick-frame'),false,'Two sticks are insufficient.');
frameState.pick('stick-2'); frameState.deposit();
assert.equal(frameState.buildRecipe('stick-frame',{x:3,z:4},.5),true);
assert.equal(frameState.count('stick'),0);
assert.equal(frameState.count('leaf'),3,'Building the frame leaves stored leaves intact.');
const frameReload = new MaterialState([...leaves,...sticks], JSON.parse(JSON.stringify(frameState.save())));
assert.equal(frameReload.builds[0].recipe,'stick-frame');
assert.equal(frameReload.count('leaf'),3);

// Repeat builds keep separate consumed item ownership and survive JSON saves.
for (const recipeId of ['leaf-bed','stick-frame']) {
  const type = recipeId === 'leaf-bed' ? 'leaf' : 'stick';
  const amount = recipeId === 'leaf-bed' ? 2 : 3;
  const stock = Array.from({length: amount*3},(_,i)=>({id:`${type}-${i}`,type,x:i,z:2}));
  const repeat = new MaterialState(stock);
  for (const item of stock) { repeat.pick(item.id); repeat.deposit(); }
  for (let i=0;i<3;i++) assert.equal(repeat.buildRecipe(recipeId,{x:i,z:4},0),true);
  assert.equal(repeat.builds.length,3);
  assert.equal(new Set(repeat.builds.flatMap((build)=>build.itemIds)).size,stock.length);
  assert.equal(repeat.canBuild(recipeId),false,'Only depleted materials disable repeat builds.');
  const reloaded = new MaterialState(stock,JSON.parse(JSON.stringify(repeat.save())));
  assert.deepEqual(reloaded.save(),repeat.save());
  reloaded.removeBuild(reloaded.builds[1].id);
  assert.equal(reloaded.count(type),amount);
  assert.equal(reloaded.builds.length,2);
  assert.equal(reloaded.canBuild(recipeId),true);
}
