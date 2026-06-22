import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { readRunState } from '../../../domains/engine/state.js';

const runtime = path.resolve('assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs');
const buildScript = path.resolve('scripts', 'build', 'build-classic-runtime.mjs');
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
    const { runClassicCli } = await import('../../../domains/comet-classic/classic-cli.js');
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
    const { runClassicCli } = await import('../../../domains/comet-classic/classic-cli.js');
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

  it('rejects unknown commands after all recognized handlers are registered', async () => {
    const { runClassicCli } = await import('../../../domains/comet-classic/classic-cli.js');

    await expect(runClassicCli(['unknown'])).resolves.toMatchObject({
      exitCode: 64,
      stderr: expect.stringContaining('Unknown Classic command'),
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

  it('executes state and validation commands from a standalone project', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-runtime-state-'));
    temporaryDirectories.push(directory);

    const init = spawnSync(process.execPath, [runtime, 'state', 'init', 'demo', 'full'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const demoDir = path.join(directory, 'openspec', 'changes', 'demo');
    await fs.writeFile(path.join(demoDir, 'proposal.md'), 'proposal\n');
    await fs.writeFile(path.join(demoDir, 'design.md'), 'design\n');
    await fs.writeFile(path.join(demoDir, 'tasks.md'), '- [x] seed\n');
    const get = spawnSync(process.execPath, [runtime, 'state', 'get', 'demo', 'phase'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const set = spawnSync(
      process.execPath,
      [runtime, 'state', 'set', 'demo', 'build_mode', 'executing-plans'],
      { cwd: directory, encoding: 'utf8' },
    );
    const transition = spawnSync(
      process.execPath,
      [runtime, 'state', 'transition', 'demo', 'open-complete'],
      { cwd: directory, encoding: 'utf8' },
    );
    const next = spawnSync(process.execPath, [runtime, 'state', 'next', 'demo'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const validate = spawnSync(process.execPath, [runtime, 'validate', 'demo'], {
      cwd: directory,
      encoding: 'utf8',
    });

    expect(init.status).toBe(0);
    expect(get).toMatchObject({ status: 0, stdout: 'open\n' });
    expect(set.status).toBe(0);
    expect(transition.status).toBe(0);
    expect(next.stdout).toContain('SKILL: comet-design');
    expect(validate.status).toBe(0);
    expect(validate.stderr).toContain('validation PASSED');
  });

  it('keeps task-checkoff validation in the TypeScript state command', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-runtime-task-'));
    temporaryDirectories.push(directory);
    await fs.mkdir(path.join(directory, 'docs'), { recursive: true });
    await fs.writeFile(
      path.join(directory, 'docs', 'plan.md'),
      '- [x] Implement runtime facade\n- [ ] Continue migration\n',
    );

    const pass = spawnSync(
      process.execPath,
      [runtime, 'state', 'task-checkoff', 'docs/plan.md', 'Implement runtime facade'],
      { cwd: directory, encoding: 'utf8' },
    );
    const fail = spawnSync(
      process.execPath,
      [runtime, 'state', 'task-checkoff', 'docs/plan.md', 'Continue migration'],
      { cwd: directory, encoding: 'utf8' },
    );

    expect(pass.status).toBe(0);
    expect(pass.stdout).toContain('TASK_CHECKOFF: PASS');
    expect(fail.status).toBe(1);
    expect(fail.stderr).toContain('task is not checked');
  });

  it('rejects direct writes to machine-owned Run fields', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-runtime-owned-'));
    temporaryDirectories.push(directory);
    spawnSync(process.execPath, [runtime, 'state', 'init', 'demo', 'full'], {
      cwd: directory,
      encoding: 'utf8',
    });

    const result = spawnSync(
      process.execPath,
      [runtime, 'state', 'set', 'demo', 'current_step', 'completed'],
      { cwd: directory, encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown field');
  });

  it('re-resolves the Run step when migrated Classic configuration changes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-runtime-sync-'));
    temporaryDirectories.push(directory);
    spawnSync(process.execPath, [runtime, 'state', 'init', 'demo', 'full'], {
      cwd: directory,
      encoding: 'utf8',
    });
    spawnSync(process.execPath, [runtime, 'state', 'set', 'demo', 'phase', 'build'], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, COMET_FORCE_PHASE: '1' },
    });
    // Full-workflow build source writes require a recorded design_doc, otherwise
    // the hook guard treats it as an illegal phase jump.
    await fs.mkdir(path.join(directory, 'docs'), { recursive: true });
    await fs.writeFile(path.join(directory, 'docs', 'design.md'), 'design\n');
    spawnSync(process.execPath, [runtime, 'state', 'set', 'demo', 'design_doc', 'docs/design.md'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const hook = spawnSync(process.execPath, [runtime, 'hook-guard'], {
      cwd: directory,
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: 'src/index.ts' },
      }),
    });
    expect(hook.status).toBe(0);
    await fs.mkdir(path.join(directory, 'docs'), { recursive: true });
    await fs.writeFile(path.join(directory, 'docs', 'plan.md'), '- [ ] implement\n');

    const set = spawnSync(
      process.execPath,
      [runtime, 'state', 'set', 'demo', 'plan', 'docs/plan.md'],
      { cwd: directory, encoding: 'utf8' },
    );
    const changeDir = path.join(directory, 'openspec', 'changes', 'demo');
    const runState = await readRunState(changeDir);

    expect(set.status).toBe(0);
    expect(runState).not.toBeNull();
    expect(runState!.currentStep).toBe('full.build.configure');
  });
});
