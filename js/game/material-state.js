import { MATERIAL_DEFINITIONS, BUILD_RECIPES } from '../content/building.js';

const statuses = new Set(['loose', 'carried', 'stored', 'used']);
const finitePosition = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.z)
  && Math.abs(point.x) <= 100 && Math.abs(point.z) <= 100;
const rotationOf = (value) => Number.isFinite(value) ? value % (Math.PI * 2) : 0;

// Every item has one type and ownership state. Inventory is derived, and each
// building owns the exact item IDs consumed by its configured recipe.
export class MaterialState {
  constructor(sources, saved = null, { materials = MATERIAL_DEFINITIONS, recipes = BUILD_RECIPES } = {}) {
    this.materials = materials;
    this.recipes = recipes;
    this.compiledRecipes = new Map();
    for (const [key, recipe] of Object.entries(recipes)) {
      if (!recipe || typeof recipe !== 'object') continue;
      const id = recipe.id ?? key;
      const cost = Object.entries(recipe.cost ?? {});
      if (!cost.length || cost.some(([type, amount]) => !Object.hasOwn(materials, type) || !Number.isSafeInteger(amount) || amount <= 0)) continue;
      this.compiledRecipes.set(id, { ...recipe, id, cost, maximum: recipe.maximum == null ? Infinity : Math.max(1, Math.floor(recipe.maximum)) });
    }
    const version = saved?.version;
    const validSave = version === 1 || version === 2;
    const records = new Map();
    if (validSave && Array.isArray(saved.items)) for (const item of saved.items.slice(0, 4096)) {
      if (item && typeof item.id === 'string' && !records.has(item.id)) records.set(item.id, item);
    }
    this.items = [];
    const sourceIds = new Set();
    let carrying = false;
    for (const source of sources) {
      if (!source) continue;
      const type = source.type ?? 'leaf';
      if (typeof source.id !== 'string' || sourceIds.has(source.id) || !Object.hasOwn(materials, type) || !finitePosition(source)) continue;
      sourceIds.add(source.id);
      const item = { ...source, type, state: 'loose', area: 'surface', rotation: rotationOf(source.rotation) };
      const record = records.get(source.id);
      if (record && statuses.has(record.state)) {
        // Types belong to source definitions, so a save cannot change a leaf into a twig.
        item.state = record.state;
        if (['surface', 'burrow'].includes(record.area) && finitePosition(record)) {
          item.area = record.area; item.x = record.x; item.z = record.z;
        }
        if (Number.isFinite(record.rotation)) item.rotation = rotationOf(record.rotation);
      }
      if (item.state === 'carried') {
        if (carrying) item.state = 'stored';
        carrying = true;
      }
      this.items.push(item);
    }
    this.builds = [];
    const claimedIds = new Set();
    const requested = version === 2 && Array.isArray(saved.builds) ? saved.builds.slice(0, this.items.length) : [];
    if (version === 1 && finitePosition(saved.bed) && Number.isFinite(saved.bed.rotation)) {
      requested.push({ ...saved.bed, id: 'leaf-bed:0', recipe: 'leaf-bed',
        itemIds: this.items.filter((item) => item.state === 'used').map((item) => item.id) });
    }
    for (const build of requested) {
      const recipe = this.compiledRecipes.get(build?.recipe);
      if (!recipe || !finitePosition(build) || !Number.isFinite(build.rotation)
        || typeof build.id !== 'string' || this.builds.some((entry) => entry.id === build.id)
        || this.builds.filter((entry) => entry.recipe === recipe.id).length >= recipe.maximum
        || !Array.isArray(build.itemIds) || new Set(build.itemIds).size !== build.itemIds.length) continue;
      const items = build.itemIds.map((id) => this.items.find((item) => item.id === id));
      if (items.some((item) => !item || item.state !== 'used' || claimedIds.has(item.id))) continue;
      if (items.length !== recipe.cost.reduce((sum, [, amount]) => sum + amount, 0)
        || recipe.cost.some(([type, amount]) => items.filter((item) => item.type === type).length !== amount)) continue;
      for (const item of items) claimedIds.add(item.id);
      this.builds.push({ id: build.id, recipe: recipe.id, x: build.x, z: build.z,
        rotation: rotationOf(build.rotation), itemIds: [...build.itemIds] });
    }
    // Invalid or removed recipes refund orphaned items instead of losing materials.
    for (const item of this.items) if (item.state === 'used' && !claimedIds.has(item.id)) item.state = 'stored';
    this.refreshBed();
  }
  // Compatibility for existing callers; the old objective gate no longer applies.
  get unlocked() { return true; }
  set unlocked(_value) {}
  get carried() { return this.items.find((item) => item.state === 'carried') ?? null; }
  get stored() { return this.count('leaf'); }
  get bed() { return this.bedView; }
  set bed(value) {
    if (value === null) for (const build of [...this.builds]) if (build.recipe === 'leaf-bed') this.removeBuild(build.id);
  }
  refreshBed() {
    const bed = this.builds.find((build) => build.recipe === 'leaf-bed');
    this.bedView = bed ? { x: bed.x, z: bed.z, rotation: bed.rotation } : null;
  }
  count(type) {
    let total = 0;
    for (const item of this.items) if (item.state === 'stored' && item.type === type) total++;
    return total;
  }
  storageCounts() { return Object.fromEntries(Object.keys(this.materials).map((type) => [type, this.count(type)])); }
  pick(id) {
    const item = this.items.find((entry) => entry.id === id && entry.state === 'loose');
    if (!item || this.carried) return false;
    item.state = 'carried'; return true;
  }
  drop(area, position, rotation) {
    if (!this.carried || !['surface', 'burrow'].includes(area) || !finitePosition(position) || !Number.isFinite(rotation)) return false;
    Object.assign(this.carried, { state: 'loose', area, x: position.x, z: position.z, rotation: rotationOf(rotation) }); return true;
  }
  deposit() { if (!this.carried) return false; this.carried.state = 'stored'; return true; }
  take(type = 'leaf') {
    const item = this.items.find((entry) => entry.state === 'stored' && entry.type === type);
    if (!item || this.carried) return false;
    item.state = 'carried'; return true;
  }
  canBuild(recipeId) {
    const recipe = this.compiledRecipes.get(recipeId);
    return Boolean(recipe
      && this.builds.filter((build) => build.recipe === recipe.id).length < recipe.maximum
      && recipe.cost.every(([type, amount]) => this.count(type) >= amount));
  }
  buildRecipe(recipeId, position, rotation) {
    if (!this.canBuild(recipeId) || !finitePosition(position) || !Number.isFinite(rotation)) return false;
    const recipe = this.compiledRecipes.get(recipeId);
    const cost = [];
    for (const [type, amount] of recipe.cost) {
      cost.push(...this.items.filter((item) => item.state === 'stored' && item.type === type).slice(0, amount));
    }
    let index = 0;
    while (this.builds.some((build) => build.id === `${recipeId}:${index}`)) index++;
    const build = { id: `${recipeId}:${index}`, recipe: recipeId, x: position.x, z: position.z,
      rotation: rotationOf(rotation), itemIds: cost.map((item) => item.id) };
    for (const item of cost) item.state = 'used';
    this.builds.push(build); this.refreshBed(); return true;
  }
  build(position, rotation) { return this.buildRecipe('leaf-bed', position, rotation); }
  removeBuild(id) {
    const build = this.builds.find((entry) => entry.id === id);
    if (!build) return false;
    for (const itemId of build.itemIds) {
      const item = this.items.find((entry) => entry.id === itemId);
      if (item?.state === 'used') item.state = 'stored';
    }
    this.builds = this.builds.filter((entry) => entry !== build);
    this.refreshBed(); return true;
  }
  save() {
    return { version: 2, unlocked: true, items: this.items.map((item) => ({ ...item })),
      builds: this.builds.map((build) => ({ ...build, itemIds: [...build.itemIds] })),
      bed: this.bed ? { ...this.bed } : null };
  }
}
