import { resolveAssetUrl } from '../utils/asset-url.js';

export const AMBIENCE_CONFIG = Object.freeze({
  tracks: Object.freeze({
    forest: Object.freeze({
      url: resolveAssetUrl('./assets/audio/ambience/day-forest.mp3', '../../assets/audio/ambience/day-forest.mp3', import.meta.url),
      condition: 'day',
      volume: 1,
      fadeSeconds: 4,
    }),
    night: Object.freeze({
      url: resolveAssetUrl('./assets/audio/ambience/late-night-sound.opus', '../../assets/audio/ambience/late-night-sound.opus', import.meta.url),
      condition: 'night',
      volume: 0.2,
      fadeSeconds: 4,
    }),
    thunder: Object.freeze({
      url: resolveAssetUrl('./assets/audio/ambience/rolling-thunder.mp3', '../../assets/audio/ambience/rolling-thunder.mp3', import.meta.url),
      condition: 'rain',
      volume: 0.2,
      fadeSeconds: 3,
    }),
  }),
});
