// Pointer presses support secondary touches while another control owns capture.
export function bindPressAction(button, action) {
  if (!button) return () => {};
  const onPointerDown = (event) => {
    if (button.disabled || event.button !== 0) return;
    event.preventDefault();
    action();
  };
  const onClick = (event) => {
    // Keyboard and assistive activation use click without a pointer press.
    if (!button.disabled && event.detail === 0) action();
  };
  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('click', onClick);
  return () => {
    button.removeEventListener('pointerdown', onPointerDown);
    button.removeEventListener('click', onClick);
  };
}

export function bindHoldAction(button, action) {
  const pointers = new Set(), keys = new Set();
  const sync = () => action(pointers.size > 0 || keys.size > 0);
  const down = (event) => {
    if (button.disabled || event.button !== 0) return;
    event.preventDefault(); pointers.add(event.pointerId);
    button.setPointerCapture?.(event.pointerId); sync();
  };
  const up = (event) => { if (pointers.delete(event.pointerId)) sync(); };
  const keydown = (event) => {
    if (button.disabled || !['Space', 'Enter'].includes(event.code)) return;
    event.preventDefault(); keys.add(event.code); sync();
  };
  const keyup = (event) => { if (keys.delete(event.code)) { event.preventDefault(); sync(); } };
  const blur = () => { pointers.clear(); keys.clear(); sync(); };
  const view = button.ownerDocument?.defaultView;
  view?.addEventListener('blur', blur);
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
  button.addEventListener('keydown', keydown);
  button.addEventListener('keyup', keyup);
  button.addEventListener('blur', blur);
  return () => {
    blur();
    view?.removeEventListener('blur', blur);
    for (const [type, handler] of [['pointerdown', down], ['pointerup', up], ['pointercancel', up],
      ['lostpointercapture', up], ['keydown', keydown], ['keyup', keyup], ['blur', blur]]) button.removeEventListener(type, handler);
  };
}
