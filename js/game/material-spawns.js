function randomFor(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return () => {
    hash += 0x6d2b79f5;
    let n = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

// Stratified candidates spread resources across the dry world. Attempts and
// validation are bounded and run once at startup, never in the frame loop.
export function scatterMaterialSources({ type, count, seed, center, radius, minimumSpacing,
  isClear, savedItems = [], anchors = [] }) {
  const sources = [];
  const reserved = savedItems.filter((item) => item && item.area === 'surface' && item.state === 'loose'
    && Number.isFinite(item.x) && Number.isFinite(item.z));
  const clear = (x, z, id) => isClear(x, z)
    && [...sources, ...reserved].every((item) => item.id === id || Math.hypot(item.x - x, item.z - z) >= minimumSpacing);
  for (let i = 0; i < count; i++) {
    const id = `${type}-${i}`;
    const random = randomFor(`${seed}:material:${id}`);
    const previous = reserved.find((item) => item.id === id);
    if (previous && isClear(previous.x, previous.z)) {
      sources.push({ id, type, x: previous.x, z: previous.z, rotation: previous.rotation ?? 0 });
      continue;
    }
    for (let attempt = 0; attempt < 120; attempt++) {
      let x, z;
      if (i < anchors.length && attempt < 24) {
        const angle = random() * Math.PI * 2, distance = 0.9 + random() * 0.8;
        x = anchors[i].x + Math.cos(angle) * distance;
        z = anchors[i].z + Math.sin(angle) * distance;
      } else {
        const sector = i % 6;
        const angle = (sector + random()) * Math.PI / 3;
        const ring = Math.floor(i / 6) % 3;
        const distance = radius * (attempt < 60 ? 0.12 + (ring + random()) * 0.28 : Math.sqrt(random()) * 0.98);
        x = center.x + Math.cos(angle) * distance;
        z = center.z + Math.sin(angle) * distance;
      }
      if (Math.hypot(x - center.x, z - center.z) > radius || !clear(x, z, id)) continue;
      sources.push({ id, type, x, z, rotation: random() * Math.PI * 2 });
      break;
    }
  }
  return sources;
}
