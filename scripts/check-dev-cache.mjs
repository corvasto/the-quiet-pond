import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const source = main.slice(main.indexOf('async function registerGameServiceWorker()'), main.indexOf('\nfunction applyLanguage()'));
for (const hostname of ['127.0.0.1', 'localhost', '[::1]', 'pond.example']) {
  const local = hostname !== 'pond.example', calls = [];
  const origin = `http://${hostname}:3000`;
  const own = { scope: `${origin}/`, active: { scriptURL: `${origin}/service-worker.js?v=old` },
    unregister: async () => calls.push('unregister') };
  const other = { scope: `${origin}/other/`, active: { scriptURL: `${origin}/other/service-worker.js` },
    unregister: async () => calls.push('other') };
  const context = vm.createContext({ URL, APP_VERSION: '1.2.6', console,
    navigator: { serviceWorker: { controller: own.active, getRegistrations: async () => [own, other],
      register: async () => calls.push('register') } },
    window: { location: { hostname, href: `${origin}/index.html`, reload: () => calls.push('reload') },
      caches: { keys: async () => ['the-quiet-pond-v1.2.5', 'other-app-v1'], delete: async (key) => calls.push(key) } },
  });
  await vm.runInContext(`${source}\nregisterGameServiceWorker()`, context);
  assert.deepEqual(calls, local ? ['unregister', 'the-quiet-pond-v1.2.5', 'reload'] : ['register']);
}
console.log('Dev cache checks passed: loopback bypass, scoped worker removal, isolated cache cleanup, reload, and published registration.');
