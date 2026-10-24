function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

export class SeededRandom {
  constructor(seed = 'seed') {
    this.seed = String(seed);
    this.state = hashString(this.seed) || 0x6d2b79f5;
  }

  float() {
    let value = this.state += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    const result = ((value ^ value >>> 14) >>> 0) / 4294967296;
    this.state >>>= 0;
    return result;
  }

  range(min, max) {
    return min + (max - min) * this.float();
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  chance(probability) {
    return this.float() < probability;
  }

  pick(items) {
    return items[Math.min(items.length - 1, Math.floor(this.float() * items.length))];
  }

  signed(magnitude = 1) {
    return this.range(-magnitude, magnitude);
  }

  fork(label) {
    return new SeededRandom(`${this.seed}:${label}:${this.state}`);
  }
}

export { hashString };
