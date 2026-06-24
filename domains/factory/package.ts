import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import type {
  FactoryResolvedSkill,
  FactorySkillPackagePlan,
  GeneratedFactorySkillPackage,
} from './types.js';

interface ResolvedSkillSourceSummary {
  query: string;
  preferenceIndex: number | null;
  status: FactoryResolvedSkill['status'];
  source: {
    name: string;
    platform: string;
    scope: string;
    root: string;
    hash: string;
    description: string;
    references: Array<{ path: string; contentHash: string }>;
    scripts: Array<{
      path: string;
      sideEffect: 'unknown' | 'none' | 'read' | 'write' | 'external';
    }>;
  };
  summary: string;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function stepId(index: number, skill: string): string {
  return `step-${index + 1}-${slug(skill)}`;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '');
}

function summarizeSkillMarkdown(markdown: string): string {
  const lines: string[] = [];
  let inFence = false;
  for (const rawLine of stripFrontmatter(markdown).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (
      inFence ||
      line.length === 0 ||
      line.startsWith('#') ||
      /^[-*_]{3,}$/u.test(line) ||
      /^<\/?[A-Z-]+>/u.test(line)
    ) {
      continue;
    }
    lines.push(line.replace(/^[-*]\s+/u, ''));
    if (lines.length >= 3) break;
  }
  const summary = lines.join(' ').replace(/\s+/gu, ' ').trim();
  return summary.length > 600 ? `${summary.slice(0, 597).trimEnd()}...` : summary;
}

function buildSourceSummaries(plan: FactorySkillPackagePlan): ResolvedSkillSourceSummary[] {
  return (plan.resolvedSkills ?? []).flatMap((skill) =>
    skill.sources.map((source) => ({
      query: skill.query,
      preferenceIndex: skill.preferenceIndex,
      status: skill.status,
      source: {
        name: source.name,
        platform: source.platform,
        scope: source.scope,
        root: source.root,
        hash: source.hash,
        description: source.description,
        references: source.references ?? [],
        scripts: source.scripts ?? [],
      },
      summary: summarizeSkillMarkdown(source.skillMd),
    })),
  );
}

function skillMarkdown(plan: FactorySkillPackagePlan): string {
  const sourceSummaries = buildSourceSummaries(plan);
  const summaryBySkill = new Map<string, ResolvedSkillSourceSummary[]>();
  for (const summary of sourceSummaries) {
    const entries = summaryBySkill.get(summary.query) ?? [];
    entries.push(summary);
    summaryBySkill.set(summary.query, entries);
  }
  const callChain =
    plan.callChain.length === 0
      ? '1. checkpoint'
      : plan.callChain.map((item, index) => `${index + 1}. ${item.skill}`).join('\n');
  const workflow =
    plan.callChain.length === 0
      ? '1. checkpoint: 完成一次显式检查点。'
      : plan.callChain
          .map((item, index) => {
            const summaries = summaryBySkill.get(item.skill) ?? [];
            const primary = summaries[0];
            const detail = primary?.summary
              ? ` ${primary.summary}`
              : (primary?.source.description ?? '按该 Skill 的真实说明执行。');
            return `${index + 1}. \`${item.skill}\`: ${detail}`;
          })
          .join('\n');
  const evidence =
    sourceSummaries.length === 0
      ? '尚未记录 resolved Skill 证据。'
      : sourceSummaries
          .map((summary) => {
            const description = summary.source.description
              ? ` - ${summary.source.description}`
              : '';
            const excerpt = summary.summary ? ` 摘要：${summary.summary}` : '';
            return `- ${summary.query} (${summary.status}, preferenceIndex=${summary.preferenceIndex ?? 'none'}): ${summary.source.name}@${summary.source.platform} ${summary.source.hash.slice(0, 12)}${description}${excerpt}`;
          })
          .join('\n');
  const deviations =
    plan.deviations.length === 0
      ? '无。'
      : plan.deviations
          .map(
            (item) =>
              `- ${item.skill}: expected ${item.expectedIndex}, actual ${item.actualIndex}. ${item.reason}`,
          )
          .join('\n');
  const stopPoints = [
    '- 当候选 Skill 缺失、歧义或偏离用户偏好顺序且没有记录原因时，停止并要求恢复。',
    '- 当生成脚本、hook 或外部副作用时，停止并要求用户确认。',
    '- 当 Eval 被跳过或失败时，不发布 ready Bundle。',
  ].join('\n');
  const risks = [
    '- 生成内容来自候选 Skill 摘要，不能声称完整复制原 Skill 的所有隐含经验。',
    '- Engine 文件表达运行语义，但当前平台入口仍由 Agent 执行 action/outcome 协议。',
    '- 偏离 `.comet/skill-preferences.yaml` 顺序会降低用户偏好可预测性，必须在 review summary 中解释。',
  ].join('\n');
  const internalUsage =
    plan.callChain.length === 0
      ? '无内部 Skill。'
      : plan.callChain
          .map((item, index) => `${index + 1}. 调用 \`${item.skill}\` 处理该步骤的专门协议。`)
          .join('\n');

  return `---
name: ${plan.name}
description: ${plan.description}
---

# ${plan.name}

${plan.description}

## 目标

${plan.goal}

## 调用链

${callChain}

## 组合后的工作方式

${workflow}

## 偏离偏好顺序

${deviations}

## 真实 Skill 证据

${evidence}

完整结构化证据位于 \`reference/resolved-skills.json\`。

## 停止点

${stopPoints}

## 风险

${risks}

## 内部 Skill 使用方式

${internalUsage}

## 运行方式

用户只需要调用本 Skill。CLI 是内部后端；需要持久化、恢复或运行期评估时，当前 Agent 应通过 Comet Engine action/outcome 协议推进。
`;
}

