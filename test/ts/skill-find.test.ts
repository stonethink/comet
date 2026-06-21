import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  findPreferredSkills,
  readSkillPreferenceEntries,
  type SkillSearchRoot,
} from '../../src/skill/find.js';

async function writeMarkdownSkill(
  root: string,
  name: string,
  description: string,
): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, 'SKILL.md'),
    `---
name: ${name}
description: ${description}
---

# ${name}

Read the nearby reference when needed.
`,
  );
  await fs.mkdir(path.join(root, 'reference'), { recursive: true });
  await fs.writeFile(path.join(root, 'reference', 'notes.md'), `# ${name} notes\n`);
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(root, 'scripts', 'run.mjs'), `console.log('${name}');\n`);
}

describe('findPreferredSkills', () => {
  let root: string;
  let projectRoot: string;
  let homeDir: string;
  let builtinRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-find-'));
    projectRoot = path.join(root, 'project');
    homeDir = path.join(root, 'home');
    builtinRoot = path.join(root, 'builtin');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(homeDir, { recursive: true });
    await fs.mkdir(builtinRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('parses preference order, comments, duplicates and explicit paths', async () => {
    const explicit = path.join(root, 'explicit-skill');
    await writeMarkdownSkill(explicit, 'explicit-skill', 'Explicit path skill.');
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skills.txt'),
      `
# preferred call chain
brainstorming
writing-plans
brainstorming
${explicit}
`,
    );

    await expect(readSkillPreferenceEntries(projectRoot)).resolves.toEqual([
      { query: 'brainstorming', preferenceIndex: 0 },
      { query: 'writing-plans', preferenceIndex: 1 },
      { query: explicit, preferenceIndex: 2 },
    ]);
  });

  it('finds real local Skills and preserves preferenceIndex', async () => {
    await writeMarkdownSkill(
      path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
      'brainstorming',
      'Explore intent before implementation.',
    );
    await writeMarkdownSkill(
      path.join(homeDir, '.agents', 'skills', 'writing-plans'),
      'writing-plans',
      'Write implementation plans.',
    );

    const result = await findPreferredSkills({
      projectRoot,
      homeDir,
      builtinRoot,
      preferences: [
        { query: 'brainstorming', preferenceIndex: 0 },
        { query: 'writing-plans', preferenceIndex: 1 },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({
        query: 'brainstorming',
        preferenceIndex: 0,
        status: 'available',
        sources: [
          expect.objectContaining({
            name: 'brainstorming',
            origin: 'project',
            platform: 'codex',
            description: 'Explore intent before implementation.',
            skillMd: expect.stringContaining('# brainstorming'),
            references: [expect.objectContaining({ path: 'reference/notes.md' })],
            scripts: [expect.objectContaining({ path: 'scripts/run.mjs', sideEffect: 'unknown' })],
            hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          }),
        ],
      }),
      expect.objectContaining({
        query: 'writing-plans',
        preferenceIndex: 1,
        status: 'available',
        sources: [expect.objectContaining({ origin: 'global', platform: 'agents' })],
      }),
    ]);
  });

  it('reports ambiguous and missing preferences without choosing for the user', async () => {
    await writeMarkdownSkill(
      path.join(projectRoot, '.codex', 'skills', 'reviewing'),
      'reviewing',
      'Project reviewer.',
    );
    await writeMarkdownSkill(
      path.join(homeDir, '.codex', 'skills', 'reviewing'),
      'reviewing',
      'Global reviewer.',
    );

    const result = await findPreferredSkills({
      projectRoot,
      homeDir,
      builtinRoot,
      preferences: [
        { query: 'reviewing', preferenceIndex: 0 },
        { query: 'missing-skill', preferenceIndex: 1 },
      ],
    });

    expect(result[0]).toMatchObject({
      query: 'reviewing',
      preferenceIndex: 0,
      status: 'ambiguous',
    });
    expect(result[0].sources).toHaveLength(2);
    expect(result[1]).toMatchObject({
      query: 'missing-skill',
      preferenceIndex: 1,
      status: 'missing',
      sources: [],
    });
  });

  it('can scan supplied roots when preferences are absent', async () => {
    const customRoot = path.join(root, 'custom-skills');
    await writeMarkdownSkill(path.join(customRoot, 'alpha'), 'alpha', 'Alpha skill.');
    const roots: SkillSearchRoot[] = [{ root: customRoot, origin: 'project', platform: 'custom' }];

    const result = await findPreferredSkills({
      projectRoot,
      homeDir,
      builtinRoot,
      preferences: null,
      extraRoots: roots,
    });

    expect(result).toEqual([
      expect.objectContaining({
        query: 'alpha',
        preferenceIndex: null,
        status: 'available',
      }),
    ]);
  });

  it('reports traversal queries as missing without reading outside roots', async () => {
    await writeMarkdownSkill(
      path.join(projectRoot, '.codex', 'outside'),
      'outside',
      'Must not be discovered through traversal.',
    );

    const result = await findPreferredSkills({
      projectRoot,
      homeDir,
      builtinRoot,
      preferences: [{ query: '../outside', preferenceIndex: 0 }],
    });

    expect(result).toEqual([
      { query: '../outside', preferenceIndex: 0, status: 'missing', sources: [] },
    ]);
  });
});
