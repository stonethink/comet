import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readRunState } from '../../src/engine/state.js';

const runtime = path.resolve('assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs');
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })),
  );
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'classic-hook-'));
  temporary.push(dir);
  return dir;
}

function run(cwd: string, command: string, args: string[] = [], input?: string) {
  return spawnSync(process.execPath, [runtime, command, ...args], {
    cwd,
    encoding: 'utf8',
    input,
  });
}

function hookInput(filePath: string): string {
  return JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: '// test' },
  });
}

async function seedDesignChange(dir: string): Promise<string> {
  run(dir, 'state', ['init', 'demo', 'full']);
  const changeDir = path.join(dir, 'openspec', 'changes', 'demo');
  // Open→design transition requires the open artifacts to exist first.
  await fs.writeFile(path.join(changeDir, 'proposal.md'), 'proposal\n');
  await fs.writeFile(path.join(changeDir, 'design.md'), 'design\n');
  await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [ ] task\n');
  run(dir, 'state', ['transition', 'demo', 'open-complete']);
  return changeDir;
}

describe('Classic hook guard command', () => {
  it('allows writes when no active change exists', async () => {
    const dir = await makeProject();

    const result = run(dir, 'hook-guard', [], hookInput(path.join(dir, 'src', 'free.ts')));

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('allowed: no active comet change');
  });

  it('blocks source writes in design and silently migrates the active change', async () => {
    const dir = await makeProject();
    const changeDir = await seedDesignChange(dir);

    const result = run(dir, 'hook-guard', [], hookInput(path.join(dir, 'src', 'index.ts')));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('COMET PHASE GUARD');
    expect(result.stderr).toContain('Current phase: design');
    const state = parse(await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(state).toMatchObject({
      classic_migration: 1,
    });
    const runState = await readRunState(changeDir);
    expect(runState).not.toBeNull();
    expect(runState!.skill).toBe('comet-classic');
    expect(runState!.currentStep).toBe('full.design.handoff');
  });

  it('allows OpenSpec artifact writes in design', async () => {
    const dir = await makeProject();
    const changeDir = await seedDesignChange(dir);

    const result = run(dir, 'hook-guard', [], hookInput(path.join(changeDir, 'proposal.md')));

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('phase: design, handoff/spec');
  });

  // The hook guard reads governing state leniently: an unknown field makes the
  // strict projection unavailable, so it falls back to the legacy phase read
  // and still enforces the phase write rule — without rewriting the file.
  it('still blocks and leaves state untouched when the state has an unknown field', async () => {
    const dir = await makeProject();
    const changeDir = await seedDesignChange(dir);
    await fs.appendFile(path.join(changeDir, '.comet.yaml'), 'unknown_root_field: true\n');
    const before = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');

    const result = run(dir, 'hook-guard', [], hookInput(path.join(dir, 'src', 'index.ts')));

    expect(result.status).toBe(2);
    expect(await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8')).toBe(before);
  });
});
