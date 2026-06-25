import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import type {
  FactoryResolvedSkill,
  FactorySkillPackagePlan,
  FactoryStageName,
  GeneratedFactorySkillPackage,
} from './types.js';
import {
  compileWorkflowSpec,
  type FactoryWorkflowSpec,
  type FactoryWorkflowSlot,
  type FactoryWorkflowStage,
} from './protocol.js';

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

type ResolvedSkillSource = FactoryResolvedSkill['sources'][number];

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

function sourceSkillBody(markdown: string): string {
  return stripFrontmatter(markdown).trim();
}

function insertAfterFirstHeading(markdown: string, insertion: string): string {
  const lines = markdown.split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => /^#\s+/u.test(line));
  if (headingIndex === -1) {
    return `${insertion.trim()}\n\n${markdown}`.trim();
  }
  return [
    ...lines.slice(0, headingIndex + 1),
    '',
    insertion.trim(),
    '',
    ...lines.slice(headingIndex + 1),
  ]
    .join('\n')
    .trim();
}

function insertSectionIntoSkillBody(
  markdown: string,
  fallbackTitle: string,
  insertion: string,
): string {
  if (/^#\s+/mu.test(markdown)) {
    return insertAfterFirstHeading(markdown, insertion);
  }
  return `# ${fallbackTitle}\n\n${insertion.trim()}\n\n${markdown}`.trim();
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

function primaryResolvedSource(
  plan: FactorySkillPackagePlan,
  query: string,
): ResolvedSkillSource | null {
  const resolved = (plan.resolvedSkills ?? []).find(
    (skill) => skill.query === query && skill.status === 'available',
  );
  return resolved?.sources[0] ?? null;
}

interface FactoryStagePlan extends FactoryStageName {
  sourceSkill: string;
  workflowStage: FactoryWorkflowStage;
  workflowSlot?: FactoryWorkflowSlot;
  parentStage?: FactoryWorkflowStage;
  kind: 'stage' | 'slot';
}

function buildStagePlans(plan: FactorySkillPackagePlan): FactoryStagePlan[] {
  const workflow = compileWorkflowSpec(plan);
  return workflow.stages.flatMap((stage) => {
    const phasePlan: FactoryStagePlan = {
      skill: stage.sourceSkill,
      name: stage.stageSkill,
      recommendedName: stage.recommendedName,
      source: stage.nameSource,
      phase: stage.phase,
      ...(stage.step ? { step: stage.step } : {}),
      label: stage.label,
      sourceSkill: stage.sourceSkill,
      workflowStage: stage,
      kind: 'stage',
    };
    const slotPlans = stage.slots.map((slot) => ({
      skill: slot.sourceSkill,
      name: slot.stageSkill,
      recommendedName: slot.recommendedName,
      source: slot.nameSource,
      phase: slot.phase,
      step: slot.step,
      label: slot.label,
      sourceSkill: slot.sourceSkill,
      workflowStage: stage,
      workflowSlot: slot,
      parentStage: stage,
      kind: 'slot' as const,
    }));
    return [phasePlan, ...slotPlans];
  });
}

function stageSkillFor(
  stagePlans: FactoryStagePlan[],
  item: FactorySkillPackagePlan['callChain'][number],
  index: number,
): string {
  return stagePlans[index]?.sourceSkill === item.skill ? stagePlans[index]!.name : item.skill;
}

function generatedEntryDescription(plan: FactorySkillPackagePlan): string {
  return `Use when running the generated ${plan.name} workflow`;
}

function generatedStageDescription(plan: FactorySkillPackagePlan, stage: FactoryStagePlan): string {
  return `Use when running the generated ${stage.name} stage for ${plan.name}`;
}

function skillLoadInstruction(skill: string): string {
  return `**立即执行：** 使用 Skill 工具加载 \`${skill}\` 技能。禁止跳过此步骤。`;
}

function workflowRouteMarkdown(workflow: FactoryWorkflowSpec): string {
  if (workflow.stages.length === 0) {
    return '1. 当前 workflow 没有阶段；记录 checkpoint 后结束。';
  }
  return workflow.stages
    .map((stage, index) => {
      const next = stage.nextStage
        ? ` 下一阶段：\`${stage.nextStage}\`。`
        : ' 当前阶段完成后 workflow 结束。';
      return `${index + 1}. ${skillLoadInstruction(stage.stageSkill)}（${stage.label} 阶段，来源 Skill: \`${stage.sourceSkill}\`。）${next}`;
    })
    .join('\n');
}

function workflowProtocolSection(workflow: FactoryWorkflowSpec): string {
  const route = workflowRouteMarkdown(workflow);
  const decisions =
    workflow.decisions.length === 0
      ? '- 无全局用户停顿点。'
      : workflow.decisions
          .map(
            (decision) =>
              `- ${decision.label}: ${decision.options.map((option) => `「${option}」`).join(' / ')}`,
          )
          .join('\n');
  return `## Workflow 协议

生成路由是本 Skill 的唯一执行权威。来源 Skill 正文只作为阶段行为和证据使用；当来源正文里的旧路由、旧命令或旧阶段顺序与本节冲突时，以本节为准。

### 权威阶段路线

${route}

### 自动推进协议

- 当前阶段退出检查全部通过且没有用户停顿点时，自动进入下一阶段。
- 如果任一退出检查未通过，继续留在当前阶段补齐目标，不得机械退出。
- 如果下一阶段为 \`null\`，汇总证据并结束 workflow。

### 脚本检查守卫

- 使用 \`scripts/workflow-guard.mjs\` 检查入口条件和退出条件。
- 使用 \`scripts/workflow-state.mjs\` 记录当前阶段、已完成阶段、证据和下一阶段。
- 使用 \`scripts/workflow-handoff.mjs\` 写入跨阶段交接摘要。

### 跨设备断点恢复

- 主状态路径：\`${workflow.recovery.statePath}\`
- 兼容状态路径：\`${workflow.recovery.compatibilityStatePath}\`
- 恢复时按 \`reference/workflow-protocol.json\` 的 \`stages\` 顺序定位第一个未完成阶段。

### 用户停顿点

${decisions}`;
}

function workflowStageProtocolMarkdown(stage: FactoryWorkflowStage): string {
  const entry = stage.entryGate.map((item) => `- ${item}`).join('\n');
  const exit = stage.exitGate.map((item) => `- ${item}`).join('\n');
  const resume = stage.resumeProbe.map((item) => `- ${item}`).join('\n');
  const evidence = stage.evidence.map((item) => `- ${item}`).join('\n');
  const pausePoints =
    stage.pausePoints.length === 0
      ? '- 无阶段专属停顿点。'
      : stage.pausePoints
          .map(
            (decision) =>
              `- ${decision.label}: ${decision.options.map((option) => `「${option}」`).join(' / ')}`,
          )
          .join('\n');
  const next = stage.nextStage ? `下一阶段：\`${stage.nextStage}\`` : '下一阶段：workflow 完成';
  return `## 阶段检查

### 入口检查

${entry}

### 退出检查

${exit}

### 未完成处理

${stage.incompleteBehavior}

### 恢复探针

${resume}

### 证据

${evidence}

### 用户停顿点

${pausePoints}

### 下一阶段

${next}`;
}

function workflowDecisionPointsMarkdown(workflow: FactoryWorkflowSpec): string {
  const decisions =
    workflow.decisions.length === 0
      ? '- 无。'
      : workflow.decisions
          .map(
            (decision) =>
              `- **${decision.label}** (${decision.id}): ${decision.options.map((option) => `「${option}」`).join(' / ')}`,
          )
          .join('\n');
  const stages = workflow.stages
    .map((stage) => {
      const points =
        stage.pausePoints.length === 0
          ? '无'
          : stage.pausePoints
              .map((decision) => `${decision.label}: ${decision.options.join(' / ')}`)
              .join('; ');
      return `- \`${stage.stageSkill}\`: ${points}`;
    })
    .join('\n');
  return `# Workflow 用户停顿点

## 全局停顿点

${decisions}

## 阶段停顿点

${stages}
`;
}

function workflowRecoveryMarkdown(workflow: FactoryWorkflowSpec): string {
  const stages = workflow.recovery.resumeOrder.map((stage) => `- ${stage}`).join('\n');
  return `# Workflow 恢复

## 状态路径

- 主状态：\`${workflow.recovery.statePath}\`
- 兼容状态：\`${workflow.recovery.compatibilityStatePath}\`

## 恢复顺序

${stages}

## 规则

从第一个未列入已完成阶段的 Skill 恢复。如果阶段证据不完整，留在该阶段补齐退出条件，不得进入下一阶段。
`;
}

function titleFromName(name: string): string {
  return name
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function slotDisplayLabel(slot: FactoryWorkflowSlot): string {
  if (/grill|pressure/u.test(`${slot.sourceSkill} ${slot.step} ${slot.label}`)) {
    return '设计压力测试';
  }
  if (/writing-plans|build plan|plan/u.test(`${slot.sourceSkill} ${slot.step} ${slot.label}`)) {
    return '构建计划';
  }
  if (
    /requesting-code-review|code-review|build review|review/u.test(
      `${slot.sourceSkill} ${slot.step} ${slot.label}`,
    )
  ) {
    return '构建代码审查';
  }
  return slot.label;
}

function stageRouteLines(workflow: FactoryWorkflowSpec): string {
  return workflow.stages
    .map((stage, index) => {
      const next = stage.nextStage
        ? ` 下一阶段：\`${stage.nextStage}\`。`
        : ' 当前阶段完成后 workflow 结束。';
      const slots =
        stage.slots.length === 0
          ? ''
          : `\n   - 插槽：${stage.slots
              .map(
                (slot) =>
                  `\`${slot.id}\` → ${skillLoadInstruction(slot.stageSkill)}（来源 Skill: \`${slot.sourceSkill}\`）`,
              )
              .join('\n   - 插槽：')}`;
      return `${index + 1}. ${skillLoadInstruction(stage.stageSkill)}（${phaseDisplayLabel(stage)}，来源 Skill: \`${stage.sourceSkill}\`。）${next}${slots}`;
    })
    .join('\n');
}

