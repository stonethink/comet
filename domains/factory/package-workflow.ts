import type { FactorySkillPackagePlan } from './types.js';
import { compileWorkflowSpec, type FactoryWorkflowSpec } from './protocol.js';
import type { FactoryResolvedSkillSourceSummary, FactoryStagePlan } from './artifacts.js';

type ResolvedSkillSourceSummary = FactoryResolvedSkillSourceSummary;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function stepId(index: number, skill: string): string {
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

export function buildSourceSummaries(plan: FactorySkillPackagePlan): ResolvedSkillSourceSummary[] {
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

export interface FactoryWorkflowRouteItem {
  kind: 'stage' | 'slot';
  id: string;
  stageSkill: string;
  sourceSkill: string;
  label: string;
  parentStage: string | null;
  nextStage: string | null;
}

export function buildStagePlans(plan: FactorySkillPackagePlan): FactoryStagePlan[] {
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

export function workflowRouteItems(workflow: FactoryWorkflowSpec): FactoryWorkflowRouteItem[] {
  return workflow.stages.flatMap((stage) => {
    const phaseItem: FactoryWorkflowRouteItem = {
      kind: 'stage',
      id: stage.id,
      stageSkill: stage.stageSkill,
      sourceSkill: stage.sourceSkill,
      label: stage.label,
      parentStage: null,
      nextStage: stage.slots[0]?.stageSkill ?? stage.nextStage,
    };
    const slotItems = stage.slots.map((slot, index) => ({
      kind: 'slot' as const,
      id: slot.id,
      stageSkill: slot.stageSkill,
      sourceSkill: slot.sourceSkill,
      label: slot.label,
      parentStage: stage.stageSkill,
      nextStage: stage.slots[index + 1]?.stageSkill ?? stage.nextStage,
    }));
    return [phaseItem, ...slotItems];
  });
}

export function workflowRouteStageSkills(workflow: FactoryWorkflowSpec): string[] {
  return workflowRouteItems(workflow).map((item) => item.stageSkill);
}
