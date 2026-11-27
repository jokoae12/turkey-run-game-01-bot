// Keyboard, mouse and touch input. Held keys give steering, a slide and a
// dash; one-shot presses (jump, start/restart, pause, mute) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. Pointer taps also report their position, so
// the loop can test menu buttons.

export const ACTION_JUMP = 1;
export const ACTION_CONFIRM = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const SLIDE_KEYS = new Set(['ArrowDown', 'KeyS']);
const DASH_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const CONFIRM_KEYS = new Set(['Space', 'Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);

export function createInput(canvas) {
  let left = false;
  let right = false;
  let slide = false;
  let dash = false;
  let actions = 0;
  let tap = null;

  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 1280,
      y: ((clientY - rect.top) / rect.height) * 720,
    };
  }

  window.addEventListener('keydown', (event) => {
    // Space is both jump and confirm: on a menu it starts the game, in play it jumps.
    let handled = false;
    if (JUMP_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_JUMP;
      handled = true;
    }
    if (CONFIRM_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      handled = true;
    }
    if (SLIDE_KEYS.has(event.code)) slide = true;
    else if (DASH_KEYS.has(event.code)) dash = true;
    else if (LEFT_KEYS.has(event.code)) left = true;
    else if (RIGHT_KEYS.has(event.code)) right = true;
    else if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (!handled) return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (SLIDE_KEYS.has(event.code)) slide = false;
    else if (DASH_KEYS.has(event.code)) dash = false;
    else if (LEFT_KEYS.has(event.code)) left = false;
    else if (RIGHT_KEYS.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    slide = false;
    dash = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    tap = toCanvas(event.clientX, event.clientY);
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 for left (slower), 1 for right (faster), 0 for neither or both. */
    speedAdjust() {
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    isSliding() {
      return slide;
    },
    isDashing() {
      return dash;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last pointer tap in playfield coordinates, or null; consumed on read. */
    takeTap() {
      const taken = tap;
      tap = null;
      return taken;
    },
  };
}
