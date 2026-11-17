// Keyboard and mouse, read as one state each frame. Movement keys give a
// normalized direction; the rest arrive as one-shot actions the loop takes and
// clears. Clicks carry their canvas position so the loop can hit-test buttons
// and blessing cards. Game keys never scroll the page.

/** Action bits returned by takeActions(). */
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_CHOICE_1 = 16;
export const ACTION_CHOICE_2 = 32;
export const ACTION_CHOICE_3 = 64;
export const ACTION_DASH = 128;

const MOVE_KEYS = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/** Keys the game owns: the page never sees their default behaviour. */
const GAME_KEYS = new Set([
  ...Object.keys(MOVE_KEYS),
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'Enter',
  'KeyP',
  'Escape',
  'KeyM',
  'KeyR',
  'Digit1',
  'Digit2',
  'Digit3',
  'Numpad1',
  'Numpad2',
  'Numpad3',
]);

/** Listen on the canvas's window; call destroy() to stop. */
export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let clicks = [];
  let mouse = { x: 0, y: 0, inside: false };

  function canvasPosition(event) {
    // CSS pixels, matching the renderer's drawing coordinates.
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onKeyDown(event) {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') actions |= ACTION_DASH;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (event.code === 'Digit1' || event.code === 'Numpad1') actions |= ACTION_CHOICE_1;
    if (event.code === 'Digit2' || event.code === 'Numpad2') actions |= ACTION_CHOICE_2;
    if (event.code === 'Digit3' || event.code === 'Numpad3') actions |= ACTION_CHOICE_3;
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    const position = canvasPosition(event);
    mouse = { x: position.x, y: position.y, inside: true };
    clicks.push(position);
    actions |= ACTION_DASH;
  }

  function onMouseMove(event) {
    mouse = { ...canvasPosition(event), inside: true };
  }

  function onMouseLeave() {
    mouse = { ...mouse, inside: false };
  }

  function onBlur() {
    held.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  return {
    /** Normalized movement direction from the held keys. */
    direction() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const vector = MOVE_KEYS[code];
        if (vector) {
          x += vector[0];
          y += vector[1];
        }
      }
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** One-shot actions since the last call, then cleared. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Click positions since the last call, then cleared. */
    takeClicks() {
      const taken = clicks;
      clicks = [];
      return taken;
    },
    /** Current mouse position in canvas pixels. */
    getMouse() {
      return mouse;
    },
    /** True while the pointer is over the canvas. */
    isMouseInside() {
      return mouse.inside;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}
