import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readRunState, writeRunState } from '../../src/engine/state.js';
import type { RunState } from '../../src/engine/types.js';

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
    const state: RunState = {
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
    };
    await writeRunState(changeDir, state);
    expect(await readRunState(changeDir)).toEqual(state);
    const raw = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');
    expect(raw).toContain('workflow: full');
    expect(raw).toContain('custom_user_field: keep-me');
  });
});
