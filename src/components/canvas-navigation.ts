/** Shared screen-space gestures for the flowsheet and the 3D viewport. */
export const ZOOM_STEP = 1.54;

export function wheelNavigation(
  event: Pick<
    WheelEvent,
    "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey"
  >,
  mac = false,
) {
  if (event.ctrlKey || event.metaKey) {
    const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
    const pinch = event.ctrlKey && mac ? 10 : 1;
    return { zoom: 2 ** (-event.deltaY * unit * pinch * 2.7), x: 0, y: 0 };
  }
  const unit = event.deltaMode === 1 ? 20 : 1;
  return {
    zoom: 1,
    x: event.deltaX * unit * 0.5,
    y: event.deltaY * unit * 0.5,
  };
}

export function keyboardPan(key: string, shift: boolean) {
  const step = shift ? 256 : 64;
  return {
    arrowleft: [-step, 0],
    arrowright: [step, 0],
    arrowup: [0, -step],
    arrowdown: [0, step],
  }[key];
}
