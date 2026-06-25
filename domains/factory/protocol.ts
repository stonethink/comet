import type { FactorySkillPackagePlan, FactoryStageName } from './types.js';

export type FactoryWorkflowKind = 'comet-overlay' | 'workflow-kernel';
export type FactoryWorkflowMode = 'customize-comet' | 'new-skill' | 'upgrade-existing' | 'generic';

export interface FactoryWorkflowDecision {
  id: string;
  label: string;
  options: string[];
}

export interface FactoryWorkflowArtifact {
  path: string;
  purpose: string;
}

export interface FactoryWorkflowRecovery {
  statePath: string;
  compatibilityStatePath: string;
  resumeOrder: string[];
}

export interface FactoryWorkflowEval {
  id: string;
  expectedStageOrder: string[];
}

export interface FactoryWorkflowSlot {
  id: string;
  label: string;
  phase: string;
  step: string;
  sourceSkill: string;
  stageSkill: string;
  recommendedName: string;
  nameSource: 'recommended' | 'custom';
  entryGate: string[];
  exitGate: string[];
  incompleteBehavior: string;
  resumeProbe: string[];
  evidence: string[];
  pausePoints: FactoryWorkflowDecision[];
}

export interface FactoryWorkflowStage {
  id: string;
  label: string;
  phase: string;
  step?: string;
  sourceSkill: string;
  stageSkill: string;
  recommendedName: string;
  nameSource: 'recommended' | 'custom';
  entryGate: string[];
  exitGate: string[];
  incompleteBehavior: string;
  resumeProbe: string[];
  evidence: string[];
  pausePoints: FactoryWorkflowDecision[];
  nextStage: string | null;
  slots: FactoryWorkflowSlot[];
}

export interface FactoryWorkflowSpec {
  schemaVersion: 1;
  kind: FactoryWorkflowKind;
  name: string;
  goal: string;
  mode: FactoryWorkflowMode;
  stages: FactoryWorkflowStage[];
  decisions: FactoryWorkflowDecision[];
  artifacts: FactoryWorkflowArtifact[];
  recovery: FactoryWorkflowRecovery;
  evals: FactoryWorkflowEval[];
}

const COMET_PHASES = ['open', 'design', 'build', 'verify', 'archive'] as const;
type CometPhase = (typeof COMET_PHASES)[number];

