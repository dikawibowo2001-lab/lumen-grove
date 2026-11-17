// The simulation: one world, stepped at a fixed 1/60 s. The warden moves,
// auto-fires at the nearest gloom, gathers ember shards, levels up into
// blessing choices, and holds ten waves. Nothing here touches the DOM or the
// clock: given the same seed and the same inputs, it plays the same way.

import {
  ARENA, FINAL_WAVE, KILL_SCORE, PARTICLE_LIFE, PLAYER,
  VICTORY_SCORE, WAVE_CLEAR_SCORE, WAVE_REST, xpForLevel,
} from './config.js';
import { applyBlessing, blessingById, freshBuild, rollChoices } from './blessings.js';
import {
  createBolt, createEnemy, createGem, createHealOrb,
  spawnBurst, spawnText, updateEnemy,
} from './entities.js';
import { createDirector, startWave, updateDirector, waveCleared } from './waves.js';

/** Events stepWorld reports, as a bitmask the loop reads for sound and screens. */
export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_OVER = 16;
export const EVENT_VICTORY = 32;
export const EVENT_BOSS = 64;
export const EVENT_PICKUP = 128;
export const EVENT_HEAL = 256;
export const EVENT_NOVA = 512;
export const EVENT_DASH = 1024;
export const EVENT_SHOOT = 2048;

/** Derived stats: base values bent by the warden's blessings. */
export function playerSpeed(player) {
  return PLAYER.speed * player.build.speedMul;
}
export function boltDamage(player) {
  return PLAYER.boltDamage * player.build.damageMul;
}
export function fireInterval(player) {
  return PLAYER.fireInterval / player.build.fireRateMul;
}
export function magnetRadius(player) {
  return PLAYER.magnetRadius * player.build.magnetMul;
}
export function maxHealth(player) {
  return PLAYER.maxHp + player.build.maxHpBonus;
}
export function boltCount(player) {
  return PLAYER.bolts + player.build.bolts;
}
export function dashCooldown(player) {
  return PLAYER.dashCooldown * player.build.dashCdMul;
}

/** A fresh warden at the arena's heart. */
function freshPlayer() {
  return {
    x: ARENA.width / 2,
    y: ARENA.height / 2,
    vx: 0, vy: 0,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    level: 1,
    xp: 0,
    xpNeed: xpForLevel(1),
    fireCd: 0.2,
    dashCd: 0,
    dashTime: 0,
    dashDx: 1, dashDy: 0,
    invuln: 0,
    facing: 0,
    moving: false,
    novaCd: 0,
    scoreBonus: 0,
    build: freshBuild(),
    owned: {},
  };
}

/** Decor the renderer draws: mushrooms, ember trees and stones, seeded. */
function makeDecor(rng) {
  const decor = [];
  const kinds = ['shroom', 'tree', 'stone', 'flower'];
  for (let i = 0; i < 52; i += 1) {
    decor.push({
      x: rng.range(60, ARENA.width - 60),
      y: rng.range(60, ARENA.height - 60),
      kind: rng.pick(kinds),
      size: rng.range(0.7, 1.5),
      phase: rng.next() * Math.PI * 2,
    });
  }
  return decor;
}

/** Fireflies drifting over the grove, seeded. */
function makeFireflies(rng) {
  const flies = [];
  for (let i = 0; i < 70; i += 1) {
    flies.push({
      x: rng.range(0, ARENA.width),
      y: rng.range(0, ARENA.height),
      phase: rng.next() * Math.PI * 2,
      speed: rng.range(0.2, 0.6),
      size: rng.range(1.5, 3),
    });
  }
  return flies;
}

/** Make a world bound to a seeded generator, then reset it to a fresh run. */
export function createWorld(rng) {
  const world = {
    rng,
    decor: makeDecor(rng),
    fireflies: makeFireflies(rng),
    director: createDirector(),
  };
  resetWorld(world);
  return world;
}

/** A fresh run: the warden, wave 1's banner, empty fields. */
export function resetWorld(world) {
  world.player = freshPlayer();
  world.enemies = [];
  world.bolts = [];
  world.gloobs = [];
  world.gems = [];
  world.orbs = [];
  world.particles = [];
  world.texts = [];
  world.boss = null;
  world.wave = 1;
  world.waveState = 'banner';
  world.bannerTimer = 1.8;
  world.waveTimer = 0;
  world.time = 0;
  world.score = 0;
  world.kills = 0;
  world.shake = 0;
  world.hitStop = 0;
  world.flashRed = 0;
  world.choicePending = false;
  world.choices = [];
  world.over = false;
  world.victory = false;
  world.shotsFired = 0;
  world.damageDealt = 0;
  world.gemsCollected = 0;
  world.dashesUsed = 0;
  world.started = false;
}

/** The nearest enemy within `range` of a point, or null. */
export function nearestEnemy(world, x, y, range) {
  let best = null;
  let bestDistance = range;
  for (const enemy of world.enemies) {
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

function clampToArena(entity, radius) {
  entity.x = Math.max(radius, Math.min(ARENA.width - radius, entity.x));
  entity.y = Math.max(radius, Math.min(ARENA.height - radius, entity.y));
}

function hurtPlayer(world, damage) {
  const player = world.player;
  if (player.invuln > 0 || player.dashTime > 0) return false;
  player.hp -= damage;
  player.invuln = PLAYER.hitInvuln;
  world.shake = Math.max(world.shake, 10);
  world.flashRed = 0.55;
  world.hitStop = Math.max(world.hitStop, 0.05);
  spawnBurst(world.particles, player.x, player.y, '#ff5d73', 14, 260, 4, PARTICLE_LIFE, world.rng);
  if (player.hp <= 0) {
    player.hp = 0;
    world.over = true;
    spawnBurst(world.particles, player.x, player.y, '#ffd166', 40, 380, 5, 1.1, world.rng);
  }
  return true;
}

function damageEnemy(world, enemy, damage, crit) {
  enemy.hp -= damage;
  enemy.flash = 1;
  world.damageDealt += damage;
  spawnText(world.texts, enemy.x, enemy.y - enemy.radius - 6, String(Math.round(damage)), crit ? '#ffe66d' : '#ffffff', crit);
  if (enemy.hp > 0) return false;
  // The splitter bursts into two wisps where it stood.
  if (enemy.kind === 'splitter') {
    for (let i = 0; i < 2; i += 1) {
      const angle = world.rng.next() * Math.PI * 2;
      world.enemies.push(createEnemy('wisp', enemy.x + Math.cos(angle) * 20, enemy.y + Math.sin(angle) * 20, world.wave, false, world.rng));
    }
  }
  world.kills += 1;
  world.score += enemy.score * world.wave;
  const gem = createGem(enemy.x, enemy.y, enemy.xp, world.rng);
  gem.vx = world.rng.range(-60, 60);
  gem.vy = world.rng.range(-60, 60);
  world.gems.push(gem);
  if (enemy.elite || enemy.kind === 'boss') {
    world.orbs.push(createHealOrb(enemy.x + 14, enemy.y, world.rng));
    world.shake = Math.max(world.shake, 8);
    world.hitStop = Math.max(world.hitStop, 0.07);
  }
  spawnBurst(world.particles, enemy.x, enemy.y, enemy.kind === 'boss' ? '#f8b4e8' : '#b8a6ff', enemy.elite ? 26 : 12, 300, 4, PARTICLE_LIFE, world.rng);
  if (enemy.kind === 'boss') {
    world.boss = null;
    world.victory = true;
    world.score += VICTORY_SCORE;
    spawnBurst(world.particles, enemy.x, enemy.y, '#ffd166', 60, 420, 5, 1.2, world.rng);
  }
  return true;
}

function fireVolley(world) {
  const player = world.player;
  const target = nearestEnemy(world, player.x, player.y, PLAYER.boltRange);
  if (!target) return false;
  const count = boltCount(player);
  const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  const damage = boltDamage(player);
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * 0.13;
    const crit = world.rng.next() < PLAYER.critChance + player.build.critChance;
    world.bolts.push(createBolt(
      player.x, player.y, baseAngle + offset,
      damage * (crit ? 2 : 1), PLAYER.pierce + player.build.pierce, crit, PLAYER.boltSpeed,
    ));
  }
  world.shotsFired += count;
  player.facing = baseAngle;
  return true;
}

function fireNova(world) {
  const player = world.player;
  const radius = 230;
  let hitAny = false;
  for (const enemy of world.enemies) {
    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < radius + enemy.radius) {
      damageEnemy(world, enemy, player.build.novaDamage, false);
      hitAny = true;
    }
  }
  world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
  spawnBurst(world.particles, player.x, player.y, '#f72585', 30, 420, 5, 0.6, world.rng);
  world.shake = Math.max(world.shake, 5);
  return hitAny;
}

