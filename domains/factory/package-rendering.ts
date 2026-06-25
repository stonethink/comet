import type { FactorySkillPackagePlan } from './types.js';
import {
  compileWorkflowSpec,
  type FactoryWorkflowSemanticCheck,
  type FactoryWorkflowSlot,
  type FactoryWorkflowSpec,
  type FactoryWorkflowStage,
} from './protocol.js';
import type { FactoryStagePlan } from './artifacts.js';
import { buildStagePlans } from './package-workflow.js';

function generatedEntryDescription(plan: FactorySkillPackagePlan): string {
  return `Use when running the generated ${plan.name} workflow`;
}

function generatedStageDescription(plan: FactorySkillPackagePlan, stage: FactoryStagePlan): string {
  return `Use when running the generated ${stage.name} stage for ${plan.name}`;
}

function skillLoadInstruction(skill: string): string {
  return `**立即执行：** 必须使用 Skill 工具加载 \`${skill}\` 技能。禁止跳过此步骤。`;
}

function generatedSkillLoadInstruction(skill: string): string {
  return skillLoadInstruction(skill);
}

function sourceSkillLoadInstruction(skill: string): string {
  return skillLoadInstruction(skill);
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
                  `\`${slot.id}\` → ${generatedSkillLoadInstruction(slot.stageSkill)}（来源 Skill: \`${slot.sourceSkill}\`）`,
              )
              .join('\n   - 插槽：')}`;
      return `${index + 1}. ${generatedSkillLoadInstruction(stage.stageSkill)}（${phaseDisplayLabel(stage)}，来源 Skill: \`${stage.sourceSkill}\`。）${next}${slots}`;
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

