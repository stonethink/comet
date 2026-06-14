import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const runtime = path.resolve('assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs');
const buildScript = path.resolve('scripts', 'build-classic-runtime.mjs');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
      ),
  );
});

describe('Classic runtime CLI adapter', () => {
  it('routes a command and preserves stdout, stderr, and exit code', async () => {
    const { runClassicCli } = await import('../../src/compat/classic-cli.js');
    const result = await runClassicCli(['state', 'get', 'phase'], {
      state: async (args) => ({
        exitCode: 3,
        stdout: args.join('|'),
        stderr: 'diagnostic',
      }),
    });

    expect(result).toEqual({
      exitCode: 3,
      stdout: 'get|phase',
      stderr: 'diagnostic',
    });
  });

  it('serializes the complete command result for internal --json callers', async () => {
    const { runClassicCli } = await import('../../src/compat/classic-cli.js');
    const result = await runClassicCli(['validate', '--json', 'change-dir'], {
      validate: async (_args, options) => ({
        exitCode: 2,
        stdout: options.json ? 'structured' : 'plain',
        stderr: 'invalid state',
      }),
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBeUndefined();
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      command: 'validate',
      exitCode: 2,
      stdout: 'structured',
      stderr: 'invalid state',
    });
  });

  it('distinguishes unknown commands from recognized commands awaiting handlers', async () => {
    const { runClassicCli } = await import('../../src/compat/classic-cli.js');

    await expect(runClassicCli(['unknown'])).resolves.toMatchObject({
      exitCode: 64,
      stderr: expect.stringContaining('Unknown Classic command'),
    });
    await expect(runClassicCli(['guard'])).resolves.toMatchObject({
      exitCode: 70,
      stderr: expect.stringContaining('not implemented'),
    });
  });
});

describe('Classic runtime bundle', () => {
  it('runs without dist or node_modules and exposes JSON diagnostics', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-runtime-'));
    temporaryDirectories.push(directory);
    const isolatedRuntime = path.join(directory, 'comet-runtime.mjs');
    await fs.copyFile(runtime, isolatedRuntime);

    const result = spawnSync(process.execPath, [isolatedRuntime, 'unknown', '--json'], {
      cwd: directory,
      encoding: 'utf8',
    });

    expect(result.status).toBe(64);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: 'unknown',
      exitCode: 64,
    });
  });

  it('is fresh and listed in the shipped manifest', async () => {
    const check = spawnSync(process.execPath, [buildScript, '--check'], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    });
    const manifest = JSON.parse(
      await fs.readFile(path.resolve('assets', 'manifest.json'), 'utf8'),
    ) as {
      skills: string[];
    };

    expect(check.status, check.stderr || check.stdout).toBe(0);
    expect(manifest.skills).toContain('comet/scripts/comet-runtime.mjs');
  });
});