/**
 * Advance the world one fixed step. `input` is { mx, my, dash, dashDx, dashDy }.
 * Returns the events bitmask: what the loop should sound or show.
 */
export function stepWorld(world, input, dt) {
  let events = 0;
  const player = world.player;
  if (world.over || world.victory || world.choicePending) {
    updateFx(world, dt);
    return events;
  }
  world.time += dt;
  world.started = true;

  // The wave's shape: a banner, the fight, a breather, the next banner.
  if (world.waveState === 'banner') {
    world.bannerTimer -= dt;
    if (world.bannerTimer <= 0) {
      startWave(world.director, world.wave, world.rng);
      world.waveState = 'fighting';
      if (world.wave === FINAL_WAVE) events |= EVENT_BOSS;
    }
  } else if (world.waveState === 'fighting') {
    updateDirector(world.director, world.wave, world, dt);
    if (waveCleared(world.director, world)) {
      world.score += WAVE_CLEAR_SCORE * world.wave;
      events |= EVENT_WAVE_CLEAR;
      world.waveState = 'rest';
      world.waveTimer = WAVE_REST;
    }
  } else if (world.waveState === 'rest') {
    world.waveTimer -= dt;
    if (world.waveTimer <= 0) {
      world.wave += 1;
      world.waveState = 'banner';
      world.bannerTimer = 1.6;
    }
  }

  // The warden moves; a dash overrides the walk for its short burst.
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.fireCd -= dt;
  player.novaCd -= dt;
  if (player.build.regen > 0) {
    player.hp = Math.min(maxHealth(player), player.hp + player.build.regen * dt);
  }
  player.maxHp = maxHealth(player);

  if (input.dash && player.dashCd <= 0 && player.dashTime <= 0) {
    let dx = input.dashDx;
    let dy = input.dashDy;
    if ((!dx && !dy) || (dx === 0 && dy === 0)) {
      dx = input.mx;
      dy = input.my;
    }
    if (dx === 0 && dy === 0) {
      dx = Math.cos(player.facing);
      dy = Math.sin(player.facing);
    }
    const length = Math.hypot(dx, dy) || 1;
    player.dashDx = dx / length;
    player.dashDy = dy / length;
    player.dashTime = PLAYER.dashTime;
    player.dashCd = dashCooldown(player);
    player.invuln = Math.max(player.invuln, PLAYER.dashInvuln);
    player.dashesUsed += 1;
    events |= EVENT_DASH;
    spawnBurst(world.particles, player.x, player.y, '#ffd166', 10, 200, 4, 0.4, world.rng);
  }

  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.vx = player.dashDx * PLAYER.dashSpeed;
    player.vy = player.dashDy * PLAYER.dashSpeed;
    spawnBurst(world.particles, player.x, player.y, '#ffcf5c', 1, 40, 3, 0.35, world.rng);
    if (player.build.dashBurn) {
      for (const enemy of world.enemies) {
        if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.radius + player.radius + 6) {
          damageEnemy(world, enemy, 6, false);
        }
      }
      world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
    }
  } else {
    const speed = playerSpeed(player);
    player.vx = input.mx * speed;
    player.vy = input.my * speed;
  }
  player.moving = player.vx !== 0 || player.vy !== 0;
  if (player.moving) player.facing = Math.atan2(player.vy, player.vx);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  clampToArena(player, player.radius);

  // The ember bolts fire on their own at the nearest gloom.
  if (player.fireCd <= 0) {
    if (fireVolley(world)) {
      player.fireCd = fireInterval(player);
      events |= EVENT_SHOOT;
    } else {
      player.fireCd = 0.08;
    }
  }
  if (player.build.novaDamage > 0 && player.novaCd <= 0) {
    player.novaCd = player.build.novaInterval;
    if (fireNova(world)) events |= EVENT_NOVA;
  }

  // Bolts fly and bite.
  for (const bolt of world.bolts) {
    bolt.x += bolt.vx * dt;
    bolt.y += bolt.vy * dt;
    bolt.life -= dt;
    for (const enemy of world.enemies) {
      if (enemy.hp <= 0 || bolt.hit.has(enemy)) continue;
      if (Math.hypot(enemy.x - bolt.x, enemy.y - bolt.y) < enemy.radius + bolt.radius) {
        bolt.hit.add(enemy);
        damageEnemy(world, enemy, bolt.damage, bolt.crit);
        const knock = PLAYER.knockback / Math.max(1, enemy.radius);
        enemy.x += Math.cos(bolt.angle) * knock * dt * 8;
        enemy.y += Math.sin(bolt.angle) * knock * dt * 8;
        if (bolt.hit.size > bolt.pierce) {
          bolt.life = 0;
          break;
        }
      }
    }
  }
  world.bolts = world.bolts.filter((bolt) => bolt.life > 0);
  const hadKill = world.enemies.some((enemy) => enemy.hp <= 0);
  world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
  if (hadKill) events |= EVENT_KILL;
  if (world.victory) {
    updateFx(world, dt);
    return events | EVENT_VICTORY;
  }

  // The gloom moves, spits and summons.
  for (const enemy of world.enemies) {
    const spawned = updateEnemy(enemy, player, dt, world.rng);
    for (const gloob of spawned.gloobs) world.gloobs.push(gloob);
    for (const child of spawned.children) world.enemies.push(child);
    clampToArena(enemy, enemy.radius);
  }
  // A soft separation keeps the horde from stacking on one point.
  for (let i = 0; i < world.enemies.length; i += 1) {
    for (let j = i + 1; j < world.enemies.length; j += 1) {
      const a = world.enemies[i];
      const b = world.enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const min = a.radius + b.radius;
      if (distance > 0 && distance < min) {
        const push = ((min - distance) / distance) * 0.5;
        a.x -= dx * push * 0.5;
        a.y -= dy * push * 0.5;
        b.x += dx * push * 0.5;
        b.y += dy * push * 0.5;
      }
    }
  }

  // Touch damage, with the warden's brief invulnerability between hits.
  for (const enemy of world.enemies) {
    if (enemy.touchCd > 0) continue;
    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.radius + player.radius - 2) {
      enemy.touchCd = 0.8;
      if (hurtPlayer(world, enemy.damage)) {
        events |= EVENT_HIT;
        if (player.build.thorns > 0) damageEnemy(world, enemy, player.build.thorns, false);
        if (world.over) {
          updateFx(world, dt);
          return events | EVENT_OVER;
        }
      }
    }
  }
  world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);

  // Gloobs drift and sting.
  for (const gloob of world.gloobs) {
    gloob.x += gloob.vx * dt;
    gloob.y += gloob.vy * dt;
    gloob.life -= dt;
    if (Math.hypot(gloob.x - player.x, gloob.y - player.y) < gloob.radius + player.radius - 2) {
      gloob.life = 0;
      if (hurtPlayer(world, gloob.damage)) {
        events |= EVENT_HIT;
        if (world.over) {
          updateFx(world, dt);
          return events | EVENT_OVER;
        }
      }
    }
  }
  world.gloobs = world.gloobs.filter((gloob) => gloob.life > 0);

  // Shards and orbs drift to the warden, then home in when close.
  for (const gem of world.gems) {
    const distance = Math.hypot(player.x - gem.x, player.y - gem.y);
    if (distance < magnetRadius(player)) {
      gem.magnet = true;
      const pull = 900;
      gem.vx += ((player.x - gem.x) / (distance || 1)) * pull * dt * 4;
      gem.vy += ((player.y - gem.y) / (distance || 1)) * pull * dt * 4;
    }
    gem.vx *= 0.90;
    gem.vy *= 0.90;
    gem.x += gem.vx * dt;
    gem.y += gem.vy * dt;
    if (distance < PLAYER.collectRadius + 6) {
      gem.taken = true;
      player.xp += gem.value;
      world.gemsCollected += 1;
      events |= EVENT_PICKUP;
      spawnBurst(world.particles, gem.x, gem.y, '#7ef0c1', 3, 120, 3, 0.3, world.rng);
    }
  }
  world.gems = world.gems.filter((gem) => !gem.taken);
  for (const orb of world.orbs) {
    const distance = Math.hypot(player.x - orb.x, player.y - orb.y);
    if (distance < magnetRadius(player)) {
      orb.magnet = true;
      orb.vx += ((player.x - orb.x) / (distance || 1)) * 900 * dt * 4;
      orb.vy += ((player.y - orb.y) / (distance || 1)) * 900 * dt * 4;
    }
    orb.vx *= 0.90;
    orb.vy *= 0.90;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    if (distance < PLAYER.collectRadius + 8) {
      orb.taken = true;
      player.hp = Math.min(maxHealth(player), player.hp + orb.value);
      events |= EVENT_HEAL;
      spawnText(world.texts, player.x, player.y - 26, `+${orb.value}`, '#ff8fa3', true);
    }
  }
  world.orbs = world.orbs.filter((orb) => !orb.taken);

  // Level up: the run pauses for a blessing choice.
  if (player.xp >= player.xpNeed && !world.choicePending) {
    player.level += 1;
    player.xp -= player.xpNeed;
    player.xpNeed = xpForLevel(player.level);
    world.choices = rollChoices(world.rng, player.owned);
    world.choicePending = true;
    events |= EVENT_LEVELUP;
    spawnBurst(world.particles, player.x, player.y, '#ffd166', 24, 300, 4, 0.8, world.rng);
  }

  updateFx(world, dt);
  return events;
}