function skillMarkdown(plan: FactorySkillPackagePlan): string {
  const workflow = compileWorkflowSpec(plan);
  return workflow.kind === 'comet-overlay'
    ? cleanCometOverlayEntryMarkdown(plan, workflow)
    : cleanWorkflowKernelEntryMarkdown(plan, workflow);
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

function cometPhaseContractMarkdown(stage: FactoryWorkflowStage): string {
  const stateAuthority =
    '本组合的 `workflow-state.mjs` 只记录外层阶段断点；原始 Comet change 的事实状态仍以 `.comet.yaml` 和原始阶段脚本检查结果为准。只有原始阶段目标真实通过后，才能记录本组合阶段证据。';
  switch (stage.phase) {
    case 'open':
      return `## Comet 阶段契约

- 保留 \`comet-open\` 的输出语言和需求探索规则，面向用户的澄清、总结和确认使用用户当前语言。
- 先完成 PRD 拆分预检；如果目标明显需要多个 change，停在这里让用户选择是否拆分，不能直接创建单个 change。
- 需求澄清没有完成前不得写入阶段完成证据；必须明确目标、范围、非目标、验收方式和未知风险。
- 创建或继续 change 前读取 \`openspec instructions\`，并让 proposal / design / tasks 与当前需求澄清一致。
- change 名称必须经用户确认；写入 \`.comet.yaml\` 后再记录本组合阶段证据。
- ${stateAuthority}`;
    case 'design':
      return `## Comet 阶段契约

- 保留 \`comet-design\` 的 brainstorming 和深度设计职责；设计未被用户确认前不得推进到构建。
- 设计阶段必须维护 \`handoff_context\` 与 \`handoff_hash\`，让跨设备恢复时能重建当前 change、设计结论、未解决问题和下一步。
- 遵守 \`context_compression\` 选择；需要压缩时先更新 handoff，再继续执行后续步骤。
- \`brainstorm-summary\` 必须来自真实的设计讨论或等价设计产物，不能用空摘要冒充通过。
- delta spec 与 Design Doc 需要跟最终方案一致；如果插槽提出修改意见，先回到本阶段更新设计产物。
- ${stateAuthority}`;
    case 'build':
      return `## Comet 阶段契约

- 保留 \`comet-build\` 的计划确认和构建停顿点；\`build_pause: plan-ready\` 没有解决前不得开始实现。
- 构建前必须确认 \`isolation\`、\`build_mode\`、\`tdd_mode\`、\`subagent_dispatch\` 和必要时的 \`direct_override\`，并把选择同步到 \`.comet.yaml\`。
- 当 \`tdd_mode\` 要求测试先行时，先写能失败的测试，再实现；不能用事后测试替代。
- 如果实现、测试或运行中出现异常，必须使用 Skill 工具加载 \`systematic-debugging\` 技能，定位根因后再改代码。
- 每个实现段前后检查 \`dirty-worktree\` 风险；不要覆盖用户未提交或不属于本阶段的改动。
- 只有原始构建阶段的计划、实现、任务勾选和必要检查完成后，才能记录本组合阶段证据。
- ${stateAuthority}`;
    case 'verify':
      return `## Comet 阶段契约

- 保留 \`comet-verify\` 的验证协议；先检查 \`dirty-worktree\`，再根据 \`verify_mode\` 选择验证强度。
- 声称完成前必须使用 Skill 工具加载 \`verification-before-completion\` 技能，并用实际命令输出支撑结论。
- 必须运行或等价执行 \`openspec-verify-change\` 的语义检查，确认实现、任务、delta spec 和设计结论一致。
- 根据分支状态使用 \`finishing-a-development-branch\` 处理合并、PR、保留分支或后续交付选择。
- 验证失败时留在本阶段，记录失败原因、修复动作和复验结果；不能因为外层 workflow 需要推进而跳过失败。
- ${stateAuthority}`;
    case 'archive':
      return `## Comet 阶段契约

- 保留 \`comet-archive\` 的最终用户确认；验证未通过或用户未确认前不得归档。
- 如果归档检查发现实现或规格需要返工，执行 \`archive-reopen\` 语义，回到对应阶段继续修复。
- 同步 delta spec 时必须按 OpenSpec 的 \`ADDED/MODIFIED/REMOVED/RENAMED\` 语义合并主 spec，避免把临时说明当成最终规格。
- 归档产物需要写入 \`archived-with\` 等可追踪元数据，让恢复和审计知道本次是由哪个生成 workflow 完成。
- 归档完成后再把本组合 workflow 标记为完成；如果 archive 脚本或规格同步失败，继续留在归档阶段。
- ${stateAuthority}`;
    default:
      return `## Comet 阶段契约

- ${stateAuthority}`;
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

function semanticChecksMarkdown(checks: FactoryWorkflowSemanticCheck[]): string {
  if (checks.length === 0) return '- 无额外语义检查。';
  return checks
    .map((check) => {
      if (check.kind === 'evidence-field') {
        return `- \`${check.id}\`: ${check.label}证据字段 \`${check.field}\` 必须存在。`;
      }
      if (check.kind === 'completed-check') {
        return `- \`${check.id}\`: 完成来源 Skill 对应语义检查；证据字段 \`${check.field ?? 'completedChecks'}\` 必须包含 \`${check.value ?? check.id}\`。详情见 \`reference/workflow-protocol.json\`。`;
      }
      if (check.expectedPhase) {
        return `- \`${check.id}\`: ${check.label}脚本会读取原始 Comet \`.comet.yaml\`。`;
      }
      return `- \`${check.id}\`: ${check.label}`;
    })
    .join('\n');
}

function evidenceRecordJson(
  checks: FactoryWorkflowSemanticCheck[],
  summary: string,
  extra: Record<string, string> = {},
): string {
  const evidence: Record<string, unknown> = { summary, ...extra };
  if (
    checks.some((check) => check.kind === 'evidence-field' && check.field === 'sourceSkillResult')
  ) {
    evidence.sourceSkillResult = '记录来源 Skill 的真实产物和结论';
  }
  const completedChecks = checks
    .filter((check) => check.kind === 'completed-check')
    .map((check) => check.value ?? check.id);
  if (completedChecks.length > 0) {
    evidence.completedChecks = completedChecks;
  }
  if (checks.some((check) => check.kind === 'comet-state')) {
    evidence.changeName = '<change-name>';
  }
  return JSON.stringify(evidence);
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
              `- \`${slot.id}\`: ${generatedSkillLoadInstruction(slot.stageSkill)}完成后必须${slotEvidencePhrase(slot)}。`,
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
  const sourceInstruction = sourceSkillLoadInstruction(workflowStage.sourceSkill);
  const cometContract = cometPhaseContractMarkdown(workflowStage);
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

1. ${sourceInstruction}
2. 按原始 Comet 阶段 Skill 完成本阶段主体产物、脚本检查和用户阻塞点。
3. 原始 Comet 阶段 Skill 只提供本阶段主体流程；不要采用原始 Comet 阶段的下一阶段跳转、自动衔接或旧路由说明。
4. 回到本组合 workflow，完成下方所有插槽步骤。
5. 把本阶段真实产物写入证据记录。
6. 运行本组合退出脚本；失败时留在本阶段继续补齐。

${cometContract}

## 插槽步骤

${slotLines}

## 证据记录

\`\`\`bash
node ${plan.name}/scripts/workflow-state.mjs record ${stage.name} '${evidenceRecordJson(workflowStage.semanticChecks, evidenceSummary)}'
\`\`\`

证据内容应来自本阶段实际产物；如果阶段需要额外校验，可以把结论、路径和用户决策写入同一个 JSON。

## 语义检查

${semanticChecksMarkdown(workflowStage.semanticChecks)}

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
  const sourceInstruction = sourceSkillLoadInstruction(slot.sourceSkill);
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
2. ${sourceInstruction}
3. 将来源 Skill 的输出转化为本 workflow 可恢复的结论。
4. 如发现设计仍不充分，回到父阶段继续调整，不得进入下一阶段。
5. 记录插槽证据并运行退出脚本。

## 证据记录

\`\`\`bash
node ${plan.name}/scripts/workflow-state.mjs record ${stage.name} '${evidenceRecordJson(slot.semanticChecks, evidence, { parent: parentSkill })}'
\`\`\`

证据必须来自来源 Skill 的实际产物。不要复制来源 Skill 正文；只记录本插槽结论、风险、反例和下一步建议。

## 语义检查

${semanticChecksMarkdown(slot.semanticChecks)}

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
  const sourceInstruction = sourceSkillLoadInstruction(workflowStage.sourceSkill);
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
2. ${sourceInstruction}
3. 执行来源 Skill 的主体方法；如果来源 Skill 自带下一阶段、旧路由或旧命令，以本 workflow 的阶段路线为准。
4. 将来源 Skill 的结果整理为阶段证据。
5. 写入本阶段证据。
6. 运行退出脚本检查是否可以推进。

## 证据记录

\`\`\`bash
node ${plan.name}/scripts/workflow-state.mjs record ${stage.name} '${evidenceRecordJson(workflowStage.semanticChecks, `${workflowStage.label} 阶段目标已完成`)}'
\`\`\`

## 语义检查

${semanticChecksMarkdown(workflowStage.semanticChecks)}

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
): string {
  const workflow = compileWorkflowSpec(plan);
  return workflow.kind === 'comet-overlay'
    ? stage.kind === 'slot'
      ? cometSlotStageSkillMarkdown(plan, stage)
      : cometPhaseStageSkillMarkdown(plan, stage)
    : workflowKernelStageSkillMarkdown(plan, stage);
}

export {
  compositionReport as renderCompositionReport,
  generatedEntryDescription as factoryEntryDescription,
  internalStageSkillMarkdown as renderInternalStageSkillMarkdown,
  skillMarkdown as renderSkillMarkdown,
  workflowDecisionPointsMarkdown as renderWorkflowDecisionPointsMarkdown,
  workflowRecoveryMarkdown as renderWorkflowRecoveryMarkdown,
};
