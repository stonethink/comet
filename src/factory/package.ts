import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import type { FactorySkillPackagePlan, GeneratedFactorySkillPackage } from './types.js';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function stepId(index: number, skill: string): string {
  return `step-${index + 1}-${slug(skill)}`;
}

function skillMarkdown(plan: FactorySkillPackagePlan): string {
  const callChain =
    plan.callChain.length === 0
      ? '1. checkpoint'
      : plan.callChain.map((item, index) => `${index + 1}. ${item.skill}`).join('\n');
  const evidence =
    !plan.resolvedSkills || plan.resolvedSkills.length === 0
      ? '尚未记录 resolved Skill 证据。'
      : plan.resolvedSkills
          .map((skill) => {
            const sources =
              skill.sources.length === 0
                ? 'no sources'
                : skill.sources
                    .map((source) => {
                      const description = source.description ? ` - ${source.description}` : '';
                      return `${source.name}@${source.platform} ${source.hash.slice(0, 12)}${description}`;
                    })
                    .join('; ');
            return `- ${skill.query} (${skill.status}, preferenceIndex=${skill.preferenceIndex ?? 'none'}): ${sources}`;
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

## 偏离偏好顺序

${deviations}

## 真实 Skill 证据

${evidence}

完整结构化证据位于 \`reference/resolved-skills.json\`。

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

export async function generateFactorySkillPackage(
  plan: FactorySkillPackagePlan,
): Promise<GeneratedFactorySkillPackage> {
  const packageRoot = path.resolve(plan.root, 'skills', plan.name);
  const cometRoot = path.join(packageRoot, 'comet');
  const referenceRoot = path.join(packageRoot, 'reference');

  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'SKILL.md'), skillMarkdown(plan), 'utf8');
  await fs.mkdir(referenceRoot, { recursive: true });
  await fs.writeFile(
    path.join(referenceRoot, 'resolved-skills.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        resolvedSkills: plan.resolvedSkills ?? [],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

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
    await fs.writeFile(path.join(cometRoot, 'evals.yaml'), stringify(runtimeEvals()), 'utf8');
  }

  return {
    packageRoot,
    skillPath: path.join(packageRoot, 'SKILL.md'),
    enginePath: plan.engineMode === 'none' ? null : cometRoot,
  };
}
