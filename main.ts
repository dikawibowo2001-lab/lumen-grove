// Lumen Grove's entry program (Node 22, standard library only). The game is
// the static files under game/ beside this file, and screenshots/ holds its
// screenshots; this program hands both in. It clears the output directory's
// game/, screenshots/ and dossier.json, copies the two folders over, and
// writes dossier.json with the vendored make.fun library, so two runs of it
// always write the same bytes. In the grader the output directory is /output;
// anywhere else, MAKEFUN_OUTPUT_DIR stands in for it:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameOut = join(out, 'game');
const shotsOut = join(out, 'screenshots');
const dossierOut = join(out, 'dossier.json');

// Start clean, so a second run writes exactly what the first one did.
rmSync(gameOut, { recursive: true, force: true });
rmSync(shotsOut, { recursive: true, force: true });
rmSync(dossierOut, { force: true });

mkdirSync(out, { recursive: true });
cpSync(join(repo, 'game'), gameOut, { recursive: true });
mkdirSync(shotsOut, { recursive: true });
const shotsIn = join(repo, 'screenshots');
if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });

// The gate's caps: the dossier text is capped at 160 KiB, screenshots at four
// of 256 KiB each, game/ at 993 files and 48 MiB, and a game path at 1,000 bytes.
writeFileSync(
  dossierOut,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
