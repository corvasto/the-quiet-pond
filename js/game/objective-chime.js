export class ObjectiveChime {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.completedIds = new Set();
    this.initialized = false;
  }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
    }
    this.context.resume?.();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  update(checklist) {
    const tasks = checklist?.tasks ?? [];
    const completeIds = new Set(tasks.filter((task) => task.complete).map((task) => task.id));
    if (this.initialized && this.enabled) {
      completeIds.forEach((id) => {
        if (!this.completedIds.has(id)) this.play();
      });
    }
    this.completedIds = completeIds;
    this.initialized = true;
  }

  play() {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    [659.25, 783.99].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.11);
      gain.gain.setValueAtTime(0.0001, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.11 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.72);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.75);
    });
  }

  playCelebration() {
    if (!this.context || this.context.state !== 'running' || !this.enabled) return;
    const now = this.context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = now + index * 0.13;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.035, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.82);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.85);
    });
  }

  dispose() {
    this.context?.close?.();
    this.context = null;
  }
}
