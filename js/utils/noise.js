import { hashString } from './random.js';

const smooth = (value) => value * value * (3 - 2 * value);
const mix = (start, end, amount) => start + (end - start) * amount;

function lattice(x, y, seed) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967295;
}

export function createNoise2D(seed = 'terrain') {
  const seedValue = hashString(seed);

  function valueNoise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const a = lattice(x0, y0, seedValue);
    const b = lattice(x0 + 1, y0, seedValue);
    const c = lattice(x0, y0 + 1, seedValue);
    const d = lattice(x0 + 1, y0 + 1, seedValue);
    return mix(mix(a, b, tx), mix(c, d, tx), ty) * 2 - 1;
  }

  return function fbm(x, y, octaves = 4) {
    let value = 0;
    let amplitude = 0.55;
    let frequency = 1;
    let normalization = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      value += valueNoise(x * frequency, y * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return value / normalization;
  };
}
