import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { discoverBundleCandidates } from '../../src/bundle/candidates.js';
import { readSkillPreferences } from '../../src/bundle/preferences.js';

async function writeSkill(root: string, name: string, description: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, 'SKILL.md'),
    `---
name: ${name}
description: ${description}
---

# ${name}
`,
  );
}

describe('Bundle candidate preferences and discovery', () => {
  let root: string;
  let projectRoot: string;
  let homeDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-bundle-candidates-'));
    projectRoot = path.join(root, 'project');
    homeDir = path.join(root, 'home');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(homeDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('ignores comments and blanks while preserving first preference order', async () => {
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skills.txt'),
      `
# preferred skills
brainstorming
writing-plans
brainstorming
  test-driven-development
`,
    );

    await expect(readSkillPreferences(projectRoot)).resolves.toEqual([
      'brainstorming',
      'writing-plans',
      'test-driven-development',
    ]);
  });

  it('returns null when the preferences file is missing', async () => {
    await expect(readSkillPreferences(projectRoot)).resolves.toBeNull();
  });

  it('reports invalid preference names as missing without reading outside Skill roots', async () => {
    const outside = path.join(projectRoot, '.claude', 'outside');
    await writeSkill(outside, 'outside', 'Must not be discovered through traversal.');

    const result = await discoverBundleCandidates({
      projectRoot,
      homeDir,
      preferences: ['../outside'],
    });

    expect(result).toEqual([{ name: '../outside', status: 'missing', sources: [] }]);
  });

  it('reads actual SKILL.md descriptions and reports ambiguous providers', async () => {
    const claudeSkill = path.join(projectRoot, '.claude', 'skills', 'brainstorming');
    const codexSkill = path.join(homeDir, '.codex', 'skills', 'brainstorming');
    await writeSkill(claudeSkill, 'brainstorming', 'Explore intent before implementation.');
    await writeSkill(codexSkill, 'brainstorming', 'Generate and compare design options.');

    const result = await discoverBundleCandidates({
      projectRoot,
      homeDir,
      preferences: ['brainstorming', 'missing'],
    });

    expect(result).toEqual([
      {
        name: 'brainstorming',
        status: 'ambiguous',
        sources: [
          expect.objectContaining({
            name: 'brainstorming',
            platform: 'claude-code',
            scope: 'project',
            root: path.resolve(claudeSkill),
            description: 'Explore intent before implementation.',
            skillMd: expect.stringContaining('# brainstorming'),
            hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          }),
          expect.objectContaining({
            name: 'brainstorming',
            platform: 'codex',
            scope: 'global',
            root: path.resolve(codexSkill),
            description: 'Generate and compare design options.',
            skillMd: expect.stringContaining('# brainstorming'),
            hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          }),
        ],
      },
      { name: 'missing', status: 'missing', sources: [] },
    ]);
  });

  it('scans available platform Skills when preferences are absent', async () => {
    await writeSkill(
      path.join(projectRoot, '.cursor', 'skills', 'writing-plans'),
      'writing-plans',
      'Write an implementation plan.',
    );
    await writeSkill(
      path.join(homeDir, '.qwen', 'skills', 'test-driven-development'),
      'test-driven-development',
      'Drive implementation from failing tests.',
    );

    const result = await discoverBundleCandidates({
      projectRoot,
      homeDir,
      preferences: null,
    });

    expect(result.map((candidate) => candidate.name)).toEqual([
      'test-driven-development',
      'writing-plans',
    ]);
    expect(result.every((candidate) => candidate.status === 'available')).toBe(true);
  });
});
