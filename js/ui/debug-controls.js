import { createDebugOverlay } from './debug-overlay.js';
import { setupDebugAntRelocation } from './debug-relocation.js';

export function createDebugControls({
  getSession,
  getGameHour,
  translate: t,
  onToggle,
  updatePrompt,
  showRadioCaption,
}) {
  const keyHint = document.getElementById('debug-key-hint');
  const relocateHint = document.getElementById('debug-relocate-hint');
  const radioHint = document.getElementById('radio-debug-hint');
  const overlay = createDebugOverlay({ getSession, getGameHour, translate: t });
  let relocateCleanup = null;

  function start(canvas) {
    relocateCleanup?.();
    relocateCleanup = setupDebugAntRelocation(canvas, getSession);
  }

  function sync({ ready }) {
    const session = getSession();
    const relocateActive = session?.canDebugRelocateAnt() ?? false;
    keyHint.hidden = !(ready && session?.isClimbDebugAvailable());
    relocateHint.hidden = !relocateActive;
    radioHint.hidden = !(session?.canDebugControlRadio() ?? false);
    document.body.classList.toggle('debug-ant-relocate', relocateActive);
    overlay.sync({ enabled: ready && (session?.isClimbDebugEnabled() ?? false) });
  }

  function appendChecklistControl(item, task) {
    if (!getSession()?.isClimbDebugEnabled()) return;
    item.classList.add('has-debug-control');
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'game-checklist__debug-complete';
    control.disabled = task.complete;
    control.setAttribute('aria-label', t('debug.completeObjective', { task: t(task.label) }));
    control.textContent = task.complete ? '✓' : '';
    control.addEventListener('click', (event) => {
      event.stopPropagation();
      getSession()?.debugCompleteObjective(task.id);
    });
    item.append(control);
  }

  // Main routes keys here after its dialog and editable-target checks.
  function handleKeyDown(event) {
    if (event.repeat) return false;
    const session = getSession();
    switch (event.code) {
      case 'KeyG':
        event.preventDefault();
        if (session?.isClimbDebugAvailable()) session.toggleClimbDebug();
        onToggle();
        return true;
      case 'KeyY':
        event.preventDefault();
        if (session?.isClimbDebugEnabled()) {
          const enabled = session.toggleFlight();
          updatePrompt(enabled ? 'debug.flight.enabled' : 'debug.flight.disabled');
        }
        return true;
      case 'KeyR':
        if (!session?.canDebugControlRadio()) return false;
        event.preventDefault();
        showRadioCaption(t('debug.radio.music', { mode: session.cycleDebugRadioMusic() }), 3);
        return true;
      case 'KeyV':
        if (!session?.canDebugControlRadio()) return false;
        event.preventDefault();
        showRadioCaption(t('debug.radio.voice', { result: session.playDebugRadioAnnouncement() }), 3);
        return true;
      case 'KeyT':
        if (!session?.canDebugControlWeather()) return false;
        event.preventDefault();
        showRadioCaption(t('debug.weather', { phase: session.toggleDebugRain() }), 3);
        return true;
      default:
        return false;
    }
  }

  function dispose() {
    overlay.dispose();
    relocateCleanup?.();
    relocateCleanup = null;
    keyHint.hidden = true;
    relocateHint.hidden = true;
    radioHint.hidden = true;
    document.body.classList.remove('debug-ant-relocate');
  }

  return { start, sync, appendChecklistControl, handleKeyDown, dispose };
}
