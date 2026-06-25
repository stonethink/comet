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
      'step-1-review-workflow-brainstorming',
      'step-2-review-workflow-writing-plans',
      'step-3-review-workflow-requesting-code-review',
    ]);
    const skill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(skill).toContain('## 决策核心');
    expect(skill).toContain('review-workflow-brainstorming');
    expect(skill).toContain('brainstorming');
    expect(skill).not.toContain('真实 Skill 证据');
    expect(skill).not.toContain('Explore intent before implementation.');
    expect(skill).not.toContain('Start by understanding the current project context.');
    expect(skill).not.toContain('Ask clarifying questions one at a time');
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
    expect(skill).toContain('## 决策核心');
    expect(skill).not.toContain('偏离偏好顺序');
    const report = await fs.readFile(
      path.join(output.packageRoot, 'reference', 'composition-report.md'),
      'utf8',
    );
    expect(report).toContain('## Preference Deviations');
    expect(report).toContain('The user already supplied enough requirements');
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
    expect(skill).toContain('## 用户停顿点');
    expect(skill).toContain('## 脚本守卫');
    expect(skill).toContain('## 阶段路线');
    expect(skill).toContain('brainstorming');
  });

  it('generates sibling internal stage Skills when stage names are provided', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'comet-grill-flow',
      version: '1.0.0',
      description: 'Comet flow with a design grill stage.',
      goal: 'Customize /comet with a design grill stage.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'comet-open', preferenceIndex: 0 },
        { skill: 'grill-me', preferenceIndex: 1 },
      ],
      stageNames: [
        {
          skill: 'comet-open',
          name: 'comet-grill-flow-open',
          recommendedName: 'comet-grill-flow-open',
          phase: 'open',
          step: 'open',
          label: 'Open',
          source: 'recommended',
        },
        {
          skill: 'grill-me',
          name: 'comet-grill-flow-design-pressure-test',
          recommendedName: 'comet-grill-flow-design-grill',
          phase: 'design',
          label: 'Design pressure test',
          source: 'custom',
        },
      ],
      resolvedSkills: [
        {
          query: 'comet-open',
          preferenceIndex: 0,
          status: 'available',
          sources: [
            {
              name: 'comet-open',
              preferenceIndex: 0,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'comet-open' },
              root: path.join(root, '.codex', 'skills', 'comet-open'),
              description: 'Open a Comet change.',
              skillMd: `---
name: comet-open
description: Open a Comet change.
---

# Comet Open

Start from the active change detector.

Use the user's request language.

Preserve .comet.yaml as the state source.

## Decision Core

Deep protocol marker: run the Comet open guard before transitioning phases.
`,
              hash: 'c'.repeat(64),
            },
          ],
        },
        {
          query: 'grill-me',
          preferenceIndex: 1,
          status: 'available',
          sources: [
            {
              name: 'grill-me',
              preferenceIndex: 1,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'grill-me' },
              root: path.join(root, '.codex', 'skills', 'grill-me'),
              description: 'A relentless interview to sharpen a plan or design.',
              skillMd: '# Grill Me\n\nRun a `/grilling` session.\n',
              hash: 'd'.repeat(64),
            },
          ],
        },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    expect(output.internalSkills).toEqual([
      'comet-grill-flow-open',
      'comet-grill-flow-design-pressure-test',
    ]);
    const entrySkill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(entrySkill).toContain('## 阶段路线');
    expect(entrySkill).toContain('comet-grill-flow-design-pressure-test');
    const internalSkill = await fs.readFile(
      path.join(root, 'skills', 'comet-grill-flow-design-pressure-test', 'SKILL.md'),
      'utf8',
    );
    expect(internalSkill).toContain('## 阶段目标');
    expect(internalSkill).toContain('设计压力测试');
    expect(internalSkill).toContain(
      '**立即执行：** 使用 Skill 工具加载 `grill-me` 技能。禁止跳过此步骤。',
    );
    expect(internalSkill).not.toContain('Run a `/grilling` session.');
    const internalDescription = internalSkill.match(/^description:\s*(.+)$/mu)?.[1] ?? '';
    expect(internalDescription).toMatch(/^[\x20-\x7E]+$/u);
    expect(internalDescription).not.toContain(':');
    const openStageSkill = await fs.readFile(
      path.join(root, 'skills', 'comet-grill-flow-open', 'SKILL.md'),
      'utf8',
    );
    expect(openStageSkill).toContain('## 阶段目标');
    expect(openStageSkill).not.toContain(
      'Deep protocol marker: run the Comet open guard before transitioning phases.',
    );
    const engineSkill = await fs.readFile(
      path.join(output.packageRoot, 'comet', 'skill.yaml'),
      'utf8',
    );
    expect(engineSkill).toContain('ref: comet-grill-flow-open');
    expect(engineSkill).toContain('ref: comet-grill-flow-design-pressure-test');
  });

  it('renders a clean Comet overlay entry instead of pasting source Skill bodies', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'comet-with-grill',
      version: '1.0.0',
      description: 'Comet with a grill stage.',
      goal: 'Customize /comet with a grill stage.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'comet-open', preferenceIndex: 0 },
        { skill: 'grill-me', preferenceIndex: 1 },
      ],
      stageNames: [
        {
          skill: 'comet-open',
          name: 'comet-with-grill-open',
          recommendedName: 'comet-with-grill-open',
          phase: 'open',
          step: 'open',
          label: 'Open',
          source: 'recommended',
        },
        {
          skill: 'grill-me',
          name: 'comet-with-grill-design-pressure-test',
          recommendedName: 'comet-with-grill-design-grill',
          phase: 'design',
          label: 'Design pressure test',
          source: 'custom',
        },
      ],
      skillMaker: {
        intent: 'customize-comet',
        baseTemplate: { skill: 'comet', profile: 'full' },
        templateExpansion: {
          retained: ['open / design / build / verify / archive'],
          additions: ['design after: grill-me'],
          replacements: [],
          disabled: [],
          rejected: [],
        },
      },
      resolvedSkills: [
        {
          query: 'comet',
          preferenceIndex: 2,
          status: 'available',
          sources: [
            {
              name: 'comet',
              preferenceIndex: 2,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'comet' },
              root: path.join(root, '.codex', 'skills', 'comet'),
              description: 'Original Comet workflow.',
              skillMd: `---
name: comet
description: Original Comet workflow.
---

# Comet Original

OpenSpec and Superpowers orbit the same goal.

## Decision Core

Deep original Comet marker: detect the active change before routing.
`,
              hash: 'e'.repeat(64),
            },
          ],
        },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    const entrySkill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(entrySkill).toContain('## 决策核心');
    expect(entrySkill).toContain('/comet 定制流程');
    expect(entrySkill).toContain('开启阶段');
    expect(entrySkill).toContain('设计阶段');
    expect(entrySkill).toContain('design.after-brainstorming');
    expect(entrySkill).toContain('comet-with-grill-design-pressure-test');
    expect(entrySkill).toContain(
      '**立即执行：** 使用 Skill 工具加载 `comet-with-grill-design-pressure-test` 技能。禁止跳过此步骤。',
    );
    expect(entrySkill).not.toContain('# Comet Original');
    expect(entrySkill).not.toContain(
      'Deep original Comet marker: detect the active change before routing.',
    );
    expect(entrySkill).not.toContain('## Generated Variant Routing');
    expect(entrySkill).not.toContain('## Generated Source Evidence');
    expect(entrySkill).not.toContain('## Generated Internal Skill Usage');
    expect(entrySkill).not.toContain('完整结构化证据');
    expect(entrySkill).not.toContain('Customize /comet workflow generated by Skill Maker.');
    expect(entrySkill).not.toContain('open / design / build / verify / archive');
    expect(entrySkill).not.toContain('Open 阶段');
    expect(entrySkill).not.toContain('Design 阶段');
    const entryDescription = entrySkill.match(/^description:\s*(.+)$/mu)?.[1] ?? '';
    expect(entryDescription).toMatch(/^[\x20-\x7E]+$/u);
    expect(entryDescription).not.toContain(':');

    const protocol = JSON.parse(
      await fs.readFile(
        path.join(output.packageRoot, 'reference', 'workflow-protocol.json'),
        'utf8',
      ),
    ) as {
      kind: string;
      stages: Array<{ id: string; slots?: Array<{ id: string; sourceSkill: string }> }>;
    };
    expect(protocol.kind).toBe('comet-overlay');
    expect(protocol.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'design',
          slots: expect.arrayContaining([
            expect.objectContaining({
              id: 'design.after-brainstorming',
              sourceSkill: 'grill-me',
            }),
          ]),
        }),
      ]),
    );
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

  it('renders arbitrary Skills as a Comet-like workflow kernel', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'protocol-workflow',
      version: '1.0.0',
      description: 'Workflow with protocol metadata.',
      goal: 'Create a workflow that behaves like a Comet-style Skill.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'brainstorming', preferenceIndex: 0 },
        { skill: 'writing-plans', preferenceIndex: 1 },
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
              skillMd: '# Brainstorming\n\nAsk questions before changing behavior.\n',
              hash: 'f'.repeat(64),
            },
          ],
        },
        {
          query: 'writing-plans',
          preferenceIndex: 1,
          status: 'available',
          sources: [
            {
              name: 'writing-plans',
              preferenceIndex: 1,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'writing-plans' },
              root: path.join(root, '.codex', 'skills', 'writing-plans'),
              description: 'Use when writing an implementation plan.',
              skillMd: '# Writing Plans\n\nCreate a step-by-step implementation plan.\n',
              hash: '1'.repeat(64),
            },
          ],
        },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    expect(output.internalSkills).toEqual([
      'protocol-workflow-brainstorming',
      'protocol-workflow-writing-plans',
    ]);
    await expect(
      fs.access(path.join(output.packageRoot, 'reference', 'workflow-protocol.json')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'reference', 'decision-points.md')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'reference', 'recovery.md')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'workflow-state.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'workflow-guard.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'workflow-handoff.mjs')),
    ).resolves.toBeUndefined();

    const entrySkill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(entrySkill).toContain('## 决策核心');
    expect(entrySkill).toContain('## 阶段路线');
    expect(entrySkill).toContain('## 自动推进与恢复');
    expect(entrySkill).toContain('## 脚本守卫');
    expect(entrySkill).toContain('## 用户停顿点');
    expect(entrySkill).toContain(
      '**立即执行：** 使用 Skill 工具加载 `protocol-workflow-brainstorming` 技能。禁止跳过此步骤。',
    );
    expect(entrySkill).not.toContain('## Generated Source Evidence');
    expect(entrySkill).not.toContain('完整结构化证据');

    const stageSkill = await fs.readFile(
      path.join(root, 'skills', 'protocol-workflow-brainstorming', 'SKILL.md'),
      'utf8',
    );
    expect(stageSkill).toContain('## 阶段目标');
    expect(stageSkill).toContain('## 入口检查');
    expect(stageSkill).toContain('## 执行步骤');
    expect(stageSkill).toContain('## 退出条件');
    expect(stageSkill).toContain('## 未完成处理');
    expect(stageSkill).toContain('## 恢复');
    expect(stageSkill).toContain(
      '**立即执行：** 使用 Skill 工具加载 `brainstorming` 技能。禁止跳过此步骤。',
    );
    expect(stageSkill).toContain('node protocol-workflow/scripts/workflow-guard.mjs exit');
    expect(stageSkill).toContain('NEXT: auto');
    expect(stageSkill).toContain('SKILL:');
    expect(stageSkill).toContain('如果任一退出检查未通过');
    expect(stageSkill).not.toContain('Workflow state is ready');
    expect(stageSkill).not.toContain('If any exit gate fails');
    expect(stageSkill).not.toContain('No blocking user decision point remains unresolved');
    expect(stageSkill).not.toContain('Ask questions before changing behavior.');

    const protocol = JSON.parse(
      await fs.readFile(
        path.join(output.packageRoot, 'reference', 'workflow-protocol.json'),
        'utf8',
      ),
    ) as {
      kind: string;
      stages: Array<{ id: string; stageSkill: string; nextStage: string | null }>;
      evals: Array<{ id: string; expectedStageOrder: string[] }>;
    };
    expect(protocol.kind).toBe('workflow-kernel');
    expect(protocol.stages).toEqual([
      expect.objectContaining({
        id: 'brainstorming',
        stageSkill: 'protocol-workflow-brainstorming',
        nextStage: 'protocol-workflow-writing-plans',
      }),
      expect.objectContaining({
        id: 'writing-plans',
        stageSkill: 'protocol-workflow-writing-plans',
        nextStage: null,
      }),
    ]);
    expect(protocol.evals).toEqual([
      expect.objectContaining({
        id: 'workflow-route-conformance',
        expectedStageOrder: ['protocol-workflow-brainstorming', 'protocol-workflow-writing-plans'],
      }),
    ]);

    const manifest = await fs.readFile(output.evalManifestPath!, 'utf8');
    expect(manifest).toContain('workflow-route-conformance');
    expect(manifest).toContain('protocol-workflow-brainstorming');
    expect(manifest).toContain('protocol-workflow-writing-plans');
  });

  it('turns grill-me into a guarded design pressure-test slot for customized Comet', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'comet-protocol-grill',
      version: '1.0.0',
      description: 'Comet with a protocol grill stage.',
      goal: 'Customize /comet with a design grill stage.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'comet-design', preferenceIndex: 0 },
        { skill: 'grill-me', preferenceIndex: 1 },
        { skill: 'comet-build', preferenceIndex: 2 },
      ],
      stageNames: [
        {
          skill: 'comet-design',
          name: 'comet-protocol-grill-design',
          recommendedName: 'comet-protocol-grill-design',
          phase: 'design',
          step: 'brainstorming',
          label: 'Design',
          source: 'recommended',
        },
        {
          skill: 'grill-me',
          name: 'comet-protocol-grill-design-pressure-test',
          recommendedName: 'comet-protocol-grill-design-grill',
          phase: 'design',
          step: 'after-brainstorming',
          label: 'Design pressure test',
          source: 'custom',
        },
        {
          skill: 'comet-build',
          name: 'comet-protocol-grill-build',
          recommendedName: 'comet-protocol-grill-build',
          phase: 'build',
          step: 'build-execution',
          label: 'Build',
          source: 'recommended',
        },
      ],
      skillMaker: {
        intent: 'customize-comet',
        baseTemplate: { skill: 'comet', profile: 'full' },
        templateExpansion: {
          retained: ['open / design / build / verify / archive'],
          additions: ['design after: grill-me'],
          replacements: [],
          disabled: [],
          rejected: [],
        },
      },
      resolvedSkills: [
        {
          query: 'comet',
          preferenceIndex: 3,
          status: 'available',
          sources: [
            {
              name: 'comet',
              preferenceIndex: 3,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'comet' },
              root: path.join(root, '.codex', 'skills', 'comet'),
              description: 'Original Comet workflow.',
              skillMd: `---
name: comet
description: Original Comet workflow.
---

# Comet Original

Route from \`/comet-design\` to \`/comet-build\` after design completes.
`,
              hash: '2'.repeat(64),
            },
          ],
        },
        {
          query: 'comet-design',
          preferenceIndex: 0,
          status: 'available',
          sources: [
            {
              name: 'comet-design',
              preferenceIndex: 0,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'comet-design' },
              root: path.join(root, '.codex', 'skills', 'comet-design'),
              description: 'Original design stage.',
              skillMd: `# Comet Design

After design guard passes, call \`/comet-build\`.
`,
              hash: '3'.repeat(64),
            },
          ],
        },
        {
          query: 'grill-me',
          preferenceIndex: 1,
          status: 'available',
          sources: [
            {
              name: 'grill-me',
              preferenceIndex: 1,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'grill-me' },
              root: path.join(root, '.codex', 'skills', 'grill-me'),
              description: 'A relentless interview to sharpen a plan or design.',
              skillMd: '# Grill Me\n\nRun a `/grilling` session.\n',
              hash: '4'.repeat(64),
            },
          ],
        },
        {
          query: 'comet-build',
          preferenceIndex: 2,
          status: 'available',
          sources: [
            {
              name: 'comet-build',
              preferenceIndex: 2,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'comet-build' },
              root: path.join(root, '.codex', 'skills', 'comet-build'),
              description: 'Original build stage.',
              skillMd: '# Comet Build\n\nBuild from the approved plan.\n',
              hash: '5'.repeat(64),
            },
          ],
        },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    const entrySkill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(entrySkill).toContain('design.after-brainstorming');
    expect(entrySkill).toContain('设计压力测试');
    expect(entrySkill).not.toContain('## Generated Variant Routing');
    expect(entrySkill).not.toContain('Route from `/comet-design` to `/comet-build`');

    const designSkill = await fs.readFile(
      path.join(root, 'skills', 'comet-protocol-grill-design', 'SKILL.md'),
      'utf8',
    );
    expect(designSkill).not.toContain(
      '**立即执行：** 使用 Skill 工具加载 `comet-design` 技能。禁止跳过此步骤。',
    );
    expect(designSkill).toContain('## 插槽步骤');
    expect(designSkill).toContain('design.after-brainstorming');
    expect(designSkill).toContain('comet-protocol-grill-design-pressure-test');
    expect(designSkill).toContain('压力测试结论');
    expect(designSkill).not.toContain('call `/comet-build`');

    const slotSkill = await fs.readFile(
      path.join(root, 'skills', 'comet-protocol-grill-design-pressure-test', 'SKILL.md'),
      'utf8',
    );
    expect(slotSkill).toContain('## 阶段目标');
    expect(slotSkill).toContain('设计压力测试');
    expect(slotSkill).toContain(
      '**立即执行：** 使用 Skill 工具加载 `grill-me` 技能。禁止跳过此步骤。',
    );
    expect(slotSkill).toContain('## 退出条件');
    expect(slotSkill).toContain('记录压力测试结论');
    expect(slotSkill).not.toContain('Run a `/grilling` session.');

    const protocol = JSON.parse(
      await fs.readFile(
        path.join(output.packageRoot, 'reference', 'workflow-protocol.json'),
        'utf8',
      ),
    ) as {
      kind: string;
      stages: Array<{
        id: string;
        stageSkill: string;
        slots?: Array<{ id: string; stageSkill: string; sourceSkill: string }>;
      }>;
    };
    expect(protocol.kind).toBe('comet-overlay');
    expect(protocol.stages.map((stage) => stage.id)).toEqual([
      'open',
      'design',
      'build',
      'verify',
      'archive',
    ]);
    expect(protocol.stages.find((stage) => stage.id === 'design')).toEqual(
      expect.objectContaining({
        stageSkill: 'comet-protocol-grill-design',
        slots: [
          expect.objectContaining({
            id: 'design.after-brainstorming',
            stageSkill: 'comet-protocol-grill-design-pressure-test',
            sourceSkill: 'grill-me',
          }),
        ],
      }),
    );
  });

  it('replaces copied Comet runtime assumptions with the generated workflow engine', async () => {
    const cometRoot = path.join(root, '.codex', 'skills', 'comet');
    await fs.mkdir(path.join(cometRoot, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(cometRoot, 'reference'), { recursive: true });
    for (const script of [
      'comet-env.mjs',
      'comet-state.mjs',
      'comet-guard.mjs',
      'comet-handoff.mjs',
      'comet-archive.mjs',
      'comet-runtime.mjs',
      'comet-yaml-validate.mjs',
    ]) {
      await fs.writeFile(path.join(cometRoot, 'scripts', script), `// ${script}\n`, 'utf8');
    }
    for (const reference of [
      'auto-transition.md',
      'decision-point.md',
      'context-recovery.md',
      'debug-gate.md',
    ]) {
      await fs.writeFile(path.join(cometRoot, 'reference', reference), `# ${reference}\n`, 'utf8');
    }

    const output = await generateFactorySkillPackage({
      root,
      name: 'comet-runtime-grill',
      version: '1.0.0',
      description: 'Comet runtime grill.',
      goal: 'Customize /comet with runtime-safe generated stages.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'comet-design', preferenceIndex: 0 },
        { skill: 'grill-me', preferenceIndex: 1 },
      ],
      stageNames: [
        {
          skill: 'comet-design',
          name: 'comet-runtime-grill-design',
          recommendedName: 'comet-runtime-grill-design',
          phase: 'design',
          step: 'brainstorming',
          label: 'Design',
          source: 'recommended',
        },
        {
          skill: 'grill-me',
          name: 'comet-runtime-grill-design-pressure-test',
          recommendedName: 'comet-runtime-grill-design-grill',
          phase: 'design',
          step: 'after-brainstorming',
          label: 'Design pressure test',
          source: 'custom',
        },
      ],
      skillMaker: {
        intent: 'customize-comet',
        baseTemplate: { skill: 'comet', profile: 'full' },
      },
      resolvedSkills: [
        {
          query: 'comet',
          preferenceIndex: 2,
          status: 'available',
          sources: [
            {
              name: 'comet',
              preferenceIndex: 2,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'comet' },
              root: cometRoot,
              description: 'Original Comet workflow.',
              skillMd: '# Comet\n\nSee `comet/reference/decision-point.md`.\n',
              hash: '7'.repeat(64),
            },
          ],
        },
        {
          query: 'comet-design',
          preferenceIndex: 0,
          status: 'available',
          sources: [
            {
              name: 'comet-design',
              preferenceIndex: 0,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'comet-design' },
              root: path.join(root, '.codex', 'skills', 'comet-design'),
              description: 'Original design stage.',
              skillMd: `# Comet Design

\`\`\`bash
COMET_ENV="\${COMET_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/comet/scripts/comet-env.sh' -type f -print -quit 2>/dev/null)}"
if [ -z "$COMET_ENV" ]; then
  echo "ERROR: comet-env.sh not found. Ensure the comet skill is installed." >&2
  return 1
fi
. "$COMET_ENV"
if [ -z "$COMET_STATE" ] || [ -z "$COMET_GUARD" ]; then
  echo "ERROR: Comet scripts not found. Ensure the comet skill is installed." >&2
  return 1
fi
"$COMET_BASH" "$COMET_STATE" check <name> design
\`\`\`

Must follow \`comet/reference/decision-point.md\`, then call \`/comet-build\`.
`,
              hash: '8'.repeat(64),
            },
          ],
        },
        {
          query: 'grill-me',
          preferenceIndex: 1,
          status: 'available',
          sources: [
            {
              name: 'grill-me',
              preferenceIndex: 1,
              platform: 'codex',
              scope: 'project',
              origin: 'project',
              factory: { query: 'grill-me' },
              root: path.join(root, '.codex', 'skills', 'grill-me'),
              description: 'A relentless interview to sharpen a plan or design.',
              skillMd: '# Grill Me\n\nRun a `/grilling` session.\n',
              hash: '9'.repeat(64),
            },
          ],
        },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'workflow-state.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'workflow-guard.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'workflow-handoff.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'comet-runtime.mjs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(output.packageRoot, 'scripts', 'comet-env.mjs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(output.controlPlane.scripts).not.toContain(
      path.join(output.packageRoot, 'scripts', 'comet-env.mjs'),
    );

    const designSkill = await fs.readFile(
      path.join(root, 'skills', 'comet-runtime-grill-design', 'SKILL.md'),
      'utf8',
    );
    expect(designSkill).toContain('scripts/workflow-guard.mjs');
    expect(designSkill).toContain('design.after-brainstorming');
    expect(designSkill).toContain('comet-runtime-grill-design-pressure-test');
    expect(designSkill).toContain(
      'node comet-runtime-grill/scripts/workflow-guard.mjs exit comet-runtime-grill-design --apply',
    );
    expect(designSkill).toContain('NEXT: auto');
    expect(designSkill).toContain('SKILL:');
    expect(designSkill).toContain('如果阶段目标或插槽证据缺失');
    expect(designSkill).toContain('没有未解决的用户阻塞决策');
    expect(designSkill).not.toContain('If any phase objective');
    expect(designSkill).not.toContain('No blocking user decision point remains unresolved');
    expect(designSkill).not.toContain('Design phase objective is complete');
    expect(designSkill).not.toContain('finode');
    expect(designSkill).not.toContain('comet-env.sh');
    expect(designSkill).not.toContain('comet/reference/');
    expect(designSkill).not.toContain('"$COMET_BASH"');

    const protocol = JSON.parse(
      await fs.readFile(
        path.join(output.packageRoot, 'reference', 'workflow-protocol.json'),
        'utf8',
      ),
    ) as { kind: string };
    expect(protocol.kind).toBe('comet-overlay');
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
      skillMaker: {
        intent: 'customize-comet',
        baseTemplate: { skill: 'comet', profile: 'full' },
        templateExpansion: {
          retained: ['open / design / build / verify / archive'],
          additions: ['verify before: security-review'],
          replacements: ['build writing-plans: writing-plans -> team-planning'],
          disabled: ['build build-review'],
          rejected: [],
        },
      },
    } as any);

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
        path.join(output.packageRoot, 'scripts', 'workflow-state.mjs'),
        path.join(output.packageRoot, 'scripts', 'workflow-guard.mjs'),
        path.join(output.packageRoot, 'scripts', 'workflow-handoff.mjs'),
      ],
    });

    const report = await fs.readFile(output.controlPlane.compositionReportPath, 'utf8');
    expect(report).toContain('## Entry Skills');
    expect(report).toContain('- stable-workflow');
    expect(report).toContain('step-1-brainstorming');
    expect(report).toContain('No composition issues.');
    expect(report).toContain('## Skill Maker Summary');
    expect(report).toContain('Intent: customize-comet');
    expect(report).toContain('verify before: security-review');
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
      'const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();',
    );
    expect(planScript).toContain("path.join(packageRoot, 'comet', 'skill.yaml')");
    expect(checkScript).toContain("import { fileURLToPath } from 'url';");
    expect(checkScript).toContain("const packageRoot = path.resolve(__dirname, '..');");
    expect(checkScript).toContain('comet/skill.yaml');
    expect(hookGuardScript).toContain(
      'const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();',
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
        path.join(output.packageRoot, 'scripts', 'workflow-state.mjs'),
        path.join(output.packageRoot, 'scripts', 'workflow-guard.mjs'),
        path.join(output.packageRoot, 'scripts', 'workflow-handoff.mjs'),
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
