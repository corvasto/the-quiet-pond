export class FpsSampler {
  constructor({ sampleSeconds = 0.75, warningFps = 30, recoveryMargin = 2 } = {}) {
    this.sampleSeconds = Math.max(0.25, Number(sampleSeconds) || 0.75);
    this.warningFps = Math.max(1, Number(warningFps) || 30);
    this.recoveryFps = this.warningFps + Math.max(0, Number(recoveryMargin) || 0);
    this.sample = { fps: 0, low: false };
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.low = false;
  }

  update(delta) {
    const seconds = Number(delta);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.5) {
      this.elapsed = 0;
      this.frames = 0;
      return null;
    }

    this.elapsed += seconds;
    this.frames += 1;
    if (this.elapsed < this.sampleSeconds) return null;

    const preciseFps = this.frames / this.elapsed;
    const fps = Math.max(0, Math.round(preciseFps));
    this.low = this.low
      ? preciseFps < this.recoveryFps
      : preciseFps < this.warningFps;
    this.elapsed = 0;
    this.frames = 0;
    this.sample.fps = fps;
    this.sample.low = this.low;
    return this.sample;
  }
}
