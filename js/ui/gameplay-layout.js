function overlaps(a, b, gap = 0) {
  return a.left < b.right + gap && a.right > b.left - gap
    && a.top < b.bottom + gap && a.bottom > b.top - gap;
}

function captionWidth(width, height, headers) {
  const margin = 12;
  const rightHeaders = headers.filter((rect) => rect.left >= width * 0.42
    && rect.right > width * 0.65 && rect.top < height * 0.6);
  const sideWidth = rightHeaders.length ? Math.min(...rightHeaders.map((rect) => rect.left)) - margin * 2 : Infinity;
  return Math.max(100, Math.min(width - margin * 2, 360, sideWidth >= 200 ? sideWidth : Infinity));
}

// A message gets its own HUD space. The action dock is an exclusion rectangle,
// rather than an unrelated bottom offset that may change when buttons wrap.
export function resolveCaptionLayout({ width, height, captionHeight = 64, headers = [], obstacles = [] }) {
  const margin = 12, gap = 8;
  const boxWidth = captionWidth(width, height, headers);
  const maxHeight = Math.max(44, Math.min(160, height * 0.25));
  const requestedHeight = Math.min(captionHeight || 64, maxHeight);
  const blocked = [...headers, ...obstacles];
  const center = { left: width * 0.32, right: width * 0.68, top: height * 0.34, bottom: height * 0.75 };
  const xs = [margin, width - margin - boxWidth, (width - boxWidth) / 2];
  let best = null;
  // Reduce the message's scrollable height only if the full box cannot fit.
  for (const boxHeight of [requestedHeight, Math.min(requestedHeight, 64), Math.min(requestedHeight, 44)]) {
    const ys = [margin, ...blocked.flatMap((rect) => [rect.bottom + gap, rect.top - gap - boxHeight]), height - margin - boxHeight];
    for (let column = 0; column < xs.length; column++) for (const top of ys) {
      const left = xs[column];
      const rect = { left, right: left + boxWidth, top, bottom: top + boxHeight };
      if (rect.left < margin || rect.top < margin || rect.right > width - margin + 0.1 || rect.bottom > height - margin) continue;
      if (blocked.some((obstacle) => overlaps(rect, obstacle, gap))) continue;
      const centralArea = Math.max(0, Math.min(rect.right, center.right) - Math.max(rect.left, center.left))
        * Math.max(0, Math.min(rect.bottom, center.bottom) - Math.max(rect.top, center.top));
      const score = centralArea * 10 + top + column * 24;
      if (!best || score < best.score) best = { left, top, width: boxWidth, maxHeight: boxHeight, score };
    }
    if (best) break;
  }
  // Extremely small viewports still expose a readable, scrollable message.
  return best ?? { left: margin, top: margin, width: boxWidth, maxHeight: Math.min(44, Math.max(20, height - margin * 2)) };
}

export function createGameplayLayout({ caption, dock, hint }) {
  if (!caption) return { dispose() {} };
  const document = caption.ownerDocument;
  const window = document.defaultView;
  const headers = [...document.querySelectorAll('.game-brand, .game-actions, .clock-controls, .game-time, .game-objective, .debug-coordinates')];
  const obstacles = [dock, hint, ...document.querySelectorAll('.movement-joystick, .mobile-game-actions, .game-hint, .card-notice, .performance-diagnostic')].filter(Boolean);
  const elements = [...new Set([caption, ...headers, ...obstacles])];
  const properties = ['--hud-caption-left', '--hud-caption-top', '--hud-caption-width', '--hud-caption-max-height'];
  let pending = null, disposed = false;
  const visibleRect = (element) => {
    if (element.hidden || !element.getClientRects().length) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  };
  const setProperty = (name, value) => {
    const formatted = `${Math.round(value * 10) / 10}px`;
    if (caption.style.getPropertyValue(name) !== formatted) caption.style.setProperty(name, formatted);
  };
  const update = () => {
    pending = null;
    if (disposed || caption.hidden) return;
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = window.visualViewport?.height || window.innerHeight;
    const headerRects = headers.map(visibleRect).filter(Boolean);
    const obstacleRects = obstacles.map(visibleRect).filter(Boolean);
    // Apply width before reading height so translated/wrapped text is measured.
    caption.setAttribute('data-hud-managed', '');
    setProperty('--hud-caption-width', captionWidth(width, height, headerRects));
    // scrollHeight measures the full message without repeatedly removing the
    // current height cap, which would cause observer feedback on long captions.
    const naturalHeight = caption.scrollHeight ? caption.scrollHeight + 2 : caption.getBoundingClientRect().height;
    const layout = resolveCaptionLayout({ width, height, captionHeight: naturalHeight,
      headers: headerRects, obstacles: obstacleRects });
    setProperty('--hud-caption-left', layout.left);
    setProperty('--hud-caption-top', layout.top);
    setProperty('--hud-caption-max-height', layout.maxHeight);
  };
  const schedule = () => { if (!disposed && pending === null) pending = window.requestAnimationFrame(update); };
  const resizeObserver = new window.ResizeObserver(schedule);
  for (const element of elements) resizeObserver.observe(element);
  const mutationObserver = new window.MutationObserver(schedule);
  for (const element of elements) mutationObserver.observe(element, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, characterData: true, subtree: true });
  mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  schedule();
  return {
    dispose() {
      disposed = true;
      if (pending !== null) window.cancelAnimationFrame(pending);
      resizeObserver.disconnect(); mutationObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      caption.removeAttribute('data-hud-managed');
      for (const name of properties) caption.style.removeProperty(name);
    },
  };
}
