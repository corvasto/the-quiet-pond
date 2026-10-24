import { TIME_OF_DAY } from '../config/scene.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value, minimum, maximum) {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const amount = clamp01((value - minimum) / (maximum - minimum));
  return amount * amount * (3 - 2 * amount);
}

export function normalizeDayHour(hour, fallbackHour = TIME_OF_DAY.fallbackHour) {
  const numericHour = Number(hour);
  const safeHour = Number.isFinite(numericHour) ? numericHour : fallbackHour;
  return ((safeHour % 24) + 24) % 24;
}

export function getNightAmount(
  hour,
  duskStartHour = TIME_OF_DAY.duskStartHour,
  duskEndHour = TIME_OF_DAY.duskEndHour,
  dawnStartHour = TIME_OF_DAY.dawnStartHour,
  dawnEndHour = TIME_OF_DAY.dawnEndHour,
) {
  const normalizedHour = normalizeDayHour(hour);
  const beforeDawn = 1 - smoothstep(normalizedHour, dawnStartHour, dawnEndHour);
  const afterDusk = smoothstep(normalizedHour, duskStartHour, duskEndHour);
  return Math.max(beforeDawn, afterDusk);
}
