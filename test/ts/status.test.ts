import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { statusCommand } from '../../src/commands/status.js';

const runtime = path.resolve('assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs');

function state(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [runtime, 'state', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, COMET_FORCE_PHASE: '1' },
  });
}

describe('status command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `comet-status-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints the next command for active changes', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'next-build');
    state(tmpDir, 'init', 'next-build', 'full');
    state(tmpDir, 'set', 'next-build', 'phase', 'build');
    state(tmpDir, 'set', 'next-build', 'build_mode', 'executing-plans');
    state(tmpDir, 'set', 'next-build', 'tdd_mode', 'tdd');
    state(tmpDir, 'set', 'next-build', 'isolation', 'branch');
    state(tmpDir, 'set', 'next-build', 'verify_mode', 'light');
    state(tmpDir, 'set', 'next-build', 'design_doc', 'docs/superpowers/specs/next-build.md');
    state(tmpDir, 'set', 'next-build', 'plan', 'docs/superpowers/plans/next-build.md');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [x] done\n- [ ] todo\n');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';
    try {
      await statusCommand(tmpDir);
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(output).toContain('next: /comet-build');
    expect(output).toContain('[1/2 tasks]');
    expect(output).toContain('run_step: full.build.plan');
  });

  it('silently migrates legacy state and includes the Run step in JSON output', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'next-verify');
    state(tmpDir, 'init', 'next-verify', 'full');
    state(tmpDir, 'set', 'next-verify', 'phase', 'verify');
    const before = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await statusCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const change = JSON.parse(json).changes[0];
    expect(change.nextCommand).toBe('/comet-verify');
    expect(change.currentStep).toBe('full.verify.run');
    expect(await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8')).not.toBe(before);
  });

  it('reports invalid state without modifying it', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'invalid');
    state(tmpDir, 'init', 'invalid', 'full');
    await fs.appendFile(path.join(changeDir, '.comet.yaml'), 'unknown_root_field: true\n');
    const before = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await statusCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(JSON.parse(json).changes[0]).toMatchObject({
      name: 'invalid',
      phase: 'invalid',
      error: expect.stringContaining('unknown_root_field'),
    });
    expect(await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8')).toBe(before);
  });
});
