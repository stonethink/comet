import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadSkillPackage } from '../../src/skill/load.js';
import { validateSkillPackage } from '../../src/skill/validate.js';
import { generateFactorySkillPackage } from '../../src/factory/package.js';

describe('Factory skill package generation', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-factory-package-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('generates a valid deterministic Comet-native Skill package', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'review-workflow',
      version: '1.0.0',
      description: 'Review workflow generated from preferred Skills.',
      goal: 'Create a review-oriented workflow.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'brainstorming', preferenceIndex: 0 },
        { skill: 'writing-plans', preferenceIndex: 1 },
        { skill: 'requesting-code-review', preferenceIndex: 2 },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    expect(output.packageRoot).toBe(path.join(root, 'skills', 'review-workflow'));
    const pkg = await loadSkillPackage(output.packageRoot);
    expect(validateSkillPackage(pkg)).toEqual([]);
    expect(pkg.definition.orchestration.steps?.map((step) => step.id)).toEqual([
      'step-1-brainstorming',
      'step-2-writing-plans',
      'step-3-requesting-code-review',
    ]);
    expect(await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8')).toContain(
      'CLI 是内部后端',
    );
  });

  it('records deviation reasons in the generated Skill guidance', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'shifted-workflow',
      version: '1.0.0',
      description: 'Workflow with a justified order adjustment.',
      goal: 'Create a safer workflow.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'writing-plans', preferenceIndex: 1 },
        { skill: 'brainstorming', preferenceIndex: 0 },
      ],
      deviations: [
        {
          skill: 'writing-plans',
          expectedIndex: 1,
          actualIndex: 0,
          reason:
            'The user already supplied enough requirements, so planning can happen before more exploration.',
        },
      ],
      engineMode: 'deterministic',
    });

    const skill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(skill).toContain('偏离偏好顺序');
    expect(skill).toContain('The user already supplied enough requirements');
  });
});
