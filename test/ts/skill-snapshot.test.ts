import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createSkillSnapshot, hashSkillPackage } from '../../src/skill/snapshot.js';
import type { SkillPackage } from '../../src/skill/types.js';

const pkg = (root: string): SkillPackage => ({
  root,
  definition: {
    apiVersion: 'comet/v1alpha1',
    kind: 'Skill',
    metadata: { name: 'demo', version: '1', description: 'Demo' },
    goal: { statement: 'Done', inputs: [], outputs: [], success: ['done'] },
    orchestration: { mode: 'adaptive' },
    skills: [],
    agents: [],
    tools: [],
  },
  guardrails: {
    allowedSkills: [],
    allowedAgents: [],
    allowedTools: [],
    maxIterations: 5,
    maxRetriesPerAction: 1,
    confirmationRequiredFor: [],
  },
  evals: [],
});

function withScriptTool(root: string): SkillPackage {
  const value = pkg(root);
  value.definition.tools.push({
    id: 'build',
    kind: 'script',
    source: 'scripts/build.sh',
    sideEffect: 'write',
  });
  value.guardrails.allowedTools.push('build');
  return value;
}

describe('Skill snapshots', () => {
  let root: string;
  let changeDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-snapshot-'));
    changeDir = path.join(root, 'change');
    await fs.mkdir(path.join(root, 'skill'), { recursive: true });
    await fs.writeFile(path.join(root, 'skill', 'SKILL.md'), '# Demo\n');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('is stable across object key order', async () => {
    const first = pkg(path.join(root, 'skill'));
    const second = structuredClone(first);
    second.guardrails = {
      maxRetriesPerAction: 1,
      maxIterations: 5,
      allowedTools: [],
      allowedSkills: [],
      allowedAgents: [],
      confirmationRequiredFor: [],
    };
    expect(await hashSkillPackage(first)).toBe(await hashSkillPackage(second));
  });

  it('includes SKILL.md content in the package hash', async () => {
    const value = pkg(path.join(root, 'skill'));
    const before = await hashSkillPackage(value);

    await fs.writeFile(path.join(value.root, 'SKILL.md'), '# Changed\n');

    expect(await hashSkillPackage(value)).not.toBe(before);
  });

  it('includes declared script Tool content in the package hash', async () => {
    const value = withScriptTool(path.join(root, 'skill'));
    await fs.mkdir(path.join(value.root, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(value.root, 'scripts', 'build.sh'), 'echo first\n');
    const before = await hashSkillPackage(value);

    await fs.writeFile(path.join(value.root, 'scripts', 'build.sh'), 'echo second\n');

    expect(await hashSkillPackage(value)).not.toBe(before);
  });

  it('writes a self-contained normalized snapshot', async () => {
    const value = withScriptTool(path.join(root, 'skill'));
    await fs.mkdir(path.join(value.root, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(value.root, 'scripts', 'build.sh'), 'echo build\n');

    const result = await createSkillSnapshot(value, changeDir);

    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.access(path.join(result.snapshotDir, 'package.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(result.snapshotDir, 'SKILL.md'))).resolves.toBeUndefined();
    await expect(
      fs.readFile(path.join(result.snapshotDir, 'scripts', 'build.sh'), 'utf8'),
    ).resolves.toBe('echo build\n');
  });

  it('keeps published snapshots immutable when the source Skill changes', async () => {
    const value = pkg(path.join(root, 'skill'));
    const first = await createSkillSnapshot(value, changeDir);

    await fs.writeFile(path.join(value.root, 'SKILL.md'), '# Changed\n');
    const second = await createSkillSnapshot(value, changeDir);

    expect(second.hash).not.toBe(first.hash);
    expect(second.snapshotDir).not.toBe(first.snapshotDir);
    await expect(fs.readFile(path.join(first.snapshotDir, 'SKILL.md'), 'utf8')).resolves.toBe(
      '# Demo\n',
    );
    await expect(fs.readFile(path.join(second.snapshotDir, 'SKILL.md'), 'utf8')).resolves.toBe(
      '# Changed\n',
    );
  });

  it('rejects missing declared script Tool sources', async () => {
    const value = withScriptTool(path.join(root, 'skill'));

    await expect(createSkillSnapshot(value, changeDir)).rejects.toThrow(
      'Script tool build does not exist: scripts/build.sh',
    );
  });

  it('rejects directories used as script Tool sources', async () => {
    const value = withScriptTool(path.join(root, 'skill'));
    await fs.mkdir(path.join(value.root, 'scripts', 'build.sh'), { recursive: true });

    await expect(createSkillSnapshot(value, changeDir)).rejects.toThrow(
      'Script tool build is not a file: scripts/build.sh',
    );
  });

  it('rejects script Tool symlinks that escape the Skill package', async () => {
    const value = withScriptTool(path.join(root, 'skill'));
    const outside = path.join(root, 'outside');
    const scripts = path.join(value.root, 'scripts');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'build.sh'), 'echo outside\n');
    await fs.symlink(outside, scripts, process.platform === 'win32' ? 'junction' : 'dir');

    await expect(createSkillSnapshot(value, changeDir)).rejects.toThrow(
      'Script tool build resolves outside the Skill package',
    );
  });
});
