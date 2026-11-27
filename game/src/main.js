// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, caught and pardoned.
//
// ?seed=N fixes the random pattern. ?shot=title|play|kitchen|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld, EVENT_CORN, EVENT_DASH, EVENT_DOUBLE_JUMP, EVENT_FEATHER,
  EVENT_FINALE, EVENT_FOUND, EVENT_HIDE, EVENT_HIT, EVENT_JUMP, EVENT_KNIFE,
  EVENT_OVER, EVENT_PIE, EVENT_SHOUT, EVENT_WIN,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_JUMP, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import {
  BUTTONS, createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function inside(point, rect) {
  return point && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      document.title = 'SHOT READY';
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let pendingJump = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    pendingJump = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    announce(`Playing. ${LIVES} lives. Run 1500 metres to win your pardon.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.stopMusic();
    if (won) {
      audio.fanfare();
      announce(`Pardoned! You escaped. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.caught();
      announce(`Caught for dinner. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function playEvents(events) {
    if (events & EVENT_JUMP) audio.jump();
    if (events & EVENT_DOUBLE_JUMP) audio.doubleJump();
    if (events & EVENT_CORN) audio.pickup();
    if (events & EVENT_FEATHER) audio.feather();
    if (events & EVENT_PIE) audio.pickup();
    if (events & EVENT_HIDE) audio.hide();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_FOUND) audio.shout();
    if (events & EVENT_SHOUT) audio.shout();
    if (events & EVENT_KNIFE) audio.whistle();
    if (events & EVENT_FINALE) audio.sting();
    if (events & EVENT_HIT) {
      audio.hit();
      audio.gobble();
      announce(world.state.lives === 1 ? 'Hit! 1 life left. The farmer is close!' : `Hit! ${world.state.lives} lives left.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const tap = input.takeTap();
    if (actions & ACTION_JUMP) pendingJump = true;
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if ((actions & ACTION_CONFIRM) || inside(tap, BUTTONS.start)) startGame();
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if ((actions & ACTION_CONFIRM) || inside(tap, BUTTONS.restart)) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if ((actions & (ACTION_PAUSE | ACTION_CONFIRM)) || inside(tap, BUTTONS.resume)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { jump: false, slide: false, dash: false, speedAdjust: 0 }, true);
      return;
    }
    const control = {
      jump: pendingJump,
      slide: input.isSliding(),
      dash: input.isDashing(),
      speedAdjust: input.speedAdjust(),
    };
    pendingJump = false;
    const events = world.step(STEP, control, false);
    audio.setStage(world.state.stageIndex, world.state.finale);
    playEvents(events);
    if (events & EVENT_OVER) endGame(Boolean(events & EVENT_WIN));
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the farmer catch the turkey unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Feast or Flight. Press Space or click Start to run.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