/** Particles, texts, shake and flashes age by `dt`, even on end screens. */
function updateFx(world, dt) {
  for (const particle of world.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.94;
    particle.vy *= 0.94;
    particle.life -= dt;
  }
  world.particles = world.particles.filter((particle) => particle.life > 0).slice(-420);
  for (const text of world.texts) {
    text.y -= 42 * dt;
    text.life -= dt;
  }
  world.texts = world.texts.filter((text) => text.life > 0);
  world.shake = Math.max(0, world.shake - dt * 34);
  world.flashRed = Math.max(0, world.flashRed - dt * 1.8);
}

/** Take a blessing from the pending choice and resume the run. */
export function applyChoice(world, blessingId) {
  if (!world.choicePending) return false;
  const blessing = world.choices.find((item) => item.id === blessingId) || blessingById(blessingId);
  if (!blessing) return false;
  applyBlessing(blessing, world.player.build, world.player, world.player.owned);
  if (world.player.scoreBonus) {
    world.score += world.player.scoreBonus;
    world.player.scoreBonus = 0;
  }
  world.player.maxHp = maxHealth(world.player);
  world.choices = [];
  world.choicePending = false;
  return true;
}

/** The title screen's quiet world: wisps drift, nothing hunts. */
export function stepAttract(world, dt) {
  world.time += dt;
  if (world.enemies.length < 5) {
    const angle = world.rng.angle();
    const distance = world.rng.range(220, 520);
    world.enemies.push(createEnemy(
      world.rng.pick(['wisp', 'wisp', 'skitter']),
      world.player.x + Math.cos(angle) * distance,
      world.player.y + Math.sin(angle) * distance,
      1, false, world.rng,
    ));
  }
  for (const enemy of world.enemies) {
    enemy.wobble += dt;
    enemy.x += Math.cos(enemy.wobble * 0.7) * 26 * dt;
    enemy.y += Math.sin(enemy.wobble * 0.9) * 26 * dt;
    clampToArena(enemy, enemy.radius);
  }
  if (world.rng.next() < dt * 2) {
    spawnBurst(world.particles, world.player.x + world.rng.range(-260, 260), world.player.y + world.rng.range(-180, 180), '#ffd166', 1, 12, 3, 1.4, world.rng);
  }
  updateFx(world, dt);
}
