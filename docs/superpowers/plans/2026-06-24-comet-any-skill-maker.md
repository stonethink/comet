# Comet Any Skill Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/comet-any` 收敛为普通用户可理解的 Skill Maker：用户只看到“改一版 `/comet` / 做一个新 Skill / 整理已有 Skill”和“加 / 换 / 关”，后端仍复用现有 Bundle Factory、Eval、Publish/Distribute。

**Architecture:** 先新增用户层摘要模型，包装现有 Factory proposal、resume、readiness、distribution 输出，不改状态事实源。随后扩展 Factory plan 支持 `/comet` 派生的内部模板模型，但仍把它呈现为“改一版 `/comet`”。最后按中文先行规则更新 `/comet-any` Skill/docs，再同步英文和 Changelog。

**Tech Stack:** TypeScript ESM、Commander、Vitest、YAML、现有 `domains/bundle/*` Bundle Factory 后端、`assets/skills-zh|skills/comet-any` 双语 Skill、Node.js 20+。

---

## Metadata

```yaml
design-doc: docs/superpowers/specs/2026-06-24-comet-any-skill-maker-design.md
base-ref: aea2f990fd2dfd6e7a299e8acbf6c68fc09e5748
```

## Global Constraints

- 不新增第二套 authoring state；继续使用 Bundle authoring state 与 `.comet/skill-preferences.yaml`。
- 不删除 `comet bundle`、`comet publish`、Eval 或 distribution 后端命令。
- 普通用户文案中不把 `Bundle`、`Factory`、`composition`、`Phase Recipe`、`templateDelta` 作为第一层概念。
- `/comet-any` Skill 修改必须中文先行：先改 `assets/skills-zh/`，经用户确认后再同步 `assets/skills/`。
- README 改动保持克制，只展示用户主路径和文档引用。
- 若产生用户可见行为变化，最后更新 `CHANGELOG.md`；Changelog 条目使用英文。
- 测试优先：每个实现任务先写或更新失败测试，再改代码。

## File Structure

### New Files

- `domains/bundle/user-facing.ts`  
  用户层摘要与格式化函数。把内部 proposal、resume、readiness、distribution 概念转为 Skill Maker 语言。

- `domains/bundle/templates/comet-skill-maker-template.ts`  
  `/comet` 派生的内部模板定义与 delta 展开逻辑。只服务后端，不向普通用户暴露 Phase Recipe。

- `test/domains/bundle/user-facing.test.ts`  
  覆盖 Skill Maker 意图、确认页、恢复摘要、安装摘要的格式化。

- `test/domains/bundle/comet-skill-maker-template.test.ts`  
  覆盖 `/comet` 派生模板的 protected/mutable/optional 规则。

### Modified Files

- `domains/bundle/types.ts`  
  增加 Skill Maker intent、derive mode、template delta、template expansion metadata 类型。

- `domains/bundle/factory-plan.ts`  
  解析 `skillMakerIntent`、`mode: "derive"`、`baseTemplate`、`templateDelta`；derive 模式允许从模板展开 `callChain`。

- `domains/bundle/factory-proposal.ts`  
  在现有 `userSummary` 旁新增普通用户确认页摘要，并在文本输出中优先展示。

- `domains/bundle/factory.ts`  
  将 Skill Maker metadata、base template、template delta、template expansion 写入 Factory metadata。

- `domains/bundle/next-action.ts`  
  给恢复摘要增加用户层文案：上次做到哪里、还差什么、下一步做什么。

- `domains/bundle/readiness-user-summary.ts`  
  将 publish/readiness 术语包装为“验证”和“安装/启用”语言，保留高级命令。

- `domains/bundle/review-summary.ts`  
  将用户层 readiness summary 挂到 review summary 输出。

- `app/commands/bundle.ts`  
  非 JSON 输出优先展示 Skill Maker 用户摘要；高级详情仍展示 backend command 和 evidence。

- `app/cli/index.ts`  
  调整 `publish` / `bundle` help 描述，`bundle` 继续是 advanced backend。

- `test/domains/bundle/bundle-cli-e2e.test.ts`  
  覆盖 built CLI 的 proposal/status/review/distribution 用户层文本。

- `test/domains/bundle/publish-command.test.ts`  
  覆盖 publish facade 文案从 publish/distribute 降级为 validate/install 语言。

- `test/domains/bundle/bundle-review-summary.test.ts`  
  覆盖 readiness 用户摘要中的 next steps。

- `test/ts/comet-any-skill.test.ts`  
  更新中文先行和双语结构断言。

- `assets/skills-zh/comet-any/SKILL.md`  
  中文 Skill 改成 Skill Maker 心智：三种入口、加/换/关、验证、安装/启用。

- `assets/skills-zh/comet-any/reference/bundle-authoring.md`  
  中文后端参考保留 Bundle Factory，但说明它是内部确定性后端。

- `assets/skills-zh/comet-any/reference/eval-provider.md`  
  中文 Eval/Publish 参考改成“验证”和“安装/启用”的用户层语言。

- `assets/skills/comet-any/SKILL.md`  
  英文 Skill 在中文确认后同步。

- `assets/skills/comet-any/reference/bundle-authoring.md`  
  英文后端参考同步。

- `assets/skills/comet-any/reference/eval-provider.md`  
  英文 Eval/Publish 参考同步。

- `README-zh.md`  
  只保留 `/comet-any` Skill Maker 主路径和文档链接。

- `README.md`  
  英文 README 与中文保持结构一致。

- `CHANGELOG.md`  
  最后添加英文用户可见变更条目。

---

## Task 1: Add User-Facing Skill Maker Summary Model