function cleanCometOverlayEntryMarkdown(
  plan: FactorySkillPackagePlan,
  workflow: FactoryWorkflowSpec,
): string {
  const slots = workflow.stages
    .flatMap((stage) =>
      stage.slots.map(
        (slot) =>
          `- \`${slot.id}\`: ${slotDisplayLabel(slot)}，来源 \`${slot.sourceSkill}\`，执行 \`${slot.stageSkill}\`。`,
      ),
    )
    .join('\n');
  const stopPoints = workflow.decisions
    .map(
      (decision) =>
        `- ${decision.label}: ${decision.options.map((option) => `「${option}」`).join(' / ')}`,
    )
    .join('\n');
  return `---
name: ${plan.name}
description: ${generatedEntryDescription(plan)}
---

# ${titleFromName(plan.name)}

这是 Skill Maker 生成的 /comet 定制流程。

## 决策核心

本 Skill 保留 Comet 的开启 / 设计 / 构建 / 验证 / 归档主路径，并把用户选择的 Skill 放入明确插槽。插槽必须在所属阶段内完成，不能绕过阶段守卫直接进入下一阶段。

## 阶段路线

${stageRouteLines(workflow)}

## 自定义插槽

${slots || '- 无自定义插槽。'}

## 自动推进与恢复

- 当前阶段目标和所有插槽退出条件满足后，自动进入下一阶段。
- 如果阶段目标或插槽证据缺失，继续停留在当前阶段补齐，不得机械退出。
- 恢复时读取 \`${workflow.recovery.statePath}\`，再按 \`reference/workflow-protocol.json\` 的阶段和插槽顺序定位断点。

## 脚本守卫

- \`scripts/workflow-guard.mjs\` 校验阶段和插槽是否允许进入或退出；退出通过时直接输出下一阶段。
- \`scripts/workflow-state.mjs\` 记录阶段、插槽证据，并可用 \`next\` 查询下一步。
- \`scripts/workflow-handoff.mjs\` 输出跨阶段交接摘要。

## 用户停顿点

${stopPoints || '- 无。'}

## 参考

- \`reference/workflow-protocol.json\`: 机器可读阶段与插槽路线。
- \`reference/resolved-skills.json\`: 候选 Skill 证据，仅供审计。
- \`reference/composition-report.md\`: 组合报告，仅供审计。
`;
}

function cleanWorkflowKernelEntryMarkdown(
  plan: FactorySkillPackagePlan,
  workflow: FactoryWorkflowSpec,
): string {
  const stopPoints = workflow.decisions
    .map(
      (decision) =>
        `- ${decision.label}: ${decision.options.map((option) => `「${option}」`).join(' / ')}`,
    )
    .join('\n');
  return `---
name: ${plan.name}
description: ${generatedEntryDescription(plan)}
---

# ${titleFromName(plan.name)}

这是由用户选择的 Skills 生成的 Comet 风格流程。

## 决策核心

本 Skill 按固定阶段路线执行用户选择的 Skills。每个阶段都有入口检查、退出条件、证据要求和恢复点；退出条件未满足时留在当前阶段继续完成目标。

## 阶段路线

${stageRouteLines(workflow)}

## 自动推进与恢复

- 当前阶段退出检查通过且没有用户停顿点时，自动进入下一阶段。
- 任一退出检查未通过时，继续当前阶段，不强制退出。
- 恢复路径：\`${workflow.recovery.statePath}\`。

## 脚本守卫

- \`scripts/workflow-guard.mjs\` 检查阶段入口、出口和路线；退出通过时直接输出下一阶段。
- \`scripts/workflow-state.mjs\` 记录当前阶段、已完成阶段和证据，并可用 \`next\` 查询下一步。
- \`scripts/workflow-handoff.mjs\` 输出阶段交接摘要。

## 用户停顿点

${stopPoints || '- 无。'}

## 参考

- \`reference/workflow-protocol.json\`: 机器可读阶段路线。
- \`reference/resolved-skills.json\`: 候选 Skill 证据，仅供审计。
- \`reference/composition-report.md\`: 组合报告，仅供审计。
`;
}

