import * as THREE from 'three';

const MINIMUM_GRID_SIZE = 4;
const MAXIMUM_GRID_SIZE = 28;

function clampCell(value, maximum) {
  return Math.max(0, Math.min(maximum - 1, value));
}

function hullCross(origin, left, right) {
  return (left.x - origin.x) * (right.z - origin.z)
    - (left.z - origin.z) * (right.x - origin.x);
}

function createConvexHull(points) {
  const sorted = [...points]
    .sort((left, right) => left.x - right.x || left.z - right.z)
    .filter((point, index, list) => (
      index === 0
      || point.x !== list[index - 1].x
      || point.z !== list[index - 1].z
    ));
  if (sorted.length <= 2) return sorted;
  const lower = [];
  for (const point of sorted) {
    while (
      lower.length >= 2
      && hullCross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2
      && hullCross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function distanceToSegmentSquared(x, z, start, end) {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared <= 0.0000001) {
    return (x - start.x) ** 2 + (z - start.z) ** 2;
  }
  const amount = THREE.MathUtils.clamp(
    ((x - start.x) * segmentX + (z - start.z) * segmentZ) / lengthSquared,
    0,
    1,
  );
  const closestX = start.x + segmentX * amount;
  const closestZ = start.z + segmentZ * amount;
  return (x - closestX) ** 2 + (z - closestZ) ** 2;
}

function containsHullPoint(hull, x, z, padding = 0) {
  if (hull.length < 3) return false;
  let inside = false;
  for (
    let index = 0, previous = hull.length - 1;
    index < hull.length;
    previous = index, index += 1
  ) {
    const start = hull[previous];
    const end = hull[index];
    const crosses = (start.z > z) !== (end.z > z)
      && x < (end.x - start.x) * (z - start.z)
        / Math.max(Math.abs(end.z - start.z), 0.0000001) * Math.sign(end.z - start.z)
        + start.x;
    if (crosses) inside = !inside;
    if (
      padding > 0
      && distanceToSegmentSquared(x, z, start, end) <= padding * padding
    ) return true;
  }
  return inside;
}

function createProjectedTriangleFootprint(
  positions,
  indices,
  bounds,
  requestedCellSize,
  maximumCollisionY,
  minimumCollisionY = -Infinity,
) {
  const cellSize = Math.max(0.025, requestedCellSize * 0.65);
  const sizeX = Math.max(0.001, bounds.max.x - bounds.min.x);
  const sizeZ = Math.max(0.001, bounds.max.z - bounds.min.z);
  const columnsX = Math.max(4, Math.ceil(sizeX / cellSize));
  const columnsZ = Math.max(4, Math.ceil(sizeZ / cellSize));
  const cellWidth = sizeX / columnsX;
  const cellDepth = sizeZ / columnsZ;
  const occupied = new Uint8Array(columnsX * columnsZ);
  const edgeDistance = Math.hypot(cellWidth, cellDepth) * 0.62;
  const edgeDistanceSquared = edgeDistance * edgeDistance;
  const triangleContains = (x, z, first, second, third) => {
    const sign = (pointX, pointZ, left, right) => (
      (pointX - right.x) * (left.z - right.z)
      - (left.x - right.x) * (pointZ - right.z)
    );
    const firstSign = sign(x, z, first, second);
    const secondSign = sign(x, z, second, third);
    const thirdSign = sign(x, z, third, first);
    const hasNegative = firstSign < 0 || secondSign < 0 || thirdSign < 0;
    const hasPositive = firstSign > 0 || secondSign > 0 || thirdSign > 0;
    return !(hasNegative && hasPositive);
  };
  const vertex = (index) => ({
    x: positions[index * 3],
    y: positions[index * 3 + 1],
    z: positions[index * 3 + 2],
  });

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const first = vertex(indices[index]);
    const second = vertex(indices[index + 1]);
    const third = vertex(indices[index + 2]);
    if (
      Math.min(first.y, second.y, third.y) > maximumCollisionY
      || Math.max(first.y, second.y, third.y) < minimumCollisionY
    ) continue;
    const minimumX = Math.max(0, Math.floor(
      (Math.min(first.x, second.x, third.x) - bounds.min.x) / cellWidth,
    ) - 1);
    const maximumX = Math.min(columnsX - 1, Math.floor(
      (Math.max(first.x, second.x, third.x) - bounds.min.x) / cellWidth,
    ) + 1);
    const minimumZ = Math.max(0, Math.floor(
      (Math.min(first.z, second.z, third.z) - bounds.min.z) / cellDepth,
    ) - 1);
    const maximumZ = Math.min(columnsZ - 1, Math.floor(
      (Math.max(first.z, second.z, third.z) - bounds.min.z) / cellDepth,
    ) + 1);
    for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ += 1) {
      for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
        const x = bounds.min.x + (cellX + 0.5) * cellWidth;
        const z = bounds.min.z + (cellZ + 0.5) * cellDepth;
        if (
          triangleContains(x, z, first, second, third)
          || distanceToSegmentSquared(x, z, first, second) <= edgeDistanceSquared
          || distanceToSegmentSquared(x, z, second, third) <= edgeDistanceSquared
          || distanceToSegmentSquared(x, z, third, first) <= edgeDistanceSquared
        ) occupied[cellZ * columnsX + cellX] = 1;
      }
    }
  }

  const contains = (x, z, padding = 0) => {
    const safePadding = Math.max(0, Number(padding) || 0);
    if (
      x + safePadding < bounds.min.x
      || x - safePadding > bounds.max.x
      || z + safePadding < bounds.min.z
      || z - safePadding > bounds.max.z
    ) return false;
    const minimumX = clampCell(Math.floor(
      (x - safePadding - bounds.min.x) / cellWidth,
    ), columnsX);
    const maximumX = clampCell(Math.floor(
      (x + safePadding - bounds.min.x) / cellWidth,
    ), columnsX);
    const minimumZ = clampCell(Math.floor(
      (z - safePadding - bounds.min.z) / cellDepth,
    ), columnsZ);
    const maximumZ = clampCell(Math.floor(
      (z + safePadding - bounds.min.z) / cellDepth,
    ), columnsZ);
    for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ += 1) {
      for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
        if (!occupied[cellZ * columnsX + cellX]) continue;
        const cellMinimumX = bounds.min.x + cellX * cellWidth;
        const cellMaximumX = cellMinimumX + cellWidth;
        const cellMinimumZ = bounds.min.z + cellZ * cellDepth;
        const cellMaximumZ = cellMinimumZ + cellDepth;
        const closestX = THREE.MathUtils.clamp(x, cellMinimumX, cellMaximumX);
        const closestZ = THREE.MathUtils.clamp(z, cellMinimumZ, cellMaximumZ);
        if (Math.hypot(x - closestX, z - closestZ) <= safePadding + 0.0001) return true;
      }
    }
    return false;
  };
  return { contains, occupied, columnsX, columnsZ, cellWidth, cellDepth };
}

