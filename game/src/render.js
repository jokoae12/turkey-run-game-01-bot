// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x800 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. Everything is drawn from flat shapes: a
// running turkey, the chasing farmer, farmyard-to-kitchen parallax, the
// obstacles and pickups, the HUD and the screens. Text that holds a number is
// rebuilt only when the number changes, so a frame allocates nothing.
import { ESCAPE_METRES, FIELD, FONT, LIVES, PALETTE, PLAYER, PX_PER_METRE, STAGES } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Menu buttons, in playfield coordinates; main.js hit-tests taps against them. */
export const BUTTONS = {
  start: { x: 470, y: 548, w: 340, h: 66 },
  restart: { x: 470, y: 512, w: 340, h: 66 },
  resume: { x: 470, y: 440, w: 340, h: 66 },
};

/** Sky palettes per stage: morning farmyard, barn dusk, kitchen night. */
const SKIES = [
  [PALETTE.skyTop, PALETTE.skyMid, PALETTE.skyLow],
  [PALETTE.duskTop, PALETTE.duskMid, PALETTE.duskLow],
  [PALETTE.kitchenTop, PALETTE.kitchenMid, PALETTE.kitchenLow],
];

function hash(index) {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const distanceLabel = cachedLabel('');
  const bestLabel = cachedLabel('BEST ');
  const finalScoreLabel = cachedLabel('SCORE ');
  const finalDistanceLabel = cachedLabel('DISTANCE ');
  const finalBestLabel = cachedLabel('BEST ');
  let lastStage = 0;
  let bannerUntil = 0;
  let bannerTitle = '';
  let bannerSub = '';
  let lastFinale = false;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${size}|${weight ?? ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ?? ''} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function heart(x, y, size, filled) {
    context.fillStyle = filled ? '#ff5a5a' : 'rgba(255,255,255,0.25)';
    context.beginPath();
    context.moveTo(x, y + size * 0.3);
    context.bezierCurveTo(x - size, y - size * 0.6, x - size * 0.4, y - size * 1.1, x, y - size * 0.3);
    context.bezierCurveTo(x + size * 0.4, y - size * 1.1, x + size, y - size * 0.6, x, y + size * 0.3);
    context.closePath();
    context.fill();
  }

  /** Sky, sun, clouds, hills, barn and fence, all parallaxed by distance. */
  function drawBackground(state) {
    const metres = state.distance / PX_PER_METRE;
    const stage = state.stageIndex;
    // Blend the sky over 60 m either side of a stage boundary.
    let blend = 0;
    if (stage > 0) {
      const boundary = STAGES[stage].fromMetres;
      blend = Math.min(1, Math.max(0, (metres - boundary + 30) / 60));
    }
    const from = SKIES[Math.max(0, stage - 1)];
    const to = SKIES[stage];
    const top = stage === 0 ? to[0] : mix(from[0], to[0], blend);
    const mid = stage === 0 ? to[1] : mix(from[1], to[1], blend);
    const low = stage === 0 ? to[2] : mix(from[2], to[2], blend);
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.55, mid);
    gradient.addColorStop(1, low);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    if (stage < 2) {
      // Sun (morning) or low dusk sun.
      const sunX = 1050 - state.distance * 0.01;
      const sunY = stage === 0 ? 110 : 190;
      context.fillStyle = PALETTE.sun;
      context.beginPath();
      context.arc(((sunX % 1400) + 1400) % 1400 - 60, sunY, stage === 0 ? 46 : 58, 0, Math.PI * 2);
      context.fill();
      // Clouds drift slowly.
      context.fillStyle = 'rgba(255, 246, 230, 0.85)';
      for (let i = 0; i < 6; i += 1) {
        const worldX = i * 430 + hash(i) * 220;
        const x = (((worldX - state.distance * 0.15) % 1700) + 1700) % 1700 - 210;
        const y = 70 + hash(i + 40) * 130;
        context.beginPath();
        context.ellipse(x, y, 70, 22, 0, 0, Math.PI * 2);
        context.ellipse(x + 44, y + 6, 52, 18, 0, 0, Math.PI * 2);
        context.ellipse(x - 46, y + 8, 46, 16, 0, 0, Math.PI * 2);
        context.fill();
      }
      // Birds cross the sky on a slow parallax, wings flapping with time.
      context.strokeStyle = 'rgba(90, 60, 40, 0.8)';
      context.lineWidth = 3;
      context.lineCap = 'round';
      for (let i = 0; i < 4; i += 1) {
        const worldX = i * 900 + hash(i + 21) * 420;
        const x = (((worldX - state.distance * 0.08) % 2100) + 2100) % 2100 - 180;
        const y = 90 + hash(i + 63) * 130;
        const flap = Math.sin(state.time * 6 + i * 2.1) * 7;
        context.beginPath();
        context.moveTo(x - 14, y - flap);
        context.quadraticCurveTo(x - 5, y + 3, x, y);
        context.quadraticCurveTo(x + 5, y + 3, x + 14, y - flap);
        context.stroke();
      }
      // A distant windmill turns on the far hill, filling the mid-sky.
      const millX = (((2600 - state.distance * 0.45) % 2400) + 2400) % 2400 - 260;
      const millBase = FIELD.groundY - 118;
      context.fillStyle = '#8a6a45';
      context.beginPath();
      context.moveTo(millX - 22, millBase);
      context.lineTo(millX - 12, millBase - 120);
      context.lineTo(millX + 12, millBase - 120);
      context.lineTo(millX + 22, millBase);
      context.closePath();
      context.fill();
      context.fillStyle = '#6e2a1e';
      context.beginPath();
      context.moveTo(millX - 14, millBase - 118);
      context.lineTo(millX, millBase - 138);
      context.lineTo(millX + 14, millBase - 118);
      context.closePath();
      context.fill();
      const bladeAngle = state.time * 0.7;
      context.strokeStyle = '#f6e8c8';
      context.lineWidth = 5;
      for (let b = 0; b < 4; b += 1) {
        const a = bladeAngle + b * Math.PI / 2;
        context.beginPath();
        context.moveTo(millX, millBase - 128);
        context.lineTo(millX + Math.cos(a) * 52, millBase - 128 + Math.sin(a) * 52);
        context.stroke();
      }
      context.fillStyle = '#5d4037';
      context.beginPath();
      context.arc(millX, millBase - 128, 6, 0, Math.PI * 2);
      context.fill();
      // Far and near hills.
      context.fillStyle = PALETTE.hillFar;
      context.beginPath();
      context.moveTo(0, FIELD.groundY);
      for (let x = 0; x <= FIELD.width; x += 80) {
        const wx = x + state.distance * 0.25;
        context.lineTo(x, FIELD.groundY - 60 - Math.sin(wx * 0.004) * 46);
      }
      context.lineTo(FIELD.width, FIELD.groundY);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.hillNear;
      context.beginPath();
      context.moveTo(0, FIELD.groundY);
      for (let x = 0; x <= FIELD.width; x += 80) {
        const wx = x + state.distance * 0.5;
        context.lineTo(x, FIELD.groundY - 26 - Math.sin(wx * 0.006 + 2) * 26);
      }
      context.lineTo(FIELD.width, FIELD.groundY);
      context.closePath();
      context.fill();
      // The barn, sitting still in the world at the start of the run.
      const barnX = 880 - state.distance * 0.85;
      if (barnX > -320 && barnX < FIELD.width + 60) {
        context.fillStyle = PALETTE.barn;
        context.fillRect(barnX, 400, 260, 200);
        context.fillStyle = PALETTE.barnRoof;
        context.beginPath();
        context.moveTo(barnX - 16, 404);
        context.lineTo(barnX + 130, 330);
        context.lineTo(barnX + 276, 404);
        context.closePath();
        context.fill();
        context.fillStyle = '#5d2318';
        context.fillRect(barnX + 100, 470, 60, 130);
        context.fillStyle = '#f6e8c8';
        context.fillRect(barnX + 30, 440, 40, 40);
        context.fillRect(barnX + 190, 440, 40, 40);
      }
      // Pumpkins and trees scattered along the farm.
      for (let i = 0; i < 10; i += 1) {
        const worldX = i * 620 + hash(i + 9) * 300;
        const x = (((worldX - state.distance) % 3400) + 3400) % 3400 - 300;
        if (i % 3 === 0) {
          context.fillStyle = PALETTE.pumpkin;
          context.beginPath();
          context.ellipse(x, FIELD.groundY - 16, 26, 20, 0, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#3f7a2e';
          context.fillRect(x - 2, FIELD.groundY - 42, 5, 12);
        } else if (i % 3 === 1) {
          context.fillStyle = '#6b4a2a';
          context.fillRect(x - 5, FIELD.groundY - 90, 10, 90);
          context.fillStyle = '#5d8a3c';
          context.beginPath();
          context.arc(x, FIELD.groundY - 110, 42, 0, Math.PI * 2);
          context.arc(x - 30, FIELD.groundY - 88, 28, 0, Math.PI * 2);
          context.arc(x + 30, FIELD.groundY - 88, 28, 0, Math.PI * 2);
          context.fill();
        }
      }
    } else {
      // Kitchen interior: wall, window with the night outside, shelf, floor boards.
      context.fillStyle = PALETTE.wall;
      context.fillRect(0, 0, FIELD.width, FIELD.groundY);
      context.fillStyle = '#54301d';
      context.fillRect(0, FIELD.groundY - 120, FIELD.width, 120);
      context.fillStyle = '#2c1a10';
      context.fillRect(180, 90, 220, 260);
      context.fillStyle = '#1b2a4a';
      context.fillRect(196, 106, 188, 228);
      context.fillStyle = '#f4ead2';
      context.beginPath();
      context.arc(330, 160, 26, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#8a5f2e';
      context.fillRect(196, 220, 188, 8);
      context.fillStyle = '#7a4526';
      context.fillRect(700, 150, 420, 16);
      for (let i = 0; i < 4; i += 1) {
        context.fillStyle = ['#b0563a', '#c98f4e', '#7fae4c', '#d8b25c'][i];
        context.beginPath();
        context.arc(740 + i * 90, 138, 20, Math.PI, 0);
        context.fill();
        context.fillRect(720 + i * 90, 138, 40, 12);
      }
      // A pendant lamp hangs over the kitchen: cord, metal shade, warm bulb
      // and a soft cone of light down to the counter — never a bare oval.
      context.strokeStyle = '#2c1a10';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(1140, 0);
      context.lineTo(1140, 62);
      context.stroke();
      const lampGlow = context.createRadialGradient(1140, 108, 4, 1140, 108, 90);
      lampGlow.addColorStop(0, 'rgba(255, 190, 90, 0.55)');
      lampGlow.addColorStop(1, 'rgba(255, 190, 90, 0)');
      context.fillStyle = lampGlow;
      context.beginPath();
      context.arc(1140, 108, 90, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255, 190, 90, 0.10)';
      context.beginPath();
      context.moveTo(1104, 112);
      context.lineTo(1176, 112);
      context.lineTo(1240, 330);
      context.lineTo(1040, 330);
      context.closePath();
      context.fill();
      context.fillStyle = '#3d5a3a';
      context.beginPath();
      context.moveTo(1116, 62);
      context.lineTo(1164, 62);
      context.lineTo(1180, 104);
      context.lineTo(1100, 104);
      context.closePath();
      context.fill();
      context.fillStyle = '#2c4630';
      context.fillRect(1100, 100, 80, 6);
      context.fillStyle = '#ffe9a8';
      context.beginPath();
      context.arc(1140, 114, 12, 0, Math.PI * 2);
      context.fill();
    }

    // Ground or kitchen floor.
    if (stage < 2) {
      context.fillStyle = PALETTE.ground;
      context.fillRect(0, FIELD.groundY, FIELD.width, FIELD.height - FIELD.groundY);
      context.fillStyle = PALETTE.groundDark;
      context.fillRect(0, FIELD.groundY, FIELD.width, 8);
      context.fillStyle = PALETTE.grass;
      context.fillRect(0, FIELD.groundY - 6, FIELD.width, 10);
      // Fence posts scrolling past.
      context.fillStyle = PALETTE.fence;
      for (let i = 0; i < 12; i += 1) {
        const worldX = i * 150;
        const x = (((worldX - state.distance) % 1800) + 1800) % 1800 - 100;
        context.fillRect(x, FIELD.groundY - 52, 10, 52);
      }
      context.fillRect(0, FIELD.groundY - 46, FIELD.width, 6);
      context.fillRect(0, FIELD.groundY - 28, FIELD.width, 6);
      // Scattered pebbles and grass tufts keep the taller ground strip alive.
      for (let i = 0; i < 16; i += 1) {
        const worldX = i * 260 + hash(i + 77) * 180;
        const x = (((worldX - state.distance) % 2600) + 2600) % 2600 - 200;
        const y = FIELD.groundY + 30 + hash(i + 31) * 130;
        if (i % 2 === 0) {
          context.fillStyle = 'rgba(120, 78, 38, 0.55)';
          context.beginPath();
          context.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2);
          context.fill();
        } else {
          context.strokeStyle = 'rgba(94, 122, 52, 0.8)';
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(x - 5, y);
          context.lineTo(x - 7, y - 9);
          context.moveTo(x, y);
          context.lineTo(x, y - 11);
          context.moveTo(x + 5, y);
          context.lineTo(x + 7, y - 9);
          context.stroke();
        }
      }
    } else {
      context.fillStyle = '#4a2c1a';
      context.fillRect(0, FIELD.groundY, FIELD.width, FIELD.height - FIELD.groundY);
      context.fillStyle = '#5d3a22';
      for (let x = 0; x < FIELD.width; x += 120) context.fillRect(x, FIELD.groundY, 3, FIELD.height - FIELD.groundY);
    }
  }

  /** The turkey: tail fan, body, head, wattle, running legs and flapping wing. */
  function drawTurkey(state) {
    const player = state.player;
    if (player.hiding) {
      // Only tail feathers poke out of the haystack.
      const cx = PLAYER.x + PLAYER.width / 2;
      for (let i = 0; i < 3; i += 1) {
        context.fillStyle = PALETTE.tail[i];
        context.beginPath();
        context.arc(cx - 16 + i * 16, FIELD.groundY - 66, 16 - i * 2, Math.PI, 0);
        context.fill();
      }
      drawHaystack(PLAYER.x - 24, FIELD.groundY - 78, 106, 82);
      return;
    }
    const cx = PLAYER.x + PLAYER.width / 2;
    const feet = player.y;
    const runPhase = state.time * (player.dashing ? 22 : 15);
    const legSwing = player.onGround && !player.sliding ? Math.sin(runPhase) * 14 : 0;
    const bob = player.onGround && !player.sliding ? Math.abs(Math.sin(runPhase)) * -4 : 0;
    const bodyY = feet - 34 + bob;
    const slide = player.sliding;

    context.save();
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) context.globalAlpha = 0.45;
    // Tail fan.
    for (let i = 0; i < 3; i += 1) {
      context.fillStyle = PALETTE.tail[i];
      context.beginPath();
      context.arc(cx - 16, bodyY + 6, 34 - i * 6, Math.PI * 0.9, Math.PI * 1.9);
      context.fill();
    }
    // Body.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    if (slide) context.ellipse(cx + 4, feet - 18, 34, 16, 0.15, 0, Math.PI * 2);
    else context.ellipse(cx, bodyY, 26, 32, 0.12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.ellipse(cx - 2, bodyY + 10, 18, 20, 0.12, 0, Math.PI * 2);
    context.fill();
    // Wing, flapping.
    const flap = player.onGround ? Math.sin(runPhase) * 6 : -14;
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.ellipse(cx - 4, bodyY + 2 + flap * 0.4, 16, 9, -0.5 + flap * 0.02, 0, Math.PI * 2);
    context.fill();
    // Head and beak.
    const headX = slide ? cx + 30 : cx + 18;
    const headY = slide ? feet - 26 : bodyY - 34;
    context.fillStyle = PALETTE.head;
    context.beginPath();
    context.arc(headX, headY, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.beak;
    context.beginPath();
    context.moveTo(headX + 8, headY - 2);
    context.lineTo(headX + 20, headY + 3);
    context.lineTo(headX + 8, headY + 6);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.wattle;
    context.beginPath();
    context.ellipse(headX + 6, headY + 12, 4, 7, 0.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1d1d1d';
    context.beginPath();
    context.arc(headX + 4, headY - 3, 2, 0, Math.PI * 2);
    context.fill();
    // Legs.
    context.strokeStyle = '#e8a33c';
    context.lineWidth = 4;
    context.lineCap = 'round';
    if (slide) {
      context.beginPath();
      context.moveTo(cx + 8, feet - 10);
      context.lineTo(cx + 26, feet);
      context.moveTo(cx + 2, feet - 10);
      context.lineTo(cx + 20, feet);
      context.stroke();
    } else if (!player.onGround) {
      context.beginPath();
      context.moveTo(cx - 8, feet - 12);
      context.lineTo(cx - 12, feet + 2);
      context.moveTo(cx + 6, feet - 12);
      context.lineTo(cx + 10, feet + 2);
      context.stroke();
    } else {
      context.beginPath();
      context.moveTo(cx - 8, bodyY + 26);
      context.lineTo(cx - 8 + legSwing, feet);
      context.moveTo(cx + 8, bodyY + 26);
      context.lineTo(cx + 8 - legSwing, feet);
      context.stroke();
    }
    // Shield shimmer.
    if (player.shield) {
      context.strokeStyle = 'rgba(255, 217, 74, 0.85)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(cx, bodyY, 52 + Math.sin(state.time * 4) * 3, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  /** The farmer, chasing from the left; the closer the threat, the closer he is. */
  function drawFarmer(state) {
    const threat = state.farmer;
    // During a cut-off he is in front of the turkey, not behind it.
    if (state.farmerMode === 'warn' || state.farmerMode === 'corner') return;
    const searching = state.farmerMode === 'search';
    // Clamped to the left edge so the farmer is always drawn whole, never
    // sliced by the frame — at low threat he lurks at the edge, watching.
    const x = Math.max(0, PLAYER.x - 330 + threat * 265);
    const feet = FIELD.groundY;
    const phase = state.time * 16;
    // Searching, he stands still and looks left and right for the turkey.
    const legSwing = searching ? 0 : Math.sin(phase) * 13;
    const look = searching ? Math.sin(state.time * 5) * 7 : 0;
    // Legs.
    context.strokeStyle = '#2f3a4a';
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x + 26, feet - 52);
    context.lineTo(x + 26 + legSwing, feet);
    context.moveTo(x + 40, feet - 52);
    context.lineTo(x + 40 - legSwing, feet);
    context.stroke();
    // Overalls and shirt.
    context.fillStyle = PALETTE.farmerOveralls;
    context.fillRect(x + 18, feet - 92, 34, 44);
    context.fillStyle = PALETTE.farmerShirt;
    context.fillRect(x + 14, feet - 122, 42, 34);
    context.fillStyle = PALETTE.farmerSkin;
    context.fillRect(x + 14, feet - 118, 10, 26);
    // Pitchfork arm.
    context.strokeStyle = PALETTE.farmerSkin;
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(x + 50, feet - 112);
    context.lineTo(x + 72, feet - 88);
    context.stroke();
    context.strokeStyle = '#8a6a3a';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x + 70, feet - 150);
    context.lineTo(x + 78, feet - 60);
    context.stroke();
    context.strokeStyle = '#c9ced6';
    context.lineWidth = 3;
    for (let i = -1; i <= 1; i += 1) {
      context.beginPath();
      context.moveTo(x + 70 + i * 6, feet - 150);
      context.lineTo(x + 70 + i * 6, feet - 168);
      context.stroke();
    }
    // Head, hat, angry face — turning left and right while searching.
    context.fillStyle = PALETTE.farmerSkin;
    context.beginPath();
    context.arc(x + 36 + look, feet - 134, 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.farmerHat;
    context.beginPath();
    context.arc(x + 36 + look, feet - 140, 15, Math.PI, 0);
    context.fill();
    context.fillRect(x + 16 + look, feet - 142, 40, 5);
    context.fillStyle = '#1d1d1d';
    context.fillRect(x + 42 + look, feet - 140, 4, 3);
    context.strokeStyle = '#1d1d1d';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 40 + look, feet - 144);
    context.lineTo(x + 48 + look, feet - 141);
    context.stroke();
    if (threat > 0.55) {
      text('!', x + 36, feet - 178, 34, PALETTE.danger, 'center', 'bold');
    }
    if (searching) {
      text('?', x + 36, feet - 182, 34, PALETTE.corn, 'center', 'bold');
    }
  }

  /** The cut-off: a shouted warning at the right edge, then the farmer
   *  charging in from the front, bent low so a jump clears him. */
  function drawCornerFarmer(state) {
    if (state.farmerMode === 'warn') {
      const flash = Math.floor(state.time * 6) % 2 === 0;
      // Warning arrow at the right edge, pointing at the turkey.
      context.fillStyle = flash ? PALETTE.danger : '#ff8a3c';
      context.beginPath();
      context.moveTo(1252, FIELD.groundY - 190);
      context.lineTo(1192, FIELD.groundY - 160);
      context.lineTo(1252, FIELD.groundY - 130);
      context.closePath();
      context.fill();
      text('THERE!', 1140, FIELD.groundY - 226, 40, flash ? PALETTE.danger : '#fff6e6', 'center', 'bold');
      text('JUMP OVER HIM!', 1140, FIELD.groundY - 182, 20, '#fff6e6', 'center', 'bold');
      return;
    }
    if (state.farmerMode !== 'corner') return;
    const x = state.farmerX;
    const feet = FIELD.groundY;
    const phase = state.time * 24;
    const legSwing = Math.sin(phase) * 16;
    // Legs, pumping fast.
    context.strokeStyle = '#2f3a4a';
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x + 26, feet - 52);
    context.lineTo(x + 26 + legSwing, feet);
    context.moveTo(x + 40, feet - 52);
    context.lineTo(x + 40 - legSwing, feet);
    context.stroke();
    // Body leaning into the charge, head low.
    context.fillStyle = PALETTE.farmerOveralls;
    context.fillRect(x + 18, feet - 88, 34, 40);
    context.fillStyle = PALETTE.farmerShirt;
    context.fillRect(x + 12, feet - 112, 42, 28);
    context.fillStyle = PALETTE.farmerSkin;
    context.beginPath();
    context.arc(x + 30, feet - 122, 14, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.farmerHat;
    context.beginPath();
    context.arc(x + 30, feet - 127, 14, Math.PI, 0);
    context.fill();
    context.fillRect(x + 12, feet - 129, 36, 5);
    // Pitchfork held low, pointing forward (to the left, at the turkey).
    context.strokeStyle = '#8a6a3a';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x + 8, feet - 90);
    context.lineTo(x - 30, feet - 116);
    context.stroke();
    context.strokeStyle = '#c9ced6';
    context.lineWidth = 3;
    for (let i = -1; i <= 1; i += 1) {
      context.beginPath();
      context.moveTo(x - 30 + i * 5, feet - 116);
      context.lineTo(x - 42 + i * 5, feet - 128);
      context.stroke();
    }
    text('!', x + 32, feet - 152, 32, PALETTE.danger, 'center', 'bold');
  }

  function drawHaystack(x, y, w, h) {
    context.fillStyle = '#d8b25c';
    context.beginPath();
    context.moveTo(x, y + h);
    context.quadraticCurveTo(x + w / 2, y - h * 0.4, x + w, y + h);
    context.closePath();
    context.fill();
    context.strokeStyle = '#b98f3e';
    context.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      context.beginPath();
      context.moveTo(x + 12 + i * 16, y + h - 8);
      context.quadraticCurveTo(x + 16 + i * 16, y + h * 0.4, x + 20 + i * 16, y + 8);
      context.stroke();
    }
  }

  function drawObstacle(item, state) {
    const x = item.x;
    const y = item.y;
    const w = item.w;
    const h = item.h;
    if (item.type === 'fence') {
      // A jumpable fence section: pointed posts, rails and a diagonal brace,
      // painted barn-red so it reads as an obstacle against the brown field fence.
      context.fillStyle = '#a03d2d';
      context.beginPath();
      context.moveTo(x, y + 10);
      context.lineTo(x + 7, y - 4);
      context.lineTo(x + 14, y + 10);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(x + w - 14, y + 10);
      context.lineTo(x + w - 7, y - 4);
      context.lineTo(x + w, y + 10);
      context.closePath();
      context.fill();
      context.fillRect(x, y + 8, 10, h - 8);
      context.fillRect(x + w - 10, y + 8, 10, h - 8);
      context.fillStyle = '#f6e8c8';
      context.fillRect(x, y + 16, w, 9);
      context.fillRect(x, y + 38, w, 9);
      context.fillStyle = '#a03d2d';
      context.save();
      context.translate(x + 5, y + 18);
      context.rotate(Math.atan2(h - 22, w - 10));
      context.fillRect(0, 0, Math.hypot(w - 10, h - 22), 7);
      context.restore();
    } else if (item.type === 'pumpkin') {
      context.save();
      context.translate(x + w / 2, y + h / 2);
      context.rotate(item.spin);
      context.fillStyle = PALETTE.pumpkin;
      context.beginPath();
      context.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#b34d12';
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(0, 0, w / 4, h / 2 - 2, 0, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#3f7a2e';
      context.fillRect(-3, -h / 2 - 6, 6, 12);
      context.restore();
    } else if (item.type === 'roller') {
      // A pumpkin rolling AT the turkey: same body as a pumpkin, angry eyes,
      // and speed lines trailing behind it.
      context.save();
      context.translate(x + w / 2, y + h / 2);
      context.rotate(item.spin);
      context.fillStyle = PALETTE.pumpkin;
      context.beginPath();
      context.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#b34d12';
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(0, 0, w / 4, h / 2 - 2, 0, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#3f7a2e';
      context.fillRect(-3, -h / 2 - 6, 6, 12);
      context.strokeStyle = '#5d2318';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(-14, -6);
      context.lineTo(-4, -2);
      context.moveTo(14, -6);
      context.lineTo(4, -2);
      context.stroke();
      context.restore();
      context.strokeStyle = 'rgba(255, 246, 230, 0.6)';
      context.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        const ly = y + 8 + i * 16;
        context.beginPath();
        context.moveTo(x + w + 10, ly);
        context.lineTo(x + w + 34, ly);
        context.stroke();
      }
    } else if (item.type === 'fallingKnife') {
      if (item.knifePhase === 'warn') {
        // The blade peeks from the top; its shadow on the ground says where.
        context.fillStyle = 'rgba(0, 0, 0, 0.35)';
        context.beginPath();
        context.ellipse(x + w / 2, FIELD.groundY + 6, 26 + Math.sin(state.time * 10) * 4, 7, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.knife;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + w, 0);
        context.lineTo(x + w / 2, 64);
        context.closePath();
        context.fill();
        text('!', x + w / 2, FIELD.groundY - 34, 30, PALETTE.danger, 'center', 'bold');
      } else if (item.knifePhase === 'fall') {
        context.fillStyle = PALETTE.knife;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + w, y);
        context.lineTo(x + w / 2, y + item.h);
        context.closePath();
        context.fill();
        context.fillStyle = 'rgba(255,255,255,0.5)';
        context.fillRect(x + w / 2 - 2, y + 6, 3, item.h - 14);
      } else {
        // Stuck in the ground, tilted, still jumpable.
        context.save();
        context.translate(x + w / 2, y + item.h);
        context.rotate(0.12);
        context.fillStyle = PALETTE.knife;
        context.beginPath();
        context.moveTo(-w / 2, -item.h);
        context.lineTo(w / 2, -item.h);
        context.lineTo(0, 0);
        context.closePath();
        context.fill();
        context.restore();
      }
    } else if (item.type === 'mud') {
      context.fillStyle = '#6b4423';
      context.beginPath();
      context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2 + 4, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#8a5a30';
      context.beginPath();
      context.ellipse(x + w / 2 - 20, y + h / 2, 18, 5, 0, 0, Math.PI * 2);
      context.ellipse(x + w / 2 + 24, y + h / 2 + 2, 14, 4, 0, 0, Math.PI * 2);
      context.fill();
      text('MUD!', x + w / 2, y - 8, 18, '#e8c9a0', 'center', 'bold');
    } else if (item.type === 'haystack') {
      drawHaystack(x, y, w, h);
      // The hide cue is text plus a drawn arrow — no font glyph to go missing.
      text('HIDE!', x + w / 2, y - 14, 20, '#ffe9a8', 'center', 'bold');
      context.fillStyle = '#ffe9a8';
      context.beginPath();
      context.moveTo(x + w / 2 - 9, y - 8);
      context.lineTo(x + w / 2 + 9, y - 8);
      context.lineTo(x + w / 2, y + 6);
      context.closePath();
      context.fill();
    } else if (item.type === 'haybale') {
      context.fillStyle = '#d8b25c';
      roundRect(x, y, w, h, 8);
      context.fill();
      context.strokeStyle = '#a8823a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x + 14, y);
      context.lineTo(x + 14, y + h);
      context.moveTo(x + w - 14, y);
      context.lineTo(x + w - 14, y + h);
      context.stroke();
    } else if (item.type === 'pitchfork') {
      context.strokeStyle = '#8a6a3a';
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(x + w / 2, y + h);
      context.lineTo(x + w / 2, y + 18);
      context.stroke();
      context.strokeStyle = '#c9ced6';
      context.lineWidth = 4;
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath();
        context.moveTo(x + w / 2 + i * 10, y + 18);
        context.lineTo(x + w / 2 + i * 10, y);
        context.stroke();
      }
    } else if (item.type === 'chicken') {
      const bob = Math.sin(state.time * 18 + item.phase) * 3;
      context.fillStyle = '#f4f1e8';
      context.beginPath();
      context.ellipse(x + w / 2, y + h / 2 + bob, w / 2, h / 2 - 4, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(x + w - 8, y + 8 + bob, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e5534b';
      context.beginPath();
      context.moveTo(x + w - 8, y + bob);
      context.lineTo(x + w - 2, y + 4 + bob);
      context.lineTo(x + w - 8, y + 7 + bob);
      context.closePath();
      context.fill();
      context.fillStyle = '#f2a541';
      context.beginPath();
      context.moveTo(x + w + 1, y + 6 + bob);
      context.lineTo(x + w + 10, y + 9 + bob);
      context.lineTo(x + w + 1, y + 12 + bob);
      context.closePath();
      context.fill();
      context.strokeStyle = '#f2a541';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x + w / 2 - 6, y + h - 6);
      context.lineTo(x + w / 2 - 6 + Math.sin(state.time * 18) * 6, y + h + 4);
      context.stroke();
    } else if (item.type === 'oven') {
      context.fillStyle = PALETTE.oven;
      roundRect(x, y, w, h, 8);
      context.fill();
      context.fillStyle = '#22222a';
      roundRect(x + 12, y + 34, w - 24, h - 50, 6);
      context.fill();
      context.fillStyle = PALETTE.ovenGlow;
      const flicker = 0.75 + Math.sin(state.time * 9 + item.phase) * 0.25;
      context.globalAlpha = flicker;
      roundRect(x + 22, y + 46, w - 44, h - 74, 4);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = '#c9ced6';
      context.fillRect(x + 18, y + 12, 10, 10);
      context.fillRect(x + 38, y + 12, 10, 10);
      context.fillStyle = '#ff5a3c';
      context.beginPath();
      context.moveTo(x + w / 2 - 16, y - 26);
      context.quadraticCurveTo(x + w / 2, y - 52, x + w / 2 + 16, y - 26);
      context.closePath();
      context.fill();
      text('HOT!', x + w / 2, y - 56, 20, '#ffb37a', 'center', 'bold');
    } else if (item.type === 'pan') {
      context.fillStyle = '#2f2f38';
      context.beginPath();
      context.ellipse(x + w / 2 + 12, y + h / 2, 34, 13, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4a4a56';
      context.fillRect(x, y + 6, 30, 8);
      context.fillStyle = '#c9a86a';
      context.beginPath();
      context.ellipse(x + w / 2 + 12, y + h / 2 - 2, 22, 7, 0, 0, Math.PI * 2);
      context.fill();
    } else if (item.type === 'knife') {
      // A giant carving knife swinging from the ceiling: its tip hangs low
      // enough to catch a standing turkey, but a sliding turkey ducks under it.
      const swing = Math.sin(state.time * 2.2 + item.phase) * 0.08;
      context.save();
      context.translate(x + w / 2, 0);
      context.rotate(swing);
      context.strokeStyle = '#8a6a3a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, 46);
      context.stroke();
      context.fillStyle = PALETTE.knifeHandle;
      context.fillRect(-7, 40, 14, 30);
      context.fillStyle = PALETTE.knife;
      context.beginPath();
      context.moveTo(-15, 70);
      context.lineTo(15, 70);
      context.lineTo(0, 520);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.fillRect(-9, 80, 3, 380);
      context.restore();
    }
  }

  function drawPickup(item) {
    const bobY = Math.sin(item.bob) * 4;
    const x = item.x + item.size / 2;
    const y = item.y + bobY + item.size / 2;
    if (item.type === 'corn') {
      context.fillStyle = '#5d8a3c';
      context.beginPath();
      context.moveTo(x - 10, y + 4);
      context.lineTo(x - 18, y + 16);
      context.lineTo(x - 4, y + 12);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(x + 10, y + 4);
      context.lineTo(x + 18, y + 16);
      context.lineTo(x + 4, y + 12);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.corn;
      context.beginPath();
      context.ellipse(x, y, 11, 15, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#d8a91e';
      context.lineWidth = 1.5;
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath();
        context.moveTo(x + i * 5, y - 12);
        context.lineTo(x + i * 5, y + 12);
        context.stroke();
      }
    } else if (item.type === 'feather') {
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(item.bob * 0.7) * 0.3);
      context.fillStyle = PALETTE.feather;
      context.beginPath();
      context.ellipse(0, 0, 8, 16, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#d8a91e';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, -16);
      context.lineTo(0, 16);
      context.stroke();
      context.restore();
      text('+1 LIFE', x, y - 26, 15, '#ffe9a8', 'center', 'bold');
    } else {
      context.fillStyle = '#8a5a30';
      context.beginPath();
      context.ellipse(x, y + 4, 17, 9, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.pie;
      context.beginPath();
      context.ellipse(x, y, 17, 10, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#a86a2a';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x - 12, y - 6);
      context.lineTo(x + 12, y + 6);
      context.moveTo(x + 12, y - 6);
      context.lineTo(x - 12, y + 6);
      context.stroke();
      text('SHIELD', x, y - 24, 15, '#ffe9a8', 'center', 'bold');
    }
  }

  function drawHud(state, best) {
    const metres = Math.floor(state.distance / PX_PER_METRE);
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 30, PALETTE.text, 'left', 'bold');
    text(distanceLabel(metres) + ' m', 24, 54, 22, PALETTE.muted, 'left');
    text(STAGES[state.stageIndex].name, FIELD.width / 2, 18, 26, PALETTE.text, 'center', 'bold');
    text(`${metres} / ${ESCAPE_METRES} m to freedom`, FIELD.width / 2, 50, 18, PALETTE.muted, 'center');
    // Hearts.
    for (let i = 0; i < LIVES; i += 1) heart(FIELD.width - 120 + i * 34, 40, 13, i < state.lives);
    text(bestLabel(best), FIELD.width - 24, 54, 18, PALETTE.muted, 'right');
    // Stamina bar.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(FIELD.width - 224, 84, 200, 12, 6);
    context.fill();
    context.fillStyle = PALETTE.stamina;
    roundRect(FIELD.width - 224, 84, 200 * (state.player.stamina / 100), 12, 6);
    context.fill();
    text('DASH', FIELD.width - 232, 82, 15, PALETTE.muted, 'right', 'bold');
    // Farmer threat meter.
    const threat = state.farmer;
    const flash = threat > 0.7 && Math.floor(state.time * 4) % 2 === 0;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(24, 96, 220, 14, 7);
    context.fill();
    context.fillStyle = flash ? PALETTE.danger : '#ff8a3c';
    roundRect(24, 96, 220 * threat, 14, 7);
    context.fill();
    text('FARMER', 24, 114, 15, flash ? PALETTE.danger : PALETTE.muted, 'left', 'bold');
    if (state.player.shield) {
      // Drawn shield icon — the emoji glyph goes tofu on bare systems.
      context.fillStyle = PALETTE.feather;
      context.beginPath();
      context.moveTo(34, 138);
      context.lineTo(46, 138);
      context.lineTo(46, 148);
      context.quadraticCurveTo(46, 158, 40, 162);
      context.quadraticCurveTo(34, 158, 34, 148);
      context.closePath();
      context.fill();
      text('SHIELD', 54, 138, 16, PALETTE.feather, 'left', 'bold');
    }
    // Escape progress bar along the bottom.
    const progress = Math.min(1, metres / ESCAPE_METRES);
    context.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(200, 772, 880, 10, 5);
    context.fill();
    context.fillStyle = PALETTE.ok;
    roundRect(200, 772, 880 * progress, 10, 5);
    context.fill();
    for (let s = 1; s < STAGES.length; s += 1) {
      const mx = 200 + 880 * (STAGES[s].fromMetres / ESCAPE_METRES);
      context.fillStyle = PALETTE.text;
      context.fillRect(mx - 1, 768, 2, 18);
    }
    text('ESCAPE', 190, 768, 14, PALETTE.muted, 'right', 'bold');
    text('FREEDOM', 1090, 768, 14, PALETTE.muted, 'left', 'bold');
  }

  /**
   * A button with an optional vector icon ('play' triangle, 'retry' circular
   * arrow) drawn in canvas shapes — never a font glyph, so no tofu box can
   * appear in front of the label on a bare system.
   */
  function drawButton(rect, label, enabled, icon) {
    context.fillStyle = enabled ? '#e8722a' : '#6b5a48';
    roundRect(rect.x, rect.y, rect.w, rect.h, 12);
    context.fill();
    context.strokeStyle = '#fff6e6';
    context.lineWidth = 3;
    roundRect(rect.x, rect.y, rect.w, rect.h, 12);
    context.stroke();
    const cy = rect.y + rect.h / 2;
    if (icon) {
      context.font = `bold 28px ${FONT}`;
      const labelWidth = context.measureText(label).width;
      const ix = rect.x + rect.w / 2 - labelWidth / 2 - 34;
      context.fillStyle = '#fff6e6';
      if (icon === 'play') {
        context.beginPath();
        context.moveTo(ix - 9, cy - 13);
        context.lineTo(ix - 9, cy + 13);
        context.lineTo(ix + 13, cy);
        context.closePath();
        context.fill();
      } else if (icon === 'retry') {
        context.strokeStyle = '#fff6e6';
        context.lineWidth = 4;
        const endA = Math.PI * 1.35;
        context.beginPath();
        context.arc(ix, cy, 11, -0.6, endA);
        context.stroke();
        const ex = ix + Math.cos(endA) * 11;
        const ey = cy + Math.sin(endA) * 11;
        const tx = -Math.sin(endA);
        const ty = Math.cos(endA);
        context.beginPath();
        context.moveTo(ex + tx * 10, ey + ty * 10);
        context.lineTo(ex - ty * 6, ey + tx * 6);
        context.lineTo(ex + ty * 6, ey - tx * 6);
        context.closePath();
        context.fill();
      }
    }
    // The label is drawn on a middle baseline so it sits truly centred
    // against the icon; the callers all work on an alphabetic baseline, so
    // restore it afterwards.
    context.textBaseline = 'middle';
    text(label, rect.x + rect.w / 2, cy, 28, '#fff6e6', 'center', 'bold');
    context.textBaseline = 'alphabetic';
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 34 + 84;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, width, height, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 3;
    roundRect(x, y, width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 74, 46, PALETTE.text, 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 122 + i * 34, 21, PALETTE.muted, 'center');
    }
    if (prompt) text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.corn, 'center');
  }

  function drawField(state) {
    drawBackground(state);
    for (const item of state.pickups) if (item.active) drawPickup(item);
    for (const item of state.obstacles) if (item.active) drawObstacle(item, state);
    drawFarmer(state);
    drawCornerFarmer(state);
    if (state.foundTimer > 0) {
      context.globalAlpha = Math.min(1, state.foundTimer * 2);
      text('FOUND YOU!', FIELD.width / 2, 180, 44, PALETTE.danger, 'center', 'bold');
      context.globalAlpha = 1;
    }
    drawTurkey(state);
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (state.stageIndex !== lastStage) {
      lastStage = state.stageIndex;
      bannerUntil = state.time + 1.6;
      bannerTitle = `STAGE ${state.stageIndex + 1} — ${STAGES[state.stageIndex].name}`;
      bannerSub = state.stageIndex === 2 ? 'Dodge the oven and the carving knives!' : state.stageIndex === 1 ? 'Mind the pitchforks — and the chickens!' : 'Run, turkey, run!';
    }
    if (!state.finale) lastFinale = false;
    else if (!lastFinale) {
      lastFinale = true;
      bannerUntil = state.time + 1.6;
      bannerTitle = 'FINAL — THE GREAT ESCAPE';
      bannerSub = 'The farmer is sprinting! Watch the sky!';
    }
    drawField(state);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(20, 12, 6, 0.45)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.textBaseline = 'alphabetic';
      text('FEAST OR FLIGHT', FIELD.width / 2, 190, 72, '#fff6e6', 'center', 'bold');
      text("A Turkey's Great Escape", FIELD.width / 2, 236, 30, PALETTE.corn, 'center', 'bold');
      text('Thanksgiving is coming. The farmer wants you on the table.', FIELD.width / 2, 286, 22, PALETTE.text, 'center');
      text('Run 1500 m from the farmyard, through the barn, out of the kitchen — and win your pardon!', FIELD.width / 2, 318, 22, PALETTE.text, 'center');
      text('SPACE / UP  jump (x2)      DOWN  slide & hide in haystacks      SHIFT  dash', FIELD.width / 2, 370, 21, PALETTE.muted, 'center');
      text('LEFT / RIGHT  speed      P  pause      M  mute      Grab corn to push the farmer back!', FIELD.width / 2, 402, 21, PALETTE.muted, 'center');
      text(bestLabel(best), FIELD.width / 2, 448, 22, PALETTE.corn, 'center', 'bold');
      drawButton(BUTTONS.start, 'START RUN', true, 'play');
      text('or press SPACE', FIELD.width / 2, 640, 20, PALETTE.muted, 'center');
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PLAY) {
      if (state.time < bannerUntil) {
        const alpha = Math.min(1, (bannerUntil - state.time) * 2);
        context.globalAlpha = alpha;
        context.fillStyle = PALETTE.panel;
        roundRect(FIELD.width / 2 - 330, 190, 660, 116, 16);
        context.fill();
        context.strokeStyle = PALETTE.panelEdge;
        context.lineWidth = 3;
        roundRect(FIELD.width / 2 - 330, 190, 660, 116, 16);
        context.stroke();
        text(bannerTitle, FIELD.width / 2, 224, 44, '#fff6e6', 'center', 'bold');
        text(bannerSub, FIELD.width / 2, 274, 20, PALETTE.corn, 'center');
        context.globalAlpha = 1;
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The farmer waits for no turkey. Well — right now he does.'], '');
      drawButton(BUTTONS.resume, 'RESUME', true);
      return;
    }
    if (screen === SCREEN_WIN) {
      const lines = [
        finalScoreLabel(state.score),
        finalDistanceLabel(Math.floor(state.distance / PX_PER_METRE)) + ' m',
        finalBestLabel(best),
        '',
        'You outran the farmer, the oven and the carving knife.',
        'The President pardons you. Happy Thanksgiving!',
      ];
      drawPanel('PARDONED!', lines, '');
      drawButton(BUTTONS.restart, 'RUN AGAIN', true, 'retry');
      return;
    }
    const lines = [
      finalScoreLabel(state.score),
      finalDistanceLabel(Math.floor(state.distance / PX_PER_METRE)) + ' m',
      finalBestLabel(best),
      '',
      state.cause === 'caught' ? 'The farmer caught you — dinner is served.' : 'Your escape ended here.',
      'Corn pushes him back. Haystacks hide you. Try again!',
    ];
    drawPanel('CAUGHT FOR DINNER!', lines, '');
    drawButton(BUTTONS.restart, 'TRY AGAIN', true, 'retry');
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
