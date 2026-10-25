const CACHE_PREFIX = 'the-quiet-pond-v';
const RELEASE_VERSION = '1.0.0';
const REQUESTED_VERSION = new URL(self.location.href).searchParams.get('v');
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_VERSION}`;
if (REQUESTED_VERSION && REQUESTED_VERSION !== RELEASE_VERSION) {
  console.info(`[the-quiet-pond] Updating ${REQUESTED_VERSION} to ${RELEASE_VERSION}.`);
}
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './icon.png',
  './styles/game.css',
  './assets/fonts/Patrick_Hand/PatrickHand-Regular.ttf',
  './assets/fonts/Indie_Flower/IndieFlower-Regular.ttf',
  './assets/fonts/fraunces.woff',
  './assets/images/ui/ant-loading.webm',
  './js/main.js',
  './js/ui/localization.js',
  './js/config/index.js',
  './js/config/app.js',
  './js/config/quality.js',
  './js/config/scene.js',
  './js/content/assets.js',
  './js/content/messages.js',
  './js/content/objectives.js',
  './js/config/game.js',
  './js/config/climbing.js',
  './js/config/content.js',
  './js/config/radio.js',
  './js/config/ambience.js',
  './js/config/bird.js',
  './js/config/world.js',
  './js/game/game-session.js',
  './js/game/game-objectives.js',
  './js/game/world-speech.js',
  './js/game/objective-chime.js',
  './js/game/ant-climbing.js',
  './js/game/seed-to-burrow.js',
  './js/game/radio-audio.js',
  './js/game/ambience-audio.js',
  './js/game/bird-flight.js',
  './js/core/app.js',
  './js/core/app-actor-animation.js',
  './js/core/app-ant-navigation.js',
  './js/core/app-camera.js',
  './js/core/app-interactions.js',
  './js/core/app-prop-placement.js',
  './js/core/app-wanderers.js',
  './js/core/app-world-query.js',
  './js/core/ant-locator.js',
  './js/core/flight-collision.js',
  './js/core/environment.js',
  './js/core/fireflies.js',
  './js/core/moths.js',
  './js/core/rain.js',
  './js/generators/ground.js',
  './js/generators/forest.js',
  './js/generators/bushes.js',
  './js/generators/rocks.js',
  './js/generators/pond.js',
  './js/generators/tree.js',
  './js/props/model-surface-proxy.js',
  './js/props/model-animation.js',
  './js/props/model-prop.js',
  './js/props/model-placement.js',
  './js/utils/random.js',
  './js/utils/asset-url.js',
  './js/utils/noise.js',
  './js/utils/time-of-day.js',
  './js/utils/player-motion.js',
  './js/utils/flight-motion.js',
  './js/utils/fps-diagnostic.js',
  './vendor/three/build/three.module.js',
  './vendor/three/build/three.core.js',
  './vendor/three/examples/jsm/controls/OrbitControls.js',
  './vendor/three/examples/jsm/utils/SkeletonUtils.js',
  './vendor/three/examples/jsm/loaders/GLTFLoader.js',
  './vendor/three/examples/jsm/objects/Sky.js',
  './vendor/three/examples/jsm/objects/Water.js',
  './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js',
  './vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  './assets/models/an_animated_cat.glb',
  './assets/models/ant.glb',
  './assets/models/bird_fly.glb',
  './assets/models/common_frog.glb',
  './assets/models/cockroach.glb',
  './assets/models/generic_narcissus_flower.glb',
  './assets/models/lollipop.glb',
  './assets/models/old_radio.glb',
  './assets/models/purple_flower.glb',
  './assets/models/quiet_reading.glb',
  './assets/models/street_light_lamp.glb',
  './assets/models/tent.glb',
  './assets/audio/radio/radio-music-bright-morning-and-noon.mp3',
  './assets/audio/radio/radio-music-night-sleep-or-raining.mp3',
  './assets/audio/radio/radio-static.mp3',
  './assets/audio/ambience/late-night-sound.opus',
  './assets/audio/ambience/rolling-thunder.mp3',
  './assets/audio/ambience/day-forest.mp3',
  './assets/audio/radio/en/radio-closing-message.wav',
  './assets/audio/radio/en/radio-dusk-message.wav',
  './assets/audio/radio/en/radio-morning-message.wav',
  './assets/audio/radio/en/radio-pond-clue.wav',
  './assets/audio/radio/en/radio-rain-variant.wav',
  './assets/audio/radio/en/radio-rain-warning.wav',
  './assets/audio/radio/en/radio-seed-clue.wav',
  './assets/audio/radio/en/radio-station-introduction.wav',
  './assets/audio/radio/id/radio-closing-message.wav',
  './assets/audio/radio/id/radio-dusk-message.wav',
  './assets/audio/radio/id/radio-morning-message.wav',
  './assets/audio/radio/id/radio-pond-clue.wav',
  './assets/audio/radio/id/radio-rain-variant.wav',
  './assets/audio/radio/id/radio-rain-warning.wav',
  './assets/audio/radio/id/radio-seed-clue.wav',
  './assets/audio/radio/id/radio-station-introduction.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.href.startsWith(scopeUrl.href)) return;
  if (event.request.mode === 'navigate') {
    const relativePath = requestUrl.pathname.slice(scopeUrl.pathname.length);
    if (!['', 'index.html'].includes(relativePath)) return;
  }
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const copy = response.clone();
        event.waitUntil(cache.put(event.request, copy));
        return response;
      }).catch(() => (
        event.request.mode === 'navigate'
          ? cache.match('./index.html')
          : Response.error()
      ));
    }),
  );
});