**Files:**
- Create: `domains/bundle/user-facing.ts`
- Modify: `domains/bundle/types.ts`
- Test: `test/domains/bundle/user-facing.test.ts`

- [ ] **Step 1: Write failing tests for Skill Maker summary formatting**

Create `test/domains/bundle/user-facing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSkillMakerPlanSummary,
  formatSkillMakerPlanSummary,
  buildSkillMakerResumeText,
  buildSkillMakerInstallText,
} from '../../../domains/bundle/user-facing.js';

describe('Skill Maker user-facing summaries', () => {
  it('formats a customize-comet proposal without backend vocabulary first', () => {
    const summary = buildSkillMakerPlanSummary({
      intent: 'customize-comet',
      skillName: 'team-comet',
      goal: 'Add security review before verification.',
      retained: ['open / design / build / verify / archive'],
      additions: ['verify before: security-review'],
      replacements: ['build planning: writing-plans -> team-planning'],
      disabled: [],
      rejected: ['delete verify: verify is the Comet closure step'],
      generated: ['/team-comet', 'Skill files, rules, hooks, scripts'],
      validation: ['Quick validation is recommended before install'],
      install: ['Install/enable into the current Agent after preview'],
      advanced: ['Bundle Factory state is preserved for audit'],
    });

    const text = formatSkillMakerPlanSummary(summary);

    expect(text).toContain('You are making: Customize /comet');
    expect(text).toContain('Keep:');
    expect(text).toContain('Add:');
    expect(text).toContain('Replace:');
    expect(text).toContain('Cannot do:');
    expect(text).toContain('Validate:');
    expect(text).toContain('Install/enable:');
    expect(text.indexOf('Bundle Factory')).toBeGreaterThan(text.indexOf('Advanced details:'));
  });

  it('formats resume text around user progress and next action', () => {
    const text = buildSkillMakerResumeText({
      title: 'Found an unfinished Skill creation',
      completed: ['Plan confirmed', 'Skill files generated'],
      missing: ['Validate this Skill'],
      nextAction: 'Continue validation',
      choices: ['Continue', 'View details', 'Abandon this creation'],
    });

    expect(text).toContain('Found an unfinished Skill creation');
    expect(text).toContain('Completed:');
    expect(text).toContain('Still needed:');
    expect(text).toContain('Next step: Continue validation');
    expect(text).not.toContain('Factory state is draft');
  });

  it('formats install preview without forcing publish/distribute vocabulary', () => {
    const text = buildSkillMakerInstallText({
      preview: true,
      skillName: 'team-comet',
      platforms: ['claude'],
      plannedFiles: ['skill: .claude/skills/team-comet/SKILL.md', 'hook: before-tool'],
      disclosures: ['hook guard reads state before writes'],
    });

    expect(text).toContain('Install preview');
    expect(text).toContain('No files were written');
    expect(text).toContain('Planned files:');
    expect(text).toContain('Executable disclosures:');
    expect(text).not.toContain('Distribution preview');
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
npx vitest run test/domains/bundle/user-facing.test.ts
```

Expected: FAIL because `domains/bundle/user-facing.ts` does not exist.

- [ ] **Step 3: Add the user-facing summary module**

Create `domains/bundle/user-facing.ts`:

```ts
export type SkillMakerIntent = 'customize-comet' | 'new-skill' | 'upgrade-existing';

export interface SkillMakerPlanSummary {
  intent: SkillMakerIntent;
  intentLabel: string;
  skillName: string;
  goal: string;
  retained: string[];
  additions: string[];
  replacements: string[];
  disabled: string[];
  rejected: string[];
  generated: string[];
  validation: string[];
  install: string[];
  advanced: string[];
}

export interface SkillMakerResumeTextInput {
  title: string;
  completed: string[];
  missing: string[];
  nextAction: string;
  choices: string[];
}

export interface SkillMakerInstallTextInput {
  preview: boolean;
  skillName: string;
  platforms: string[];
  plannedFiles: string[];
  disclosures: string[];
}

export function skillMakerIntentLabel(intent: SkillMakerIntent): string {
  switch (intent) {
    case 'customize-comet':
      return 'Customize /comet';
    case 'new-skill':
      return 'Create a new Skill';
    case 'upgrade-existing':
      return 'Upgrade an existing Skill';
  }
}

export function buildSkillMakerPlanSummary(options: Omit<SkillMakerPlanSummary, 'intentLabel'>) {
  return {
    ...options,
    intentLabel: skillMakerIntentLabel(options.intent),
  };
}

function section(title: string, values: string[]): string[] {
  return values.length === 0 ? [`${title}: None`] : [`${title}:`, ...values.map((value) => `- ${value}`)];
}

export function formatSkillMakerPlanSummary(summary: SkillMakerPlanSummary): string {
  return [
    `You are making: ${summary.intentLabel}`,
    `Skill: ${summary.skillName}`,
    `Goal: ${summary.goal}`,
    ...section('Keep', summary.retained),
    ...section('Add', summary.additions),
    ...section('Replace', summary.replacements),
    ...section('Turn off', summary.disabled),
    ...section('Cannot do', summary.rejected),
    ...section('Will generate', summary.generated),
    ...section('Validate', summary.validation),
    ...section('Install/enable', summary.install),
    ...section('Advanced details', summary.advanced),
  ].join('\n');
}

export function buildSkillMakerResumeText(input: SkillMakerResumeTextInput): string {
  return [
    input.title,
    ...section('Completed', input.completed),
    ...section('Still needed', input.missing),
    `Next step: ${input.nextAction}`,
    ...section('Choices', input.choices),
  ].join('\n');
}

export function buildSkillMakerInstallText(input: SkillMakerInstallTextInput): string {
  return [
    input.preview ? 'Install preview' : 'Install result',
    `Skill: ${input.skillName}`,
    ...section('Platforms', input.platforms),
    ...(input.preview ? ['No files were written'] : []),
    ...section('Planned files', input.plannedFiles),
    ...section('Executable disclosures', input.disclosures),
  ].join('\n');
}
```