function skillDefinition(plan: FactorySkillPackagePlan): Record<string, unknown> {
  const steps = plan.callChain.map((item, index) => ({
    id: stepId(index, item.skill),
    action: { type: 'invoke_skill', ref: item.skill },
    ...(index + 1 < plan.callChain.length
      ? { next: stepId(index + 1, plan.callChain[index + 1].skill) }
      : {}),
  }));

  return {
    apiVersion: 'comet/v1alpha1',
    kind: 'Skill',
    metadata: {
      name: plan.name,
      version: plan.version,
      description: plan.description,
    },
    goal: {
      statement: plan.goal,
      inputs: [],
      outputs: [{ name: 'result', description: 'Generated workflow result' }],
      success: ['The generated workflow completes according to its call chain'],
    },
    orchestration:
      plan.engineMode === 'adaptive'
        ? { mode: 'adaptive' }
        : {
            mode: 'deterministic',
            entry: steps[0]?.id ?? 'complete',
            steps: steps.length > 0 ? steps : [{ id: 'complete', action: { type: 'checkpoint' } }],
          },
    skills: plan.callChain.map((item) => ({ id: item.skill })),
    agents: [],
    tools: [],
  };
}

function guardrails(plan: FactorySkillPackagePlan): Record<string, unknown> {
  return {
    allowedSkills: plan.callChain.map((item) => item.skill),
    allowedAgents: [],
    allowedTools: [],
    maxIterations: Math.max(plan.callChain.length + 2, 5),
    maxRetriesPerAction: 2,
    confirmationRequiredFor: [],
  };
}

function runtimeEvals(): Record<string, unknown> {
  return {
    runtime: [
      {
        id: 'completed',
        scope: 'completion',
        type: 'state_equals',
        field: 'status',
        equals: 'completed',
      },
    ],
  };
}

function evalManifest(plan: FactorySkillPackagePlan): Record<string, unknown> {
  return {
    apiVersion: 'comet.eval/v1alpha1',
    kind: 'SkillEvalManifest',
    metadata: {
      name: plan.name,
      description: plan.description,
    },
    skill: {
      name: plan.name,
      source: '..',
      profile: 'authoring-skill',
    },
    evaluation: {
      recommendedTasks: ['authoring-skill-smoke'],
      requiredSkills: plan.callChain.map((item) => item.skill),
      expectedArtifacts: ['reference/resolved-skills.json'],
    },
    interaction: {
      mode: 'none',
      maxTurns: 8,
    },
  };
}

