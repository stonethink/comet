import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readRunState, writeRunState } from '../../src/engine/state.js';
import type { RunState } from '../../src/engine/types.js';

const state = (): RunState => ({
  runId: 'run-1',
  skill: 'demo',
  skillVersion: '1',
  skillHash: 'a'.repeat(64),
  orchestration: 'deterministic',
  currentStep: 'start',
  iteration: 0,
  pending: null,
  pendingRef: '.comet/pending-action.json',
  trajectoryRef: '.comet/trajectory.jsonl',
  contextRef: '.comet/context.md',
  artifactsRef: '.comet/artifacts.json',
  checkpointRef: '.comet/checkpoint.json',
  status: 'running',
  retries: {},
});

describe('engine state projection', () => {
  let changeDir: string;

  beforeEach(async () => {
    changeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-engine-state-'));
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      'workflow: full\nphase: build\ncustom_user_field: keep-me\n',
    );
  });

  afterEach(async () => {
    await fs.rm(changeDir, { recursive: true, force: true });
  });

  it('round-trips run fields and preserves legacy and unknown fields', async () => {
    const value = state();
    await writeRunState(changeDir, value);
    expect(await readRunState(changeDir)).toEqual(value);
    const raw = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');
    expect(raw).toContain('workflow: full');
    expect(raw).toContain('custom_user_field: keep-me');
  });

  it('creates .comet.yaml when the state file is absent', async () => {
    await fs.rm(path.join(changeDir, '.comet.yaml'));

    await writeRunState(changeDir, state());

    expect(await readRunState(changeDir)).toEqual(state());
  });

  it('does not replace .comet.yaml when reading it fails', async () => {
    const file = path.join(changeDir, '.comet.yaml');
    await fs.rm(file);
    await fs.mkdir(file);

    await expect(writeRunState(changeDir, state())).rejects.toMatchObject({ syscall: 'read' });
    expect((await fs.stat(file)).isDirectory()).toBe(true);
  });

  it('rejects incomplete Run projections', async () => {
    await fs.writeFile(path.join(changeDir, '.comet.yaml'), 'run_id: run-1\n');

    await expect(readRunState(changeDir)).rejects.toThrow(
      'Invalid Run state: skill must be a non-empty string',
    );
  });

  it('rejects invalid Run counters and retry maps', async () => {
    await writeRunState(changeDir, state());
    const file = path.join(changeDir, '.comet.yaml');
    const raw = await fs.readFile(file, 'utf8');
    await fs.writeFile(
      file,
      raw
        .replace('iteration: 0', 'iteration: -1')
        .replace("run_retries: '{}'", 'run_retries: "[]"'),
    );

    await expect(readRunState(changeDir)).rejects.toThrow(
      'Invalid Run state: iteration must be a non-negative integer',
    );

    await fs.writeFile(file, raw.replace(/^run_retries:.*$/m, 'run_retries: "[]"'));
    await expect(readRunState(changeDir)).rejects.toThrow(
      'Invalid Run state: run_retries must be a JSON object',
    );
  });

  it.each([
    ['absolute', 'pending_ref', '/tmp/pending.json'],
    ['traversal', 'context_ref', '../context.md'],
  ])('rejects %s Run reference paths', async (_name, field, invalidPath) => {
    await writeRunState(changeDir, state());
    const file = path.join(changeDir, '.comet.yaml');
    const raw = await fs.readFile(file, 'utf8');
    await fs.writeFile(
      file,
      raw.replace(new RegExp(`^${field}:.*$`, 'm'), `${field}: ${invalidPath}`),
    );

    await expect(readRunState(changeDir)).rejects.toThrow(
      `Invalid Run state: ${field} must stay inside the change directory`,
    );
  });
});
