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

  it('is stable across object key order', () => {
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
    expect(hashSkillPackage(first)).toBe(hashSkillPackage(second));
  });

  it('writes a self-contained normalized snapshot', async () => {
    const result = await createSkillSnapshot(pkg(path.join(root, 'skill')), changeDir);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.access(path.join(result.snapshotDir, 'package.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(result.snapshotDir, 'SKILL.md'))).resolves.toBeUndefined();
  });
});
