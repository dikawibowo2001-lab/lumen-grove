// A small seeded random generator (mulberry32), so a run or a screenshot scene
// from one seed always plays the same way. The simulation never uses
// Math.random: every roll goes through the world's generator.

/** Make a generator from any 32-bit seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return {
    /** Next float in [0, 1). */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Float in [min, max). */
    range(min, max) {
      return min + this.next() * (max - min);
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    /** One element of an array. */
    pick(items) {
      return items[Math.floor(this.next() * items.length)];
    },
    /** A random angle in radians. */
    angle() {
      return this.next() * Math.PI * 2;
    },
  };
}
