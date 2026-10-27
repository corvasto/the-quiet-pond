export function setupDebugAntRelocation(canvas, getSession) {
  if (!canvas) return null;
  let activePointerId = null;

  const finish = (event = null) => {
    if (activePointerId === null) return;
    if (event && event.pointerId !== undefined && event.pointerId !== activePointerId) return;
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (canvas.hasPointerCapture?.(activePointerId)) {
      canvas.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
    document.body.classList.remove('debug-ant-dragging');
  };
  const relocate = (event) => {
    if (!getSession()?.canDebugRelocateAnt()) return false;
    return getSession().debugRelocateAnt(event.clientX, event.clientY);
  };
  const onPointerDown = (event) => {
    if (
      event.button !== 0
      || !event.shiftKey
      || !getSession()?.canDebugRelocateAnt()
    ) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activePointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    document.body.classList.add('debug-ant-dragging');
    relocate(event);
  };
  const onPointerMove = (event) => {
    if (event.pointerId !== activePointerId) return;
    if (!event.shiftKey || !getSession()?.canDebugRelocateAnt()) {
      finish(event);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    relocate(event);
  };
  const onPointerEnd = (event) => finish(event);
  const onWindowBlur = () => finish();

  canvas.addEventListener('pointerdown', onPointerDown, true);
  canvas.addEventListener('pointermove', onPointerMove, true);
  canvas.addEventListener('pointerup', onPointerEnd, true);
  canvas.addEventListener('pointercancel', onPointerEnd, true);
  window.addEventListener('blur', onWindowBlur);
  return () => {
    finish();
    canvas.removeEventListener('pointerdown', onPointerDown, true);
    canvas.removeEventListener('pointermove', onPointerMove, true);
    canvas.removeEventListener('pointerup', onPointerEnd, true);
    canvas.removeEventListener('pointercancel', onPointerEnd, true);
    window.removeEventListener('blur', onWindowBlur);
  };
}

