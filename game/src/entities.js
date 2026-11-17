// The things that live in the arena: the gloom's kinds, the warden's bolts,
// gloobs, ember shards, heal orbs, particles and floating text. Factories make
// them, and updateEnemy moves each kind the way it behaves. Nothing here
// touches the DOM: the simulation stays testable on its own.

/** The gloom's kinds: base stats and the look render.js draws. */
export const ENEMY_KINDS = {
  wisp: {
    name: 'Wisp', hp: 18, speed: 96, damage: 8, radius: 14, xp: 1, score: 10,
    color: '#8b7ff0', core: '#cfc6ff', behavior: 'chase',
  },
  skitter: {
    name: 'Skitter', hp: 12, speed: 148, damage: 6, radius: 11, xp: 1, score: 15,
    color: '#4cc9f0', core: '#bdefff', behavior: 'lunge',
  },
  spitter: {
    name: 'Spitter', hp: 24, speed: 82, damage: 8, radius: 15, xp: 2, score: 20,
    color: '#80ed99', core: '#e2ffe9', behavior: 'spit',
  },
  bulwark: {
    name: 'Bulwark', hp: 95, speed: 56, damage: 16, radius: 26, xp: 4, score: 30,
    color: '#f72585', core: '#ffb3c6', behavior: 'chase',
  },
  splitter: {
    name: 'Splitter', hp: 28, speed: 88, damage: 10, radius: 17, xp: 2, score: 25,
    color: '#ff9f1c', core: '#ffe8b3', behavior: 'chase',
  },
};

/** The Gloom Herald: the boss of wave 10. */
export const BOSS_KIND = {
  name: 'Gloom Herald', hp: 1500, speed: 74, damage: 24, radius: 46, xp: 50, score: 500,
  color: '#b5179e', core: '#f8b4e8', behavior: 'boss',
};

/** Wave scaling: health and speed grow a little every wave. */
export function waveScale(wave) {
  return { hp: 1 + 0.13 * (wave - 1), speed: Math.min(1.35, 1 + 0.022 * (wave - 1)) };
}

/** Make an enemy of `kind` at a position, scaled to `wave`; elites are bigger. */
export function createEnemy(kind, x, y, wave, elite = false, rng = null) {
  const base = kind === 'boss' ? BOSS_KIND : ENEMY_KINDS[kind];
  const scale = waveScale(wave);
  const hp = Math.round(base.hp * scale.hp * (elite ? 3.2 : 1));
  return {
    kind, x, y, elite,
    hp, maxHp: hp,
    speed: base.speed * scale.speed * (elite ? 0.92 : 1),
    damage: base.damage + (elite ? 4 : 0),
    radius: base.radius * (elite ? 1.5 : 1),
    xp: base.xp * (elite ? 5 : 1),
    score: base.score * (elite ? 3 : 1),
    vx: 0, vy: 0,
    touchCd: 0,
    spitCd: 1.5,
    lungeCd: 1.2,
    lunging: 0,
    summonCd: 8,
    burstCd: 3.5,
    chargeCd: 10,
    charging: 0,
    chargeVx: 0, chargeVy: 0,
    flash: 0,
    wobble: rng ? rng.next() * Math.PI * 2 : 0,
  };
}

/** A bolt the warden fired: it flies straight and fades past its range. */
export function createBolt(x, y, angle, damage, pierce, crit, speed) {
  return {
    x, y, angle, damage, pierce, crit,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1.4,
    radius: 6,
    hit: new Set(),
  };
}

/** A gloob an enemy spat: slow, round, and hurts on touch. */
export function createGloob(x, y, angle, damage, speed) {
  return {
    x, y, damage,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 6,
    radius: 7,
  };
}

/** An ember shard: XP the warden collects. */
export function createGem(x, y, value, rng = null) {
  return { x, y, value, vx: 0, vy: 0, magnet: false, bob: rng ? rng.next() * Math.PI * 2 : 0 };
}

/** A heal orb: dropped by elites and the Herald. */
export function createHealOrb(x, y, rng = null) {
  return { x, y, value: 25, vx: 0, vy: 0, magnet: false, bob: rng ? rng.next() * Math.PI * 2 : 0 };
}