- [ ] **Step 4: Run the user-facing tests**

Run:

```bash
npx vitest run test/domains/bundle/user-facing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add domains/bundle/user-facing.ts test/domains/bundle/user-facing.test.ts
git commit -m "feat: add comet-any skill maker summaries"
```

---

## Task 2: Put User Summary First in Factory Proposal, Resume, Review, and Install Output

**Files:**
- Modify: `domains/bundle/factory-proposal.ts`
- Modify: `domains/bundle/next-action.ts`
- Modify: `domains/bundle/readiness-user-summary.ts`
- Modify: `app/commands/bundle.ts`
- Test: `test/domains/bundle/bundle-cli-e2e.test.ts`
- Test: `test/domains/bundle/publish-command.test.ts`

- [ ] **Step 1: Write failing CLI tests for proposal, resume, review, and install language**

Add these assertions to `test/domains/bundle/bundle-cli-e2e.test.ts` in the existing Factory proposal tests or create a nearby test that writes a Factory plan:

```ts
it('shows Skill Maker language before backend details in factory proposal text', async () => {
  const skillsDir = path.join(projectRoot, '.codex', 'skills', 'factory-alpha');
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.writeFile(
    path.join(skillsDir, 'SKILL.md'),
    '---\nname: factory-alpha\ndescription: Alpha.\n---\n\n# Alpha\n',
  );
  const planFile = path.join(root, 'factory-plan.json');
  await writeFactoryPlan(planFile);

  const result = runCli(
    'bundle',
    'factory-propose',
    'skill-maker-alpha',
    '--project',
    projectRoot,
    '--file',
    planFile,
  );

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('You are making: Create a new Skill');
  expect(result.stdout).toContain('Will generate:');
  expect(result.stdout).toContain('Validate:');
  expect(result.stdout).toContain('Install/enable:');
  expect(result.stdout.indexOf('You are making:')).toBeLessThan(
    result.stdout.indexOf('Advanced details:'),
  );
});
```

Update `test/domains/bundle/publish-command.test.ts`:

```ts
expect(text).toContain('Found an unfinished Skill creation');
expect(text).toContain('Still needed:');
expect(reviewText).toContain('Validate this Skill');
expect(text).toContain('Install result');
expect(text).not.toContain('Distribution result');
```

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: FAIL because current text starts with Factory/Bundle/Publish wording.

- [ ] **Step 3: Add `skillMakerSummary` to Factory proposal**

Modify `domains/bundle/factory-proposal.ts`:

```ts
import {
  buildSkillMakerPlanSummary,
  type SkillMakerPlanSummary,
} from './user-facing.js';
```

Add the field to `BundleFactoryProposal`:

```ts
  skillMakerSummary: SkillMakerPlanSummary;
```

Before constructing `proposal`, build:

```ts
  const skillMakerSummary = buildSkillMakerPlanSummary({
    intent: plan.mode === 'optimize' ? 'upgrade-existing' : 'new-skill',
    skillName: options.name,
    goal: plan.goal,
    retained: [],
    additions: plan.callChain.map((item) => item.skill),
    replacements: [],
    disabled: [],
    rejected: blockers,
    generated: generatedControlPlane(),
    validation: validationPlan(),
    install: ['Install/enable into the current Agent after validation and preview.'],
    advanced: [
      `Preference mode: ${projectPreferences?.preferences.mode ?? 'advisory'}`,
      `Factory proposal hash will be recorded after confirmation.`,
    ],
  });
```

Add it to the returned proposal object:

```ts
    skillMakerSummary,
```

- [ ] **Step 4: Make CLI text use user-facing summaries first**

Modify imports in `app/commands/bundle.ts`:

```ts
import {
  buildSkillMakerInstallText,
  buildSkillMakerResumeText,
  formatSkillMakerPlanSummary,
} from '../../domains/bundle/user-facing.js';
```

In `formatStatusText`, prepend:

```ts
  const userText = buildSkillMakerResumeText({
    title: 'Found an unfinished Skill creation',
    completed: resumeSummary.completed,
    missing: resumeSummary.missing,
    nextAction: resumeSummary.recommendedNextStep.userLabel,
    choices: resumeSummary.choices.map((choice) => choice.label),
  });
```

Return `userText` before advanced details:

```ts
  return [
    userText,
    'Advanced details:',
    `Bundle: ${state.name}`,
    ...
  ].join('\n');
```

In `bundleFactoryProposeCommand`, replace the text branch beginning with `Factory proposal` with:

```ts
    [
      formatSkillMakerPlanSummary(proposal.skillMakerSummary),
      'Advanced details:',
      `Factory proposal ${proposal.name}`,
      `Preference mode: ${proposal.preference.mode}`,
      `Can generate: ${proposal.canGenerate ? 'yes' : 'no'}`,
      ...formatOptionalSection(
        'Will reuse Skills:',
        proposal.userSummary.reusedSkills.map(
          (item) => `${item.skill}: ${item.status}; ${item.sourceCount} source(s)`,
        ),
      ),
      ...formatOptionalSection('Blockers:', proposal.blockers),
      ...formatOptionalSection(
        'Actions:',
        proposal.actions.map((action) => `${action.id}: ${action.command}`),
      ),
    ].join('\n')
```

In `formatReviewSummaryText`, rename the first user lines:

```ts
  const userLines = [
    summary.userSummary.conclusion === 'blocked'
      ? 'Validate this Skill: blocked'
      : 'Validate this Skill: ready for the next step',
    summary.userSummary.summary,
    ...formatOptionalSection(
      'Next steps:',
      summary.userSummary.nextSteps.map((step) => `${step.label}: ${step.command}`),
    ),
  ];
```

In `formatDistributionText`, replace the header with user-facing text:

```ts
  return buildSkillMakerInstallText({
    preview: result.preview,
    skillName: result.bundle,
    platforms: result.platforms.map((platform) => `${platform.platform}: ${platform.status}`),
    plannedFiles: result.platforms.flatMap((platform) =>
      platform.plannedFiles.map((file) => `${file.kind}: ${file.destination}`),
    ),
    disclosures: result.platforms.flatMap((platform) =>
      platform.executableDisclosures.map(
        (disclosure) =>
          `${disclosure.id}: ${disclosure.command} (${disclosure.sideEffect}) -> ${disclosure.destination}`,
      ),
    ),
  });
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add domains/bundle/factory-proposal.ts domains/bundle/next-action.ts domains/bundle/readiness-user-summary.ts app/commands/bundle.ts test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/publish-command.test.ts
git commit -m "feat: put comet-any user summaries first"
```

---

## Task 3: Add Skill Maker Intents and `/comet` Derive Plan Parsing

**Files:**
- Create: `domains/bundle/templates/comet-skill-maker-template.ts`
- Modify: `domains/bundle/types.ts`
- Modify: `domains/bundle/factory-plan.ts`
- Test: `test/domains/bundle/comet-skill-maker-template.test.ts`
- Test: `test/domains/bundle/bundle-cli-e2e.test.ts`

- [ ] **Step 1: Write failing template tests**

Create `test/domains/bundle/comet-skill-maker-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expandCometSkillMakerTemplate } from '../../../domains/bundle/templates/comet-skill-maker-template.js';

describe('Comet Skill Maker template expansion', () => {
  it('expands add, replace, and disable operations into a call chain summary', () => {
    const expanded = expandCometSkillMakerTemplate({
      baseTemplate: { skill: 'comet', profile: 'full' },
      templateDelta: {
        add: [{ phase: 'verify', position: 'before', skill: 'security-review' }],
        replace: [{ phase: 'build', step: 'writing-plans', skill: 'team-planning' }],
        disable: [{ phase: 'build', step: 'build-review' }],
      },
    });

    expect(expanded.callChain.map((step) => step.skill)).toEqual([
      'comet-open',
      'comet-design',
      'team-planning',
      'comet-build',
      'security-review',
      'comet-verify',
      'comet-archive',
    ]);
    expect(expanded.additions).toContain('verify before: security-review');
    expect(expanded.replacements).toContain('build writing-plans: writing-plans -> team-planning');
    expect(expanded.disabled).toContain('build build-review');
    expect(expanded.rejected).toEqual([]);
  });

  it('rejects replacing protected closure steps', () => {
    const expanded = expandCometSkillMakerTemplate({
      baseTemplate: { skill: 'comet', profile: 'full' },
      templateDelta: {
        add: [],
        replace: [{ phase: 'verify', step: 'verify-result-transition', skill: 'skip-verify' }],
        disable: [],
      },
    });

    expect(expanded.rejected).toEqual([
      'verify verify-result-transition: protected steps cannot be replaced',
    ]);
    expect(expanded.callChain.map((step) => step.skill)).toContain('comet-verify');
  });
});
```

- [ ] **Step 2: Run template tests to verify failure**

Run:

```bash
npx vitest run test/domains/bundle/comet-skill-maker-template.test.ts
```

Expected: FAIL because template module does not exist.

- [ ] **Step 3: Add derive/template types**

Modify `domains/bundle/types.ts`:

```ts
export type SkillMakerIntent = 'customize-comet' | 'new-skill' | 'upgrade-existing';
export type BundleAuthoringMode = 'create' | 'optimize' | 'derive';

export interface BundleBaseTemplate {
  skill: 'comet';
  profile: 'full' | 'hotfix' | 'tweak';
}

export interface BundleTemplateDelta {
  add: Array<{ phase: string; position: 'before' | 'after'; skill: string }>;
  replace: Array<{ phase: string; step: string; skill: string }>;
  disable: Array<{ phase: string; step: string }>;
}

export interface BundleTemplateExpansion {
  retained: string[];
  additions: string[];
  replacements: string[];
  disabled: string[];
  rejected: string[];
}
```

Change `BundleAuthoringState.mode` to:

```ts
  mode: BundleAuthoringMode;
```

Add optional metadata to `BundleFactoryMetadata`:

```ts
  skillMakerIntent?: SkillMakerIntent;
  baseTemplate?: BundleBaseTemplate;
  templateDelta?: BundleTemplateDelta;
  templateExpansion?: BundleTemplateExpansion;
```

- [ ] **Step 4: Add `/comet` template expansion module**

Create `domains/bundle/templates/comet-skill-maker-template.ts`:

