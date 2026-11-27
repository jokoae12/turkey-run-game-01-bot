// Every tuning number, stage and colour of Feast or Flight lives here, so the
// rest of the game never hard-codes a speed, a size or a colour. The playfield
// is a fixed 1280x800 logical area; the renderer scales it to the window, so
// no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 800, groundY: 600 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Pixels of scrolling that count as one metre of escape. */
export const PX_PER_METRE = 42;

/** The finish line: reach this distance and the turkey is pardoned. */
export const ESCAPE_METRES = 1500;

export const PLAYER = {
  x: 300,
  width: 58,
  height: 66,
  slideHeight: 34,
  gravity: 2600,
  jumpSpeed: 980,
  doubleJumpSpeed: 860,
  invulnerable: 1.4,
  hideSeconds: 1.6,
};

export const RUN = {
  baseSpeed: 300,
  speedPerStage: 58,
  maxSpeed: 560,
  minSpeed: 190,
  speedStep: 70,
  dashMultiplier: 1.8,
  dashDrain: 42,
  dashRegen: 16,
  mudSlow: 0.55,
};

export const LIVES = 3;

export const FARMER = {
  /** Threat gained on every hit, and the slow creep while the farmer hunts. */
  hitGain: 0.18,
  creepPerSecond: 0.0045,
  cornPushback: 0.05,
  hideDrop: 0.45,
  dashPushbackPerSecond: 0.03,
  /** Below this the farmer is off-screen; at 1 he grabs the turkey. */
  visibleAt: 0.25,
};

export const STAGES = [
  {
    name: 'FARMYARD',
    fromMetres: 0,
    toMetres: 500,
    spawnInterval: 1.6,
    groundTypes: ['fence', 'pumpkin', 'mud', 'haystack'],
    airTypes: [],
    cornInterval: 1.6,
  },
  {
    name: 'BARN',
    fromMetres: 500,
    toMetres: 1000,
    spawnInterval: 1.3,
    groundTypes: ['haybale', 'pitchfork', 'chicken', 'haystack', 'mud'],
    airTypes: [],
    cornInterval: 1.5,
  },
  {
    name: 'KITCHEN',
    fromMetres: 1000,
    toMetres: 1500,
    spawnInterval: 1.2,
    groundTypes: ['oven', 'pan', 'haystack'],
    airTypes: ['knife'],
    cornInterval: 1.4,
  },
];

/** Size and shape of every obstacle kind: w/h in pixels, kind jump (jump it) or duck (slide under it). */
export const OBSTACLES = {
  fence: { w: 46, h: 62, kind: 'jump' },
  pumpkin: { w: 56, h: 52, kind: 'jump', rolls: true },
  mud: { w: 130, h: 16, kind: 'jump', flat: true },
  haystack: { w: 96, h: 74, kind: 'jump', hide: true },
  haybale: { w: 78, h: 58, kind: 'jump' },
  pitchfork: { w: 40, h: 96, kind: 'jump' },
  chicken: { w: 52, h: 44, kind: 'jump', runs: true },
  oven: { w: 120, h: 118, kind: 'jump' },
  pan: { w: 84, h: 30, kind: 'jump', flat: true },
  knife: { w: 34, h: 520, kind: 'duck', hangs: true },
};

export const PICKUPS = {
  corn: { size: 30, points: 10 },
  feather: { size: 30, points: 50 },
  pie: { size: 34, points: 25 },
};

export const SCORE = {
  perMetre: 2,
  dodge: 5,
  hideBonus: 15,
};

/** How many obstacles, pickups and particles can exist at once; pools are allocated once, at boot. */
export const POOL_SIZE = 48;
export const PARTICLE_POOL = 90;

export const PALETTE = {
  backdrop: '#241a12',
  // Farmyard morning.
  skyTop: '#f7b733',
  skyMid: '#f9d976',
  skyLow: '#f6a05c',
  sun: '#fff3b0',
  hillFar: '#b98a4a',
  hillNear: '#8a5f2e',
  barn: '#a03d2d',
  barnRoof: '#6e2a1e',
  fence: '#7a5230',
  ground: '#c98f4e',
  groundDark: '#a06a33',
  grass: '#7fae4c',
  pumpkin: '#e8722a',
  // Barn dusk.
  duskTop: '#5b3a6e',
  duskMid: '#c65d3b',
  duskLow: '#f0914a',
  // Kitchen night.
  kitchenTop: '#3a2418',
  kitchenMid: '#5c3423',
  kitchenLow: '#7a4526',
  wall: '#6b3a24',
  oven: '#3d3d46',
  ovenGlow: '#ff7b24',
  knife: '#d7dde6',
  knifeHandle: '#4a2c17',
  player: '#8a5230',
  playerDark: '#6b3d22',
  tail: ['#a0522d', '#d2691e', '#e8a33c'],
  head: '#e8e2d5',
  wattle: '#e5534b',
  beak: '#f2a541',
  farmerHat: '#5d4037',
  farmerShirt: '#3e6fb0',
  farmerOveralls: '#2f4d6d',
  farmerSkin: '#e8b98a',
  corn: '#f2c94c',
  feather: '#ffd94a',
  pie: '#d98a3d',
  panel: 'rgba(32, 20, 12, 0.92)',
  panelEdge: '#e8a33c',
  text: '#fff6e6',
  muted: '#e0c9a6',
  danger: '#ff5a3c',
  ok: '#8fd14f',
  stamina: '#ffcf3f',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'feast-or-flight.best';