function compositionReport(plan: FactorySkillPackagePlan): string {
  const preference = `## Project Skill Preference

- Preference mode: ${plan.preference?.mode ?? 'advisory'}
- Preference source: ${plan.preference?.sourcePath ?? 'none'}
- Preference hash: ${plan.preference?.sourceHash ?? 'none'}
- Required Skills: ${(plan.preference?.requiredSkills ?? []).join(', ') || 'none'}
`;
  const composition = plan.composition;
  if (!composition) {
    return `# Composition Report

${preference}

No composition metadata was recorded.
`;
  }

  const entrySkills =
    composition.entrySkills.length === 0
      ? 'No entry skills were recorded.'
      : composition.entrySkills.map((skill) => `- ${skill}`).join('\n');
  const steps =
    composition.steps.length === 0
      ? 'No steps were recorded.'
      : composition.steps
          .map((step, index) => {
            const from = step.fromSkill ? ` from ${step.fromSkill}` : '';
            const choice = step.choiceId ? ` via choice ${step.choiceId}` : '';
            const preference = step.preferenceIndex === null ? 'none' : step.preferenceIndex;
            return `${index + 1}. ${step.id}: ${step.skill} (${step.source}${from}${choice}, preferenceIndex=${preference})`;
          })
          .join('\n');
  const choices =
    composition.choices.length === 0
      ? 'No choices were recorded.'
      : composition.choices
          .map(
            (choice) =>
              `- ${choice.id}: ${choice.selectedSkill ?? 'unresolved'} from ${choice.fromSkill}. ${choice.reason}`,
          )
          .join('\n');
  const issues =
    composition.issues.length === 0
      ? 'No composition issues.'
      : composition.issues.map((issue) => `- ${issue.type}: ${issue.message}`).join('\n');

  return `# Composition Report

${preference}

## Entry Skills

${entrySkills}

## Steps

${steps}

## Choices

${choices}

## Issues

${issues}
`;
}