function cometRuntimeBoilerplate(skillName: string): string {
  return `COMET_ENV="\${COMET_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/${skillName}/scripts/comet-env.mjs' -type f -print -quit 2>/dev/null)}"
if [ -z "$COMET_ENV" ]; then
  echo "ERROR: comet-env.mjs not found. Ensure the ${skillName} skill is installed." >&2
  return 1
fi
COMET_SCRIPTS_DIR="$(node "$COMET_ENV")"
COMET_STATE="$COMET_SCRIPTS_DIR/comet-state.mjs"
COMET_GUARD="$COMET_SCRIPTS_DIR/comet-guard.mjs"
COMET_HANDOFF="$COMET_SCRIPTS_DIR/comet-handoff.mjs"
COMET_ARCHIVE="$COMET_SCRIPTS_DIR/comet-archive.mjs"
COMET_RUNTIME="$COMET_SCRIPTS_DIR/comet-runtime.mjs"

if [ -z "$COMET_SCRIPTS_DIR" ]; then
  echo "ERROR: Comet scripts not found. Ensure the ${skillName} skill is installed." >&2
  return 1
fi
`;
}

function rewriteCometRuntimeReferences(markdown: string, skillName: string): string {
  let result = markdown;
  result = result.replace(/\bcomet\/reference\//gu, `${skillName}/reference/`);
  result = result.replace(/\bcomet\/scripts\//gu, `${skillName}/scripts/`);
  result = result.replace(
    /\*\/comet\/scripts\/comet-env\.(?:sh|mjs)/gu,
    `*/${skillName}/scripts/comet-env.mjs`,
  );
  result = result.replace(/\bcomet-env\.sh\b/gu, 'comet-env.mjs');
  result = result.replace(/\bcomet-state\.sh\b/gu, 'comet-state.mjs');
  result = result.replace(/\bcomet-guard\.sh\b/gu, 'comet-guard.mjs');
  result = result.replace(/\bcomet-handoff\.sh\b/gu, 'comet-handoff.mjs');
  result = result.replace(/\bcomet-archive\.sh\b/gu, 'comet-archive.mjs');
  result = result.replace(/"\$COMET_BASH"\s+"\$(COMET_[A-Z_]+)"/gu, 'node "$$$1"');
  result = result.replace(
    /COMET_ENV="\$\{COMET_ENV:-\$\(find [\s\S]*?fi\r?\n\. "\$COMET_ENV"\r?\n(?:\r?\nif \[ -z "\$COMET_[\s\S]*?fi)?/gu,
    cometRuntimeBoilerplate(skillName),
  );
  result = result.replace(/\bfinode "\$(COMET_[A-Z_]+)"/gu, 'fi\nnode "$$$1"');
  return result;
}

function rewriteSourceSkillReferences(
  markdown: string,
  stagePlans: FactoryStagePlan[],
  plan?: FactorySkillPackagePlan,
): string {
  let result = markdown;
  for (const stage of stagePlans) {
    const escaped = stage.sourceSkill.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    result = result.replace(new RegExp(`/${escaped}`, 'gu'), stage.name);
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gu'), stage.name);
  }
  if (plan?.skillMaker?.intent === 'customize-comet') {
    result = rewriteCometRuntimeReferences(result, plan.name);
  }
  return result;
}

function isCometBuiltinStage(plan: FactorySkillPackagePlan, stage: FactoryStagePlan): boolean {
  return plan.skillMaker?.intent === 'customize-comet' && /^comet(?:-|$)/u.test(stage.sourceSkill);
}

function skillMarkdown(plan: FactorySkillPackagePlan): string {
  const sourceSummaries = buildSourceSummaries(plan);
  const stagePlans = buildStagePlans(plan);
  const workflow = compileWorkflowSpec(plan);
  if (workflow.kind === 'comet-overlay') {
    return cleanCometOverlayEntryMarkdown(plan, workflow);
  }
  if (workflow.kind === 'workflow-kernel') {
    return cleanWorkflowKernelEntryMarkdown(plan, workflow);
  }
  const summaryBySkill = new Map<string, ResolvedSkillSourceSummary[]>();
  for (const summary of sourceSummaries) {
    const entries = summaryBySkill.get(summary.query) ?? [];
    entries.push(summary);
    summaryBySkill.set(summary.query, entries);
  }
  const callChain =
    plan.callChain.length === 0
      ? '1. checkpoint'
      : plan.callChain
          .map((item, index) => {
            const stageSkill = stageSkillFor(stagePlans, item, index);
            return `${index + 1}. ${stageSkill === item.skill ? item.skill : `${stageSkill} (${item.skill})`}`;
          })
          .join('\n');
  const workflowSummary =
    plan.callChain.length === 0
      ? '1. checkpoint: 完成一次显式检查点。'
      : plan.callChain
          .map((item, index) => {
            const summaries = summaryBySkill.get(item.skill) ?? [];
            const primary = summaries[0];
            const detail = primary?.summary
              ? ` ${primary.summary}`
              : (primary?.source.description ?? '按该 Skill 的真实说明执行。');
            const stageSkill = stageSkillFor(stagePlans, item, index);
            return `${index + 1}. \`${stageSkill}\`: ${detail}`;
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
    stagePlans.length === 0
      ? '无内部 Skill。'
      : stagePlans
          .map(
            (stage, index) =>
              `${index + 1}. ${skillLoadInstruction(stage.name)}（${stage.label ?? stage.phase ?? stage.sourceSkill} 阶段，来源 Skill: \`${stage.sourceSkill}\`。）`,
          )
          .join('\n');
  const stageSkillSection =
    stagePlans.length === 0
      ? '无内部阶段 Skill。'
      : stagePlans
          .map((stage) => {
            const source =
              stage.source === 'custom' ? `自定义，推荐名 \`${stage.recommendedName}\`` : '推荐名';
            return `- \`${stage.name}\`: ${stage.label ?? stage.phase ?? stage.sourceSkill}，来源 \`${stage.sourceSkill}\`，${source}。`;
          })
          .join('\n');
  const baseTemplateSkill =
    plan.skillMaker?.intent === 'customize-comet' ? plan.skillMaker.baseTemplate?.skill : undefined;
  const baseTemplateSource = baseTemplateSkill
    ? primaryResolvedSource(plan, baseTemplateSkill)
    : null;
  const baseTemplateBody = baseTemplateSource ? sourceSkillBody(baseTemplateSource.skillMd) : '';
  if (baseTemplateSource && baseTemplateBody.length > 0) {
    return customizedCometSkillMarkdown({
      plan,
      baseSource: baseTemplateSource,
      baseBody: baseTemplateBody,
      stagePlans,
      stageSkillSection,
      evidence,
      deviations,
      stopPoints,
      internalUsage,
    });
  }

  return `---
name: ${plan.name}
description: ${generatedEntryDescription(plan)}
---

# ${plan.name}

${workflowProtocolSection(workflow)}

${plan.description}

## 目标

${plan.goal}

## 调用链

${callChain}

## 组合后的工作方式

${workflowSummary}

## 偏离偏好顺序

${deviations}

## 真实 Skill 证据

${evidence}

完整结构化证据位于 \`reference/resolved-skills.json\`。

## 阶段 Skill

${stageSkillSection}

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

function customizedCometSkillMarkdown(options: {
  plan: FactorySkillPackagePlan;
  baseSource: ResolvedSkillSource;
  baseBody: string;
  stagePlans: FactoryStagePlan[];
  stageSkillSection: string;
  evidence: string;
  deviations: string;
  stopPoints: string;
  internalUsage: string;
}): string {
  const {
    plan,
    baseSource,
    baseBody,
    stagePlans,
    stageSkillSection,
    evidence,
    deviations,
    stopPoints,
    internalUsage,
  } = options;
  const workflow = compileWorkflowSpec(plan);
  const mappings =
    stagePlans.length === 0
      ? '- 未生成内部阶段 Skill；按原始 Skill 协议执行。'
      : stagePlans
          .map(
            (stage, index) =>
              `${index + 1}. ${skillLoadInstruction(stage.name)}（${stage.label ?? stage.phase ?? stage.sourceSkill} 阶段，来源 Skill: \`${stage.sourceSkill}\`。）`,
          )
          .join('\n');
  const expansion = plan.skillMaker?.templateExpansion;
  const delta = [
    `- Retained: ${(expansion?.retained ?? []).join(', ') || 'none'}`,
    `- Additions: ${(expansion?.additions ?? []).join(', ') || 'none'}`,
    `- Replacements: ${(expansion?.replacements ?? []).join(', ') || 'none'}`,
    `- Disabled: ${(expansion?.disabled ?? []).join(', ') || 'none'}`,
  ].join('\n');
  const overlay = `## Generated Variant Routing

本 Skill 由 Skill Factory 基于原始 \`${baseSource.name}\` Skill 生成。生成路由是本 Skill 的唯一执行权威；下面保留并改写原始 Skill 正文作为阶段行为参考。当原文的旧路由、子 Skill 名称或阶段顺序与本节冲突时，以本节的生成映射为准。

### Stage Mapping

${mappings}

### Template Delta

${delta}`;
  const rewrittenBaseBody = rewriteSourceSkillReferences(baseBody, stagePlans, plan);
  const body = insertSectionIntoSkillBody(
    rewrittenBaseBody,
    plan.name,
    `${workflowProtocolSection(workflow)}\n\n${overlay}`,
  );

  return `---
name: ${plan.name}
description: ${generatedEntryDescription(plan)}
---

${body}

## Generated Stage Skills

${stageSkillSection}

## Generated Preference Deviations

${deviations}

## Generated Source Evidence

${evidence}

完整结构化证据位于 \`reference/resolved-skills.json\`。

## Generated Stop Points

${stopPoints}

## Generated Internal Skill Usage

${internalUsage}
`;
}

function skillDefinition(plan: FactorySkillPackagePlan): Record<string, unknown> {
  const stagePlans = buildStagePlans(plan);
  const steps = plan.callChain.map((item, index) => ({
    id: stepId(index, stageSkillFor(stagePlans, item, index)),
    action: { type: 'invoke_skill', ref: stageSkillFor(stagePlans, item, index) },
    ...(index + 1 < plan.callChain.length
      ? { next: stepId(index + 1, stageSkillFor(stagePlans, plan.callChain[index + 1], index + 1)) }
      : {}),
  }));

  return {
    apiVersion: 'comet/v1alpha1',
    kind: 'Skill',
    metadata: {
      name: plan.name,
      version: plan.version,
      description: generatedEntryDescription(plan),
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
    skills: plan.callChain.map((item, index) => ({
      id: stageSkillFor(stagePlans, item, index),
    })),
    agents: [],
    tools: [],
  };
}

function guardrails(plan: FactorySkillPackagePlan): Record<string, unknown> {
  const stagePlans = buildStagePlans(plan);
  return {
    allowedSkills: plan.callChain.map((item, index) => stageSkillFor(stagePlans, item, index)),
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
  const workflow = compileWorkflowSpec(plan);
  return {
    apiVersion: 'comet.eval/v1alpha1',
    kind: 'SkillEvalManifest',
    metadata: {
      name: plan.name,
      description: generatedEntryDescription(plan),
    },
    skill: {
      name: plan.name,
      source: '..',
      profile: 'authoring-skill',
    },
    evaluation: {
      recommendedTasks: ['authoring-skill-smoke', 'workflow-route-conformance'],
      requiredSkills: plan.callChain.map((item) => item.skill),
      generatedStageSkills: workflow.stages.map((stage) => stage.stageSkill),
      expectedArtifacts: [
        'reference/resolved-skills.json',
        'reference/workflow-protocol.json',
        'reference/decision-points.md',
        'reference/recovery.md',
      ],
      routeConformance: {
        task: 'workflow-route-conformance',
        expectedStageOrder: workflow.stages.map((stage) => stage.stageSkill),
      },
    },
    interaction: {
      mode: 'none',
      maxTurns: 8,
    },
  };
}

function compositionReport(plan: FactorySkillPackagePlan): string {
  const stagePlans = buildStagePlans(plan);
  const deviations =
    plan.deviations.length === 0
      ? 'No preference deviations.'
      : plan.deviations
          .map(
            (item) =>
              `- ${item.skill}: expected ${item.expectedIndex}, actual ${item.actualIndex}. ${item.reason}`,
          )
          .join('\n');
  const preference = `## Project Skill Preference

- Preference mode: ${plan.preference?.mode ?? 'advisory'}
- Preference source: ${plan.preference?.sourcePath ?? 'none'}
- Preference hash: ${plan.preference?.sourceHash ?? 'none'}
- Required Skills: ${(plan.preference?.requiredSkills ?? []).join(', ') || 'none'}

## Preference Deviations

${deviations}
`;
  const skillMaker = plan.skillMaker
    ? `## Skill Maker Summary

- Intent: ${plan.skillMaker.intent}
- Base template: ${plan.skillMaker.baseTemplate ? `${plan.skillMaker.baseTemplate.skill}/${plan.skillMaker.baseTemplate.profile}` : 'none'}
- Retained: ${(plan.skillMaker.templateExpansion?.retained ?? []).join(', ') || 'none'}
- Additions: ${(plan.skillMaker.templateExpansion?.additions ?? []).join(', ') || 'none'}
- Replacements: ${(plan.skillMaker.templateExpansion?.replacements ?? []).join(', ') || 'none'}
- Disabled: ${(plan.skillMaker.templateExpansion?.disabled ?? []).join(', ') || 'none'}
- Rejected: ${(plan.skillMaker.templateExpansion?.rejected ?? []).join(', ') || 'none'}
`
    : '';
  const stageNames =
    stagePlans.length === 0
      ? 'No generated stage Skills.'
      : stagePlans
          .map(
            (stage) =>
              `- ${stage.name}: ${stage.sourceSkill}; recommended=${stage.recommendedName}; source=${stage.source}`,
          )
          .join('\n');
  const composition = plan.composition;
  if (!composition) {
    return `# Composition Report

${preference}

${skillMaker}

## Stage Skills

${stageNames}

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

${skillMaker}

## Stage Skills

${stageNames}

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

function phaseObjective(stage: FactoryWorkflowStage): string {
  switch (stage.phase) {
    case 'open':
      return '开启 change，明确目标、范围、非目标和初始任务边界。';
    case 'design':
      return '完成深度设计，确认技术方案、风险、测试策略，并完成本阶段所有设计插槽。';
    case 'build':
      return '基于确认后的设计实施变更，保持任务和证据同步。';
    case 'verify':
      return '验证实现与设计和规格一致，处理失败、偏差和收尾选择。';
    case 'archive':
      return '完成归档确认、规格同步和 workflow 收尾。';
    default:
      return `完成 ${stage.label} 阶段目标。`;
  }
}

function phaseDisplayLabel(stage: FactoryWorkflowStage): string {
  switch (stage.phase) {
    case 'open':
      return '开启阶段';
    case 'design':
      return '设计阶段';
    case 'build':
      return '构建阶段';
    case 'verify':
      return '验证阶段';
    case 'archive':
      return '归档阶段';
    default:
      return `${stage.label} 阶段`;
  }
}

function slotEvidencePhrase(slot: FactoryWorkflowSlot): string {
  if (/grill|pressure/u.test(`${slot.sourceSkill} ${slot.step} ${slot.label}`)) {
    return '记录压力测试结论';
  }
  return `记录 ${slot.label} 结论`;
}

function cometPhaseStageSkillMarkdown(
  plan: FactorySkillPackagePlan,
  stage: FactoryStagePlan,
): string {
  const workflowStage = stage.workflowStage;
  const slotLines =
    workflowStage.slots.length === 0
      ? '- 本阶段没有自定义插槽。'
      : workflowStage.slots
          .map(
            (slot) =>
              `- \`${slot.id}\`: ${skillLoadInstruction(slot.stageSkill)}完成后必须${slotEvidencePhrase(slot)}。`,
          )
          .join('\n');
  const exit = workflowStage.exitGate.map((item) => `- ${item}`).join('\n');
  const evidenceSummary =
    workflowStage.slots.length === 0
      ? '阶段目标已完成，没有自定义插槽。'
      : '阶段目标已完成，所有插槽证据已经记录。';
  const nextOutput = workflowStage.nextStage
    ? `NEXT: auto\nSKILL: ${workflowStage.nextStage}`
    : 'NEXT: done';
  return `---
name: ${stage.name}
description: ${generatedStageDescription(plan, stage)}
---

# ${phaseDisplayLabel(workflowStage)}

## 阶段目标

${phaseObjective(workflowStage)}

## 入口检查

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs entry ${stage.name}
\`\`\`

如果入口检查失败，按输出提示恢复状态或补齐上游产物，不要跳过本阶段。

## 执行步骤

1. 按 Comet ${phaseDisplayLabel(workflowStage)} 职责推进当前 change。
2. 遇到用户决策点时暂停并等待明确选择。
3. 完成本阶段所有插槽步骤。
4. 把本阶段真实产物写入证据记录。
5. 运行退出脚本；失败时留在本阶段继续补齐。

## 插槽步骤

${slotLines}

## 证据记录

\`\`\`bash
node ${plan.name}/scripts/workflow-state.mjs record ${stage.name} '{"summary":"${evidenceSummary}"}'
\`\`\`

证据内容应来自本阶段实际产物；如果阶段需要额外校验，可以把结论、路径和用户决策写入同一个 JSON。

## 退出条件

${exit}

## 退出脚本

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs exit ${stage.name} --apply
\`\`\`

脚本通过时会直接输出下一步，例如：

\`\`\`text
ALL CHECKS PASSED
${nextOutput}
\`\`\`

如果脚本输出 \`NEXT: auto\`，立即加载 \`SKILL:\` 指向的阶段 Skill；如果输出 \`NEXT: done\`，汇总证据并结束 workflow。

## 未完成处理

${workflowStage.incompleteBehavior}

## 恢复

恢复时读取 \`${workflowStage.resumeProbe[0]}\`，并使用 \`scripts/workflow-guard.mjs\` 重新检查当前阶段。

## 下一阶段

${workflowStage.nextStage ? `退出条件通过后进入 \`${workflowStage.nextStage}\`。` : '退出条件通过后 workflow 完成。'}
`;
}

function cometSlotStageSkillMarkdown(
  plan: FactorySkillPackagePlan,
  stage: FactoryStagePlan,
): string {
  const slot = stage.workflowSlot!;
  const pressureTest = /grill|pressure/u.test(`${slot.sourceSkill} ${slot.step} ${slot.label}`);
  const objective = pressureTest
    ? '设计压力测试：用高强度追问检查设计目标、边界、风险、反例和验收条件。'
    : `完成 ${slot.label} 插槽目标，并把结论交还给 ${slot.phase} 阶段。`;
  const evidence = slotEvidencePhrase(slot);
  const parentSkill = stage.parentStage?.stageSkill ?? slot.phase;
  return `---
name: ${stage.name}
description: ${generatedStageDescription(plan, stage)}
---

# ${slotDisplayLabel(slot)}

## 阶段目标

${objective}

## 入口检查

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs entry ${stage.name}
\`\`\`

如果入口检查提示父阶段未就绪，先回到父阶段恢复上下文，不要单独推进插槽。

## 执行步骤

1. 读取父阶段交接上下文和当前候选方案。
2. ${skillLoadInstruction(slot.sourceSkill)}
3. 将来源 Skill 的输出转化为本 workflow 可恢复的结论。
4. 如发现设计仍不充分，回到父阶段继续调整，不得进入下一阶段。
5. 记录插槽证据并运行退出脚本。

## 证据记录

\`\`\`bash
node ${plan.name}/scripts/workflow-state.mjs record ${stage.name} '{"summary":"${evidence}","parent":"${parentSkill}"}'
\`\`\`

证据必须来自来源 Skill 的实际产物。不要复制来源 Skill 正文；只记录本插槽结论、风险、反例和下一步建议。

## 退出条件

- ${evidence}。
- 明确列出必须修改的问题，或明确说明可以继续。
- 没有未解决的阻塞问题。

## 退出脚本

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs exit ${stage.name} --apply
\`\`\`

脚本通过时会回到父阶段，例如：

\`\`\`text
ALL CHECKS PASSED
NEXT: auto
SKILL: ${parentSkill}
\`\`\`

## 未完成处理

${slot.incompleteBehavior}

## 恢复

恢复时读取 \`${slot.resumeProbe[0]}\`，检查 \`${slot.id}\` 是否已有证据；没有证据则继续本插槽。

## 下一阶段

本插槽完成后回到 \`${parentSkill}\`，由父阶段统一决定是否进入下一阶段。
`;
}

function workflowKernelStageSkillMarkdown(
  plan: FactorySkillPackagePlan,
  stage: FactoryStagePlan,
): string {
  const workflowStage = stage.workflowStage;
  const exit = workflowStage.exitGate.map((item) => `- ${item}`).join('\n');
  const objective = /grill|pressure/u.test(
    `${workflowStage.sourceSkill} ${workflowStage.step ?? ''} ${workflowStage.label}`,
  )
    ? '设计压力测试：用追问检查方案目标、边界、风险、反例和验收条件，并产出可恢复的阶段证据。'
    : `完成 \`${workflowStage.sourceSkill}\` 在本 workflow 中承担的目标，并产出可恢复、可检查的阶段证据。`;
  const nextOutput = workflowStage.nextStage
    ? `NEXT: auto\nSKILL: ${workflowStage.nextStage}`
    : 'NEXT: done';
  return `---
name: ${stage.name}
description: ${generatedStageDescription(plan, stage)}
---

# ${workflowStage.label}

## 阶段目标

${objective}

## 入口检查

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs entry ${stage.name}
\`\`\`

如果入口检查失败，按脚本输出恢复上游阶段或补齐证据。

## 执行步骤

1. 读取 \`reference/workflow-protocol.json\` 中本阶段的目标、证据和下一阶段。
2. ${skillLoadInstruction(workflowStage.sourceSkill)}
3. 将来源 Skill 的结果整理为阶段证据。
4. 写入本阶段证据。
5. 运行退出脚本检查是否可以推进。

## 证据记录

\`\`\`bash
node ${plan.name}/scripts/workflow-state.mjs record ${stage.name} '{"summary":"${workflowStage.label} 阶段目标已完成"}'
\`\`\`

## 退出条件

${exit}

## 退出脚本

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs exit ${stage.name} --apply
\`\`\`

脚本通过时会直接输出下一步，例如：

\`\`\`text
ALL CHECKS PASSED
${nextOutput}
\`\`\`

如果脚本输出 \`NEXT: auto\`，立即加载 \`SKILL:\` 指向的阶段 Skill；如果输出 \`NEXT: done\`，汇总证据并结束 workflow。

## 未完成处理

${workflowStage.incompleteBehavior}

## 恢复

恢复时读取 \`${workflowStage.resumeProbe[0]}\`。如果本阶段没有完成证据，继续本阶段而不是跳到下一阶段。

## 下一阶段

${workflowStage.nextStage ? `退出条件通过后进入 \`${workflowStage.nextStage}\`。` : '退出条件通过后 workflow 完成。'}
`;
}

function internalStageSkillMarkdown(
  plan: FactorySkillPackagePlan,
  stage: FactoryStagePlan,
  sourceSummaries: ResolvedSkillSourceSummary[],
): string {
  if (compileWorkflowSpec(plan).kind === 'comet-overlay') {
    return stage.kind === 'slot'
      ? cometSlotStageSkillMarkdown(plan, stage)
      : cometPhaseStageSkillMarkdown(plan, stage);
  }
  if (compileWorkflowSpec(plan).kind === 'workflow-kernel') {
    return workflowKernelStageSkillMarkdown(plan, stage);
  }
  const allStagePlans = buildStagePlans(plan);
  const summaries = sourceSummaries.filter((summary) => summary.query === stage.sourceSkill);
  const primary = summaries[0];
  const primarySource = primaryResolvedSource(plan, stage.sourceSkill);
  const sourceBody = primarySource ? sourceSkillBody(primarySource.skillMd) : '';
  const sourceSummary = rewriteSourceSkillReferences(
    primary?.summary || primary?.source.description || '按来源 Skill 的真实说明执行该阶段。',
    allStagePlans,
    plan,
  );
  const stageProtocol = workflowStageProtocolMarkdown(stage.workflowStage);
  const sourceInvocation = isCometBuiltinStage(plan, stage)
    ? `本阶段内联执行已适配的 \`${stage.sourceSkill}\` 来源正文；不要重新加载原始 \`${stage.sourceSkill}\`，避免回到未改写的 Comet 路由。`
    : `${skillLoadInstruction(stage.sourceSkill)}
如果当前平台无法加载来源 Skill，则按下方保留的来源 Skill 正文执行同一阶段。`;
  const evidence =
    summaries.length === 0
      ? '- No resolved source evidence was recorded for this stage.'
      : summaries
          .map(
            (summary) =>
              `- ${summary.source.name}@${summary.source.platform} ${summary.source.hash.slice(0, 12)}: ${rewriteSourceSkillReferences(summary.summary || summary.source.description || 'No summary.', allStagePlans, plan)}`,
          )
          .join('\n');
  const description = generatedStageDescription(plan, stage);
  if (sourceBody.length > 0) {
    const bodySource = rewriteSourceSkillReferences(sourceBody, allStagePlans, plan);
    const adapter = `## Generated Stage Adapter

- Parent workflow: \`${plan.name}\`
- Stage Skill: \`${stage.name}\`
- Source Skill: \`${stage.sourceSkill}\`
- Stage label: ${stage.label ?? stage.phase ?? stage.sourceSkill}
- Outcome: follow the source Skill protocol, then return a concise outcome for the parent workflow before moving to the next stage.

${sourceInvocation}

${stageProtocol}`;
    const body = insertSectionIntoSkillBody(bodySource, stage.label ?? stage.name, adapter);
    return `---
name: ${stage.name}
description: ${description}
---

${body}

## Generated Source Evidence

${evidence}
`;
  }

  return `---
name: ${stage.name}
description: ${description}
---

# ${stage.label ?? stage.name}

Internal stage Skill for \`${plan.name}\`.

## Source Skill

Source Skill: \`${stage.sourceSkill}\`

${sourceInvocation}

## Stage Role

${sourceSummary}

${stageProtocol}

## Execution

1. Treat this as the \`${stage.name}\` stage of \`${plan.name}\`.
2. Follow the source Skill protocol below as the stage-specific behavior.
3. Return a concise outcome for the parent workflow before moving to the next stage.

## Source Evidence

${evidence}
`;
}

function planScript(plan: FactorySkillPackagePlan): string {
  const stagePlans = buildStagePlans(plan);
  const workflow = compileWorkflowSpec(plan);
  const planSourcePath = plan.engineMode === 'none' ? ['SKILL.md'] : ['comet', 'skill.yaml'];
  const planSteps = plan.callChain.map((item, index) =>
    stepId(index, stageSkillFor(stagePlans, item, index)),
  );
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'status';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const workflowStatePath = path.join(runRoot, ${workflow.recovery.statePath
    .split('/')
    .map((item) => `'${item}'`)
    .join(', ')});
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
  try {
    return await readJson(workflowStatePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return readJson(statePath);
    }
    throw error;
  }
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
    const state = {
      schemaVersion: 1,
      status: 'running',
      currentStep: planSteps[0] ?? null,
      completedSteps: [],
      outcomes: {},
      planHash: await currentPlanHash(),
    };
    await writeJson(workflowStatePath, state);
    await writeJson(statePath, state);
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
    await writeJson(workflowStatePath, state);
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
  const stagePlans = buildStagePlans(plan);
  const required = [
    'SKILL.md',
    ...stagePlans.map((stage) => `../${stage.name}/SKILL.md`),
    ...(plan.engineMode === 'none'
      ? []
      : ['comet/skill.yaml', 'comet/guardrails.yaml', 'comet/checks.yaml', 'comet/eval.yaml']),
    'reference/resolved-skills.json',
    'reference/workflow-protocol.json',
    'reference/decision-points.md',
    'reference/recovery.md',
    'reference/composition-report.md',
    'scripts/comet-plan.mjs',
    'scripts/comet-check.mjs',
    'scripts/comet-hook-guard.mjs',
    'scripts/workflow-state.mjs',
    'scripts/workflow-guard.mjs',
    'scripts/workflow-handoff.mjs',
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

function workflowStateScript(plan: FactorySkillPackagePlan): string {
  const workflow = compileWorkflowSpec(plan);
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'status';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');
const statePath = path.join(runRoot, ${workflow.recovery.statePath
    .split('/')
    .map((item) => `'${item}'`)
    .join(', ')});
const compatibilityStatePath = path.join(runRoot, '.comet', 'runs', 'state.json');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

function flattenRoute(protocol) {
  const route = [];
  for (const stage of protocol.stages ?? []) {
    route.push({
      kind: 'stage',
      id: stage.id,
      stageSkill: stage.stageSkill,
      parentStage: null,
    });
    for (const slot of stage.slots ?? []) {
      route.push({
        kind: 'slot',
        id: slot.id,
        stageSkill: slot.stageSkill,
        parentStage: stage.stageSkill,
      });
    }
  }
  return route;
}

function completedSet(state) {
  return new Set(Array.isArray(state.completedStages) ? state.completedStages : []);
}

function nextItem(protocol, state) {
  const completed = completedSet(state);
  return flattenRoute(protocol).find((item) => !completed.has(item.stageSkill)) ?? null;
}

function printNext(next) {
  if (!next) {
    console.log('NEXT: done');
    return;
  }
  console.log('NEXT: auto');
  console.log('SKILL: ' + next.stageSkill);
}

function parseEvidence(raw) {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return { value: parsed };
  } catch {
    return { summary: raw };
  }
}

async function readState() {
  try {
    return await readJson(statePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('缺少 workflow 状态，请先运行 workflow-state.mjs init。');
    }
    throw error;
  }
}

async function writeState(state) {
  await writeJson(statePath, state);
  await writeJson(compatibilityStatePath, state);
}

async function initialState() {
  const protocol = await readJson(protocolPath);
  const current = nextItem(protocol, { completedStages: [] });
  return {
    schemaVersion: 1,
    workflow: protocol.name,
    status: 'running',
    currentStage: current?.stageSkill ?? null,
    completedStages: [],
    evidence: {},
    history: [],
  };
}

async function main() {
  const protocol = await readJson(protocolPath);
  if (command === 'init') {
    const state = await initialState();
    await writeState(state);
    return;
  }
  if (command === 'status') {
    try {
      console.log(JSON.stringify(await readJson(statePath), null, 2));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        console.log(JSON.stringify({ status: 'not-started' }, null, 2));
        return;
      }
      throw error;
    }
    return;
  }
  if (command === 'next') {
    const state = await readState();
    printNext(nextItem(protocol, state));
    return;
  }
  if (command === 'record') {
    const stageSkill = process.argv[3];
    if (!stageSkill) throw new Error('record requires a stage Skill name.');
    const target = flattenRoute(protocol).find(
      (item) => item.stageSkill === stageSkill || item.id === stageSkill,
    );
    if (!target) throw new Error('Unknown workflow stage: ' + stageSkill);
    const rawEvidence = process.argv.slice(4).join(' ');
    const state = await readState();
    state.evidence = state.evidence && typeof state.evidence === 'object' ? state.evidence : {};
    state.history = Array.isArray(state.history) ? state.history : [];
    state.evidence[target.stageSkill] = {
      ...parseEvidence(rawEvidence),
      recordedAt: new Date().toISOString(),
    };
    state.history.push({
      event: 'evidence-recorded',
      stageSkill: target.stageSkill,
      at: new Date().toISOString(),
    });
    if (!state.currentStage) {
      state.currentStage = nextItem(protocol, state)?.stageSkill ?? null;
    }
    await writeState(state);
    console.log('EVIDENCE: ' + target.stageSkill);
    printNext(nextItem(protocol, state));
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

function workflowGuardScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'verify';
const stageId = process.argv[3] ?? null;
const apply = process.argv.includes('--apply');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');

function slashPath(root, value) {
  return path.join(root, ...String(value).split('/').filter(Boolean));
}

function flattenRoute(protocol) {
  const route = [];
  for (const stage of protocol.stages ?? []) {
    route.push({
      kind: 'stage',
      id: stage.id,
      stageSkill: stage.stageSkill,
      parentStage: null,
      slots: stage.slots ?? [],
    });
    for (const slot of stage.slots ?? []) {
      route.push({
        kind: 'slot',
        id: slot.id,
        stageSkill: slot.stageSkill,
        parentStage: stage.stageSkill,
        slots: [],
      });
    }
  }
  return route;
}

function completedSet(state) {
  return new Set(Array.isArray(state.completedStages) ? state.completedStages : []);
}

function nextItem(protocol, state) {
  const completed = completedSet(state);
  return flattenRoute(protocol).find((item) => !completed.has(item.stageSkill)) ?? null;
}

function printNext(next) {
  if (!next) {
    console.log('NEXT: done');
    return;
  }
  console.log('NEXT: auto');
  console.log('SKILL: ' + next.stageSkill);
}

function findNode(protocol, id) {
  return flattenRoute(protocol).find((item) => item.stageSkill === id || item.id === id) ?? null;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

async function readState(protocol) {
  const primary = slashPath(runRoot, protocol.recovery.statePath);
  const compatibility = slashPath(runRoot, protocol.recovery.compatibilityStatePath);
  try {
    return { path: primary, compatibilityPath: compatibility, state: await readJson(primary) };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      try {
        return {
          path: primary,
          compatibilityPath: compatibility,
          state: await readJson(compatibility),
        };
      } catch {
        throw new Error('缺少 workflow 状态，请先运行 workflow-state.mjs init。');
      }
    }
    throw error;
  }
}

async function writeState(paths, state) {
  await writeJson(paths.path, state);
  await writeJson(paths.compatibilityPath, state);
}

function hasEvidence(state, stageSkill) {
  return Boolean(state.evidence && typeof state.evidence === 'object' && state.evidence[stageSkill]);
}

function missingEvidence(node, state) {
  const missing = [];
  if (!hasEvidence(state, node.stageSkill)) missing.push(node.stageSkill);
  if (node.kind === 'stage') {
    for (const slot of node.slots) {
      if (!hasEvidence(state, slot.stageSkill)) missing.push(slot.stageSkill);
    }
  }
  return missing;
}

async function main() {
  const protocol = await readJson(protocolPath);
  if (command !== 'entry' && command !== 'exit' && command !== 'verify') {
    throw new Error('Unknown command: ' + command);
  }
  if (command === 'verify') {
    if (!Array.isArray(protocol.stages)) throw new Error('Invalid workflow protocol: stages missing.');
    console.log('workflow-guard-ok');
    return;
  }
  if (!stageId) throw new Error(command + ' requires a stage Skill name.');
  const node = findNode(protocol, stageId);
  if (!node) throw new Error('Unknown workflow stage: ' + stageId);
  const paths = await readState(protocol);
  const state = paths.state;
  state.completedStages = Array.isArray(state.completedStages) ? state.completedStages : [];
  state.evidence = state.evidence && typeof state.evidence === 'object' ? state.evidence : {};
  state.history = Array.isArray(state.history) ? state.history : [];

  if (command === 'entry') {
    const current = state.currentStage ?? nextItem(protocol, state)?.stageSkill ?? null;
    const allowed =
      state.completedStages.includes(node.stageSkill) ||
      current === node.stageSkill ||
      (node.kind === 'slot' && current === node.parentStage);
    if (!allowed) {
      console.error(
        'BLOCKED: 当前断点是 ' +
          String(current) +
          '，不能直接进入 ' +
          node.stageSkill +
          '。请先完成前置阶段。',
      );
      process.exit(1);
    }
    console.log('ENTRY OK: ' + node.stageSkill);
    return;
  }

  const missing = missingEvidence(node, state);
  if (missing.length > 0) {
    console.error('BLOCKED: 缺少阶段证据: ' + missing.join(', '));
    console.error(
      '先运行: node ' +
        path.relative(runRoot, path.join(packageRoot, 'scripts', 'workflow-state.mjs')) +
        ' record <stage-skill> ' +
        '\\'{"summary":"已完成的真实产物"}\\'',
    );
    process.exit(1);
  }

  if (apply) {
    const completed = completedSet(state);
    completed.add(node.stageSkill);
    if (node.kind === 'stage') {
      for (const slot of node.slots) completed.add(slot.stageSkill);
    }
    state.completedStages = flattenRoute(protocol)
      .filter((item) => completed.has(item.stageSkill))
      .map((item) => item.stageSkill);
    state.history.push({
      event: 'exit-applied',
      stageSkill: node.stageSkill,
      at: new Date().toISOString(),
    });
    const next = nextItem(protocol, state);
    state.currentStage = next?.stageSkill ?? null;
    state.status = next ? 'running' : 'completed';
    await writeState(paths, state);
    console.log('ALL CHECKS PASSED');
    printNext(next);
    return;
  }

  console.log('ALL CHECKS PASSED');
  console.log('APPLY: rerun with --apply to update workflow state');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function workflowHandoffScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');

async function main() {
  const protocol = JSON.parse(await fs.readFile(protocolPath, 'utf8'));
  const summary = {
    workflow: protocol.name,
    stages: protocol.stages.map((stage) => ({
      stageSkill: stage.stageSkill,
      nextStage: stage.nextStage,
      evidence: stage.evidence,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
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
  const skillsRoot = path.dirname(packageRoot);
  const cometRoot = path.join(packageRoot, 'comet');
  const referenceRoot = path.join(packageRoot, 'reference');
  const scriptsRoot = path.join(packageRoot, 'scripts');
  const sourceSummaries = buildSourceSummaries(plan);
  const stagePlans = buildStagePlans(plan);
  const workflow = compileWorkflowSpec(plan);
  const compositionReportPath = path.join(referenceRoot, 'composition-report.md');
  const cometRuntimeScripts: string[] = [];
  const scriptPaths = [
    path.join(scriptsRoot, 'comet-plan.mjs'),
    path.join(scriptsRoot, 'comet-check.mjs'),
    path.join(scriptsRoot, 'comet-hook-guard.mjs'),
    path.join(scriptsRoot, 'workflow-state.mjs'),
    path.join(scriptsRoot, 'workflow-guard.mjs'),
    path.join(scriptsRoot, 'workflow-handoff.mjs'),
  ];

  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'SKILL.md'), skillMarkdown(plan), 'utf8');
  for (const stage of stagePlans) {
    const stageRoot = path.join(skillsRoot, stage.name);
    await fs.mkdir(stageRoot, { recursive: true });
    await fs.writeFile(
      path.join(stageRoot, 'SKILL.md'),
      internalStageSkillMarkdown(plan, stage, sourceSummaries),
      'utf8',
    );
  }
  await fs.mkdir(referenceRoot, { recursive: true });
  await fs.writeFile(
    path.join(referenceRoot, 'resolved-skills.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        resolvedSkills: plan.resolvedSkills ?? [],
        sourceSummaries,
        stageNames: stagePlans,
        preference: plan.preference ?? null,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(referenceRoot, 'workflow-protocol.json'),
    JSON.stringify(workflow, null, 2) + '\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(referenceRoot, 'decision-points.md'),
    workflowDecisionPointsMarkdown(workflow),
    'utf8',
  );
  await fs.writeFile(
    path.join(referenceRoot, 'recovery.md'),
    workflowRecoveryMarkdown(workflow),
    'utf8',
  );
  await fs.writeFile(compositionReportPath, compositionReport(plan), 'utf8');
  await fs.mkdir(scriptsRoot, { recursive: true });
  await fs.writeFile(scriptPaths[0]!, planScript(plan), 'utf8');
  await fs.writeFile(scriptPaths[1]!, checkScript(plan), 'utf8');
  await fs.writeFile(scriptPaths[2]!, hookGuardScript(plan), 'utf8');
  await fs.writeFile(scriptPaths[3]!, workflowStateScript(plan), 'utf8');
  await fs.writeFile(scriptPaths[4]!, workflowGuardScript(), 'utf8');
  await fs.writeFile(scriptPaths[5]!, workflowHandoffScript(), 'utf8');

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
    internalSkills: stagePlans.map((stage) => stage.name),
    enginePath: plan.engineMode === 'none' ? null : cometRoot,
    evalManifestPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'eval.yaml'),
    controlPlane: {
      checksPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'checks.yaml'),
      evalManifestPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'eval.yaml'),
      compositionReportPath,
      scripts: [
        ...scriptPaths,
        ...cometRuntimeScripts.map((script) => path.join(packageRoot, script)),
      ],
    },
  };
}
