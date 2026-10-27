const DEBUG_COORDINATE_UPDATE_MS = 100;

function formatVector(value) {
  return `x ${value.x.toFixed(3)}  y ${value.y.toFixed(3)}  z ${value.z.toFixed(3)}`;
}

function formatRotation(value) {
  const degrees = 180 / Math.PI;
  return `x ${(value.x * degrees).toFixed(3)}  y ${(value.y * degrees).toFixed(3)}  z ${(value.z * degrees).toFixed(3)}`;
}

export function createDebugOverlay({ getSession, getGameHour, translate: t }) {
  const byId = (id) => document.getElementById(id);
  const elements = {
    panel: byId('debug-coordinates'),
    position: byId('debug-coordinate-values'),
    positionLabel: byId('debug-position-label'),
    timeInput: byId('debug-time-input'),
    timeApply: byId('debug-time-apply'),
    timeFreeze: byId('debug-time-freeze'),
    timeReset: byId('debug-time-reset'),
    cameraPosition: byId('debug-camera-position'),
    cameraTarget: byId('debug-camera-target'),
    cameraRotation: byId('debug-camera-rotation'),
  };
  let coordinateInterval = null;

  function renderCoordinates() {
    const session = getSession();
    const position = session?.getPlayerWorldPosition();
    const camera = session?.getCameraDebugValues();
    if (!position || !camera) return;
    setText(elements.positionLabel, t(session.isBirdActive() ? 'debug.bird.position' : 'debug.coordinates.title'));
    setText(elements.position, formatVector(position));
    setText(elements.cameraPosition, formatVector(camera.position));
    setText(elements.cameraTarget, formatVector(camera.target));
    setText(elements.cameraRotation, formatRotation(camera.rotation));
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function setTimeInput(hour) {
    const minutes = Math.round(((hour % 24 + 24) % 24) * 60) % 1440;
    elements.timeInput.value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function stopCoordinates() {
    window.clearInterval(coordinateInterval);
    coordinateInterval = null;
    elements.panel.hidden = true;
  }

  function sync({ enabled }) {
    if (!enabled) {
      stopCoordinates();
      return;
    }
    elements.panel.hidden = false;
    if (!elements.timeInput.value) setTimeInput(getGameHour());
    renderCoordinates();
    coordinateInterval ??= window.setInterval(renderCoordinates, DEBUG_COORDINATE_UPDATE_MS);
  }

  function applyTime() {
    if (!elements.timeInput.reportValidity()) return;
    const [hours, minutes] = elements.timeInput.value.split(':').map(Number);
    getSession()?.setDebugTime(hours + minutes / 60, { freeze: elements.timeFreeze.checked });
  }

  function freezeTime() {
    getSession()?.setDebugTimeFrozen(elements.timeFreeze.checked);
  }

  function resetTime() {
    getSession()?.clearDebugTime();
    setTimeInput(getGameHour());
  }

  elements.timeApply.addEventListener('click', applyTime);
  elements.timeFreeze.addEventListener('change', freezeTime);
  elements.timeReset.addEventListener('click', resetTime);

  function dispose() {
    stopCoordinates();
    elements.timeApply.removeEventListener('click', applyTime);
    elements.timeFreeze.removeEventListener('change', freezeTime);
    elements.timeReset.removeEventListener('click', resetTime);
  }

  return { sync, dispose };
}