export function createObjectGroundFootprint(object, {
  cellSize = 0.05,
  baseHeight = null,
  maximumHeightAboveBase = 0.42,
} = {}) {
  if (!object?.isObject3D) return null;
  object.updateWorldMatrix(true, true);
  const positions = [];
  const indices = [];
  const point = new THREE.Vector3();
  object.traverse((child) => {
    const geometry = child.isMesh ? child.geometry : null;
    const position = geometry?.attributes?.position;
    if (!position) return;
    child.updateWorldMatrix(true, false);
    const offset = positions.length / 3;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      positions.push(point.x, point.y, point.z);
    }
    const sourceIndex = geometry.index;
    const indexCount = sourceIndex?.count ?? position.count;
    for (let index = 0; index < indexCount; index += 1) {
      indices.push(offset + (sourceIndex ? sourceIndex.getX(index) : index));
    }
  });
  if (positions.length < 9 || indices.length < 3) return null;

  const bounds = new THREE.Box3().makeEmpty();
  for (let index = 0; index < positions.length; index += 3) {
    bounds.expandByPoint(point.set(
      positions[index],
      positions[index + 1],
      positions[index + 2],
    ));
  }
  if (bounds.isEmpty()) return null;
  const collisionBaseHeight = Number.isFinite(Number(baseHeight))
    ? Number(baseHeight)
    : bounds.min.y;
  const minimumCollisionY = collisionBaseHeight + 0.004;
  const maximumCollisionY = collisionBaseHeight
    + Math.max(0.08, Number(maximumHeightAboveBase) || 0.42);
  const collisionBounds = new THREE.Box3().makeEmpty();
  const trianglePoint = new THREE.Vector3();
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const firstOffset = indices[index] * 3;
    const secondOffset = indices[index + 1] * 3;
    const thirdOffset = indices[index + 2] * 3;
    const firstY = positions[firstOffset + 1];
    const secondY = positions[secondOffset + 1];
    const thirdY = positions[thirdOffset + 1];
    if (
      Math.min(firstY, secondY, thirdY) > maximumCollisionY
      || Math.max(firstY, secondY, thirdY) < minimumCollisionY
    ) continue;
    for (const offset of [firstOffset, secondOffset, thirdOffset]) {
      collisionBounds.expandByPoint(trianglePoint.set(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2],
      ));
    }
  }
  if (collisionBounds.isEmpty()) return null;
  const footprint = createProjectedTriangleFootprint(
    positions,
    indices,
    collisionBounds,
    Math.max(0.025, Number(cellSize) || 0.05),
    maximumCollisionY,
    minimumCollisionY,
  );
  const objectCenter = object.getWorldPosition(new THREE.Vector3());
  let maximumRadius = 0;
  for (let cellZ = 0; cellZ < footprint.columnsZ; cellZ += 1) {
    for (let cellX = 0; cellX < footprint.columnsX; cellX += 1) {
      if (!footprint.occupied[cellZ * footprint.columnsX + cellX]) continue;
      const x = collisionBounds.min.x + (cellX + 0.5) * footprint.cellWidth;
      const z = collisionBounds.min.z + (cellZ + 0.5) * footprint.cellDepth;
      maximumRadius = Math.max(maximumRadius, Math.hypot(
        x - objectCenter.x,
        z - objectCenter.z,
      ));
    }
  }
  return {
    bounds: collisionBounds,
    containsGroundPoint: footprint.contains,
    occupied: footprint.occupied,
    columnsX: footprint.columnsX,
    columnsZ: footprint.columnsZ,
    maximumRadius,
  };
}

