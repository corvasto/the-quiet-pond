import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.join(projectRoot, 'build', 'release');
const read = (relativePath) => fs.readFileSync(path.join(releaseRoot, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(releaseRoot, relativePath));

const html = read('index.html');
const script = read('js/main.js');
const css = read('styles/game.css');
const serviceWorker = read('service-worker.js');
assert.ok(!html.includes('type="importmap"'), 'Release HTML should not need an import map.');
assert.ok(html.includes('src="./js/main.js"'), 'Release HTML should load the bundled app.');
assert.ok(script.length > 100_000, 'Bundled app should include the game runtime.');
assert.ok(!/from\s+["']three(?:\/|["'])/.test(script), 'Three.js imports should be bundled.');
assert.ok(css.includes('nunito-sans.woff') && css.includes('fraunces.woff'), 'Bundled CSS should retain local fonts.');

const appShellBlock = serviceWorker.match(/const APP_SHELL = (\[[\s\S]*?\]);/)?.[1];
assert.ok(appShellBlock, 'Release service worker should contain a generated app shell.');
const appShell = JSON.parse(appShellBlock);
for (const entry of appShell) {
  assert.ok(exists(entry.replace(/^\.\//, '')), `Release cache entry should exist: ${entry}`);
}

const sourceModels = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(entryPath);
    else if (entry.name.toLowerCase().endsWith('.glb')) sourceModels.push(entryPath);
  }
};
walk(path.join(projectRoot, 'assets', 'models'));
const releaseModels = sourceModels.map((sourcePath) => {
  const relativePath = path.relative(path.join(projectRoot, 'assets'), sourcePath);
  const compressedPath = path.join(releaseRoot, 'assets', `${relativePath}.gz`);
  const compressed = fs.readFileSync(compressedPath);
  const original = gunzipSync(compressed);
  assert.equal(original.byteLength, fs.statSync(sourcePath).size, `Compressed model should decode: ${relativePath}`);
  assert.ok(!exists(`assets/${relativePath}`), `Release should omit the raw model: ${relativePath}`);
  return compressedPath;
});
assert.equal(releaseModels.length, sourceModels.length, 'Every source model should have a compressed release model.');
console.log(`Release build checks passed: bundled app, minified styles, ${releaseModels.length} compressed models, and complete offline shell.`);