```ts
import type {
  BundleBaseTemplate,
  BundleFactoryCallChainItem,
  BundleTemplateDelta,
  BundleTemplateExpansion,
} from '../types.js';

type StepType = 'protected' | 'mutable' | 'optional';

interface TemplateStep {
  phase: string;
  step: string;
  skill: string;
  type: StepType;
}

export interface CometTemplateExpansionInput {
  baseTemplate: BundleBaseTemplate;
  templateDelta: BundleTemplateDelta;
}

export interface CometTemplateExpansionOutput extends BundleTemplateExpansion {
  callChain: BundleFactoryCallChainItem[];
}

const fullTemplate: TemplateStep[] = [
  { phase: 'open', step: 'open', skill: 'comet-open', type: 'protected' },
  { phase: 'design', step: 'brainstorming', skill: 'comet-design', type: 'mutable' },
  { phase: 'build', step: 'writing-plans', skill: 'writing-plans', type: 'mutable' },
  { phase: 'build', step: 'build-execution', skill: 'comet-build', type: 'mutable' },
  { phase: 'build', step: 'build-review', skill: 'requesting-code-review', type: 'optional' },
  { phase: 'verify', step: 'verify-result-transition', skill: 'comet-verify', type: 'protected' },
  { phase: 'archive', step: 'archive-delta-sync', skill: 'comet-archive', type: 'protected' },
];

function templateFor(baseTemplate: BundleBaseTemplate): TemplateStep[] {
  if (baseTemplate.profile === 'full') return [...fullTemplate];
  if (baseTemplate.profile === 'hotfix') {
    return fullTemplate.filter((step) => step.phase !== 'design');
  }
  return fullTemplate.filter(
    (step) => !(step.phase === 'design' || step.step === 'writing-plans'),
  );
}

function findStep(steps: TemplateStep[], phase: string, step: string): TemplateStep | undefined {
  return steps.find((item) => item.phase === phase && item.step === step);
}

export function expandCometSkillMakerTemplate(
  input: CometTemplateExpansionInput,
): CometTemplateExpansionOutput {
  const steps = templateFor(input.baseTemplate);
  const additions: string[] = [];
  const replacements: string[] = [];
  const disabled: string[] = [];
  const rejected: string[] = [];
  const disabledKeys = new Set<string>();
  const before = new Map<string, string[]>();
  const after = new Map<string, string[]>();
  const replacementByKey = new Map<string, string>();

  for (const operation of input.templateDelta.add) {
    const phaseSteps = steps.filter((step) => step.phase === operation.phase);
    const anchor = operation.position === 'before' ? phaseSteps[0] : phaseSteps[phaseSteps.length - 1];
    if (!anchor) {
      rejected.push(`${operation.phase}: unknown phase`);
      continue;
    }
    const key = `${anchor.phase}:${anchor.step}`;
    const target = operation.position === 'before' ? before : after;
    target.set(key, [...(target.get(key) ?? []), operation.skill]);
    additions.push(`${operation.phase} ${operation.position}: ${operation.skill}`);
  }

  for (const operation of input.templateDelta.replace) {
    const target = findStep(steps, operation.phase, operation.step);
    if (!target) {
      rejected.push(`${operation.phase} ${operation.step}: unknown step`);
      continue;
    }
    if (target.type !== 'mutable') {
      rejected.push(`${operation.phase} ${operation.step}: protected steps cannot be replaced`);
      continue;
    }
    replacementByKey.set(`${target.phase}:${target.step}`, operation.skill);
    replacements.push(`${operation.phase} ${operation.step}: ${target.skill} -> ${operation.skill}`);
  }

  for (const operation of input.templateDelta.disable) {
    const target = findStep(steps, operation.phase, operation.step);
    if (!target) {
      rejected.push(`${operation.phase} ${operation.step}: unknown step`);
      continue;
    }
    if (target.type !== 'optional') {
      rejected.push(`${operation.phase} ${operation.step}: only optional steps can be turned off`);
      continue;
    }
    disabledKeys.add(`${target.phase}:${target.step}`);
    disabled.push(`${operation.phase} ${operation.step}`);
  }

  const skills: string[] = [];
  for (const step of steps) {
    const key = `${step.phase}:${step.step}`;
    skills.push(...(before.get(key) ?? []));
    if (!disabledKeys.has(key)) skills.push(replacementByKey.get(key) ?? step.skill);
    skills.push(...(after.get(key) ?? []));
  }

  return {
    retained: ['open / design / build / verify / archive'],
    additions,
    replacements,
    disabled,
    rejected,
    callChain: [...new Set(skills)].map((skill) => ({ skill, preferenceIndex: null })),
  };
}
```

- [ ] **Step 5: Extend factory plan parsing for derive**

Modify `domains/bundle/factory-plan.ts` imports:

```ts
import { expandCometSkillMakerTemplate } from './templates/comet-skill-maker-template.js';
import type {
  BundleBaseTemplate,
  BundleTemplateDelta,
  SkillMakerIntent,
} from './types.js';
```

Extend `BundleFactoryPlanFile`:

```ts
  skillMakerIntent?: SkillMakerIntent;
  callChain?: Array<string | { skill: string; preferenceIndex?: number | null }>;
  baseTemplate?: BundleBaseTemplate;
  templateDelta?: BundleTemplateDelta;
```

In `readBundleFactoryPlan`, replace the hard callChain requirement with:

```ts
  if (plan.mode === 'derive') {
    if (!plan.baseTemplate) throw new Error(`Invalid factory plan: ${absolutePath} derive mode must include baseTemplate`);
    if (!plan.templateDelta) throw new Error(`Invalid factory plan: ${absolutePath} derive mode must include templateDelta`);
  } else if (!Array.isArray(plan.callChain)) {
    throw new Error(`Invalid factory plan: ${absolutePath} must include callChain`);
  }
```

In `normalizeBundleFactoryPlan`, compute:

```ts
  const derived =
    plan.mode === 'derive' && plan.baseTemplate && plan.templateDelta
      ? expandCometSkillMakerTemplate({
          baseTemplate: plan.baseTemplate,
          templateDelta: plan.templateDelta,
        })
      : null;
  const rawCallChain = plan.callChain ?? derived?.callChain ?? [];
```

Use `rawCallChain` instead of `plan.callChain` when computing `preferredSkills` and `callChain`.

