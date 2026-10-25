import * as THREE from 'three';

const LEAF_PRIMITIVE_COUNT = 12;
const BVH_YIELD_PRIMITIVE_COUNT = 4096;
const BRANCH_SURFACE_PADDING = 0.006;
const point = new THREE.Vector3();
const instanceMatrix = new THREE.Matrix4();
const worldMatrix = new THREE.Matrix4();

function squaredDistanceToBox(position, bounds) {
  const x = Math.max(bounds.min.x - position.x, 0, position.x - bounds.max.x);
  const y = Math.max(bounds.min.y - position.y, 0, position.y - bounds.max.y);
  const z = Math.max(bounds.min.z - position.z, 0, position.z - bounds.max.z);
  return x * x + y * y + z * z;
}

async function buildNode(primitives) {
  const bounds = new THREE.Box3().makeEmpty();
  const centers = new THREE.Box3().makeEmpty();
  for (const record of primitives) {
    bounds.union(record.bounds);
    centers.expandByPoint(record.center);
  }
  if (primitives.length <= LEAF_PRIMITIVE_COUNT) return { bounds, primitives };
  const size = centers.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  primitives.sort((left, right) => left.center[axis] - right.center[axis]);
  const middle = Math.floor(primitives.length / 2);
  if (primitives.length >= BVH_YIELD_PRIMITIVE_COUNT) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return {
    bounds,
    left: await buildNode(primitives.slice(0, middle)),
    right: await buildNode(primitives.slice(middle)),
  };
}

// Extract once, then query nearby BVH leaves without scene traversal or raycasts.
export class FlightCollisionWorld {
  constructor() {
    this.primitives = [];
    this.root = null;
    this.stack = [];
    this.closest = new THREE.Vector3();
  }

  addBranches(source, branches) {
    source.updateWorldMatrix(true, false);
    const scale = source.getWorldScale(new THREE.Vector3());
    const maximumScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    for (const branch of branches) {
      for (let index = 1; index < branch.points.length; index += 1) {
        this.addBranchSegment(source, branch.points[index - 1], branch.points[index],
          branch.radii[index - 1], branch.radii[index], maximumScale);
      }
      // Junction collars have their own local volume, rather than widening the entire branch.
      const collar = branch.collisionCollar;
      if (collar) {
        this.addBranchSegment(source,
          collar.center.clone().addScaledVector(collar.direction, -collar.halfLength),
          collar.center.clone().addScaledVector(collar.direction, collar.halfLength),
          collar.radius, collar.radius, maximumScale);
      }
    }
  }

  addBranchSegment(source, start, end, startRadius, endRadius, scale) {
    const segment = new THREE.Line3(
      start.clone().applyMatrix4(source.matrixWorld),
      end.clone().applyMatrix4(source.matrixWorld),
    );
    const radiusStart = (startRadius + BRANCH_SURFACE_PADDING) * scale;
    const radiusEnd = (endRadius + BRANCH_SURFACE_PADDING) * scale;
    const radius = Math.max(radiusStart, radiusEnd);
    const length = segment.distance();
    const radiusDelta = radiusEnd - radiusStart;
    const taperFactor = length > Math.abs(radiusDelta)
      ? radiusDelta / (length * Math.sqrt(length * length - radiusDelta * radiusDelta))
      : Infinity;
    const bounds = new THREE.Box3().setFromPoints([segment.start, segment.end]).expandByScalar(radius);
    this.primitives.push({
      segment, radiusStart, radiusEnd, radiusDelta, taperFactor,
      bounds, source, center: bounds.getCenter(new THREE.Vector3()),
    });
  }

