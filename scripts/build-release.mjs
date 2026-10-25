import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import * as esbuild from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDirectory = path.join(projectRoot, 'build', 'release');
const safeReleaseDirectory = path.resolve(releaseDirectory);
if (!safeReleaseDirectory.startsWith(`${projectRoot}${path.sep}`)) {
  throw new Error('Release output must stay inside the project build directory.');
}

const gzipAsync = promisify(gzip);
const threeExamples = path.join(projectRoot, 'vendor', 'three', 'examples', 'jsm');
const threeModule = path.join(projectRoot, 'vendor', 'three', 'build', 'three.module.js');
const releaseAssets = path.join(releaseDirectory, 'assets');

async function listFiles(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

async function copyAssets() {
  const sourceAssets = path.join(projectRoot, 'assets');
  const files = await listFiles(sourceAssets);
  const modelFiles = files.filter((file) => file.toLowerCase().endsWith('.glb'));
  for (const sourceFile of files) {
    const relativePath = path.relative(sourceAssets, sourceFile);
    if (relativePath.toLowerCase().endsWith('.glb')) continue;
    const targetFile = path.join(releaseAssets, relativePath);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.copyFile(sourceFile, targetFile);
  }
  const modelSizes = await Promise.all(modelFiles.map(async (sourceFile) => {
    const source = await fs.readFile(sourceFile);
    const compressed = await gzipAsync(source, { level: 9, mtime: 0 });
    const relativePath = path.relative(sourceAssets, sourceFile);
    const targetFile = path.join(releaseAssets, `${relativePath}.gz`);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, compressed);
    return { sourceBytes: source.byteLength, compressedBytes: compressed.byteLength };
  }));
  return modelSizes.reduce((sum, size) => ({
    sourceBytes: sum.sourceBytes + size.sourceBytes,
    compressedBytes: sum.compressedBytes + size.compressedBytes,
  }), { sourceBytes: 0, compressedBytes: 0 });
}

function threeResolverPlugin() {
  return {
    name: 'local-three-runtime',
    setup(build) {
      build.onResolve({ filter: /^three$/ }, () => ({ path: threeModule }));
      build.onResolve({ filter: /^three\/addons\// }, ({ path: importPath }) => ({
        path: path.join(threeExamples, importPath.slice('three/addons/'.length)),
      }));
    },
  };
}

function generateReleaseShell(source) {
  const shellPaths = [
    './index.html',
    './manifest.webmanifest',
    './icon.png',
    './styles/game.css',
    './js/main.js',
    ...fsSyncWalk(releaseAssets)
      .filter((file) => /\.(?:glb\.gz|woff|ttf|png|gif|webm|mp3|opus|wav)$/i.test(file))
      .map((file) => `./${path.relative(releaseDirectory, file).replaceAll('\\', '/')}`),
  ];
  const array = JSON.stringify(shellPaths, null, 2);
  return source.replace(
    /const APP_SHELL = \[[\s\S]*?\];/,
    `const APP_SHELL = ${array};`,
  );
}

function fsSyncWalk(directory) {
  const files = [];
  for (const entry of fsSync.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...fsSyncWalk(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

await fs.rm(releaseDirectory, { recursive: true, force: true });
await fs.mkdir(path.join(releaseDirectory, 'js'), { recursive: true });
await fs.mkdir(path.join(releaseDirectory, 'styles'), { recursive: true });

const modelCompression = await copyAssets();
await Promise.all([
  fs.copyFile(path.join(projectRoot, 'manifest.webmanifest'), path.join(releaseDirectory, 'manifest.webmanifest')),
  fs.copyFile(path.join(projectRoot, 'icon.png'), path.join(releaseDirectory, 'icon.png')),
  fs.copyFile(path.join(projectRoot, 'LICENSE'), path.join(releaseDirectory, 'LICENSE')),
  fs.copyFile(path.join(projectRoot, 'THIRD_PARTY_NOTICES.md'), path.join(releaseDirectory, 'THIRD_PARTY_NOTICES.md')),
]);

await Promise.all([
  esbuild.build({
    absWorkingDir: projectRoot,
    entryPoints: ['js/main.js'],
    outfile: path.join(releaseDirectory, 'js', 'main.js'),
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    legalComments: 'none',
    define: { __COMPRESSED_MODELS__: 'true' },
    plugins: [threeResolverPlugin()],
  }),
  esbuild.build({
    absWorkingDir: projectRoot,
    entryPoints: ['styles/game.css'],
    outdir: path.join(releaseDirectory, 'styles'),
    outbase: path.join(projectRoot, 'styles'),
    bundle: true,
    minify: true,
    legalComments: 'none',
    external: ['../assets/*'],
  }),
]);

const sourceHtml = await fs.readFile(path.join(projectRoot, 'index.html'), 'utf8');
const releaseHtml = sourceHtml
  .replace(/<script\s+type="importmap">[\s\S]*?<\/script>\s*/i, '')
  .replace('<script type="module" src="./js/main.js"></script>', '<script type="module" src="./js/main.js"></script>');
if (releaseHtml.includes('type="importmap"')) throw new Error('The import map was not removed from release HTML.');
await fs.writeFile(path.join(releaseDirectory, 'index.html'), releaseHtml);

const sourceServiceWorker = await fs.readFile(path.join(projectRoot, 'service-worker.js'), 'utf8');
const releaseServiceWorker = generateReleaseShell(sourceServiceWorker);
if (releaseServiceWorker === sourceServiceWorker) throw new Error('Could not generate the release service-worker cache list.');
await fs.writeFile(path.join(releaseDirectory, 'service-worker.js'), releaseServiceWorker);
await fs.writeFile(path.join(releaseDirectory, '.nojekyll'), '');

const savings = modelCompression.sourceBytes > 0
  ? 100 * (1 - modelCompression.compressedBytes / modelCompression.sourceBytes)
  : 0;
console.log(`Release built at ${path.relative(projectRoot, releaseDirectory)}.`);
console.log(`Compressed ${modelCompression.sourceBytes.toLocaleString()} model bytes to ${modelCompression.compressedBytes.toLocaleString()} bytes (${savings.toFixed(1)}% smaller).`);
