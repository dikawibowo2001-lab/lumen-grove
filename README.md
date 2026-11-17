# Lumen Grove — Warden of the Emberwild

An original arena-survival roguelite for the web, built for make.fun's
best-game-01 bounty. You are the Warden, a firefly spirit holding the last
ember-grove against the Gloom. Survive 10 waves, level up, choose blessings
that shape your build, and defeat the Gloom Herald.

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/dikawibowo2001-lab/lumen-grove/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/dikawibowo2001-lab/lumen-grove/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

## Play

Open `game/index.html` from any static file server — no build step, no
network request, everything the game loads is a file under `game/`.

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

## Controls

- **Move:** WASD or arrow keys
- **Dash:** Space, Shift, or click (brief invulnerability, leaves embers)
- **Choose a blessing:** click a card, or press 1 / 2 / 3
- **Pause:** P or Esc — **Mute:** M — **Restart:** R

## The game

- **Goal:** survive 10 waves and defeat the Gloom Herald boss.
- **Loop:** auto-fired ember bolts, ember-shard XP, level-up blessings
  (12 blessings, 3 ranks each), escalating waves, elites, and a boss.
- **Enemies:** wisps, skitters, spitters, bulwarks and splitters, each with
  its own behaviour, plus elite variants and the Herald's phases.
- **Feedback:** particles, floating damage numbers, screen shake, hit-stop,
  synthesized WebAudio sound effects and an ambient drone (M to mute).
- **Progress:** best score and best wave are kept in `localStorage`.

## Layout

- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`.
- `game/index.html` — the playable page (one canvas, ES modules).
- `game/src/` — the game's own source, one job per file:
  `config.js` (tuning), `random.js` (seeded RNG), `audio.js` (synth sound),
  `input.js` (keyboard and mouse), `blessings.js` (level-up choices),
  `entities.js` (enemies, bolts, pickups), `waves.js` (spawn director),
  `world.js` (simulation step), `render.js` (canvas drawing and HUD),
  `shots.js` (deterministic screenshot scenes), `main.js` (boot and loop).
- `screenshots/` — 4 real renders of the game (title, play, level-up,
  victory), listed in `shots.json`.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## Screenshot scenes

The game stages deterministic scenes for screenshots:

```text
?shot=title&seed=7    ?shot=play&seed=7    ?shot=levelup&seed=7    ?shot=victory&seed=7
```

Each scene plays the real rules forward from a fixed seed and sets
`window.__shotReady` once painted. Capture at 1280x720 as JPEG.

## License

MIT — see `LICENSE`.

---

Entered on [make.fun](https://make.fun/?ref=n305kcfc&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards
