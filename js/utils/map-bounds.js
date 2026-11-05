// SVG and the orthographic surface capture use identical world-space bounds.
export function getMapBounds(data) {
  const points = [...data.layout.cells, ...(data.passage ?? []), ...data.pond, data.layout.treePosition, data.position];
  const x = Math.min(...points.map((point) => point.x)) - 1.2;
  const z = Math.min(...points.map((point) => point.z)) - 1.2;
  return { x, z,
    width: Math.max(...points.map((point) => point.x)) + 1.2 - x,
    height: Math.max(...points.map((point) => point.z)) + 1.2 - z };
}