export function createColumnSurfaceProxy(modelGroup, {
  groundHeightAt = () => 0,
  cellSize = 0.11,
  maximumSamples = 120000,
  minimumColumnHeight = 0.035,
} = {}) {
  if (!modelGroup?.isObject3D) return null;
  modelGroup.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(modelGroup, true);
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  const requestedCellSize = Math.max(0.04, Number(cellSize) || 0.11);
  const columnsX = THREE.MathUtils.clamp(
    Math.ceil(size.x / requestedCellSize),
    MINIMUM_GRID_SIZE,
    MAXIMUM_GRID_SIZE,
  );
  const columnsZ = THREE.MathUtils.clamp(
    Math.ceil(size.z / requestedCellSize),
    MINIMUM_GRID_SIZE,
    MAXIMUM_GRID_SIZE,
  );
  const cellWidth = size.x / columnsX;
  const cellDepth = size.z / columnsZ;
  const cellCount = columnsX * columnsZ;
  const topHeights = new Float32Array(cellCount);
  topHeights.fill(-Infinity);

  let vertexCount = 0;
  modelGroup.traverse((object) => {
    if (object.isMesh && object.geometry?.attributes?.position) {
      vertexCount += object.geometry.attributes.position.count;
    }
  });
  if (vertexCount === 0) return null;
  const sampleStride = Math.max(
    1,
    Math.ceil(vertexCount / Math.max(1000, Number(maximumSamples) || 120000)),
  );
  const point = new THREE.Vector3();
  modelGroup.traverse((object) => {
    const position = object.isMesh ? object.geometry?.attributes?.position : null;
    if (!position) return;
    object.updateWorldMatrix(true, false);
    for (let index = 0; index < position.count; index += sampleStride) {
      point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      const cellX = clampCell(
        Math.floor((point.x - bounds.min.x) / Math.max(cellWidth, 0.0001)),
        columnsX,
      );
      const cellZ = clampCell(
        Math.floor((point.z - bounds.min.z) / Math.max(cellDepth, 0.0001)),
        columnsZ,
      );
      const cellIndex = cellZ * columnsX + cellX;
      topHeights[cellIndex] = Math.max(topHeights[cellIndex], point.y);
    }
  });

  const filledHeights = topHeights.slice();
  for (let cellZ = 0; cellZ < columnsZ; cellZ += 1) {
    for (let cellX = 0; cellX < columnsX; cellX += 1) {
      const cellIndex = cellZ * columnsX + cellX;
      if (Number.isFinite(topHeights[cellIndex])) continue;
      let neighborHeight = 0;
      let neighborCount = 0;
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetZ === 0) continue;
          const neighborX = cellX + offsetX;
          const neighborZ = cellZ + offsetZ;
          if (
            neighborX < 0
            || neighborX >= columnsX
            || neighborZ < 0
            || neighborZ >= columnsZ
          ) continue;
          const height = topHeights[neighborZ * columnsX + neighborX];
          if (!Number.isFinite(height)) continue;
          neighborHeight += height;
          neighborCount += 1;
        }
      }
      if (neighborCount >= 4) filledHeights[cellIndex] = neighborHeight / neighborCount;
    }
  }

  const columnData = [];
  const occupiedCells = new Uint8Array(cellCount);
  for (let cellZ = 0; cellZ < columnsZ; cellZ += 1) {
    for (let cellX = 0; cellX < columnsX; cellX += 1) {
      const cellIndex = cellZ * columnsX + cellX;
      const topY = filledHeights[cellIndex];
      if (!Number.isFinite(topY)) continue;
      const x = bounds.min.x + (cellX + 0.5) * cellWidth;
      const z = bounds.min.z + (cellZ + 0.5) * cellDepth;
      const bottomY = Number(groundHeightAt(x, z)) || 0;
      const height = topY - bottomY;
      if (height < minimumColumnHeight) continue;
      occupiedCells[cellIndex] = 1;
      columnData.push({ x, z, bottomY, height });
    }
  }
  if (columnData.length === 0) return null;
  const hullPoints = [];
  for (let cellZ = 0; cellZ < columnsZ; cellZ += 1) {
    for (let cellX = 0; cellX < columnsX; cellX += 1) {
      if (!occupiedCells[cellZ * columnsX + cellX]) continue;
      const minimumX = bounds.min.x + cellX * cellWidth;
      const maximumX = minimumX + cellWidth;
      const minimumZ = bounds.min.z + cellZ * cellDepth;
      const maximumZ = minimumZ + cellDepth;
      hullPoints.push(
        { x: minimumX, z: minimumZ },
        { x: maximumX, z: minimumZ },
        { x: maximumX, z: maximumZ },
        { x: minimumX, z: maximumZ },
      );
    }
  }
  const footprintHull = createConvexHull(hullPoints);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const columns = new THREE.InstancedMesh(geometry, material, columnData.length);
  const dummy = new THREE.Object3D();
  columnData.forEach((column, index) => {
    dummy.position.set(column.x, column.bottomY + column.height * 0.5, column.z);
    dummy.scale.set(cellWidth * 1.04, column.height, cellDepth * 1.04);
    dummy.updateMatrix();
    columns.setMatrixAt(index, dummy.matrix);
  });
  columns.instanceMatrix.needsUpdate = true;
  columns.frustumCulled = false;
  columns.name = 'Reader climb proxy columns';

  const proxy = new THREE.Group();
  proxy.name = 'Reader climb surface proxy';
  proxy.add(columns);
  proxy.userData.containsGroundPoint = (x, z, padding = 0) => {
    const safePadding = Math.max(0, Number(padding) || 0);
    if (
      x + safePadding < bounds.min.x
      || x - safePadding > bounds.max.x
      || z + safePadding < bounds.min.z
      || z - safePadding > bounds.max.z
    ) return false;
    return containsHullPoint(footprintHull, x, z, safePadding);
  };
  proxy.userData.dispose = () => {
    geometry.dispose();
    material.dispose();
  };
  proxy.userData.sampledVertexCount = Math.ceil(vertexCount / sampleStride);
  proxy.userData.columnCount = columnData.length;
  proxy.userData.footprintHull = footprintHull;
  return proxy;
}

