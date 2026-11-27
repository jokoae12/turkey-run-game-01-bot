// The screenshot scenes behind ?shot=title|play|kitchen|end. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (look ahead, jump the ground obstacles, slide
// under the swinging knives, dash on clear ground, hide when the farmer gets
// close), so the frame is what a short game really looks like and the same
// seed always gives the same frame.
import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const TITLE_SECONDS = 6;
const PLAY_SECONDS = 13;
const KITCHEN_TARGET_METRES = 1030;
const END_LIMIT_SECONDS = 300;
const SAMPLE = STEP;

/** The nearest obstacle ahead of the turkey, or null. */
function nearestAhead(state, maxDistance) {
  let nearest = null;
  for (const item of state.obstacles) {
    if (!item.active) continue;
    // A falling knife still warning is no threat yet: it hangs above the
    // screen and only matters once it drops or sticks.
    if (item.type === 'fallingKnife' && item.knifePhase === 'warn') continue;
    const dx = item.x - PLAYER.x;
    if (dx < -20 || dx > maxDistance) continue;
    if (!nearest || item.x < nearest.x) nearest = item;
  }
  return nearest;
}

function nearestOfType(state, type, minX, maxX) {
  for (const item of state.obstacles) {
    if (item.active && item.type === type && item.x >= minX && item.x <= maxX) return item;
  }
  return null;
}

/**
 * Steer one step. `careless` plays like a hurried player: it reacts late,
 * never double-jumps, never dashes and never slides — so it gets caught.
 * Exported so the Node logic test drives the exact same pilot the shots use.
 */
export function autopilot(state, careless) {
  const control = { jump: false, slide: false, dash: false, speedAdjust: 0 };
  const player = state.player;
  // The farmer's cut-off charge: jump over him as he closes in.
  if (!careless && state.farmerMode === 'corner') {
    const dx = state.farmerX - PLAYER.x;
    if (dx < 260 && dx > -40 && player.onGround) control.jump = true;
    return control;
  }
  // A dropping knife outranks a hanging one: jump it (the same jump clears
  // a hanging knife), and never slide while one is coming down — sliding
  // under a hanging knife is exactly how a falling knife catches the turkey.
  let knifeNear = null;
  if (!careless) {
    for (const item of state.obstacles) {
      if (!item.active || item.type !== 'fallingKnife' || item.knifePhase === 'warn') continue;
      const dx = item.x - PLAYER.x;
      if (dx >= -20 && dx <= 320 && (!knifeNear || item.x < knifeNear.x)) knifeNear = item;
    }
  }
  const obstacle = nearestAhead(state, careless ? 200 : 520);
  if (obstacle) {
    const dx = obstacle.x - PLAYER.x;
    // A jump covers about 0.55 s of travel; jump late enough to still be
    // airborne when the obstacle arrives, early enough to clear it.
    const closing = state.speed + (obstacle.type === 'chicken' ? 130 : 0) + (obstacle.type === 'roller' ? 85 : 0);
    // Jump when the obstacle is ~0.55 s out: the overlap window then falls
    // inside the jump arc, so one well-timed jump clears it — no double
    // jump needed. (0.62 s used to land the turkey right on fast closers.)
    // A falling knife is jumped late: it drops onto the turkey's spot, so
    // jumping early lands the turkey right on the stuck blade.
    const jumpAt = careless ? 60 : obstacle.type === 'fallingKnife' ? 190 : closing * 0.55;
    if (obstacle.kind === 'duck') {
      if (!careless && knifeNear && dx < 260 && player.onGround) control.jump = true;
      else if (!careless && !knifeNear && dx < 300 && player.onGround) control.slide = true;
    } else if (dx < jumpAt) {
      if (player.onGround) control.jump = true;
      else if (!careless && player.jumpsUsed === 1 && dx < 190 && player.vy > -100) {
        control.jump = true;
      }
    }
    // Hide only while the farmer is far enough not to search the haystack:
    // hiding when he is close gets the turkey found and dragged out.
    if (obstacle.type === 'haystack' && state.farmer > 0.5 && state.farmer < 0.68 && dx < 200 && player.onGround) control.slide = true;
  }
  if (knifeNear) {
    const dx = knifeNear.x - PLAYER.x;
    if (dx < 260) {
      if (player.onGround) control.jump = true;
      else if (player.jumpsUsed === 1 && player.vy > -100) control.jump = true;
    }
  }
  if (!obstacle && !careless && player.stamina > 50) {
    control.dash = true;
    control.speedAdjust = 1;
  }
  return control;
}

function runAutopilot(world, seconds, careless) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(SAMPLE, autopilot(world.state, careless), false);
    if (events & (EVENT_OVER | EVENT_WIN)) return events;
  }
  return 0;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'kitchen' && name !== 'end') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.step(STEP, { jump: false, slide: false, dash: false, speedAdjust: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'end') {
    runAutopilot(world, END_LIMIT_SECONDS, true);
    if (!world.state.over) world.forceCaught();
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'kitchen') {
    // Play well until the kitchen, then a little further in.
    let guard = 0;
    while (world.meters() < KITCHEN_TARGET_METRES && guard < 12000 && !world.state.over) {
      world.step(STEP, autopilot(world.state, false), false);
      guard += 1;
    }
    runAutopilot(world, 3.5, false);
    if (!world.state.over) {
      // Make sure the kitchen's stars are in frame: a glowing oven and a knife.
      if (!nearestOfType(world.state, 'oven', 400, 1250)) world.spawnObstacle('oven', 940);
      if (!nearestOfType(world.state, 'knife', 400, 1250)) world.spawnObstacle('knife', 1140);
      runAutopilot(world, 0.6, false);
    }
    // Frame the farmer whole at the left edge: a good run pushes him far
    // back, which used to leave him sliced by the frame in this shot.
    if (!world.state.over) world.state.farmer = Math.max(world.state.farmer, 0.55);
    return { screen: world.state.over ? (world.state.won ? SCREEN_WIN : SCREEN_OVER) : SCREEN_PLAY, best: world.state.score };
  }
  // Play: a mid-run farmyard frame with the farmer breathing down the turkey's neck.
  runAutopilot(world, PLAY_SECONDS, false);
  if (!world.state.over) {
    // Clear the road ahead, put one fence right in front of the turkey and
    // catch it at the top of its jump, directly over the fence.
    for (const item of world.state.obstacles) {
      if (item.active && item.x > PLAYER.x - 100 && item.x < 950) item.active = false;
    }
    world.spawnObstacle('fence', 430);
    world.step(STEP, { jump: true, slide: false, dash: false, speedAdjust: 0 }, false);
    for (let i = 0; i < 20; i += 1) {
      world.step(STEP, { jump: false, slide: false, dash: false, speedAdjust: 0 }, false);
    }
    world.state.farmer = 0.72;
  }
  return { screen: world.state.over ? (world.state.won ? SCREEN_WIN : SCREEN_OVER) : SCREEN_PLAY, best: world.state.score };
}