Add to the normalized return value:

```ts
    skillMakerIntent: plan.skillMakerIntent ?? (plan.mode === 'derive' ? 'customize-comet' : plan.mode === 'optimize' ? 'upgrade-existing' : 'new-skill'),
    ...(plan.baseTemplate ? { baseTemplate: plan.baseTemplate } : {}),
    ...(plan.templateDelta ? { templateDelta: plan.templateDelta } : {}),
    ...(derived ? { templateExpansion: derived } : {}),
```

Also extend `NormalizedBundleFactoryPlan` with those optional fields.

- [ ] **Step 6: Run template and existing factory tests**

Run:

```bash
npx vitest run test/domains/bundle/comet-skill-maker-template.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add domains/bundle/types.ts domains/bundle/factory-plan.ts domains/bundle/templates/comet-skill-maker-template.ts test/domains/bundle/comet-skill-maker-template.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
git commit -m "feat: support comet-any skill maker intents"
```

---

## Task 4: Persist Skill Maker Metadata Through Factory State and Generated Reports

**Files:**
- Modify: `domains/bundle/factory.ts`
- Modify: `domains/factory/package.ts`
- Test: `test/domains/factory/factory-package.test.ts`
- Test: `test/domains/bundle/bundle-cli-e2e.test.ts`

- [ ] **Step 1: Write failing metadata persistence tests**

Add to `test/domains/bundle/bundle-cli-e2e.test.ts`:

```ts
it('persists Skill Maker intent and template expansion in factory metadata', async () => {
  const skillsDir = path.join(projectRoot, '.codex', 'skills', 'security-review');
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.writeFile(
    path.join(skillsDir, 'SKILL.md'),
    '---\nname: security-review\ndescription: Security review.\n---\n\n# Security Review\n',
  );
  const planFile = path.join(root, 'derive-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        mode: 'derive',
        goal: 'Customize /comet with security review.',
        baseTemplate: { skill: 'comet', profile: 'full' },
        templateDelta: {
          add: [{ phase: 'verify', position: 'before', skill: 'security-review' }],
          replace: [],
          disable: [{ phase: 'build', step: 'build-review' }],
        },
        engineMode: 'deterministic',
        runnerMode: 'change',
        defaultLocale: 'zh',
        locales: ['zh', 'en'],
      },
      null,
      2,
    ),
  );

  const state = runJson(
    'bundle',
    'factory-init',
    'team-comet',
    '--project',
    projectRoot,
    '--file',
    planFile,
    '--confirmed-proposal',
  );

  expect(state.factory).toMatchObject({
    skillMakerIntent: 'customize-comet',
    baseTemplate: { skill: 'comet', profile: 'full' },
    templateExpansion: expect.objectContaining({
      additions: expect.arrayContaining(['verify before: security-review']),
      disabled: expect.arrayContaining(['build build-review']),
    }),
  });
});
```

- [ ] **Step 2: Run metadata tests to verify failure**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: FAIL because metadata is not copied into Factory state yet.

- [ ] **Step 3: Persist fields in Factory metadata**

Modify `domains/bundle/factory.ts` when constructing `factory` in `initializeBundleFactoryState`:

```ts
    skillMakerIntent: plan.skillMakerIntent,
    baseTemplate: plan.baseTemplate,
    templateDelta: plan.templateDelta,
    templateExpansion: plan.templateExpansion
      ? {
          retained: plan.templateExpansion.retained,
          additions: plan.templateExpansion.additions,
          replacements: plan.templateExpansion.replacements,
          disabled: plan.templateExpansion.disabled,
          rejected: plan.templateExpansion.rejected,
        }
      : undefined,
```

When calling `generateFactorySkillPackage`, pass these values through:

```ts
    skillMaker: factory.skillMakerIntent
      ? {
          intent: factory.skillMakerIntent,
          baseTemplate: factory.baseTemplate,
          templateExpansion: factory.templateExpansion,
        }
      : undefined,
```

- [ ] **Step 4: Add generated report text**

Extend `domains/factory/types.ts` `FactorySkillPackagePlan`:

```ts
  skillMaker?: {
    intent: 'customize-comet' | 'new-skill' | 'upgrade-existing';
    baseTemplate?: { skill: 'comet'; profile: 'full' | 'hotfix' | 'tweak' };
    templateExpansion?: {
      retained: string[];
      additions: string[];
      replacements: string[];
      disabled: string[];
      rejected: string[];
    };
  };
```

In `domains/factory/package.ts`, add to `compositionReport(plan)` before Issues:

```ts
  const skillMaker = plan.skillMaker
    ? `## Skill Maker Summary

- Intent: ${plan.skillMaker.intent}
- Base template: ${
        plan.skillMaker.baseTemplate
          ? `${plan.skillMaker.baseTemplate.skill}/${plan.skillMaker.baseTemplate.profile}`
          : 'none'
      }
- Retained: ${plan.skillMaker.templateExpansion?.retained.join(', ') || 'none'}
- Added: ${plan.skillMaker.templateExpansion?.additions.join(', ') || 'none'}
- Replaced: ${plan.skillMaker.templateExpansion?.replacements.join(', ') || 'none'}
- Turned off: ${plan.skillMaker.templateExpansion?.disabled.join(', ') || 'none'}
- Rejected: ${plan.skillMaker.templateExpansion?.rejected.join(', ') || 'none'}
`
    : '';
```

Include `${skillMaker}` after the preference section in the returned Markdown.

- [ ] **Step 5: Add generated report test**

In `test/domains/factory/factory-package.test.ts`, add:

