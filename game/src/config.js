// Every number the game is tuned by, in one place. The world is a fixed-step
// simulation (STEP seconds a step) inside a bounded arena; the camera follows
// the warden. Times are seconds, distances are world units (pixels at 1x zoom).

/** Fixed simulation step: 60 steps a second. */
export const STEP = 1 / 60;
/** The longest frame the loop catches up on; a longer stall is dropped. */
export const MAX_FRAME = 0.25;
/** localStorage keys for the warden's best run. */
export const BEST_KEY = 'lumen-grove-best-score';
export const BEST_WAVE_KEY = 'lumen-grove-best-wave';

/** The arena the game plays in. */
export const ARENA = { width: 2600, height: 1800 };
/** Waves in a run: wave 10 is the Gloom Herald. */
export const FINAL_WAVE = 10;
/** Breather between waves, in seconds. */
export const WAVE_REST = 3.5;

/** The warden's base build, before blessings. */
export const PLAYER = {
  radius: 15,
  maxHp: 100,
  speed: 238,
  boltDamage: 12,
  fireInterval: 0.42,
  boltSpeed: 650,
  boltRange: 580,
  bolts: 1,
  pierce: 0,
  critChance: 0.05,
  magnetRadius: 95,
  collectRadius: 26,
  dashCooldown: 2.4,
  dashTime: 0.22,
  dashSpeed: 780,
  dashInvuln: 0.32,
  hitInvuln: 0.6,
  knockback: 130,
};

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level) {
  return 5 + (level - 1) * 4;
}

/** Score for a kill, before the wave multiplier. */
export const KILL_SCORE = 10;
/** Score for clearing a wave, times the wave number. */
export const WAVE_CLEAR_SCORE = 60;
/** Score for defeating the Herald. */
export const VICTORY_SCORE = 1000;

/** Stars on the victory screen by run time in seconds. */
export const STAR_TIMES = [420, 540];

/** Palette: a night grove lit by ember and moonlight. */
export const PALETTE = {
  skyTop: '#0a1230',
  skyBottom: '#07101f',
  ground: '#0c1a26',
  groundEdge: '#123043',
  groveRing: '#1e4a5e',
  player: '#ffd166',
  playerCore: '#fff3c4',
  bolt: '#ffcf5c',
  gem: '#7ef0c1',
  heal: '#ff8fa3',
  text: '#eaf6ff',
  dim: '#9db8cc',
  gold: '#ffcf5c',
  danger: '#ff5d73',
};

/** Enemy projectile (gloob) tuning. */
export const GLOOB = { radius: 7, speed: 235, damage: 8, life: 6 };
/** How long damage numbers and particles live, in seconds. */
export const TEXT_LIFE = 0.9;
export const PARTICLE_LIFE = 0.7;
