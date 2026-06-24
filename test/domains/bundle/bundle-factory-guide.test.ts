import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { buildBundleFactoryGuide } from '../../../domains/bundle/factory-guide.js';
import { createBundleDraft } from '../../../domains/bundle/draft.js';

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

describe('Bundle Factory first-use guide', () => {
  let root: string;
  let projectRoot: string;
  let homeDir: string;
  let builtinRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-factory-guide-'));
    projectRoot = path.join(root, 'project');
    homeDir = path.join(root, 'home');
    builtinRoot = path.join(root, 'builtin');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('guides first-use projects without saved preferences', async () => {
    await writeSkill(
      path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
      'brainstorming',
      'Explore intent before implementation.',
    );
    await writeSkill(
      path.join(homeDir, '.codex', 'skills', 'writing-plans'),
      'writing-plans',
      'Write implementation plans.',
    );

    const guide = await buildBundleFactoryGuide({ projectRoot, homeDir, builtinRoot });

    expect(guide).toMatchObject({
      schemaVersion: 1,
      preference: {
        state: 'missing',
        path: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      },
      firstRun: true,
      userMessage: {
        title: 'Start with /comet-any',
      },
    });
    expect(guide.inventory.recommended.map((item) => item.name)).toEqual([
      'brainstorming',
      'writing-plans',
    ]);
    expect(guide.nextQuestions).toContain('What Skill do you want to create or optimize?');
    expect(guide.nextQuestions).toContain(
      'Should Comet save these preferences to .comet/skill-preferences.yaml?',
    );
  });

  it('surfaces resumable Factory flows before starting a new one', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'half-built',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
      factory: {
        goal: 'Create a half-built Skill',
        preferredSkills: ['brainstorming'],
        resolvedSkills: [
          { query: 'brainstorming', preferenceIndex: 0, status: 'available', sources: [] },
        ],
        callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });

    const guide = await buildBundleFactoryGuide({ projectRoot, homeDir, builtinRoot });

    expect(guide.firstRun).toBe(false);
    expect(guide.resumable).toEqual([
      expect.objectContaining({
        name: 'half-built',
        goal: 'Create a half-built Skill',
        currentStep: 'needs-generation',
        recommendedNextStep: expect.objectContaining({
          action: 'generate-factory-package',
        }),
      }),
    ]);
    expect(guide.userMessage.summary).toContain('unfinished Skill creation flow');
  });
});
