import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/config/app.js';

const activeCache = `the-quiet-pond-v${APP_VERSION}`;

const source = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const gameHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(gameHtml.includes('src="./js/main.js"'));
assert.ok(!gameHtml.includes('location.replace'));
for (const scope of ['https://example.test/', 'https://example.test/the-quiet-pond/']) {
  const listeners = {};
  const cached = new Map();
  const deleted = [];
  const opened = [];
  let installed = [];
  let online = false;
  let claimed = false;
  let skipped = false;
  const cache = {
    async addAll(entries) {
      installed = Array.from(entries);
      for (const entry of entries) {
        assert.ok(fs.existsSync(fileURLToPath(new URL('../' + entry, import.meta.url))), entry);
        cached.set(new URL(entry, scope).href, { kind: entry });
      }
    },
    async match(request) { return cached.get(typeof request === 'string' ? new URL(request, scope).href : request.url); },
    async put(request, response) { cached.set(request.url, response); },
  };
  const environment = {
    URL, console,
    Response: { error() { return { kind: 'network-error' }; } },
    self: {
      location: new URL(`service-worker.js?v=${APP_VERSION}`, scope),
      registration: { scope },
      addEventListener(name, callback) { listeners[name] = callback; },
      async skipWaiting() { skipped = true; },
      clients: { async claim() { claimed = true; } },
    },
    caches: {
      async open(name) { opened.push(name); return cache; },
      async keys() { return ['the-quiet-pond-v0.9.0', 'unrelated-app-v1.2.7', activeCache, 'another-app']; },
      async delete(name) { deleted.push(name); },
      async match() { throw new Error('Cache reads must use the active app release.'); },
    },
    async fetch() {
      if (!online) throw new Error('offline');
      return { status: 200, type: 'basic', clone() { return { kind: 'downloaded' }; } };
    },
  };
  vm.runInNewContext(source, environment);
  async function lifecycle(name) {
    const pending = [];
    listeners[name]({ waitUntil(promise) { pending.push(promise); } });
    await Promise.all(pending);
  }
  await lifecycle('install');
  assert.ok(skipped);
  for (const entry of ['./index.html', './js/utils/player-motion.js']) assert.ok(installed.includes(entry));
  await lifecycle('activate');
  assert.ok(claimed);
  assert.deepEqual(deleted, ['the-quiet-pond-v0.9.0']);
  async function request(relative, mode = 'navigate', method = 'GET') {
    let response;
    const pending = [];
    listeners.fetch({
      request: { url: new URL(relative, scope).href, mode, method },
      respondWith(promise) { response = promise; },
      waitUntil(promise) { pending.push(promise); },
    });
    const value = await response;
    await Promise.all(pending);
    return value;
  }
  for (const entry of ['', '?q=mid', 'index.html?q=low', 'index.html?q=full', 'index.html?debug=1', 'index.html?q=mid&debug=1']) {
    assert.equal((await request(entry)).kind, './index.html', entry);
  }
  assert.equal((await request('index.html')).kind, './index.html');
  for (const entry of ['game.html', 'other.html', 'nested/index.html', 'https://other.test/game.html', 'https://example.test.evil/game.html']) {
    assert.equal(await request(entry), undefined, entry);
  }
  assert.equal(await request('game.html', 'navigate', 'POST'), undefined);
  if (scope.endsWith('/the-quiet-pond/')) assert.equal(await request('/sibling/asset.js', 'cors'), undefined);
  assert.equal((await request('missing.js', 'cors')).kind, 'network-error');
  online = true;
  assert.equal((await request('new.js', 'cors')).status, 200);
  online = false;
  assert.equal((await request('new.js', 'cors')).kind, 'downloaded');
  assert.ok(opened.every(name => name === activeCache));
}
console.log('Offline shell checks passed: local payload, root/subfolder routing, query fallback, isolated caches, activation, and network handling.');
