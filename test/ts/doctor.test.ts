import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { doctorCommand } from '../../src/commands/doctor.js';

describe('doctor command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `comet-doctor-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts current comet state fields in JSON output', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'current-state');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'build_mode: executing-plans',
        'isolation: branch',
        'verify_mode: full',
        'verify_result: pending',
        'design_doc: docs/superpowers/specs/current-state.md',
        'plan: docs/superpowers/plans/current-state.md',
        'verification_report: docs/superpowers/reports/current-state.md',
        'branch_status: handled',
        'verified_at: null',
        'archived: false',
        'run_id: run-1',
        'skill: demo',
        'skill_version: 1',
        'skill_hash: ' + 'a'.repeat(64),
        'orchestration: deterministic',
        'current_step: start',
        'iteration: 0',
        'pending: null',
        'pending_ref: null',
        'trajectory_ref: null',
        'context_ref: null',
        'artifacts_ref: null',
        'checkpoint_ref: null',
        'run_status: running',
        'run_retries: {}',
        '',
      ].join('\n'),
    );

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
    });
  });

  it('only validates top-level keys in .comet.yaml', async () => {
    const validChangeDir = path.join(tmpDir, 'openspec', 'changes', 'nested-valid');
    await fs.mkdir(validChangeDir, { recursive: true });
    await fs.writeFile(
      path.join(validChangeDir, '.comet.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'verify_result: pending',
        'archived: false',
        'verification_report:',
        '  nested_key: value',
        '',
      ].join('\n'),
    );

    const invalidChangeDir = path.join(tmpDir, 'openspec', 'changes', 'top-level-invalid');
    await fs.mkdir(invalidChangeDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidChangeDir, '.comet.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'unknown_root_field: true',
        '',
      ].join('\n'),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{ check: string; status: string; message: string }>;

    expect(results.find((result) => result.check === '.comet.yaml: nested-valid')).toMatchObject({
      status: 'pass',
    });

    expect(results.find((result) => result.check === '.comet.yaml: top-level-invalid')).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('unknown_root_field'),
    });
  });
});
