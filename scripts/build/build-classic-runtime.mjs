#!/usr/bin/env node

import { build } from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';
import { readRepositoryLayout, resolveRepositoryPath } from '../lib/repository-layout.mjs';

const layout = readRepositoryLayout();
const repoRoot = resolveRepositoryPath('.');
const runtimeScripts = Object.entries(layout.classicRuntime.outputs).map(([name, output]) => {
  const entry = layout.classicRuntime.entries[name];
  if (!entry) {
    throw new Error(`Classic runtime script "${name}" is missing an entry`);
  }
  return {
    name,
    entry,
    output,
    outputFile: resolveRepositoryPath(output),
  };
});

async function bundledRuntime(script) {
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [script.entry],
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
    throw new Error(
      `Expected one Classic runtime output for ${script.name}, got ${result.outputFiles.length}`,
    );
  }
  return result.outputFiles[0].contents;
}

async function checkFreshness(script, expected) {
  let actual;
  try {
    actual = await fs.readFile(script.outputFile);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Classic runtime script is missing: ${script.output}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (!actual.equals(expected)) {
    console.error(
      `Classic runtime script is stale: ${script.output}; run node scripts/build/build-classic-runtime.mjs`,
    );
    process.exitCode = 1;
  }
}

const outputs = await Promise.all(
  runtimeScripts.map(async (script) => ({
    script,
    output: Buffer.from(await bundledRuntime(script)),
  })),
);

if (process.argv.includes('--check')) {
  for (const { script, output } of outputs) {
    await checkFreshness(script, output);
  }
} else {
  for (const { script, output } of outputs) {
    await fs.mkdir(path.dirname(script.outputFile), { recursive: true });
    await fs.writeFile(script.outputFile, output);
  }
}
