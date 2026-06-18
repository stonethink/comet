import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

const sourceScripts = path.resolve('assets', 'skills', 'comet', 'scripts');

function bash(): string | null {
  const candidates = [
    process.env.COMET_TEST_BASH,
    process.env.COMET_BASH,
    'bash',
    ...(process.platform === 'win32'
      ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe']
      : []),
  ].filter((value): value is string => Boolean(value));
  return (
    [...new Set(candidates)].find((candidate) => {
      const result = spawnSync(candidate, ['-lc', 'uname -s'], { encoding: 'utf8' });
      return result.status === 0 && !(process.platform === 'win32' && /linux/i.test(result.stdout));
    }) ?? null
  );
}

function bashPath(value: string): string {
  const normalized = path.resolve(value).replaceAll('\\', '/');
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!drive) return normalized;
  return `/${drive[1].toLowerCase()}/${drive[2]}`;
}

describe.skipIf(!bash())('Skill Engine shell schema compatibility', () => {
  let root: string;
  let stateScript: string;
  let validateScript: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-engine-shell-'));
    await fs.mkdir(path.join(root, 'assets'), { recursive: true });
    for (const name of [
      'comet-state.sh',
      'comet-yaml-validate.sh',
      'comet-guard.sh',
      'comet-handoff.sh',
      'comet-archive.sh',
      'comet-env.sh',
      'comet-runtime.mjs',
    ]) {
      await fs.copyFile(path.join(sourceScripts, name), path.join(root, 'assets', name));
    }
    stateScript = bashPath(path.join(root, 'assets', 'comet-state.sh'));
    validateScript = bashPath(path.join(root, 'assets', 'comet-yaml-validate.sh'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function run(script: string, args: string[]) {
    return spawnSync(bash()!, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  }

  it('sets and validates every Skill Engine projection field', () => {
    expect(run(stateScript, ['init', 'demo', 'full']).status).toBe(0);
    const values: Record<string, string> = {
      run_id: 'run-1',
      skill: 'demo',
      skill_version: '1',
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
      run_retries: '"{}"',
    };
    for (const [field, value] of Object.entries(values)) {
      expect(run(stateScript, ['set', 'demo', field, value]).status, field).toBe(0);
    }
    const result = run(validateScript, ['demo']);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('unknown field');
  }, 30_000);

  it.each([
    ['orchestration', 'freeform'],
    ['iteration', '-1'],
    ['trajectory_ref', '../outside.jsonl'],
  ])('rejects invalid %s=%s', (field, value) => {
    expect(run(stateScript, ['init', 'demo', 'full']).status).toBe(0);
    expect(run(stateScript, ['set', 'demo', field, value]).status).not.toBe(0);
  });
});
