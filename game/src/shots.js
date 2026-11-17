// The screenshot scenes behind ?shot=title|play|levelup|victory. Each one plays
// the real rules forward from a fresh world for a fixed time, steered by a
// simple autopilot (kite the gloom, chase the nearest shard, dash out when
// surrounded), so the frame is what a real game looks like and the same seed
// always gives the same frame. Level-up choices during a scene take the first
// card, deterministically; the victory scene runs a strong hero build through
// all ten waves. Nothing here reads the clock or the network.

import { ARENA, STEP, xpForLevel } from './config.js';
import { applyBlessing, blessingById } from './blessings.js';
import { SCREEN_LEVELUP, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';
import { applyChoice, resetWorld, stepAttract, stepWorld } from './world.js';

/** Seconds of ambient drift behind the title scene. */
const TITLE_SECONDS = 6;
/** The play scene runs until the field is busy, within these bounds. */
const PLAY_MIN_SECONDS = 90;
const PLAY_MIN_ON_SCREEN = 6;
const PLAY_LIMIT_SECONDS = 150;
/** Longest the level-up scene waits for its first choice. */
const LEVELUP_LIMIT_SECONDS = 150;
/** Longest the victory scene plays before it gives up. */
const VICTORY_LIMIT_SECONDS = 900;

/** The hero build the victory scene runs: strong, but a build a run can earn. */
const HERO_BLESSINGS = [
  ['split', 2], ['might', 2], ['rapid', 2], ['swift', 1], ['heart', 2],
  ['magnet', 1], ['pierce', 1], ['nova', 1], ['regen', 1], ['crit', 1],
];

/**
 * The autopilot's move for one step: kite away from close gloom, drift toward
 * the nearest shard when it is safe, and dash out when surrounded.
 */
export function autopilot(world) {
  const player = world.player;
  let fx = 0;
  let fy = 0;
  let close = 0;
  let cx = 0;
  let cy = 0;
  for (const enemy of world.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance < 190) {
      const weight = (190 - distance) / 190;
      fx += (dx / distance) * weight * 3;
      fy += (dy / distance) * weight * 3;
      close += 1;
      cx += enemy.x;
      cy += enemy.y;
    }
  }
  // The nearest shard, when the way is clear.
  let gem = null;
  let gemDistance = 340;
  for (const shard of world.gems) {
    const distance = Math.hypot(shard.x - player.x, shard.y - player.y);
    if (distance < gemDistance) {
      gemDistance = distance;
      gem = shard;
    }
  }
  if (gem && close < 2) {
    fx += ((gem.x - player.x) / (gemDistance || 1)) * 1.4;
    fy += ((gem.y - player.y) / (gemDistance || 1)) * 1.4;
  }
  // A slow orbit keeps the warden moving instead of standing still.
  const orbit = world.time * 0.55;
  fx += Math.cos(orbit) * 0.5;
  fy += Math.sin(orbit) * 0.5;
  // The arena's edge pushes back.
  const margin = 170;
  if (player.x < margin) fx += (margin - player.x) / margin * 2;
  if (player.x > ARENA.width - margin) fx -= (player.x - (ARENA.width - margin)) / margin * 2;
  if (player.y < margin) fy += (margin - player.y) / margin * 2;
  if (player.y > ARENA.height - margin) fy -= (player.y - (ARENA.height - margin)) / margin * 2;
  const length = Math.hypot(fx, fy);
  const move = length > 0 ? { mx: fx / length, my: fy / length } : { mx: 0, my: 0 };
  let dash = false;
  let dashDx = 0;
  let dashDy = 0;
  if (close >= 3 && player.dashCd <= 0) {
    const awayX = player.x - cx / close;
    const awayY = player.y - cy / close;
    const awayLength = Math.hypot(awayX, awayY) || 1;
    dash = true;
    dashDx = awayX / awayLength;
    dashDy = awayY / awayLength;
  }
  return { ...move, dash, dashDx, dashDy };
}