/** A spark of light: particles drift, fade and die. Rolls go through `rng`. */
export function spawnBurst(particles, x, y, color, count, speed, size, life, rng = null) {
  const roll = () => (rng ? rng.next() : Math.random());
  for (let i = 0; i < count; i += 1) {
    const angle = roll() * Math.PI * 2;
    const power = speed * (0.3 + roll() * 0.7);
    particles.push({
      x, y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      size: size * (0.6 + roll() * 0.8),
      color,
      life: life * (0.6 + roll() * 0.7),
      maxLife: life,
    });
  }
}

/** A floating number: damage dealt, healing, or a pickup. */
export function spawnText(texts, x, y, content, color, big = false) {
  texts.push({ x, y, content, color, big, life: 0.9, maxLife: 0.9 });
}

/**
 * Steer one enemy for a step. Returns gloobs it spat (for spitters and the
 * boss) and children it summoned (the boss only). `player` is the warden's
 * position; `dt` is the step length; `rng` rolls its decisions.
 */
export function updateEnemy(enemy, player, dt, rng) {
  const spawned = { gloobs: [], children: [] };
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;
  enemy.touchCd = Math.max(0, enemy.touchCd - dt);
  enemy.flash = Math.max(0, enemy.flash - dt * 6);

  if (enemy.kind === 'skitter') {
    enemy.lungeCd -= dt;
    if (enemy.lunging > 0) {
      enemy.lunging -= dt;
      enemy.vx = nx * enemy.speed * 2.4;
      enemy.vy = ny * enemy.speed * 2.4;
    } else if (enemy.lungeCd <= 0 && distance < 320) {
      enemy.lunging = 0.35;
      enemy.lungeCd = 1.6 + rng.next() * 0.8;
      enemy.vx = nx * enemy.speed * 2.4;
      enemy.vy = ny * enemy.speed * 2.4;
    } else {
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
    }
  } else if (enemy.kind === 'spitter') {
    enemy.spitCd -= dt;
    if (distance > 300) {
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
    } else if (distance < 210) {
      enemy.vx = -nx * enemy.speed * 0.8;
      enemy.vy = -ny * enemy.speed * 0.8;
    } else {
      enemy.vx = -ny * enemy.speed * 0.5;
      enemy.vy = nx * enemy.speed * 0.5;
    }
    if (enemy.spitCd <= 0 && distance < 460) {
      enemy.spitCd = 2.3;
      spawned.gloobs.push(createGloob(enemy.x, enemy.y, Math.atan2(dy, dx), enemy.damage, 235));
    }
  } else if (enemy.kind === 'boss') {
    enemy.burstCd -= dt;
    enemy.summonCd -= dt;
    enemy.chargeCd -= dt;
    if (enemy.charging > 0) {
      enemy.charging -= dt;
      enemy.vx = enemy.chargeVx;
      enemy.vy = enemy.chargeVy;
    } else if (enemy.chargeCd <= 0 && distance < 520) {
      enemy.chargeCd = 10;
      enemy.charging = 0.55;
      enemy.chargeVx = nx * 520;
      enemy.chargeVy = ny * 520;
    } else {
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
    }
    if (enemy.burstCd <= 0) {
      enemy.burstCd = 3.6;
      const count = 10;
      const offset = rng.next() * Math.PI * 2;
      for (let i = 0; i < count; i += 1) {
        spawned.gloobs.push(createGloob(enemy.x, enemy.y, offset + (i / count) * Math.PI * 2, 10, 200));
      }
    }
    if (enemy.summonCd <= 0) {
      enemy.summonCd = 9;
      for (let i = 0; i < 3; i += 1) {
        const angle = rng.next() * Math.PI * 2;
        spawned.children.push(createEnemy('wisp', enemy.x + Math.cos(angle) * 70, enemy.y + Math.sin(angle) * 70, 10, false, rng));
      }
    }
  } else {
    // Wisps, bulwarks and splitters walk straight at the warden.
    enemy.vx = nx * enemy.speed;
    enemy.vy = ny * enemy.speed;
  }

  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  return spawned;
}
