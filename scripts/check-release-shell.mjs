import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Validate cache generation without creating or replacing a release build.
const source = fs.readFileSync(new URL('./build-release.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function generateReleaseShell(');
const end = source.indexOf('\nfunction fsSyncWalk(', start);
const projectRoot = path.resolve('.');
const releaseDirectory = path.join(projectRoot, 'build', 'release');
const generate = vm.runInNewContext(`${source.slice(start, end)}\ngenerateReleaseShell;`, {
  path, projectRoot, releaseDirectory, releaseAssets: path.join(releaseDirectory, 'assets'),
  fsSyncWalk: () => [],
});
const outputs = {
  'build/release/js/main.js': { entryPoint: 'js/main.js', imports: [{ path: 'build/release/js/startup.js', kind: 'dynamic-import' }] },
  'build/release/js/startup.js': { imports: [{ path: 'build/release/js/shared.js', kind: 'import-statement' }] },
  'build/release/js/shared.js': { imports: [] },
};
const worker = generate("const APP_SHELL = ['./old.js'];", outputs);
const shell = JSON.parse(worker.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1]);
for (const file of ['main.js', 'startup.js', 'shared.js']) {
  assert.ok(shell.includes(`./js/${file}`), `Install cache includes ${file}`);
}
assert.equal(new Set(shell).size, shell.length);
assert.ok(!shell.includes('./old.js'));
console.log('Release shell checks passed: static and dynamic runtime chunks are cached at installation.');