  addObject(source) {
    if (!source) return;
    source.updateWorldMatrix(true, true);
    source.traverse((mesh) => {
      const geometry = mesh.isMesh ? mesh.geometry : null;
      if (!geometry?.attributes.position) return;
      mesh.skeleton?.update();
      const indices = geometry.index;
      const count = indices?.count ?? geometry.attributes.position.count;
      const instances = mesh.isInstancedMesh ? mesh.count : 1;
      for (let instance = 0; instance < instances; instance += 1) {
        worldMatrix.copy(mesh.matrixWorld);
        if (mesh.isInstancedMesh) {
          mesh.getMatrixAt(instance, instanceMatrix);
          worldMatrix.multiply(instanceMatrix);
        }
        for (let index = 0; index + 2 < count; index += 3) {
          const triangle = new THREE.Triangle();
          for (let corner = 0; corner < 3; corner += 1) {
            const vertex = indices ? indices.getX(index + corner) : index + corner;
            mesh.getVertexPosition(vertex, point).applyMatrix4(worldMatrix);
            (corner === 0 ? triangle.a : corner === 1 ? triangle.b : triangle.c).copy(point);
          }
          if (triangle.getArea() < 1e-10) continue;
          const bounds = new THREE.Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
          this.primitives.push({
            triangle, bounds, source, center: bounds.getCenter(new THREE.Vector3()),
          });
        }
      }
    });
  }

  async build() {
    this.root = this.primitives.length ? await buildNode(this.primitives) : null;
    this.primitives = [];
  }

  intersectsSphere(position, radius) {
    if (!this.root) return false;
    const squaredRadius = radius * radius;
    const stack = this.stack;
    stack.length = 0;
    stack.push(this.root);
    while (stack.length) {
      const node = stack.pop();
      if (squaredDistanceToBox(position, node.bounds) > squaredRadius) continue;
      if (node.primitives) {
        for (const record of node.primitives) {
          if (!record.source.parent || !record.source.visible) continue;
          if (squaredDistanceToBox(position, record.bounds) > squaredRadius) continue;
          if (record.segment) {
            let amount;
            if (record.radiusDelta === 0) {
              amount = record.segment.closestPointToPointParameter(position, true);
            } else if (Number.isFinite(record.taperFactor)) {
              const projected = record.segment.closestPointToPointParameter(position, false);
              record.segment.at(projected, this.closest);
              const perpendicular = position.distanceTo(this.closest);
              amount = THREE.MathUtils.clamp(projected + perpendicular * record.taperFactor, 0, 1);
            } else amount = record.radiusDelta >= 0 ? 1 : 0;
            record.segment.at(amount, this.closest);
            const branchRadius = record.radiusStart + record.radiusDelta * amount;
            if (position.distanceToSquared(this.closest) <= (radius + branchRadius) ** 2) return true;
          } else {
            record.triangle.closestPointToPoint(position, this.closest);
            if (position.distanceToSquared(this.closest) <= squaredRadius) return true;
          }
        }
      } else {
        stack.push(node.left, node.right);
      }
    }
    return false;
  }

  dispose() {
    this.root = null;
    this.primitives.length = 0;
    this.stack.length = 0;
  }
}

export function sphereIntersectsBox(position, radius, bounds) {
  return bounds && !bounds.isEmpty() && squaredDistanceToBox(position, bounds) <= radius * radius;
}

// Test the whole path in sphere-sized increments so a thin obstacle cannot be skipped.
export function moveFlightSphere(position, displacement, radius, resolveCandidate, candidate) {
  if (displacement.lengthSq() < 1e-12) return position;
  const steps = Math.max(1, Math.ceil(displacement.length() / (radius * 0.4)));
  const x = displacement.x / steps;
  const y = displacement.y / steps;
  const z = displacement.z / steps;
  for (let step = 0; step < steps; step += 1) {
    candidate.copy(position).addScaledVector(displacement, 1 / steps);
    // The resolver can follow terrain clearance before testing solid collisions.
    if (resolveCandidate(candidate)) {
      position.copy(candidate);
      continue;
    }
    // Keep tangential movement while rejecting each blocked component.
    for (let axis = 0; axis < 3; axis += 1) {
      candidate.copy(position);
      if (axis === 0) candidate.x += x;
      else if (axis === 1) candidate.y += y;
      else candidate.z += z;
      if (resolveCandidate(candidate)) position.copy(candidate);
    }
  }
  return position;
}
