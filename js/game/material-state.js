const statuses = new Set(['loose', 'carried', 'stored', 'used']);
const finitePosition = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.z)
  && Math.abs(point.x) <= 100 && Math.abs(point.z) <= 100;

// Each leaf has exactly one owner/state. Storage counts are derived, never saved twice.
export class MaterialState {
  constructor(sources, saved = null) {
    const records = saved?.version === 1 && Array.isArray(saved.items) ? saved.items : [];
    let carrying = false;
    this.items = sources.map((source) => {
      const record = records.find((item) => item?.id === source.id);
      const item = { ...source, state: 'loose', area: 'surface', rotation: 0 };
      if (record && statuses.has(record.state)) {
        item.state = record.state;
        if (['surface', 'burrow'].includes(record.area) && finitePosition(record)) {
          item.area = record.area; item.x = record.x; item.z = record.z;
        }
        if (Number.isFinite(record.rotation)) item.rotation = record.rotation;
      }
      if (item.state === 'carried') {
        if (carrying) item.state = 'stored';
        carrying = true;
      }
      return item;
    });
    const bed = saved?.version === 1 ? saved.bed : null;
    this.bed = finitePosition(bed) && Number.isFinite(bed.rotation)
      && this.items.filter((item) => item.state === 'used').length === 2 ? { x: bed.x, z: bed.z, rotation: bed.rotation } : null;
    if (!this.bed) for (const item of this.items) if (item.state === 'used') item.state = 'stored';
    this.unlocked = saved?.version === 1 && saved.unlocked === true;
  }
  get carried() { return this.items.find((item) => item.state === 'carried') ?? null; }
  get stored() { return this.items.filter((item) => item.state === 'stored').length; }
  pick(id) {
    const item = this.items.find((leaf) => leaf.id === id && leaf.state === 'loose');
    if (!item || this.carried) return false;
    item.state = 'carried'; return true;
  }
  drop(area, position, rotation) {
    if (!this.carried || !['surface', 'burrow'].includes(area) || !finitePosition(position) || !Number.isFinite(rotation)) return false;
    Object.assign(this.carried, { state: 'loose', area, x: position.x, z: position.z, rotation }); return true;
  }
  deposit() { if (!this.carried) return false; this.carried.state = 'stored'; return true; }
  take() {
    const item = this.items.find((leaf) => leaf.state === 'stored');
    if (!item || this.carried) return false;
    item.state = 'carried'; return true;
  }
  build(position, rotation) {
    if (this.bed || this.stored < 2 || !finitePosition(position) || !Number.isFinite(rotation)) return false;
    const cost = this.items.filter((item) => item.state === 'stored').slice(0, 2);
    for (const item of cost) item.state = 'used';
    this.bed = { x: position.x, z: position.z, rotation }; return true;
  }
  save() { return { version: 1, unlocked: this.unlocked, items: this.items.map((item) => ({ ...item })), bed: this.bed ? { ...this.bed } : null }; }
}