```ts
expect(report).toContain('## Skill Maker Summary');
expect(report).toContain('Intent: customize-comet');
expect(report).toContain('Base template: comet/full');
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts test/domains/factory/factory-package.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add domains/bundle/factory.ts domains/factory/types.ts domains/factory/package.ts test/domains/bundle/bundle-cli-e2e.test.ts test/domains/factory/factory-package.test.ts
git commit -m "feat: persist comet-any skill maker metadata"
```

---

## Task 5: Update Chinese `/comet-any` Skill and References First

**Files:**
- Modify: `assets/skills-zh/comet-any/SKILL.md`
- Modify: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills-zh/comet-any/reference/eval-provider.md`
- Modify: `test/ts/comet-any-skill.test.ts`

- [ ] **Step 1: Update Chinese Skill tests to expect Skill Maker language**

In `test/ts/comet-any-skill.test.ts`, update the Chinese expected phrases:

```ts
for (const expected of [
  'Skill Maker',
  '改一版 /comet',
  '做一个新 Skill',
  '整理已有 Skill',
  '加 / 换 / 关',
  '验证这个 Skill',
  '安装/启用到当前 Agent',
  'Bundle Factory 是内部确定性后端',
  '普通用户不需要学习 Bundle、Factory 或 templateDelta',
  '显示详情',
  '高级详情',
]) {
  expect(combined).toContain(expected);
}
```

Keep assertions that backend commands still appear in references:

```ts
for (const command of [
  'comet bundle factory-guide',
  'comet bundle factory-propose',
  'comet bundle factory-init',
  'comet publish review',
  'comet publish distribute',
]) {
  expect(combined).toContain(command);
}
```

- [ ] **Step 2: Run Chinese Skill test to verify failure**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: FAIL because the Chinese Skill still describes Comet Any as Comet Skill Factory first.

- [ ] **Step 3: Rewrite Chinese top-level Skill user layer**

In `assets/skills-zh/comet-any/SKILL.md`, replace the opening section with:

```markdown
# Comet Any — Skill Maker

`/comet-any` 是 Skill 创建向导。普通用户只需要说明想做什么 Skill；
本 Skill 会把需求转成内部 Factory plan、验证计划和安装计划。

普通用户只需要理解三件事：

1. `改一版 /comet` — 保留 Comet 的流程，只加、换、关一些能力。
2. `做一个新 Skill` — 从目标出发生成一个可调用、可验证、可安装的 Skill。
3. `整理已有 Skill` — 把已有 Skill 调整成更稳定、可验证、可安装的版本。

用户编辑动作只使用：

- `加`：增加一个能力。
- `换`：替换一个可替换能力。
- `关`：关闭一个可选能力。

Bundle Factory、composition、templateDelta、Phase Recipe、readiness、publish/distribute
都是内部或高级详情概念。对普通用户转述时，使用“方案”“验证”“安装/启用”“恢复”这些词。
```

Keep the existing hard gates that say CLI is deterministic backend, no manual `comet bundle` as main flow, no missing/ambiguous silent selection, Eval skip blocks ready, and distribution requires confirmation.

- [ ] **Step 4: Rewrite Chinese workflow step headings**

Change step headings in `assets/skills-zh/comet-any/SKILL.md`:

```markdown
### 1. 恢复未完成的 Skill 创建
### 2. 询问用户意图
### 3. 读取项目偏好和真实 Skill
### 4. 生成用户可读方案
### 5. 等待确认生成 / 修改 / 取消
### 6. 内部写入 Factory 状态并生成 Skill
### 7. 验证这个 Skill
### 8. 安装/启用到当前 Agent
```

Under "询问用户意图", include the three choices exactly:

```markdown
1. 改一版 /comet
2. 做一个新 Skill
3. 整理已有 Skill
```

Under "生成用户可读方案", include the unified confirmation page shape from the spec.

- [ ] **Step 5: Update Chinese references**

In `assets/skills-zh/comet-any/reference/bundle-authoring.md`, add near the top:

```markdown
## 用户层和后端层

普通用户看到的是 Skill Maker：改一版 `/comet`、做一个新 Skill、整理已有 Skill。
Bundle Factory 是内部确定性后端，用于维护 plan、metadata、proposal confirmation、Eval evidence 和 publish/distribute evidence。
普通路径不要求用户学习 `bundle.yaml`、`templateDelta`、`Phase Recipe` 或 `.comet/bundle-authoring/*`。
```

In `assets/skills-zh/comet-any/reference/eval-provider.md`, add:

```markdown
## 用户层命名

对普通用户说“验证这个 Skill”和“安装/启用到当前 Agent”。
`comet eval`、`comet publish review/approve/run`、`comet publish distribute --preview` 是内部或高级详情命令。
```

- [ ] **Step 6: Run Chinese Skill test**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: PASS. Do not add English parity assertions in this task; Task 6 adds them after Chinese wording is approved.

- [ ] **Step 7: Commit Chinese Skill update and stop for user review**

```bash
git add assets/skills-zh/comet-any/SKILL.md assets/skills-zh/comet-any/reference/bundle-authoring.md assets/skills-zh/comet-any/reference/eval-provider.md test/ts/comet-any-skill.test.ts
git commit -m "docs: update chinese comet-any skill maker flow"
```

Stop after this commit and ask the user to review the Chinese wording before modifying English files.

---

## Task 6: Sync English Skill and User-Facing Docs After Chinese Approval

**Files:**
- Modify: `assets/skills/comet-any/SKILL.md`
- Modify: `assets/skills/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills/comet-any/reference/eval-provider.md`
- Modify: `test/ts/comet-any-skill.test.ts`
- Modify: `README-zh.md`
- Modify: `README.md`

This task must run only after the user approves the Chinese wording from Task 5.

- [ ] **Step 1: Update English parity assertions**

In `test/ts/comet-any-skill.test.ts`, add parity rows:

```ts
{ zh: '改一版 /comet', en: 'Customize /comet' },
{ zh: '做一个新 Skill', en: 'Create a new Skill' },
{ zh: '整理已有 Skill', en: 'Upgrade an existing Skill' },
{ zh: '加 / 换 / 关', en: 'add / replace / turn off' },
{ zh: '验证这个 Skill', en: 'Validate this Skill' },
{ zh: '安装/启用到当前 Agent', en: 'Install/enable into the current Agent' },
```

- [ ] **Step 2: Run parity test to verify failure**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: FAIL because English Skill is not synced yet.

- [ ] **Step 3: Sync English top-level Skill**

In `assets/skills/comet-any/SKILL.md`, mirror the Chinese user layer:

```markdown
# Comet Any - Skill Maker

