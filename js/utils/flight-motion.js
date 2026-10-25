import { resolveMovementAxes } from './player-motion.js';

const TAU = Math.PI * 2;

export function stepFlightMotion(state, input, cameraForward, config, delta, displacement) {
  const axes = resolveMovementAxes(
    state.axes,
    Number(input.keys.has('right')) - Number(input.keys.has('left')),
    Number(input.keys.has('forward')) - Number(input.keys.has('backward')),
    input.x, input.y, config.analogDeadzone,
  );
  const cameraYaw = Math.atan2(cameraForward.x, cameraForward.z);
  const directionX = Math.sin(cameraYaw) * axes.y - Math.cos(cameraYaw) * axes.x;
  const directionZ = Math.cos(cameraYaw) * axes.y + Math.sin(cameraYaw) * axes.x;
  let turn = 0;
  if (axes.magnitude > 0) {
    const desiredYaw = Math.atan2(directionX, directionZ);
    const difference = Math.atan2(Math.sin(desiredYaw - state.yaw), Math.cos(desiredYaw - state.yaw));
    const maximumTurn = config.maximumTurnRate * delta;
    turn = Math.max(-maximumTurn, Math.min(maximumTurn,
      difference * (1 - Math.exp(-config.turnResponsiveness * delta))));
    state.yaw = (state.yaw + turn) % TAU;
  }
  const targetSpeed = config.speed * axes.magnitude;
  state.speed += (targetSpeed - state.speed)
    * (1 - Math.exp(-(targetSpeed > state.speed ? config.acceleration : config.braking) * delta));
  if (targetSpeed === 0 && state.speed < 0.0001) state.speed = 0;
  const cameraPitch = Math.atan2(cameraForward.y, Math.hypot(cameraForward.x, cameraForward.z));
  const neutralPitch = -Math.atan2(config.camera.height, config.camera.distance);
  const tilt = Math.sin(Math.max(-1.1, Math.min(1.1, cameraPitch - neutralPitch)));
  const verticalKeys = Number(input.keys.has('up')) - Number(input.keys.has('down'));
  const climb = verticalKeys || tilt * axes.y;
  state.verticalSpeed += (climb * config.climbSpeed - state.verticalSpeed)
    * (1 - Math.exp(-config.acceleration * delta));
  if (climb === 0 && Math.abs(state.verticalSpeed) < 0.0001) state.verticalSpeed = 0;
  state.bank += (-turn / Math.max(delta * config.maximumTurnRate, 1e-6) * config.bankAngle - state.bank)
    * (1 - Math.exp(-7 * delta));
  state.pitch += (-Math.atan2(state.verticalSpeed, Math.max(state.speed, 1)) * 0.5 - state.pitch)
    * (1 - Math.exp(-6 * delta));
  return displacement.set(
    Math.sin(state.yaw) * state.speed * delta,
    state.verticalSpeed * delta,
    Math.cos(state.yaw) * state.speed * delta,
  );
}
