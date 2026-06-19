import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

const sourceScripts = path.resolve('assets', 'skills', 'comet', 'scripts');

describe('Skill Engine schema compatibility', () => {
  let root: string;
  let stateScript: string;
  let validateScript: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-engine-'));
    await fs.mkdir(path.join(root, 'assets'), { recursive: true });
    for (const name of [
      'comet-state.mjs',
      'comet-yaml-validate.mjs',
      'comet-guard.mjs',
      'comet-handoff.mjs',
      'comet-archive.mjs',
      'comet-env.mjs',
      'comet-runtime.mjs',
    ]) {
      await fs.copyFile(path.join(sourceScripts, name), path.join(root, 'assets', name));
    }
    stateScript = path.join(root, 'assets', 'comet-state.mjs');
    validateScript = path.join(root, 'assets', 'comet-yaml-validate.mjs');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function run(script: string, args: string[]) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  }

  // Run projection fields are machine-owned (the engine writes them via the
  // Run store, never via `comet-state set`), so this writes them directly to
  // .comet.yaml — exactly as the engine would — and confirms the schema
  // accepts every field.
  async function writeRunState(overrides: Record<string, string> = {}): Promise<void> {
    const yamlPath = path.join(root, 'openspec', 'changes', 'demo', '.comet.yaml');
    const base = await fs.readFile(yamlPath, 'utf8');
    const fields: Record<string, string> = {
      run_id: 'run-1',
      skill: 'demo',
      skill_version: "'1'",
      skill_hash: 'a'.repeat(64),
      orchestration: 'deterministic',
      current_step: 'start',
      iteration: '0',
      pending: 'null',
      pending_ref: '.comet/pending-action.json',
      trajectory_ref: '.comet/trajectory.jsonl',
      context_ref: '.comet/context.md',
      artifacts_ref: '.comet/artifacts.json',
      checkpoint_ref: '.comet/checkpoint.json',
      run_status: 'running',
      run_retries: '{}',
    };
    Object.assign(fields, overrides);
    const block = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n';
    await fs.writeFile(yamlPath, base + block);
  }

  it('validates every Skill Engine projection field written as the engine would', async () => {
    expect(run(stateScript, ['init', 'demo', 'full']).status).toBe(0);
    await writeRunState();
    const result = run(validateScript, ['demo']);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('unknown field');
  }, 30_000);

  it.each([
    ['orchestration', 'freeform'],
    ['iteration', '-1'],
    ['trajectory_ref', '../outside.jsonl'],
  ])('rejects invalid %s=%s', async (field, value) => {
    expect(run(stateScript, ['init', 'demo', 'full']).status).toBe(0);
    await writeRunState({ [field]: value });
    const result = run(validateScript, ['demo']);
    expect(result.status).not.toBe(0);
  });
});