`/comet-any` is the Skill creation guide. The user only describes what Skill they want;
this Skill translates that goal into an internal Factory plan, validation plan, and install plan.

The ordinary user only needs three choices:

1. `Customize /comet` - keep the Comet workflow and add, replace, or turn off capabilities.
2. `Create a new Skill` - generate a callable, validated, installable Skill from a goal.
3. `Upgrade an existing Skill` - make an existing Skill more stable, validated, and installable.

User edits use only:

- `add`: add a capability.
- `replace`: replace a replaceable capability.
- `turn off`: turn off an optional capability.

Bundle Factory, composition, templateDelta, Phase Recipe, readiness, publish, and distribute
are internal or advanced-detail concepts. In ordinary user-facing text, say "plan",
"validate", "install/enable", and "resume".
```

- [ ] **Step 4: Sync English references**

Add equivalent "User layer and backend layer" and "User-facing naming" sections to:

```text
assets/skills/comet-any/reference/bundle-authoring.md
assets/skills/comet-any/reference/eval-provider.md
```

- [ ] **Step 5: Update README surfaces conservatively**

In `README-zh.md`, ensure `/comet-any` is described with one concise paragraph:

```markdown
`/comet-any` 是 Skill Maker：用来改一版 `/comet`、做一个新 Skill，或整理已有 Skill。普通用户只需要确认方案、验证 Skill，并安装/启用到当前 Agent；Bundle Factory 是内部后端。
```

In `README.md`, mirror:

```markdown
`/comet-any` is the Skill Maker for customizing `/comet`, creating a new Skill, or upgrading an existing Skill. Ordinary users confirm the plan, validate the Skill, and install/enable it into the current Agent; Bundle Factory remains the internal backend.
```

- [ ] **Step 6: Run docs/Skill tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add assets/skills/comet-any/SKILL.md assets/skills/comet-any/reference/bundle-authoring.md assets/skills/comet-any/reference/eval-provider.md test/ts/comet-any-skill.test.ts README-zh.md README.md
git commit -m "docs: sync comet-any skill maker wording"
```

---

## Task 7: CLI Help, Changelog, and Final Verification

**Files:**
- Modify: `app/cli/index.ts`
- Modify: `test/domains/bundle/publish-command.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add failing CLI help assertions**

In `test/domains/bundle/publish-command.test.ts` or a new CLI help test, add:

```ts
const help = spawnSync(process.execPath, [cli, 'publish', '--help'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
expect(help.stdout).toContain('Validate and install /comet-any Skill candidates');
```

For bundle help:

```ts
const bundleHelp = spawnSync(process.execPath, [cli, 'bundle', '--help'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
expect(bundleHelp.stdout).toContain('Advanced Bundle backend');
```

- [ ] **Step 2: Run help tests to verify failure**

Run:

```bash
npx vitest run test/domains/bundle/publish-command.test.ts
```

Expected: FAIL until CLI descriptions are updated.

- [ ] **Step 3: Update CLI help**

Modify `app/cli/index.ts`:

```ts
const publish = program
  .command('publish')
  .description('Validate and install /comet-any Skill candidates');
```

Keep:

```ts
const bundle = program
  .command('bundle')
  .description('Advanced Bundle backend for Skill publish candidates');
```

- [ ] **Step 4: Update Changelog**

Find the top version in `package.json` (`0.4.0-beta.1`) and compare with current `CHANGELOG.md`.
If `CHANGELOG.md` already has `## What's Changed [0.4.0-beta.1] - 2026-06-24`, append:

```markdown
### Changed

- **Comet Any Skill Maker UX**: Reframes `/comet-any` around user-facing Skill Maker intents, plain add/replace/turn-off edits, validation, and install/enable language while keeping Bundle Factory, Eval, and publish/distribute as internal backend capabilities.
```

If no current entry exists, add a new top entry with the same version as `package.json`.

- [ ] **Step 5: Run targeted checks**

Run:

```bash
npx vitest run test/domains/bundle/user-facing.test.ts test/domains/bundle/comet-skill-maker-template.test.ts test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/publish-command.test.ts test/domains/bundle/bundle-review-summary.test.ts test/ts/comet-any-skill.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run broad verification**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

Expected: all PASS.

- [ ] **Step 7: Commit final verification/changelog changes**

```bash
git add app/cli/index.ts test/domains/bundle/publish-command.test.ts CHANGELOG.md
git commit -m "docs: record comet-any skill maker changes"
```

## Execution Notes

- Prefer `subagent-driven-development` for implementation because tasks touch independent surfaces: user-facing summary, derive template, Skill docs, README, and CLI help.
- If executing inline, stop after Task 5 for Chinese wording review before Task 6.
- Use `PYTHONUTF8=1` only when running Python-based Chinese validation scripts; the TypeScript tests above do not require it.
