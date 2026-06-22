#!/usr/bin/env node

import { build } from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';
import { readRepositoryLayout, resolveRepositoryPath } from '../lib/repository-layout.mjs';

const layout = readRepositoryLayout();
const repoRoot = resolveRepositoryPath('.');
const outputFile = resolveRepositoryPath(layout.classicRuntime.output);

async function bundledRuntime() {
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [layout.classicRuntime.entry],
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
    banner: {
      js: [
        '#!/usr/bin/env node',
        "import { createRequire as __cometCreateRequire } from 'module';",
        'const require = __cometCreateRequire(import.meta.url);',
      ].join('\n'),
    },
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
      console.error(`Classic runtime is missing: ${layout.classicRuntime.output}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (!actual.equals(expected)) {
    console.error(`Classic runtime is stale: run node scripts/build/build-classic-runtime.mjs`);
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
