#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { cpSync, existsSync, rmSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const runTsc = (args = []) => {
  const tscPath = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tscPath, ...args], { stdio: 'inherit' });
};

const buildClassicRuntime = () => {
  execFileSync(process.execPath, ['scripts/build/build-classic-runtime.mjs'], {
    stdio: 'inherit',
  });
};

console.log('Building Comet...\n');

if (existsSync('dist')) {
  console.log('Cleaning dist directory...');
  rmSync('dist', { recursive: true, force: true });
}

console.log('Building Classic runtime...');
try {
  buildClassicRuntime();
  console.log('Compiling TypeScript...');
  runTsc(['--version']);
  runTsc();

  // Mirror non-TS dashboard frontend assets (HTML/CSS/JS) into dist so the
  // packaged tarball can serve them. TypeScript itself ignores these files.
  const webSrc = path.join('domains', 'dashboard', 'web');
  if (existsSync(webSrc)) {
    const webDest = path.join('dist', 'domains', 'dashboard', 'web');
    cpSync(webSrc, webDest, { recursive: true });
  }

  console.log('\nBuild completed successfully!');
} catch (error) {
  console.error('\nBuild failed!');
  process.exit(1);
}