const COMET_PHASE_LABELS: Record<CometPhase, string> = {
  open: '开启',
  design: '设计',
  build: '构建',
  verify: '验证',
  archive: '归档',
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function unique(value: string, used: Set<string>): string {
  if (!used.has(value)) {
    used.add(value);
    return value;
  }
  let index = 2;
  while (used.has(`${value}-${index}`)) {
    index += 1;
  }
  const result = `${value}-${index}`;
  used.add(result);
  return result;
}

function defaultStageName(planName: string, skill: string, used: Set<string>): string {
  return unique(`${planName}-${slug(skill) || 'stage'}`, used);
}

function defaultCometPhaseName(planName: string, phase: CometPhase, used: Set<string>): string {
  return unique(`${planName}-${phase}`, used);
}

function defaultStageId(skill: string, used: Set<string>): string {
  return unique(slug(skill) || 'stage', used);
}

function workflowMode(plan: FactorySkillPackagePlan): FactoryWorkflowMode {
  return plan.skillMaker?.intent ?? 'generic';
}

function stageNameQueues(
  stageNames: FactoryStageName[] | undefined,
): Map<string, FactoryStageName[]> {
  const queues = new Map<string, FactoryStageName[]>();
  for (const stage of stageNames ?? []) {
    const entries = queues.get(stage.skill) ?? [];
    entries.push(stage);
    queues.set(stage.skill, entries);
  }
  return queues;
}

function pickStageName(
  plan: FactorySkillPackagePlan,
  index: number,
  skill: string,
  queues: Map<string, FactoryStageName[]>,
  usedNames: Set<string>,
): FactoryStageName {
  const aligned = plan.stageNames?.[index];
  if (aligned?.skill === skill) {
    const queue = queues.get(skill);
    if (queue) {
      const queuedIndex = queue.indexOf(aligned);
      if (queuedIndex >= 0) queue.splice(queuedIndex, 1);
    }
    return aligned;
  }
  const stage = queues.get(skill)?.shift() ?? null;
  if (stage) return stage;

  const name = defaultStageName(plan.name, skill, usedNames);
  return {
    skill,
    name,
    recommendedName: name,
    source: 'recommended',
    phase: 'workflow',
    step: slug(skill) || `stage-${index + 1}`,
    label: skill,
  };
}

function stageDecision(stageSkill: string): FactoryWorkflowDecision {
  return {
    id: `${stageSkill}-review`,
    label: '阶段结果确认',
    options: ['继续下一阶段', '调整当前阶段后重试', '暂停并保留断点'],
  };
}

function stageEvidence(stageSkill: string, nextStage: string | null): string[] {
  return [
    `${stageSkill} 阶段结果摘要`,
    `${stageSkill} 退出检查结果`,
    nextStage ? `下一阶段 ${nextStage}` : 'workflow 已完成',
  ];
}

function workflowRecovery(
  plan: FactorySkillPackagePlan,
  resumeOrder: string[],
): FactoryWorkflowRecovery {
  return {
    statePath: `.comet/runs/${plan.name}/state.json`,
    compatibilityStatePath: '.comet/runs/state.json',
    resumeOrder,
  };
}

function workflowArtifacts(): FactoryWorkflowArtifact[] {
  return [
    {
      path: 'reference/workflow-protocol.json',
      purpose: '机器可读的 Comet 风格流程契约。',
    },
    {
      path: 'reference/decision-points.md',
      purpose: '面向用户的停顿点选项。',
    },
    {
      path: 'reference/recovery.md',
      purpose: '跨会话恢复协议。',
    },
  ];
}

function workflowEvals(expectedStageOrder: string[]): FactoryWorkflowEval[] {
  return [
    {
      id: 'workflow-route-conformance',
      expectedStageOrder,
    },
  ];
}

function isCometPhaseSkill(skill: string): boolean {
  return /^comet-(open|design|build|verify|archive)$/u.test(skill);
}

function slotStep(stage: FactoryStageName, skill: string): string {
  if (
    !stage.step &&
    stage.phase === 'design' &&
    /grill|pressure/u.test(`${skill} ${stage.label ?? ''}`)
  ) {
    return 'after-brainstorming';
  }
  return slug(stage.step ?? stage.label ?? skill) || slug(skill) || 'slot';
}

function localizedSlotLabel(skill: string, label: string | undefined): string {
  const value = `${skill} ${label ?? ''}`;
  if (/grill|pressure/u.test(value)) return '设计压力测试';
  if (/writing-plans|build plan|plan/u.test(value)) return '构建计划';
  if (/requesting-code-review|code-review|build review|review/u.test(value)) {
    return '构建代码审查';
  }
  return label ?? skill;
}

function compileCometOverlay(plan: FactorySkillPackagePlan): FactoryWorkflowSpec {
  const usedNames = new Set<string>(plan.stageNames?.map((stage) => stage.name) ?? []);
  const stageBySkill = new Map((plan.stageNames ?? []).map((stage) => [stage.skill, stage]));
  const slotsByPhase = new Map<CometPhase, FactoryWorkflowSlot[]>();

  for (const stage of plan.stageNames ?? []) {
    if (isCometPhaseSkill(stage.skill)) continue;
    const phase = (
      stage.phase && (COMET_PHASES as readonly string[]).includes(stage.phase)
        ? stage.phase
        : 'design'
    ) as CometPhase;
    const step = slotStep(stage, stage.skill);
    const slotId = `${phase}.${step}`;
    const label = localizedSlotLabel(stage.skill, stage.label);
    const slot: FactoryWorkflowSlot = {
      id: slotId,
      label,
      phase,
      step,
      sourceSkill: stage.skill,
      stageSkill: stage.name,
      recommendedName: stage.recommendedName,
      nameSource: stage.source,
      entryGate: [`父阶段 ${phase} 正在执行。`, `插槽 ${slotId} 尚未记录完成证据。`],
      exitGate: [`${label}插槽目标已完成。`, `${stage.name} 的必要证据已经记录。`],
      incompleteBehavior: '如果插槽目标尚未完成，留在父阶段继续补齐插槽工作，不得进入下一阶段。',
      resumeProbe: [`.comet/runs/${plan.name}/state.json`, `${slotId} 已有证据`],
      evidence: [`${stage.name} 结果摘要`, `${stage.name} 插槽证据`],
      pausePoints: [stageDecision(stage.name)],
    };
    const slots = slotsByPhase.get(phase) ?? [];
    slots.push(slot);
    slotsByPhase.set(phase, slots);
  }

  const stages: FactoryWorkflowStage[] = COMET_PHASES.map((phase, index) => {
    const sourceSkill = `comet-${phase}`;
    const override = stageBySkill.get(sourceSkill);
    const name = override?.name ?? defaultCometPhaseName(plan.name, phase, usedNames);
    const nextPhase = COMET_PHASES[index + 1] ?? null;
    const nextStage = nextPhase
      ? (stageBySkill.get(`comet-${nextPhase}`)?.name ?? `${plan.name}-${nextPhase}`)
      : null;
    const slots = slotsByPhase.get(phase) ?? [];
    return {
      id: phase,
      label: override?.label ?? COMET_PHASE_LABELS[phase],
      phase,
      step: override?.step ?? phase,
      sourceSkill,
      stageSkill: name,
      recommendedName: override?.recommendedName ?? name,
      nameSource: override?.source ?? 'recommended',
      entryGate: [
        `Comet 当前阶段是 ${phase}，或可以恢复到 ${phase}。`,
        `${phase} 阶段所需输入已经存在。`,
      ],
      exitGate: [
        `${COMET_PHASE_LABELS[phase]}阶段目标已完成。`,
        ...slots.map((slot) => `插槽 ${slot.id} 已记录完成证据。`),
        '没有未解决的用户阻塞决策。',
      ],
      incompleteBehavior: '如果阶段目标或插槽证据缺失，留在当前阶段继续补齐，不得进入下一阶段。',
      resumeProbe: [
        `.comet/runs/${plan.name}/state.json`,
        `当前阶段 ${phase}`,
        `已完成阶段包含 ${name}`,
      ],
      evidence: stageEvidence(name, nextStage),
      pausePoints: [stageDecision(name)],
      nextStage,
      slots,
    };
  });

  const expectedStageOrder = stages.flatMap((stage) => [
    stage.stageSkill,
    ...stage.slots.map((slot) => slot.stageSkill),
  ]);

  return {
    schemaVersion: 1,
    kind: 'comet-overlay',
    name: plan.name,
    goal: plan.goal,
    mode: workflowMode(plan),
    stages,
    decisions: [
      {
        id: `${plan.name}-stage-review`,
        label: '阶段停顿点',
        options: ['确认继续', '需要调整', '暂停恢复'],
      },
    ],
    artifacts: workflowArtifacts(),
    recovery: workflowRecovery(plan, expectedStageOrder),
    evals: workflowEvals(expectedStageOrder),
  };
}

function compileWorkflowKernel(plan: FactorySkillPackagePlan): FactoryWorkflowSpec {
  const nameUsed = new Set<string>(plan.stageNames?.map((stage) => stage.name) ?? []);
  const idUsed = new Set<string>();
  const queues = stageNameQueues(plan.stageNames);
  const stageSeeds = plan.callChain.map((item, index) => {
    const stage = pickStageName(plan, index, item.skill, queues, nameUsed);
    const id = defaultStageId(stage.step ?? stage.name ?? item.skill, idUsed);
    return {
      id,
      label: stage.label ?? stage.phase ?? item.skill,
      phase: stage.phase ?? 'workflow',
      ...(stage.step ? { step: stage.step } : {}),
      sourceSkill: item.skill,
      stageSkill: stage.name,
      recommendedName: stage.recommendedName,
      nameSource: stage.source,
    };
  });

  const stages: FactoryWorkflowStage[] = stageSeeds.map((stage, index) => {
    const nextStage = stageSeeds[index + 1]?.stageSkill ?? null;
    return {
      ...stage,
      entryGate: [
        `workflow 状态允许进入 ${stage.stageSkill}，或可以恢复到该阶段。`,
        `来源 Skill ${stage.sourceSkill} 可用，或已有可审计的来源证据。`,
      ],
      exitGate: [
        `${stage.label} 阶段目标已完成。`,
        `${stage.stageSkill} 的必要证据已经记录。`,
        '没有未解决的用户阻塞决策。',
      ],
      incompleteBehavior:
        '如果任一退出检查未通过，留在当前阶段，报告缺失条件并继续完成阶段目标，不得进入下一阶段。',
      resumeProbe: [
        `.comet/runs/${plan.name}/state.json`,
        '.comet/runs/state.json',
        `completedStages 包含 ${stage.stageSkill}`,
      ],
      evidence: stageEvidence(stage.stageSkill, nextStage),
      pausePoints: [stageDecision(stage.stageSkill)],
      nextStage,
      slots: [],
    };
  });

  const expectedStageOrder = stages.map((stage) => stage.stageSkill);

  return {
    schemaVersion: 1,
    kind: 'workflow-kernel',
    name: plan.name,
    goal: plan.goal,
    mode: workflowMode(plan),
    stages,
    decisions: [
      {
        id: `${plan.name}-stage-review`,
        label: '阶段停顿点',
        options: ['确认继续', '需要调整', '暂停恢复'],
      },
    ],
    artifacts: workflowArtifacts(),
    recovery: workflowRecovery(plan, expectedStageOrder),
    evals: workflowEvals(expectedStageOrder),
  };
}

export function compileWorkflowSpec(plan: FactorySkillPackagePlan): FactoryWorkflowSpec {
  if (plan.skillMaker?.intent === 'customize-comet') {
    return compileCometOverlay(plan);
  }
  return compileWorkflowKernel(plan);
}
