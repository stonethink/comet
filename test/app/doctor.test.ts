import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { doctorCommand } from '../../app/commands/doctor.js';

const runtime = path.resolve('assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs');

function state(cwd: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (args[0] === 'set' && args[2] === 'phase') {
    // Direct phase writes are normally blocked; the force hatch is the
    // documented way for tooling/tests to seed a change into a specific phase.
    env.COMET_FORCE_PHASE = '1';
  }
  return spawnSync(process.execPath, [runtime, 'state', ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
}

describe('doctor command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `comet-doctor-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts current comet state fields in JSON output', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'current-state');
    state(tmpDir, 'init', 'current-state', 'full');
    state(tmpDir, 'set', 'current-state', 'phase', 'verify');
    const before = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{ check: string; status: string }>;
    expect(results.find((result) => result.check === '.comet.yaml: current-state')).toMatchObject({
      status: 'pass',
      message: expect.stringContaining('full.verify.run'),
    });
    expect(await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8')).not.toBe(before);
  });

  it('uses the shared schema and leaves invalid state untouched', async () => {
    const invalidChangeDir = path.join(tmpDir, 'openspec', 'changes', 'top-level-invalid');
    state(tmpDir, 'init', 'top-level-invalid', 'full');
    await fs.appendFile(path.join(invalidChangeDir, '.comet.yaml'), 'unknown_root_field: true\n');
    const before = await fs.readFile(path.join(invalidChangeDir, '.comet.yaml'), 'utf8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{
      check: string;
      status: string;
      message: string;
    }>;

    expect(
      results.find((result) => result.check === '.comet.yaml: top-level-invalid'),
    ).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('unknown_root_field'),
    });
    expect(await fs.readFile(path.join(invalidChangeDir, '.comet.yaml'), 'utf8')).toBe(before);
  });
});
