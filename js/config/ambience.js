export const AMBIENCE_CONFIG = Object.freeze({
  tracks: Object.freeze({
    forest: Object.freeze({
      url: new URL('../../assets/audio/ambience/day-forest.mp3', import.meta.url).href,
      condition: 'day',
      volume: 1,
      fadeSeconds: 4,
    }),
    night: Object.freeze({
      url: new URL('../../assets/audio/ambience/late-night-sound.opus', import.meta.url).href,
      condition: 'night',
      volume: 0.2,
      fadeSeconds: 4,
    }),
    thunder: Object.freeze({
      url: new URL('../../assets/audio/ambience/rolling-thunder.mp3', import.meta.url).href,
      condition: 'rain',
      volume: 0.2,
      fadeSeconds: 3,
    }),
  }),
});
