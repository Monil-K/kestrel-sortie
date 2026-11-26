// Kestrel Sortie — the entry program.
//
// The game itself is plain static files under game/: game/index.html plus the ES modules beside
// it. This program does the hand-in: it stages game/ and screenshots/ where the grader reads
// them, then writes dossier.json with the kit's library, so the judge gets the same bytes the
// repository holds.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Inside the grader MAKEFUN_OUTPUT_DIR is unset and /output is used instead.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own caps. A file over one of them would be refused, so stop here with a sentence
// rather than hand in something the scorer throws out.
const LIMITS = {
  textMaxBytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  gamePathMaxBytes: 1000,
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) out.push(...walk(full));
    else out.push({ path: full, bytes: info.size });
  }
  return out;
}

function stage(source, destination) {
  if (!existsSync(source)) return 0;
  cpSync(source, destination, { recursive: true });
  return walk(destination).length;
}

function assertWithinCaps() {
  const gameDir = join(outputDir, 'game');
  const files = walk(gameDir);
  const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
  if (files.length > LIMITS.gameMaxFiles) {
    throw new Error(`game/ holds ${files.length} files, over the gate's ${LIMITS.gameMaxFiles}`);
  }
  if (bytes > LIMITS.gameMaxBytes) {
    throw new Error(`game/ is ${bytes} bytes, over the gate's ${LIMITS.gameMaxBytes}`);
  }
  for (const file of files) {
    const path = relative(gameDir, file.path);
    if (Buffer.byteLength(path) > LIMITS.gamePathMaxBytes) {
      throw new Error(`game/${path} is too long a path for the gate`);
    }
  }
  const shots = readdirSync(join(outputDir, 'screenshots'))
    .filter((name) => /\.(png|jpe?g)$/i.test(name))
    .map((name) => ({ name, bytes: statSync(join(outputDir, 'screenshots', name)).size }));
  if (shots.length < 3 || shots.length > LIMITS.screenshots.max) {
    throw new Error(`screenshots/ holds ${shots.length} images; the gate takes 3 or 4`);
  }
  for (const shot of shots) {
    if (shot.bytes > LIMITS.screenshots.max_bytes) {
      throw new Error(`screenshots/${shot.name} is ${shot.bytes} bytes, over the gate's 256 KiB`);
    }
  }
  return { files: files.length, bytes, shots: shots.length };
}

mkdirSync(outputDir, { recursive: true });

const gameFiles = stage(join(repoRoot, 'game'), join(outputDir, 'game'));
const shotFiles = stage(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
const caps = assertWithinCaps();

const dossier = buildDossier(outputDir, {
  text_max_bytes: LIMITS.textMaxBytes,
  screenshots: LIMITS.screenshots,
  game_max_files: LIMITS.gameMaxFiles,
  game_max_bytes: LIMITS.gameMaxBytes,
  game_path_max_bytes: LIMITS.gamePathMaxBytes,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(
  `Kestrel Sortie staged: ${gameFiles} game files, ${shotFiles} screenshots ` +
  `(${caps.bytes} bytes of game), dossier ${Buffer.byteLength(dossier)} bytes -> ${outputDir}`,
);