export function createTriangleSurfaceProxy(modelGroup, {
  cellSize = 0.06,
  minimumTriangleArea = 0.000001,
  groundCollisionHeight = 0.3,
} = {}) {
  if (!modelGroup?.isObject3D) return null;
  modelGroup.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(modelGroup, true);
  if (bounds.isEmpty()) return null;
  const safeCellSize = Math.max(0.015, Number(cellSize) || 0.06);
  const clusterLookup = new Map();
  const clusters = [];
  const meshRecords = [];
  const point = new THREE.Vector3();

  modelGroup.traverse((object) => {
    const geometry = object.isMesh ? object.geometry : null;
    const position = geometry?.attributes?.position;
    if (!position) return;
    object.updateWorldMatrix(true, false);
    const vertexClusters = new Uint32Array(position.count);
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      const cellX = Math.floor((point.x - bounds.min.x) / safeCellSize);
      const cellY = Math.floor((point.y - bounds.min.y) / safeCellSize);
      const cellZ = Math.floor((point.z - bounds.min.z) / safeCellSize);
      const key = `${cellX},${cellY},${cellZ}`;
      let clusterIndex = clusterLookup.get(key);
      if (clusterIndex === undefined) {
        clusterIndex = clusters.length;
        clusterLookup.set(key, clusterIndex);
        clusters.push({ x: 0, y: 0, z: 0, count: 0 });
      }
      const cluster = clusters[clusterIndex];
      cluster.x += point.x;
      cluster.y += point.y;
      cluster.z += point.z;
      cluster.count += 1;
      vertexClusters[index] = clusterIndex;
    }
    meshRecords.push({ geometry, vertexClusters });
  });
  if (clusters.length < 3 || meshRecords.length === 0) return null;

  const proxyPositions = new Float32Array(clusters.length * 3);
  const footprintPoints = [];
  clusters.forEach((cluster, index) => {
    const divisor = Math.max(1, cluster.count);
    const x = cluster.x / divisor;
    const y = cluster.y / divisor;
    const z = cluster.z / divisor;
    proxyPositions[index * 3] = x;
    proxyPositions[index * 3 + 1] = y;
    proxyPositions[index * 3 + 2] = z;
    footprintPoints.push({ x, z });
  });

  const proxyIndices = [];
  const triangleLookup = new Set();
  const minimumAreaSquared = Math.max(0, Number(minimumTriangleArea) || 0.000001) ** 2;
  const triangleAreaSquared = (first, second, third) => {
    const firstOffset = first * 3;
    const secondOffset = second * 3;
    const thirdOffset = third * 3;
    const abX = proxyPositions[secondOffset] - proxyPositions[firstOffset];
    const abY = proxyPositions[secondOffset + 1] - proxyPositions[firstOffset + 1];
    const abZ = proxyPositions[secondOffset + 2] - proxyPositions[firstOffset + 2];
    const acX = proxyPositions[thirdOffset] - proxyPositions[firstOffset];
    const acY = proxyPositions[thirdOffset + 1] - proxyPositions[firstOffset + 1];
    const acZ = proxyPositions[thirdOffset + 2] - proxyPositions[firstOffset + 2];
    const crossX = abY * acZ - abZ * acY;
    const crossY = abZ * acX - abX * acZ;
    const crossZ = abX * acY - abY * acX;
    return crossX * crossX + crossY * crossY + crossZ * crossZ;
  };
  const addTriangle = (first, second, third) => {
    if (first === second || second === third || third === first) return;
    const minimum = Math.min(first, second, third);
    const maximum = Math.max(first, second, third);
    const middle = first + second + third - minimum - maximum;
    const key = `${minimum},${middle},${maximum}`;
    if (triangleLookup.has(key)) return;
    if (triangleAreaSquared(first, second, third) <= minimumAreaSquared) return;
    triangleLookup.add(key);
    proxyIndices.push(first, second, third);
  };

  meshRecords.forEach(({ geometry, vertexClusters }) => {
    const sourceIndex = geometry.index;
    const indexCount = sourceIndex?.count ?? geometry.attributes.position.count;
    for (let index = 0; index + 2 < indexCount; index += 3) {
      const first = vertexClusters[sourceIndex ? sourceIndex.getX(index) : index];
      const second = vertexClusters[sourceIndex ? sourceIndex.getX(index + 1) : index + 1];
      const third = vertexClusters[sourceIndex ? sourceIndex.getX(index + 2) : index + 2];
      addTriangle(first, second, third);
    }
  });
  if (proxyIndices.length < 3) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(proxyPositions, 3));
  geometry.setIndex(proxyIndices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Reader simplified triangle climb surface';
  mesh.frustumCulled = false;

  const footprintHull = createConvexHull(footprintPoints);
  const projectedFootprint = createProjectedTriangleFootprint(
    proxyPositions,
    proxyIndices,
    bounds,
    safeCellSize,
    bounds.min.y + Math.max(0.08, Number(groundCollisionHeight) || 0.3),
  );
  const proxy = new THREE.Group();
  proxy.name = 'Reader triangle surface proxy';
  proxy.add(mesh);
  proxy.userData.containsGroundPoint = projectedFootprint.contains;
  proxy.userData.dispose = () => {
    geometry.dispose();
    material.dispose();
  };
  proxy.userData.vertexCount = clusters.length;
  proxy.userData.triangleCount = proxyIndices.length / 3;
  proxy.userData.footprintHull = footprintHull;
  proxy.userData.projectedFootprint = projectedFootprint;
  proxy.userData.cellSize = safeCellSize;
  return proxy;
}
