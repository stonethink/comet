#!/usr/bin/env node

import { build } from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = path.join(repoRoot, 'assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs');

async function bundledRuntime() {
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: ['src/compat/classic-cli.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: ['node20'],
    packages: 'bundle',
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
    treeShaking: true,
    banner: { js: '#!/usr/bin/env node' },
  });

  if (result.outputFiles.length !== 1) {
    throw new Error(`Expected one Classic runtime output, got ${result.outputFiles.length}`);
  }
  return result.outputFiles[0].contents;
}

async function checkFreshness(expected) {
  let actual;
  try {
    actual = await fs.readFile(outputFile);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Classic runtime is missing: ${path.relative(repoRoot, outputFile)}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (!actual.equals(expected)) {
    console.error(`Classic runtime is stale: run node scripts/build-classic-runtime.mjs`);
    process.exitCode = 1;
  }
}

const output = Buffer.from(await bundledRuntime());
if (process.argv.includes('--check')) {
  await checkFreshness(output);
} else {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, output);
}
