import type {
  BundleBaseTemplate,
  BundleFactoryCallChainItem,
  BundleFactoryStageNameHint,
  BundleTemplateDelta,
  BundleTemplateExpansion,
} from '../types.js';

type StepType = 'protected' | 'mutable' | 'optional';

interface TemplateStep {
  phase: string;
  step: string;
  skill: string;
  type: StepType;
  recommendedName: string;
  label: string;
}

export interface CometTemplateExpansionInput {
  baseTemplate: BundleBaseTemplate;
  templateDelta: BundleTemplateDelta;
}

export interface CometTemplateExpansionOutput extends BundleTemplateExpansion {
  callChain: BundleFactoryCallChainItem[];
}

const builtInSkillIds = new Set([
  'comet-open',
  'comet-design',
  'writing-plans',
  'comet-build',
  'requesting-code-review',
  'comet-verify',
  'comet-archive',
]);

const fullTemplate: TemplateStep[] = [
  {
    phase: 'open',
    step: 'open',
    skill: 'comet-open',
    type: 'protected',
    recommendedName: 'open',
    label: 'Open',
  },
  {
    phase: 'design',
    step: 'brainstorming',
    skill: 'comet-design',
    type: 'mutable',
    recommendedName: 'design',
    label: 'Design',
  },
  {
    phase: 'build',
    step: 'writing-plans',
    skill: 'writing-plans',
    type: 'mutable',
    recommendedName: 'build-plan',
    label: 'Build plan',
  },
  {
    phase: 'build',
    step: 'build-execution',
    skill: 'comet-build',
    type: 'mutable',
    recommendedName: 'build',
    label: 'Build',
  },
  {
    phase: 'build',
    step: 'build-review',
    skill: 'requesting-code-review',
    type: 'optional',
    recommendedName: 'build-review',
    label: 'Build review',
  },
  {
    phase: 'verify',
    step: 'verify-result-transition',
    skill: 'comet-verify',
    type: 'protected',
    recommendedName: 'verify',
    label: 'Verify',
  },
  {
    phase: 'archive',
    step: 'archive-delta-sync',
    skill: 'comet-archive',
    type: 'protected',
    recommendedName: 'archive',
    label: 'Archive',
  },
];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function insertedRecommendedName(phase: string, skill: string): string {
  const skillSlug = slug(skill).replace(/-me$/u, '');
  return `${phase}-${skillSlug || 'stage'}`;
}

function templateFor(baseTemplate: BundleBaseTemplate): TemplateStep[] {
  if (baseTemplate.profile === 'full') {
    return [...fullTemplate];
  }
  if (baseTemplate.profile === 'hotfix') {
    return fullTemplate.filter((step) => step.phase !== 'design');
  }
  return fullTemplate.filter((step) => !(step.phase === 'design' || step.step === 'writing-plans'));
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
  const insertedHints = new Map<string, BundleFactoryStageNameHint[]>();
  const replacementByKey = new Map<string, string>();

  for (const operation of input.templateDelta.add) {
    const phaseSteps = steps.filter((step) => step.phase === operation.phase);
    const anchor =
      operation.position === 'before' ? phaseSteps[0] : phaseSteps[phaseSteps.length - 1];
    if (!anchor) {
      rejected.push(`${operation.phase}: unknown phase`);
      continue;
    }
    const key = `${anchor.phase}:${anchor.step}`;
    const target = operation.position === 'before' ? before : after;
    target.set(key, [...(target.get(key) ?? []), operation.skill]);
    insertedHints.set(key, [
      ...(insertedHints.get(key) ?? []),
      {
        skill: operation.skill,
        phase: operation.phase,
        step: `${operation.position}-${anchor.step}`,
        recommendedName: insertedRecommendedName(operation.phase, operation.skill),
        label: `${operation.phase} ${operation.position}: ${operation.skill}`,
      },
    ]);
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
    replacements.push(
      `${operation.phase} ${operation.step}: ${target.skill} -> ${operation.skill}`,
    );
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

  const callChainSkills: string[] = [];
  const stageNameHints: BundleFactoryStageNameHint[] = [];
  for (const step of steps) {
    const key = `${step.phase}:${step.step}`;
    callChainSkills.push(...(before.get(key) ?? []));
    if (before.has(key)) {
      stageNameHints.push(...(insertedHints.get(key) ?? []));
    }
    if (!disabledKeys.has(key)) {
      const skill = replacementByKey.get(key) ?? step.skill;
      callChainSkills.push(skill);
      stageNameHints.push({
        skill,
        phase: step.phase,
        step: step.step,
        recommendedName: step.recommendedName,
        label: step.label,
      });
    }
    callChainSkills.push(...(after.get(key) ?? []));
    if (after.has(key)) {
      stageNameHints.push(...(insertedHints.get(key) ?? []));
    }
  }

  return {
    retained: ['open / design / build / verify / archive'],
    additions,
    replacements,
    disabled,
    rejected,
    stageNameHints,
    callChain: [...new Set(callChainSkills)].map((skill) => ({
      skill,
      preferenceIndex: null,
    })),
  };
}

export function isCometSkillMakerBuiltin(skill: string): boolean {
  return builtInSkillIds.has(skill);
}
