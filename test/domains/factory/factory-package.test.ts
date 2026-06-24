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
      preference: {
        mode: 'strict',
        policies: {
          missing: 'fail',
          ambiguous: 'ask',
          deviation: 'fail',
          scripts: 'disclose',
          hooks: 'disclose',
        },
        requiredSkills: ['verification-before-completion'],
        sourcePath: path.join(root, '.comet', 'skill-preferences.yaml'),
        sourceHash: 'c'.repeat(64),
        warnings: [],
      },
      deviations: [],
      engineMode: 'deterministic',
    });

    expect(output.packageRoot).toBe(path.join(root, 'skills', 'review-workflow'));
    await expect(
      fs.access(path.join(output.packageRoot, 'comet', 'checks.yaml')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'comet', 'evals.yaml')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(output.evalManifestPath).toBe(path.join(output.packageRoot, 'comet', 'eval.yaml'));
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
      preference: {
        mode: 'strict',
        requiredSkills: ['verification-before-completion'],
        sourceHash: 'c'.repeat(64),
      },
    });
    const compositionReport = await fs.readFile(
      path.join(output.packageRoot, 'reference', 'composition-report.md'),
      'utf8',
    );
    expect(compositionReport).toContain('Preference mode: strict');
    expect(compositionReport).toContain('Required Skills');
    expect(compositionReport).toContain('verification-before-completion');
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

  it('generates the required stable composition control plane files', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'stable-workflow',
      version: '1.0.0',
      description: 'Stable workflow.',
      goal: 'Create a stable workflow.',
      defaultLocale: 'zh',
      callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
      resolvedSkills: [],
      deviations: [],
      composition: {
        schemaVersion: 1,
        entrySkills: ['stable-workflow'],
        steps: [
          {
            id: 'step-1-brainstorming',
            skill: 'brainstorming',
            source: 'atomic',
            preferenceIndex: 0,
          },
        ],
        choices: [],
        issues: [],
      },
      engineMode: 'deterministic',
    });

    await expect(
      fs.access(path.join(output.packageRoot, 'reference', 'composition-report.md')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'comet-plan.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'comet-check.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs')),
    ).resolves.toBeUndefined();
    expect(output.controlPlane).toEqual({
      checksPath: path.join(output.packageRoot, 'comet', 'checks.yaml'),
      evalManifestPath: path.join(output.packageRoot, 'comet', 'eval.yaml'),
      compositionReportPath: path.join(output.packageRoot, 'reference', 'composition-report.md'),
      scripts: [
        path.join(output.packageRoot, 'scripts', 'comet-plan.mjs'),
        path.join(output.packageRoot, 'scripts', 'comet-check.mjs'),
        path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'),
      ],
    });

    const report = await fs.readFile(output.controlPlane.compositionReportPath, 'utf8');
    expect(report).toContain('## Entry Skills');
    expect(report).toContain('- stable-workflow');
    expect(report).toContain('step-1-brainstorming');
    expect(report).toContain('No composition issues.');
    const planScript = await fs.readFile(
      path.join(output.packageRoot, 'scripts', 'comet-plan.mjs'),
      'utf8',
    );
    const checkScript = await fs.readFile(
      path.join(output.packageRoot, 'scripts', 'comet-check.mjs'),
      'utf8',
    );
    const hookGuardScript = await fs.readFile(
      path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'),
      'utf8',
    );
    expect(planScript).toContain("import { fileURLToPath } from 'url';");
    expect(planScript).toContain("const packageRoot = path.resolve(__dirname, '..');");
    expect(planScript).toContain(
      "const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();",
    );
    expect(planScript).toContain("path.join(packageRoot, 'comet', 'skill.yaml')");
    expect(checkScript).toContain("import { fileURLToPath } from 'url';");
    expect(checkScript).toContain("const packageRoot = path.resolve(__dirname, '..');");
    expect(checkScript).toContain('comet/skill.yaml');
    expect(hookGuardScript).toContain(
      "const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();",
    );
  });

  it('keeps generated control plane checks consistent when engine mode is none', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'plain-workflow',
      version: '1.0.0',
      description: 'Plain workflow.',
      goal: 'Create a plain workflow.',
      defaultLocale: 'zh',
      callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
      resolvedSkills: [],
      deviations: [],
      engineMode: 'none',
    });

    expect(output.enginePath).toBeNull();
    expect(output.evalManifestPath).toBeNull();
    expect(output.controlPlane).toEqual({
      checksPath: null,
      evalManifestPath: null,
      compositionReportPath: path.join(output.packageRoot, 'reference', 'composition-report.md'),
      scripts: [
        path.join(output.packageRoot, 'scripts', 'comet-plan.mjs'),
        path.join(output.packageRoot, 'scripts', 'comet-check.mjs'),
        path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'),
      ],
    });
    await expect(
      fs.access(path.join(output.packageRoot, 'comet', 'skill.yaml')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const checkScript = await fs.readFile(
      path.join(output.packageRoot, 'scripts', 'comet-check.mjs'),
      'utf8',
    );
    expect(checkScript).not.toContain('comet/skill.yaml');
    expect(checkScript).not.toContain('comet/guardrails.yaml');
    expect(checkScript).not.toContain('comet/checks.yaml');
    expect(checkScript).not.toContain('comet/eval.yaml');
    expect(checkScript).toContain('reference/resolved-skills.json');
  });
});
