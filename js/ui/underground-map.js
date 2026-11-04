import { getMapBounds } from '../utils/map-bounds.js';

export function setMapLabelsVisible(container, visible) {
  container.classList.toggle('underground-map__hide-labels', !visible);
}

const escapeText = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

// World X/Z coordinates are used directly by every layer, with Z pointing down.
export function renderUndergroundMap(data, translate) {
  if (!data) return '';
  const { layout, position, heading, pond, pondCenter } = data;
  const half = layout.cellSize / 2;
  const bounds = getMapBounds(data);
  const { x: left, z: top, width, height } = bounds;
  const label = (key) => escapeText(translate(key));
  const text = (point, key, dy = -0.5) => `<text x="${point.x}" y="${point.z + dy}" class="underground-map__label">${label(key)}</text>`;
  const cells = layout.cells.map((cell) => `<rect x="${cell.x - half}" y="${cell.z - half}" width="${layout.cellSize + 0.002}" height="${layout.cellSize + 0.002}"/>`).join('');
  const degrees = (Math.PI - heading) * 180 / Math.PI;
  const opacity = Number.isFinite(data.surfaceMapOpacity) ? Math.max(0, Math.min(1, data.surfaceMapOpacity)) : 0.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}" role="img" aria-label="${label('underground.map.description')}">
    <title>${label('underground.map.description')}</title>
    <g class="underground-map__tunnels">${cells}</g>
    <image class="underground-map__surface-image" opacity="${opacity}" x="${left}" y="${top}" width="${width}" height="${height}" preserveAspectRatio="none"${data.surfaceMap ? ` href="${escapeText(data.surfaceMap.url)}"` : ''}/>
    <g class="underground-map__surface"${data.surfaceMap ? ' visibility="hidden"' : ''}>
      ${pond.length ? `<polygon points="${pond.map((p) => `${p.x},${p.z}`).join(' ')}" class="underground-map__pond"/>` : ''}
      <circle cx="${layout.treePosition.x}" cy="${layout.treePosition.z}" r="1" class="underground-map__tree"/>
    </g>
    <circle cx="${layout.treePosition.x}" cy="${layout.treePosition.z}" r="${layout.rootRadius}" class="underground-map__root"/>
    ${text(layout.treePosition, 'underground.map.tree', -1.2)}
    ${pondCenter ? text(pondCenter, 'underground.map.pond', 0) : ''}
    <g class="underground-map__entrance" transform="translate(${layout.exit.x} ${layout.exit.z})"><rect x="-0.22" y="-0.22" width="0.44" height="0.44" rx="0.06"/></g>
    ${text(layout.exit, 'underground.map.entrance', -0.5)}
    ${data.colony?.store ? `<g fill="#8b6746"><circle cx="${data.colony.store.x}" cy="${data.colony.store.z}" r="0.25"/></g>${text(data.colony.store,'building.mapStore',-0.55)}` : ''}
    ${(data.colony?.beds ?? (data.colony?.bed ? [data.colony.bed] : [])).map((bed) => `<g fill="#72924a"><ellipse cx="${bed.x}" cy="${bed.z}" rx="0.3" ry="0.2"/></g>${text(bed,'building.mapBed',0.6)}`).join('')}
    <g class="underground-map__player" transform="translate(${position.x} ${position.z})">
      <circle r="0.24"/><path d="M 0 -0.58 L -0.16 -0.3 L 0.16 -0.3 Z" transform="rotate(${degrees})"/>
    </g>
    ${text(position, 'underground.map.you', 0.75)}
  </svg>`;
}

export function applySurfaceMap(container, snapshot) {
  if (!snapshot) return;
  const image = container.querySelector('.underground-map__surface-image');
  if (!image) return;
  image.setAttribute('href', snapshot.url);
  container.querySelector('.underground-map__surface')?.setAttribute('visibility', 'hidden');
}

export function createMapViewport(container, onZoom = () => {}) {
  let svg = null;
  let base = null;
  let view = null;
  const pointers = new Map();
  const clamp = () => {
    view.x = Math.max(base.x - view.width * 0.2, Math.min(base.x + base.width - view.width * 0.8, view.x));
    view.y = Math.max(base.y - view.height * 0.2, Math.min(base.y + base.height - view.height * 0.8, view.y));
  };
  const draw = () => {
    clamp();
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
    onZoom(Math.round(base.width / view.width * 100));
  };
  const scale = () => {
    const rect = svg.getBoundingClientRect();
    return Math.min(rect.width / view.width, rect.height / view.height) || 1;
  };
  const point = (x, y) => {
    const rect = svg.getBoundingClientRect();
    const factor = scale();
    return { x: view.x + (x - rect.left - (rect.width - view.width * factor) / 2) / factor,
      y: view.y + (y - rect.top - (rect.height - view.height * factor) / 2) / factor };
  };
  function zoom(factor, x, y) {
    if (!svg) return;
    const anchor = x === undefined ? { x: view.x + view.width / 2, y: view.y + view.height / 2 } : point(x, y);
    const next = Math.max(1, Math.min(6, base.width / view.width * factor));
    const ratio = base.width / next / view.width;
    view.x = anchor.x - (anchor.x - view.x) * ratio;
    view.y = anchor.y - (anchor.y - view.y) * ratio;
    view.width *= ratio;
    view.height *= ratio;
    draw();
  }
  const pan = (dx, dy) => { const factor = scale(); view.x -= dx / factor; view.y -= dy / factor; draw(); };
  const gesture = () => {
    const [a, b] = [...pointers.values()];
    return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
      : { ...a, distance: 0 };
  };
  function clear() {
    for (const id of pointers.keys()) if (container.hasPointerCapture?.(id)) container.releasePointerCapture(id);
    pointers.clear();
  }
  const down = (event) => {
    if (!svg || event.button !== 0) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    container.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const before = gesture();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = gesture();
    if (before.distance > 0 && after.distance > 0) zoom(after.distance / before.distance, before.x, before.y);
    pan(after.x - before.x, after.y - before.y);
  };
  const up = (event) => { pointers.delete(event.pointerId); };
  const wheel = (event) => { if (svg) { event.preventDefault(); zoom(Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY); } };
  container.addEventListener('pointerdown', down);
  container.addEventListener('pointermove', move);
  container.addEventListener('pointerup', up);
  container.addEventListener('pointercancel', up);
  container.addEventListener('lostpointercapture', up);
  container.addEventListener('wheel', wheel, { passive: false });
  return {
    zoom,
    clear,
    fit() { if (base) { view = { ...base }; draw(); } },
    reset(focus) {
      clear();
      svg = container.querySelector('svg');
      if (!svg) return;
      const [x, y, width, height] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      base = { x, y, width, height }; view = { ...base };
      if (focus && container.clientWidth < 500) {
        view.width /= 1.6; view.height /= 1.6;
        view.x = focus.x - view.width / 2; view.y = focus.z - view.height / 2;
      }
      draw();
    },
    dispose() {
      clear();
      for (const [name, handler] of [['pointerdown', down], ['pointermove', move], ['pointerup', up],
        ['pointercancel', up], ['lostpointercapture', up], ['wheel', wheel]]) container.removeEventListener(name, handler);
      svg = null; base = null; view = null;
    },
  };
}