/** Enemies inside the 1280x720 view, the way the renderer frames it. */
function onScreenEnemies(world) {
  const player = world.player;
  const camX = Math.max(0, Math.min(ARENA.width - 1280, player.x - 640));
  const camY = Math.max(0, Math.min(ARENA.height - 720, player.y - 360));
  let count = 0;
  for (const enemy of world.enemies) {
    if (enemy.x >= camX && enemy.x <= camX + 1280 && enemy.y >= camY && enemy.y <= camY + 720) count += 1;
  }
  return count;
}

/** Step the world with the autopilot, taking the first blessing on level-up. */
function runAutopilot(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.choicePending) applyChoice(world, world.choices[0].id);
    if (world.over || world.victory) break;
    stepWorld(world, autopilot(world), STEP);
  }
}

/** Grant the hero build to a fresh world, as a run's blessings would. */
function grantHeroBuild(world) {
  const player = world.player;
  for (const [id, ranks] of HERO_BLESSINGS) {
    const blessing = blessingById(id);
    for (let i = 0; i < ranks; i += 1) {
      applyBlessing(blessing, player.build, player, player.owned);
    }
  }
  player.level = 9;
  player.xpNeed = xpForLevel(9);
  player.maxHp = 100 + player.build.maxHpBonus;
  player.hp = player.maxHp;
}

/**
 * Stage the named scene (title, play, levelup or victory; any other name is
 * title) and return the screen to draw and the best score to show.
 */
export function stageShot(name, world) {
  resetWorld(world);
  if (name === 'play') {
    // Play until the frame itself is busy (never a rest gap): at least six
    // enemies inside the 1280x720 view the screenshot takes.
    const limit = Math.floor(PLAY_LIMIT_SECONDS / STEP);
    for (let i = 0; i < limit; i += 1) {
      if (world.choicePending) applyChoice(world, world.choices[0].id);
      if (world.over || world.victory) break;
      if (world.time >= PLAY_MIN_SECONDS && onScreenEnemies(world) >= PLAY_MIN_ON_SCREEN && world.waveState === 'fighting') break;
      stepWorld(world, autopilot(world), STEP);
    }
    if (world.choicePending) applyChoice(world, world.choices[0].id);
    // A short tail, until a kill burst or a fresh volley is mid-flight.
    for (let i = 0; i < 60; i += 1) {
      if (world.particles.length >= 4 || world.bolts.length >= 2) break;
      if (world.choicePending) applyChoice(world, world.choices[0].id);
      if (world.over || world.victory) break;
      stepWorld(world, autopilot(world), STEP);
    }
    return { screen: SCREEN_PLAY, best: { score: 0, wave: 0 }, time: world.time };
  }
  if (name === 'levelup') {
    world.player.xp = world.player.xpNeed - 1;
    const steps = Math.floor(LEVELUP_LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      if (world.choicePending) break;
      if (world.over || world.victory) break;
      stepWorld(world, autopilot(world), STEP);
    }
    return { screen: world.choicePending ? SCREEN_LEVELUP : SCREEN_PLAY, best: { score: 0, wave: 0 }, time: world.time };
  }
  if (name === 'victory') {
    grantHeroBuild(world);
    runAutopilot(world, VICTORY_LIMIT_SECONDS);
    if (world.victory) return { screen: SCREEN_VICTORY, best: { score: 0, wave: 0 }, time: world.time };
    // The hero fell short: the frame shows the run where it ended instead.
    return { screen: SCREEN_PLAY, best: { score: 0, wave: 0 }, time: world.time };
  }
  for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) stepAttract(world, STEP);
  return { screen: SCREEN_TITLE, best: { score: 0, wave: 0 }, time: world.time };
}

/** The scenes the game stages, for the shot list. */
export const SHOT_NAMES = ['title', 'play', 'levelup', 'victory'];
