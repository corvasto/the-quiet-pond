export function resolveAssetUrl(publicPath, sourcePath, sourceModuleUrl) {
  if (typeof document !== 'undefined') return new URL(publicPath, document.baseURI).href;
  return new URL(sourcePath, sourceModuleUrl).href;
}
