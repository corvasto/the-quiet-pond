export function clampMovementAxis(value) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

export function clampMotionDelta(delta) {
  return Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
}

// Keyboard input takes precedence while a direction is held. Analog input uses
// a radial deadzone, preserving small, deliberate movements beyond its edge.
export function resolveMovementAxes(target, horizontal, forward, analogX, analogY, deadzone = 0.12) {
  const keyboardActive = horizontal !== 0 || forward !== 0;
  let x = clampMovementAxis(keyboardActive ? horizontal : analogX);
  let y = clampMovementAxis(keyboardActive ? forward : analogY);
  const length = Math.hypot(x, y);
  let magnitude = Math.min(1, length);
  if (!keyboardActive) {
    const threshold = Number.isFinite(deadzone) ? Math.max(0, Math.min(deadzone, 0.5)) : 0.12;
    magnitude = magnitude <= threshold ? 0 : (magnitude - threshold) / (1 - threshold);
  }
  if (length > 0) {
    x *= magnitude / length;
    y *= magnitude / length;
  }
  target.x = x;
  target.y = y;
  target.magnitude = magnitude;
  return target;
}

// Integrate the exponential response analytically so constant input covers the
// same distance at different frame rates. Facing rotation never steers travel.
export function stepPlanarMotion(velocity, displacement, targetX, targetZ, acceleration, braking, delta) {
  const dt = clampMotionDelta(delta);
  const slowing = targetX * targetX + targetZ * targetZ < velocity.x * velocity.x + velocity.z * velocity.z
    || targetX * velocity.x + targetZ * velocity.z < 0;
  const response = Math.max(0.001, slowing ? braking : acceleration);
  const decay = Math.exp(-response * dt);
  const integral = (1 - decay) / response;
  displacement.x = targetX * dt + (velocity.x - targetX) * integral;
  displacement.z = targetZ * dt + (velocity.z - targetZ) * integral;
  velocity.x = targetX + (velocity.x - targetX) * decay;
  velocity.z = targetZ + (velocity.z - targetZ) * decay;
  if (targetX === 0 && targetZ === 0 && Math.hypot(velocity.x, velocity.z) < 0.0001) {
    velocity.x = 0;
    velocity.z = 0;
  }
  return displacement;
}
