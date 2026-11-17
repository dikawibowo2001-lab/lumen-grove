// The grove blessings: what a level-up offers. Twelve blessings, three ranks
// each; every rank changes how the run plays, so the three cards on offer are a
// real choice. `apply` mutates the warden's build (the multipliers and bonuses
// world.js reads); `describe` says what the next rank does, for the card.

/** Every blessing: id, name, glyph, colour, ranks and what each rank grants. */
export const BLESSINGS = [
  {
    id: 'split', name: 'Ember Split', glyph: '✦', color: '#ffd166', maxRank: 3,
    summary: '+1 ember bolt per volley',
    apply(build) { build.bolts += 1; },
  },
  {
    id: 'might', name: 'Kindled Rounds', glyph: '◆', color: '#ff9f43', maxRank: 3,
    summary: '+30% bolt damage',
    apply(build) { build.damageMul *= 1.3; },
  },
  {
    id: 'rapid', name: 'Rapid Tinder', glyph: '≋', color: '#ffe66d', maxRank: 3,
    summary: '+18% fire rate',
    apply(build) { build.fireRateMul *= 1.18; },
  },
  {
    id: 'swift', name: 'Swiftfoot', glyph: '»', color: '#7ef0c1', maxRank: 3,
    summary: '+12% move speed',
    apply(build) { build.speedMul *= 1.12; },
  },
  {
    id: 'heart', name: 'Heartwood', glyph: '♥', color: '#ff8fa3', maxRank: 3,
    summary: '+25 max health, heal 25',
    apply(build, player) {
      build.maxHpBonus += 25;
      player.hp = Math.min(player.hp + 25, player.maxHp);
    },
  },
  {
    id: 'magnet', name: 'Ember Magnet', glyph: '◎', color: '#8ecae6', maxRank: 3,
    summary: '+45% shard pickup radius',
    apply(build) { build.magnetMul *= 1.45; },
  },
  {
    id: 'pierce', name: 'Piercing Light', glyph: '↗', color: '#e0aaff', maxRank: 3,
    summary: 'Bolts pierce +1 enemy',
    apply(build) { build.pierce += 1; },
  },
  {
    id: 'crit', name: 'Critspark', glyph: '★', color: '#fff3b0', maxRank: 3,
    summary: '+12% critical chance (2x damage)',
    apply(build) { build.critChance += 0.12; },
  },
  {
    id: 'thorns', name: 'Thornbark', glyph: '❈', color: '#95d5b2', maxRank: 3,
    summary: 'Attackers take 12 damage',
    apply(build) { build.thorns += 12; },
  },
  {
    id: 'regen', name: 'Lifespark', glyph: '✚', color: '#b7f0ad', maxRank: 3,
    summary: 'Regenerate +0.7 health per second',
    apply(build) { build.regen += 0.7; },
  },
  {
    id: 'dash', name: 'Dashmaster', glyph: '➤', color: '#90e0ef', maxRank: 3,
    summary: '-25% dash cooldown, dash scorches',
    apply(build) { build.dashCdMul *= 0.75; build.dashBurn = true; },
  },
  {
    id: 'nova', name: 'Nova Bloom', glyph: '✺', color: '#f72585', maxRank: 3,
    summary: 'A nova blast every 6s (30 damage)',
    apply(build) { build.novaDamage += 30; build.novaInterval = 6; },
  },
];

/** The fallback offer when every blessing is maxed: a full heal and points. */
export const FALLBACK_BLESSING = {
  id: 'rest', name: "Grove's Rest", glyph: '☾', color: '#cdb4db', maxRank: 99,
  summary: 'Heal to full and gain 150 score',
  apply(build, player) {
    player.hp = player.maxHp;
    player.scoreBonus = (player.scoreBonus || 0) + 150;
  },
};

/** Find a blessing by id. */
export function blessingById(id) {
  return BLESSINGS.find((item) => item.id === id) || null;
}

/** The warden's starting build: every multiplier at its base. */
export function freshBuild() {
  return {
    bolts: 0,
    damageMul: 1,
    fireRateMul: 1,
    speedMul: 1,
    maxHpBonus: 0,
    magnetMul: 1,
    pierce: 0,
    critChance: 0,
    thorns: 0,
    regen: 0,
    dashCdMul: 1,
    dashBurn: false,
    novaDamage: 0,
    novaInterval: 0,
  };
}

/**
 * Roll three distinct blessings the warden can still rank up, from `owned`
 * (an id-to-rank map). When fewer than three are left, the rest is filled with
 * the grove's rest. The roll is deterministic on the generator given.
 */
export function rollChoices(rng, owned) {
  const available = BLESSINGS.filter((item) => (owned[item.id] || 0) < item.maxRank);
  const choices = [];
  const pool = available.slice();
  while (choices.length < 3 && pool.length > 0) {
    const index = Math.floor(rng.next() * pool.length);
    choices.push(pool.splice(index, 1)[0]);
  }
  while (choices.length < 3) choices.push(FALLBACK_BLESSING);
  return choices;
}

/** Apply a blessing to the warden and record its new rank in `owned`. */
export function applyBlessing(blessing, build, player, owned) {
  blessing.apply(build, player);
  owned[blessing.id] = (owned[blessing.id] || 0) + 1;
}
