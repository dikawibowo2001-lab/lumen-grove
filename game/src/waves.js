// The spawn director: what each wave throws at the warden, and when. Waves 1
// to 9 trickle the gloom in from the dark; wave 10 is the Gloom Herald, with a
// thin stream of wisps behind it. Every pick goes through the world's seeded
// generator, so one seed always builds the same waves.

import { ARENA, FINAL_WAVE } from './config.js';
import { createEnemy } from './entities.js';

/** Mix weights by wave: new kinds join as the run goes on. */
function mixFor(wave) {
  const mix = [{ kind: 'wisp', weight: 10 }];
  if (wave >= 2) mix.push({ kind: 'skitter', weight: 4 + wave });
  if (wave >= 3) mix.push({ kind: 'spitter', weight: 2 + wave });
  if (wave >= 4) mix.push({ kind: 'bulwark', weight: 1 + Math.floor(wave / 2) });
  if (wave >= 5) mix.push({ kind: 'splitter', weight: 2 + Math.floor(wave / 2) });
  return mix;
}

function pickKind(rng, mix) {
  let total = 0;
  for (const entry of mix) total += entry.weight;
  let roll = rng.next() * total;
  for (const entry of mix) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return 'wisp';
}

/** A spawn point at the arena's edge, well away from the warden. */
export function spawnPoint(rng, player) {
  for (let tries = 0; tries < 12; tries += 1) {
    const angle = rng.angle();
    const distance = rng.range(430, 620);
    const x = Math.max(40, Math.min(ARENA.width - 40, player.x + Math.cos(angle) * distance));
    const y = Math.max(40, Math.min(ARENA.height - 40, player.y + Math.sin(angle) * distance));
    if (Math.hypot(x - player.x, y - player.y) > 400) return { x, y };
  }
  const edge = rng.pick([
    { x: 60, y: 60 },
    { x: ARENA.width - 60, y: 60 },
    { x: 60, y: ARENA.height - 60 },
    { x: ARENA.width - 60, y: ARENA.height - 60 },
  ]);
  return edge;
}

/** Make a director. startWave builds the queue; update trickles it out. */
export function createDirector() {
  return {
    queue: [],
    timer: 0,
    interval: 1,
    total: 0,
    bossSpawned: false,
    trickleTimer: 0,
  };
}

/** Build wave `n`'s queue: a list of kinds, shuffled by the generator. */
export function startWave(director, wave, rng) {
  director.queue = [];
  director.bossSpawned = false;
  director.trickleTimer = 0;
  if (wave === FINAL_WAVE) {
    director.total = 1;
    director.interval = 6;
    director.timer = 0;
    return;
  }
  const count = 12 + wave * 4;
  const mix = mixFor(wave);
  const elites = wave >= 4 ? 1 + Math.floor((wave - 4) / 3) : 0;
  for (let i = 0; i < count; i += 1) director.queue.push({ kind: pickKind(rng, mix), elite: false });
  for (let i = 0; i < elites && i < director.queue.length; i += 1) {
    director.queue[Math.floor(rng.next() * director.queue.length)].elite = true;
  }
  // Shuffle the queue so the wave never arrives in one kind's clump.
  for (let i = director.queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [director.queue[i], director.queue[j]] = [director.queue[j], director.queue[i]];
  }
  director.total = director.queue.length;
  director.interval = Math.max(0.3, 0.85 - wave * 0.06);
  director.timer = 0.4;
}

/** Trickle the queue into the world; returns enemies spawned this step. */
export function updateDirector(director, wave, world, dt) {
  const spawned = [];
  if (wave === FINAL_WAVE) {
    if (!director.bossSpawned) {
      director.bossSpawned = true;
      const point = spawnPoint(world.rng, world.player);
      const boss = createEnemy('boss', point.x, point.y, wave, false, world.rng);
      world.enemies.push(boss);
      world.boss = boss;
      spawned.push(boss);
      return spawned;
    }
    director.trickleTimer -= dt;
    if (director.trickleTimer <= 0 && world.enemies.length < 14) {
      director.trickleTimer = 6;
      const point = spawnPoint(world.rng, world.player);
      const wisp = createEnemy('wisp', point.x, point.y, wave, false, world.rng);
      world.enemies.push(wisp);
      spawned.push(wisp);
    }
    return spawned;
  }
  if (director.queue.length === 0) return spawned;
  director.timer -= dt;
  while (director.timer <= 0 && director.queue.length > 0) {
    director.timer += director.interval;
    const next = director.queue.shift();
    const point = spawnPoint(world.rng, world.player);
    const enemy = createEnemy(next.kind, point.x, point.y, wave, next.elite, world.rng);
    world.enemies.push(enemy);
    spawned.push(enemy);
  }
  return spawned;
}

/** True when the wave has nothing left to send and nothing left standing. */
export function waveCleared(director, world) {
  return director.queue.length === 0 && world.enemies.length === 0 && !world.boss;
}