function planScript(plan: FactorySkillPackagePlan): string {
  const planSourcePath = plan.engineMode === 'none' ? ['SKILL.md'] : ['comet', 'skill.yaml'];
  const planSteps = plan.callChain.map((item, index) => stepId(index, item.skill));
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'status';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');
const planSteps = ${JSON.stringify(planSteps, null, 2)};
const planSourcePath = path.join(packageRoot, ${planSourcePath.map((item) => `'${item}'`).join(', ')});

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function currentPlanHash() {
  return sha256(await fs.readFile(planSourcePath, 'utf8'));
}

async function readState() {
  return readJson(statePath);
}

async function assertPlanHash(state) {
  const actual = await currentPlanHash();
  if (state?.planHash !== actual) {
    throw new Error('Comet control plane plan hash drift: expected ' + String(state?.planHash) + ', got ' + actual);
  }
}

async function main() {
  if (command === 'status') {
    try {
      const state = await readState();
      await assertPlanHash(state);
      console.log(JSON.stringify(state, null, 2));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        console.log(JSON.stringify({ status: 'not-started' }, null, 2));
        return;
      }
      throw error;
    }
    return;
  }
  if (command === 'init') {
    await writeJson(statePath, {
      schemaVersion: 1,
      status: 'running',
      currentStep: planSteps[0] ?? null,
      completedSteps: [],
      outcomes: {},
      planHash: await currentPlanHash(),
    });
    return;
  }
  if (command === 'complete-step') {
    const step = process.argv[3];
    if (!step) throw new Error('complete-step requires a step id');
    const state = await readState();
    await assertPlanHash(state);
    if (state.status !== 'running') {
      throw new Error('complete-step requires running state; got ' + String(state.status));
    }
    if (state.currentStep !== step) {
      throw new Error('complete-step expected currentStep ' + String(state.currentStep) + ', got ' + step);
    }
    const outcomeArg = process.argv[4];
    let outcome = null;
    if (outcomeArg !== undefined) {
      outcome = JSON.parse(outcomeArg);
    }
    const completedSteps = Array.isArray(state.completedSteps) ? state.completedSteps : [];
    const nextIndex = planSteps.indexOf(step) + 1;
    const nextStep = planSteps[nextIndex] ?? null;
    state.completedSteps = [...completedSteps, step];
    state.outcomes = {
      ...(state.outcomes && typeof state.outcomes === 'object' && !Array.isArray(state.outcomes)
        ? state.outcomes
        : {}),
      [step]: outcome,
    };
    state.currentStep = nextStep;
    state.status = nextStep === null ? 'completed' : 'running';
    await writeJson(statePath, state);
    return;
  }
  throw new Error('Unknown command: ' + command);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function checkScript(plan: FactorySkillPackagePlan): string {
  const required = [
    'SKILL.md',
    ...(plan.engineMode === 'none'
      ? []
      : ['comet/skill.yaml', 'comet/guardrails.yaml', 'comet/checks.yaml', 'comet/eval.yaml']),
    'reference/resolved-skills.json',
    'reference/composition-report.md',
    'scripts/comet-plan.mjs',
    'scripts/comet-check.mjs',
    'scripts/comet-hook-guard.mjs',
  ];
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const command = process.argv[2] ?? 'verify';

const required = ${JSON.stringify(required, null, 2)};

async function main() {
  if (command !== 'verify') {
    throw new Error('Unknown command: ' + command);
  }
  const missing = [];
  for (const relative of required) {
    try {
      const stats = await fs.stat(path.join(packageRoot, relative));
      if (!stats.isFile()) missing.push(relative);
    } catch {
      missing.push(relative);
    }
  }
  if (missing.length > 0) {
    console.error('Missing required control plane files: ' + missing.join(', '));
    process.exit(1);
  }
  console.log('control-plane-ok');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function hookGuardScript(plan: FactorySkillPackagePlan): string {
  const planSourcePath = plan.engineMode === 'none' ? ['SKILL.md'] : ['comet', 'skill.yaml'];
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const planSourcePath = path.join(packageRoot, ${planSourcePath.map((item) => `'${item}'`).join(', ')});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function currentPlanHash() {
  return sha256(await fs.readFile(planSourcePath, 'utf8'));
}

async function main() {
  const event = process.argv[2];
  if (event !== 'before_write' && event !== 'before_tool') {
    console.error('Comet hook guard only supports before_write and before_tool events.');
    process.exit(1);
  }
  const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');
  let state;
  try {
    await fs.access(packageRoot);
    state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch (error) {
    const message = error instanceof SyntaxError ? 'invalid' : 'missing';
    console.error('Comet control plane state is ' + message + ': ' + statePath);
    process.exit(1);
  }
  if (state?.status !== 'running') {
    console.error(
      'Comet control plane state status must be running before guarded writes; got ' +
        String(state?.status) +
        '.',
    );
    process.exit(1);
  }
  const actualPlanHash = await currentPlanHash();
  if (state.planHash !== actualPlanHash) {
    console.error('Comet control plane plan hash drift: expected ' + String(state.planHash) + ', got ' + actualPlanHash + '.');
    process.exit(1);
  }
  console.log('hook-guard-ok');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

export async function generateFactorySkillPackage(
  plan: FactorySkillPackagePlan,
): Promise<GeneratedFactorySkillPackage> {
  const packageRoot = path.resolve(plan.root, 'skills', plan.name);
  const cometRoot = path.join(packageRoot, 'comet');
  const referenceRoot = path.join(packageRoot, 'reference');
  const scriptsRoot = path.join(packageRoot, 'scripts');
  const compositionReportPath = path.join(referenceRoot, 'composition-report.md');
  const scriptPaths = [
    path.join(scriptsRoot, 'comet-plan.mjs'),
    path.join(scriptsRoot, 'comet-check.mjs'),
    path.join(scriptsRoot, 'comet-hook-guard.mjs'),
  ];

  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'SKILL.md'), skillMarkdown(plan), 'utf8');
  await fs.mkdir(referenceRoot, { recursive: true });
  await fs.writeFile(
    path.join(referenceRoot, 'resolved-skills.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        resolvedSkills: plan.resolvedSkills ?? [],
        sourceSummaries: buildSourceSummaries(plan),
        preference: plan.preference ?? null,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await fs.writeFile(compositionReportPath, compositionReport(plan), 'utf8');
  await fs.mkdir(scriptsRoot, { recursive: true });
  await fs.writeFile(scriptPaths[0]!, planScript(plan), 'utf8');
  await fs.writeFile(scriptPaths[1]!, checkScript(plan), 'utf8');
  await fs.writeFile(scriptPaths[2]!, hookGuardScript(plan), 'utf8');

  if (plan.engineMode !== 'none') {
    await fs.mkdir(cometRoot, { recursive: true });
    await fs.writeFile(
      path.join(cometRoot, 'skill.yaml'),
      stringify(skillDefinition(plan)),
      'utf8',
    );
    await fs.writeFile(
      path.join(cometRoot, 'guardrails.yaml'),
      stringify(guardrails(plan)),
      'utf8',
    );
    await fs.writeFile(path.join(cometRoot, 'checks.yaml'), stringify(runtimeEvals()), 'utf8');
    await fs.writeFile(path.join(cometRoot, 'eval.yaml'), stringify(evalManifest(plan)), 'utf8');
  }

  return {
    packageRoot,
    skillPath: path.join(packageRoot, 'SKILL.md'),
    enginePath: plan.engineMode === 'none' ? null : cometRoot,
    evalManifestPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'eval.yaml'),
    controlPlane: {
      checksPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'checks.yaml'),
      evalManifestPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'eval.yaml'),
      compositionReportPath,
      scripts: scriptPaths,
    },
  };
}
