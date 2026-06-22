import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadSkillPackage } from '../../../domains/skill/load.js';
import { validateSkillPackage } from '../../../domains/skill/validate.js';
import { generateFactorySkillPackage } from '../../../domains/factory/package.js';

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
      resolvedSkills: [
        {
          query: 'brainstorming',
          preferenceIndex: 0,
          status: 'available',
          sources: [
            {
              name: 'brainstorming',
              preferenceIndex: 0,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'brainstorming' },
              root: path.join(root, '.codex', 'skills', 'brainstorming'),
              description: 'Explore intent before implementation.',
              skillMd: `---
name: brainstorming
description: Explore intent before implementation.
---

# Brainstorming

Start by understanding the current project context.

Ask clarifying questions one at a time before presenting a design.
`,
              hash: 'a'.repeat(64),
            },
          ],
        },
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
    const skill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(skill).toContain('真实 Skill 证据');
    expect(skill).toContain('brainstorming');
    expect(skill).toContain('Explore intent before implementation.');
    expect(skill).toContain('组合后的工作方式');
    expect(skill).toContain('Start by understanding the current project context.');
    expect(skill).toContain('Ask clarifying questions one at a time');
    const evidence = JSON.parse(
      await fs.readFile(path.join(output.packageRoot, 'reference', 'resolved-skills.json'), 'utf8'),
    ) as unknown;
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      resolvedSkills: [
        {
          query: 'brainstorming',
          status: 'available',
          sources: [{ hash: 'a'.repeat(64) }],
        },
      ],
      sourceSummaries: [
        {
          query: 'brainstorming',
          source: { hash: 'a'.repeat(64) },
          summary: expect.stringContaining('Start by understanding the current project context.'),
        },
      ],
    });
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

  it('explains stop points, risks, and internal Skill usage', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'quality-workflow',
      version: '1.0.0',
      description: 'Quality workflow generated from preferred Skills.',
      goal: 'Create a quality-oriented workflow.',
      defaultLocale: 'zh',
      callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
      resolvedSkills: [
        {
          query: 'brainstorming',
          preferenceIndex: 0,
          status: 'available',
          sources: [
            {
              name: 'brainstorming',
              preferenceIndex: 0,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'brainstorming' },
              root: path.join(root, '.codex', 'skills', 'brainstorming'),
              description: 'Explore intent before implementation.',
              skillMd: '# Brainstorming\n\nAsk questions before changing behavior.\n',
              hash: 'b'.repeat(64),
            },
          ],
        },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    const skill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(skill).toContain('## 停止点');
    expect(skill).toContain('## 风险');
    expect(skill).toContain('## 内部 Skill 使用方式');
    expect(skill).toContain('brainstorming');
  });

  it('writes an authoring-skill eval manifest for Engine-enabled generated packages', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'eval-workflow',
      version: '1.0.0',
      description: 'Workflow with eval metadata.',
      goal: 'Create a workflow with eval metadata.',
      defaultLocale: 'zh',
      callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
      resolvedSkills: [],
      deviations: [],
      engineMode: 'deterministic',
    });

    expect(output.evalManifestPath).toBe(path.join(output.packageRoot, 'comet', 'eval.yaml'));
    const manifest = await fs.readFile(output.evalManifestPath!, 'utf8');
    expect(manifest).toContain('apiVersion: comet.eval/v1alpha1');
    expect(manifest).toContain('kind: SkillEvalManifest');
    expect(manifest).toContain('profile: authoring-skill');
    expect(manifest).toContain('authoring-skill-smoke');
  });
});
