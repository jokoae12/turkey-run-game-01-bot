// The game's rules and state, with no drawing and no browser in it: a
// side-view auto-runner. The turkey holds its ground while the farm scrolls
// past; the farmer's threat creeps up behind it, every hit brings him closer,
// corn pushes him back and a haystack hide loses him. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound. Nothing here allocates
// after createWorld returns.

import {
  ESCAPE_METRES, FARMER, FIELD, FINALE_METRES, LIVES, OBSTACLES, PARTICLE_POOL, PICKUPS,
  PLAYER, POOL_SIZE, PX_PER_METRE, RUN, SCORE, STAGES,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_CORN = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_FEATHER = 16;
export const EVENT_PIE = 32;
export const EVENT_HIDE = 64;
export const EVENT_JUMP = 128;
export const EVENT_DOUBLE_JUMP = 256;
export const EVENT_DASH = 512;
/** The farmer poked the haystack and found the turkey hiding inside. */
export const EVENT_FOUND = 1024;
/** The farmer shouts "THERE!" and runs around to cut the turkey off. */
export const EVENT_SHOUT = 2048;
/** A falling knife starts dropping: whistle warning. */
export const EVENT_KNIFE = 4096;
/** The last 200 m begin: the farmer sprints and knives rain down. */
export const EVENT_FINALE = 8192;

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createWorld(random) {
  const player = {
    y: FIELD.groundY, vy: 0, onGround: true, jumpsUsed: 0,
    sliding: false, invulnerable: 0, shield: false,
    hiding: false, hideTimer: 0, stamina: 100, dashing: false,
  };
  const obstacles = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    obstacles.push({ active: false, type: 'fence', x: 0, y: 0, w: 0, h: 0, kind: 'jump', passed: false, spin: 0, phase: 0, warnT: 0, vy: 0, knifePhase: 'warn' });
  }
  const pickups = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    pickups.push({ active: false, type: 'corn', x: 0, y: 0, size: 0, bob: 0 });
  }
  const particles = [];
  for (let i = 0; i < PARTICLE_POOL; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#ffffff', size: 3 });
  }
  const state = {
    player, obstacles, pickups, particles,
    distance: 0, score: 0, bonus: 0, lives: LIVES, stageIndex: 0,
    time: 0, spawnTimer: 1.0, cornTimer: 1.2, featherTimer: 30,
    farmer: 0.12, speed: RUN.baseSpeed, inMud: false,
    over: false, won: false, cause: '', runTime: 0,
    /** Farmer behaviour: chase (default), search (poking a haystack),
     *  warn (shouting before a cut-off) or corner (charging from the front). */
    farmerMode: 'chase', farmerTimer: 0, farmerX: 0, farmerDodged: false,
    cornerDone: [false, false],
    /** The finale: the last 200 m, farmer sprinting, knives falling. */
    finale: false, knifeTimer: 2.0, foundTimer: 0,
    /** What caused the last hit (obstacle type, or 'corner'). */
    lastHit: '',
  };

  function reset() {
    player.y = FIELD.groundY;
    player.vy = 0;
    player.onGround = true;
    player.jumpsUsed = 0;
    player.sliding = false;
    player.invulnerable = 0;
    player.shield = false;
    player.hiding = false;
    player.hideTimer = 0;
    player.stamina = 100;
    player.dashing = false;
    for (const item of obstacles) item.active = false;
    for (const item of pickups) item.active = false;
    for (const item of particles) item.active = false;
    state.distance = 0;
    state.score = 0;
    state.bonus = 0;
    state.lives = LIVES;
    state.stageIndex = 0;
    state.time = 0;
    state.spawnTimer = 1.0;
    state.cornTimer = 1.2;
    state.featherTimer = 30;
    state.farmer = 0.12;
    state.speed = RUN.baseSpeed;
    state.inMud = false;
    state.over = false;
    state.won = false;
    state.cause = '';
    state.runTime = 0;
    state.farmerMode = 'chase';
    state.farmerTimer = 0;
    state.farmerX = 0;
    state.farmerDodged = false;
    state.cornerDone = [false, false];
    state.finale = false;
    state.knifeTimer = 2.0;
    state.foundTimer = 0;
    state.lastHit = '';
  }

  function meters() {
    return state.distance / PX_PER_METRE;
  }

  function stage() {
    return STAGES[state.stageIndex];
  }

  function freeObstacle() {
    for (let i = 0; i < obstacles.length; i += 1) if (!obstacles[i].active) return obstacles[i];
    return null;
  }

  function freePickup() {
    for (let i = 0; i < pickups.length; i += 1) if (!pickups[i].active) return pickups[i];
    return null;
  }

  function freeParticle() {
    for (let i = 0; i < particles.length; i += 1) if (!particles[i].active) return particles[i];
    return null;
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i += 1) {
      const p = freeParticle();
      if (!p) return;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = (random() - 0.5) * power;
      p.vy = -random() * power * 0.8;
      p.life = 0.5 + random() * 0.5;
      p.maxLife = p.life;
      p.color = color;
      p.size = 3 + random() * 4;
    }
  }

  function playerBox() {
    const height = player.sliding ? PLAYER.slideHeight : PLAYER.height;
    return { x: PLAYER.x, y: player.y - height, w: PLAYER.width, h: height };
  }

  function spawnObstacle(type, x) {
    const def = OBSTACLES[type];
    const item = freeObstacle();
    if (!item || !def) return null;
    item.active = true;
    item.type = type;
    item.w = def.w;
    item.h = def.h;
    item.kind = def.kind;
    item.x = x ?? FIELD.width + 60 + random() * 140;
    item.y = def.hangs ? 30 : FIELD.groundY - def.h;
    item.passed = false;
    item.spin = 0;
    item.phase = random() * Math.PI * 2;
    item.knifePhase = 'warn';
    item.warnT = 0;
    item.vy = 0;
    if (type === 'fallingKnife') {
      // It starts above the screen, warning with its shadow, then drops.
      item.y = -160;
      item.warnT = 0.8;
    }
    return item;
  }

  /**
   * Resolve a hit on the turkey (obstacle, falling knife or the charging
   * farmer): a shield absorbs it, otherwise a life goes and the farmer gains.
   * Returns EVENT_HIT, plus EVENT_OVER when the run ends here.
   */
  function takeHit(cause) {
    let events = EVENT_HIT;
    state.lastHit = cause;
    if (player.shield) {
      player.shield = false;
      player.invulnerable = PLAYER.invulnerable;
      burst(PLAYER.x + 30, player.y - 40, '#ffd94a', 12, 200);
      return events;
    }
    state.lives -= 1;
    player.invulnerable = PLAYER.invulnerable;
    state.farmer = Math.min(1, state.farmer + FARMER.hitGain);
    burst(PLAYER.x + 30, player.y - 40, '#ffffff', 16, 260);
    burst(PLAYER.x + 30, player.y - 40, '#8a5230', 8, 180);
    if (state.lives <= 0 || state.farmer >= 1) {
      finish('caught', false);
      return events | EVENT_OVER;
    }
    return events;
  }

  function spawnPickupRow() {
    const roll = random();
    // Golden feathers are rare on purpose: a +1 life every dozen seconds
    // would refill every hit, so most rows are corn or a shield pie.
    const type = roll < 0.85 ? 'corn' : roll < 0.9 ? 'feather' : 'pie';
    const def = PICKUPS[type];
    const count = type === 'corn' ? 3 + Math.floor(random() * 3) : 1;
    // Corn rows arc over a jump; feather and pie float high, worth the leap.
    const high = type !== 'corn' && random() < 0.6;
    const baseY = high ? FIELD.groundY - 190 : FIELD.groundY - 70 - random() * 60;
    for (let i = 0; i < count; i += 1) {
      const item = freePickup();
      if (!item) return;
      item.active = true;
      item.type = type;
      item.size = def.size;
      item.x = FIELD.width + 80 + i * 56;
      item.y = baseY - Math.sin((i / Math.max(1, count - 1)) * Math.PI) * (type === 'corn' ? 46 : 0);
      item.bob = random() * Math.PI * 2;
    }
  }

  function currentSpeed(control) {
    const base = RUN.baseSpeed + RUN.speedPerStage * state.stageIndex;
    let target = base + control.speedAdjust * RUN.speedStep;
    target = Math.min(RUN.maxSpeed, Math.max(RUN.minSpeed, target));
    if (control.dash && player.stamina > 0 && !player.hiding) target *= RUN.dashMultiplier;
    if (state.inMud) target *= RUN.mudSlow;
    return target;
  }

  function finish(cause, won) {
    state.over = true;
    state.won = won;
    state.cause = cause;
  }

  /**
   * One fixed step. `control` is { jump (edge), slide, dash, speedAdjust }.
   * With `harmless` set (the title screen's backdrop) the world scrolls and
   * things spawn, but nothing touches the player and nothing scores.
   */
  function step(dt, control, harmless) {
    if (state.over) return 0;
    let events = 0;
    state.time += dt;
    state.runTime += dt;
    const stageDef = stage();
    const speed = currentSpeed(control);
    state.speed = speed;
    state.distance += speed * dt;
    const metres = meters();
    const nextStage = STAGES[state.stageIndex + 1];
    if (nextStage && metres >= nextStage.fromMetres) {
      state.stageIndex = Math.min(STAGES.length - 1, state.stageIndex + 1);
      // At each stage boundary the farmer cuts the turkey off: a shouted
      // warning first, then he charges in from the front. Fair because the
      // warning is long and jumping over him dodges it.
      const boundary = state.stageIndex - 1;
      if (!harmless && boundary >= 0 && !state.cornerDone[boundary] && state.farmerMode === 'chase') {
        state.cornerDone[boundary] = true;
        state.farmerMode = 'warn';
        state.farmerTimer = FARMER.cornerWarnSeconds;
        events |= EVENT_SHOUT;
      }
    }
    // The finale: the last 200 m, the farmer sprints and knives rain down.
    if (!harmless && !state.finale && metres >= FINALE_METRES) {
      state.finale = true;
      events |= EVENT_FINALE;
    }
    state.score = Math.floor(metres) * SCORE.perMetre + state.bonus;

    if (state.foundTimer > 0) state.foundTimer -= dt;

    // --- the farmer hunts: slow creep, pushed back by corn, dash and hiding.
    // While he searches, warns or charges he is not creeping up from behind.
    if (!harmless && state.farmerMode === 'chase') {
      const creep = FARMER.creepPerSecond * (state.finale ? FARMER.finaleCreep : 1);
      state.farmer = Math.min(1, state.farmer + creep * dt);
      if (player.dashing) state.farmer = Math.max(0, state.farmer - FARMER.dashPushbackPerSecond * dt);
      if (state.farmer >= 1) {
        finish('caught', false);
        return EVENT_OVER;
      }
    }

    // --- farmer behaviours: searching a haystack, warning, charging.
    if (!harmless && state.farmerMode === 'search') {
      state.farmerTimer -= dt;
      if (state.farmerTimer <= 0) {
        if (player.hiding) {
          // Found! Dragged out of the haystack; he gains a lot of ground.
          player.hiding = false;
          state.farmer = Math.min(1, state.farmer + FARMER.foundGain);
          state.foundTimer = 1.0;
          events |= EVENT_FOUND;
          burst(PLAYER.x + 30, FIELD.groundY - 30, '#d8b25c', 14, 160);
          if (state.farmer >= 1) {
            finish('caught', false);
            return events | EVENT_OVER;
          }
        } else {
          // He poked the wrong haystack and lost the trail.
          state.farmer = Math.max(0, state.farmer - 0.05);
        }
        state.farmerMode = 'chase';
      }
    } else if (!harmless && state.farmerMode === 'warn') {
      state.farmerTimer -= dt;
      if (state.farmerTimer <= 0) {
        state.farmerMode = 'corner';
        state.farmerX = FIELD.width + 40;
        state.farmerDodged = false;
      }
    } else if (!harmless && state.farmerMode === 'corner') {
      state.farmerX -= (speed + FARMER.cornerSpeed) * dt;
      const chargeBox = { x: state.farmerX, y: FIELD.groundY - FARMER.cornerHeight, w: 64, h: FARMER.cornerHeight };
      if (!player.hiding && overlaps(playerBox(), chargeBox)) {
        if (player.y < FIELD.groundY - FARMER.cornerHeight) {
          // Airborne over him: he runs straight past underneath.
          state.farmerDodged = true;
        } else if (player.invulnerable <= 0 && !state.farmerDodged) {
          events |= takeHit('corner');
          state.farmerMode = 'chase';
          if (events & EVENT_OVER) return events;
        }
      }
      if (state.farmerX + 64 < PLAYER.x) {
        if (state.farmerDodged) {
          state.bonus += SCORE.cornerDodge;
          state.farmer = Math.max(0, state.farmer - 0.05);
        }
        state.farmerMode = 'chase';
      }
    }

    // --- dash and stamina.
    const wantDash = control.dash && player.stamina > 0 && !player.hiding;
    if (wantDash && !player.dashing) events |= EVENT_DASH;
    player.dashing = wantDash;
    if (player.dashing) player.stamina = Math.max(0, player.stamina - RUN.dashDrain * dt);
    else player.stamina = Math.min(100, player.stamina + RUN.dashRegen * dt);

    // --- jumping: one jump from the ground, one more in the air.
    if (control.jump && !player.hiding) {
      if (player.onGround) {
        player.vy = -PLAYER.jumpSpeed;
        player.onGround = false;
        player.jumpsUsed = 1;
        events |= EVENT_JUMP;
      } else if (player.jumpsUsed < 2) {
        player.vy = -PLAYER.doubleJumpSpeed;
        player.jumpsUsed = 2;
        events |= EVENT_DOUBLE_JUMP;
        burst(PLAYER.x + 20, player.y, '#e8e2d5', 5, 120);
      }
    }
    player.vy += PLAYER.gravity * dt;
    player.y += player.vy * dt;
    if (player.y >= FIELD.groundY) {
      player.y = FIELD.groundY;
      player.vy = 0;
      player.onGround = true;
      player.jumpsUsed = 0;
    }

    // --- sliding, and hiding inside a haystack.
    const wasSliding = player.sliding;
    player.sliding = control.slide && player.onGround && !player.hiding;
    if (player.sliding && !wasSliding) burst(PLAYER.x + 10, FIELD.groundY, '#c98f4e', 6, 90);
    if (player.hiding) {
      player.hideTimer -= dt;
      if (player.hideTimer <= 0) player.hiding = false;
    }

    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // --- spawning. No fresh obstacles while the farmer is cutting the
    // turkey off, or while a knife is falling: one threat at a time keeps
    // each dodge readable instead of a pile-up.
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      let knifeBusy = false;
      for (const item of obstacles) {
        if (item.active && item.type === 'fallingKnife') {
          knifeBusy = true;
          break;
        }
      }
      if (state.farmerMode === 'warn' || state.farmerMode === 'corner' || knifeBusy) {
        state.spawnTimer = 0.3;
      } else {
        const pool = [...stageDef.groundTypes, ...stageDef.airTypes];
        let type = pool[Math.floor(random() * pool.length)];
        // Rollers close fast, so they stay rare: a picked roller only
        // actually rolls about 40% of the time, the rest is a normal obstacle.
        if (type === 'roller' && random() < 0.6) {
          const rest = pool.filter((t) => t !== 'roller');
          type = rest[Math.floor(random() * rest.length)];
        }
        spawnObstacle(type);
        state.spawnTimer = stageDef.spawnInterval * (0.85 + random() * 0.4);
      }
    }
    // --- the finale's falling knives: about half are aimed to land on the
    // turkey, the rest fall ahead at random. The shadow warns where.
    if (state.finale && !harmless) {
      state.knifeTimer -= dt;
      if (state.knifeTimer <= 0) {
        const aimed = random() < 0.45;
        const x = aimed
          ? PLAYER.x + speed * 1.5 + random() * 80
          : FIELD.width + 60 + random() * 200;
        spawnObstacle('fallingKnife', x);
        state.knifeTimer = 1.9 * (0.8 + random() * 0.4);
      }
    }
    state.cornTimer -= dt;
    if (state.cornTimer <= 0) {
      spawnPickupRow();
      state.cornTimer = stageDef.cornInterval * (0.8 + random() * 0.5);
    }
    state.featherTimer -= dt;
    if (state.featherTimer <= 0) {
      const item = freePickup();
      if (item) {
        item.active = true;
        item.type = 'feather';
        item.size = PICKUPS.feather.size;
        item.x = FIELD.width + 80;
        item.y = FIELD.groundY - 200;
        item.bob = 0;
      }
      state.featherTimer = 28 + random() * 14;
    }

    // --- move the world left past the turkey.
    const box = playerBox();
    state.inMud = false;
    for (const item of obstacles) {
      if (!item.active) continue;
      let drift = speed;
      if (item.type === 'chicken') drift += 130;
      if (item.type === 'roller') drift += 85;
      if (item.type === 'pumpkin' || item.type === 'roller') item.spin += (drift / (item.w / 2)) * dt;
      if (item.type === 'knife') item.x += Math.sin(state.time * 2.2 + item.phase) * 40 * dt;
      if (item.type === 'fallingKnife') {
        // Warn (shadow on the ground), fall fast, then stick in the ground.
        if (item.knifePhase === 'warn') {
          item.warnT -= dt;
          if (item.warnT <= 0) {
            item.knifePhase = 'fall';
            item.vy = 0;
            events |= EVENT_KNIFE;
          }
        } else if (item.knifePhase === 'fall') {
          item.vy += 3000 * dt;
          item.y += item.vy * dt;
          if (item.y >= FIELD.groundY - 46) {
            item.y = FIELD.groundY - 46;
            item.h = 46;
            item.knifePhase = 'stuck';
            item.warnT = 1.2;
          }
        } else {
          item.warnT -= dt;
          if (item.warnT <= 0) {
            item.active = false;
            continue;
          }
        }
      }
      item.x -= drift * dt;
      if (item.x + item.w < -80) {
        item.active = false;
        continue;
      }
      if (item.type === 'mud') {
        if (overlaps(box, item)) state.inMud = true;
        if (item.x + item.w < PLAYER.x && !item.passed) item.passed = true;
        continue;
      }
      if (!item.passed && item.x + item.w < PLAYER.x) {
        item.passed = true;
        if (!harmless) state.bonus += SCORE.dodge;
      }
      if (harmless || player.hiding) continue;
      const hitBox = item.kind === 'duck'
        ? { x: item.x + 4, y: item.y + item.h - 96, w: item.w - 8, h: 96 }
        : { x: item.x + 4, y: item.y + 4, w: item.w - 8, h: item.h - 4 };
      if (!overlaps(box, hitBox)) continue;
      if (item.type === 'haystack' && player.sliding) {
        // Duck into the haystack: the farmer loses the trail.
        item.active = false;
        player.hiding = true;
        player.hideTimer = PLAYER.hideSeconds;
        const threatBefore = state.farmer;
        state.farmer = Math.max(0.1, state.farmer - FARMER.hideDrop);
        state.bonus += SCORE.hideBonus;
        events |= EVENT_HIDE;
        burst(PLAYER.x + 30, FIELD.groundY - 30, '#d8b25c', 14, 160);
        // If he was close, he saw where the turkey went: he stops, looks
        // around, then pokes the haystack. Hiding while he is far stays safe.
        if (!harmless && state.farmerMode === 'chase' && threatBefore >= FARMER.searchFindAt) {
          state.farmerMode = 'search';
          state.farmerTimer = FARMER.searchSeconds;
        }
        continue;
      }
      if (player.invulnerable > 0) continue;
      item.active = false;
      events |= takeHit(item.type);
      if (events & EVENT_OVER) return events;
    }

    // --- pickups.
    for (const item of pickups) {
      if (!item.active) continue;
      item.x -= speed * dt;
      item.bob += dt * 4;
      if (item.x + item.size < -40) {
        item.active = false;
        continue;
      }
      if (harmless || player.hiding) continue;
      const pickupBox = { x: item.x, y: item.y + Math.sin(item.bob) * 4, w: item.size, h: item.size };
      if (!overlaps(box, pickupBox)) continue;
      item.active = false;
      if (item.type === 'corn') {
        state.bonus += PICKUPS.corn.points;
        state.farmer = Math.max(0, state.farmer - FARMER.cornPushback);
        events |= EVENT_CORN;
        burst(item.x, item.y, '#f2c94c', 8, 140);
      } else if (item.type === 'feather') {
        state.bonus += PICKUPS.feather.points;
        state.lives = Math.min(LIVES, state.lives + 1);
        player.stamina = 100;
        events |= EVENT_FEATHER;
        burst(item.x, item.y, '#ffd94a', 12, 180);
      } else {
        state.bonus += PICKUPS.pie.points;
        player.shield = true;
        events |= EVENT_PIE;
        burst(item.x, item.y, '#d98a3d', 10, 160);
      }
    }

    // --- running dust, and particles.
    if (player.onGround && !player.hiding && random() < 0.3) {
      const p = freeParticle();
      if (p) {
        p.active = true;
        p.x = PLAYER.x + 8;
        p.y = FIELD.groundY - 2;
        p.vx = -speed * 0.25;
        p.vy = -20 - random() * 30;
        p.life = 0.4;
        p.maxLife = 0.4;
        p.color = '#d8b98a';
        p.size = 3;
      }
    }
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
    }

    // --- the finish line.
    if (!harmless && metres >= ESCAPE_METRES) {
      finish('pardon', true);
      return events | EVENT_OVER | EVENT_WIN;
    }
    return events;
  }

  reset();
  return {
    state, reset, step, meters, stage,
    spawnObstacle,
    playerBox,
    /** Force a caught ending (used by the end screenshot when the pilot survives too long). */
    forceCaught() {
      if (!state.over) {
        state.lives = 0;
        finish('caught', false);
      }
    },
  };
}
