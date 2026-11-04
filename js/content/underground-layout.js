import { BURROW_CONFIG } from '../config/content.js';
import { UNDERGROUND_CONFIG } from '../config/underground.js';

// One horizontal cell corresponds to the same X/Z area in the surface world.
// Rooms share a continuous contoured floor. The roof remains solid in every camera mode.
export function createUndergroundLayout({ treePosition = { x: 0, z: 0 } } = {}) {
  const { cellSize, floorY, ceilingY } = UNDERGROUND_CONFIG;
  const origin = BURROW_CONFIG.position;
  const treeColumn = Math.round((treePosition.x - origin.x) / cellSize);
  const treeRow = Math.round((treePosition.z - origin.z) / cellSize);
  const minimumColumn = Math.min(-12, treeColumn - 4);
  const maximumColumn = Math.max(12, treeColumn + 4);
  const minimumRow = Math.min(-2, treeRow - 4);
  const maximumRow = Math.max(20, treeRow + 4);
  const width = maximumColumn - minimumColumn + 1;
  const height = maximumRow - minimumRow + 1;
  const occupied = new Uint8Array(width * height);
  const index = (column, row) => (row - minimumRow) * width + column - minimumColumn;
  const hasCell = (column, row) => column >= minimumColumn && column <= maximumColumn
    && row >= minimumRow && row <= maximumRow && occupied[index(column, row)] === 1;
  const fill = (left, right, front, back) => {
    for (let row = front; row <= back; row += 1) {
      for (let column = left; column <= right; column += 1) occupied[index(column, row)] = 1;
    }
  };
  fill(-1, 1, -1, 6); // Entry passage.
  fill(-3, 3, 6, 11); // Shared nest chamber.
  fill(-8, 8, 7, 9); // Branches to the seed store and roots.
  fill(-10, -6, 6, 10);
  fill(6, 10, 6, 11);
  fill(7, 9, 10, 17);
  fill(6, 10, 15, 19); // Quiet discovery chamber.
  fill(-1, 7, 16, 18); // Passage reconnects to the nest.
  fill(-1, 1, 10, 17);

  fill(Math.min(8, treeColumn) - 1, Math.max(8, treeColumn) + 1, 7, 9);
  fill(treeColumn - 1, treeColumn + 1, Math.min(8, treeRow), Math.max(8, treeRow));
  fill(treeColumn - 3, treeColumn + 3, treeRow - 3, treeRow + 3);
  const rootRadius = 0.34;
  const heightAt = (x, z) => floorY + 0.1 * Math.sin(x * 0.85 + z * 0.32)
    + 0.065 * Math.sin(z * 1.3 - x * 0.4);
  function roofAt(x, z) {
    const column = Math.floor((x-origin.x)/cellSize+0.5);
    const row = Math.floor((z-origin.z)/cellSize+0.5);
    let edge = 1;
    for (let r=row-2; r<=row+2; r++) for (let c=column-2; c<=column+2; c++) {
      if (hasCell(c,r)) continue;
      const dx = Math.max(0, Math.abs(x-origin.x-c*cellSize)-cellSize/2);
      const dz = Math.max(0, Math.abs(z-origin.z-r*cellSize)-cellSize/2);
      edge = Math.min(edge, Math.hypot(dx,dz));
    }
    const shoulder = Math.min(1, edge/0.65);
    return heightAt(x,z) + 0.72 + 0.3*Math.sin(shoulder*Math.PI/2)
      + 0.035*Math.sin(x*0.6-z*0.7);
  }
  const pointAt = (column, row) => ({
    x: origin.x + column * cellSize,
    y: heightAt(origin.x + column * cellSize, origin.z + row * cellSize),
    z: origin.z + row * cellSize,
  });
  const cells = [];
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      if (hasCell(column, row)) cells.push({ ...pointAt(column, row), column, row });
    }
  }

  // Circle against neighboring solid squares, including diagonal corners.
  // The numerical grid makes queries independent of decorative mesh complexity.
  function isWalkable(x, z, radius = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius < 0) return false;
    if (Math.hypot(x - treePosition.x, z - treePosition.z) < rootRadius + radius) return false;
    const column = Math.floor((x - origin.x) / cellSize + 0.5);
    const row = Math.floor((z - origin.z) / cellSize + 0.5);
    if (!hasCell(column, row)) return false;
    const reach = Math.ceil(radius / cellSize) + 1;
    for (let testRow = row - reach; testRow <= row + reach; testRow += 1) {
      for (let testColumn = column - reach; testColumn <= column + reach; testColumn += 1) {
        if (hasCell(testColumn, testRow)) continue;
        const dx = Math.max(0, Math.abs(x - origin.x - testColumn * cellSize) - cellSize / 2);
        const dz = Math.max(0, Math.abs(z - origin.z - testRow * cellSize) - cellSize / 2);
        if (dx * dx + dz * dz < radius * radius + 1e-10) return false;
      }
    }
    return true;
  }

  function containsSphere(x, y, z, radius = 0) {
    return Number.isFinite(y) && y - radius >= heightAt(x, z) + radius * 0.4 && y + radius <= roofAt(x, z) - radius * 0.4
      && isWalkable(x, z, radius);
  }

  const spawn = pointAt(0, 0);
  const landmarks = {
    nest: pointAt(0, 8),
    store: pointAt(-8, 8),
    roots: { x: treePosition.x + 0.95, y: heightAt(treePosition.x + 0.95, treePosition.z), z: treePosition.z },
    quiet: pointAt(8, 17),
  };
  const workerRoutes = [
    [pointAt(0, 1), pointAt(0, 8), pointAt(-8, 8), pointAt(0, 8)],
    [pointAt(0, 8), pointAt(8, 8), pointAt(8, 17), pointAt(0, 17)],
  ];
  return { cells, hasCell, pointAt, isWalkable, containsSphere, floorY, ceilingY,
    antRadius: UNDERGROUND_CONFIG.antRadius, cellSize, heightAt, roofAt, treePosition, rootRadius, spawn, exit: spawn, landmarks, workerRoutes };
}
