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
  { phase: 'open', step: 'open', skill: 'comet-open', type: 'protected' },
  { phase: 'design', step: 'brainstorming', skill: 'comet-design', type: 'mutable' },
  { phase: 'build', step: 'writing-plans', skill: 'writing-plans', type: 'mutable' },
  { phase: 'build', step: 'build-execution', skill: 'comet-build', type: 'mutable' },
  {
    phase: 'build',
    step: 'build-review',
    skill: 'requesting-code-review',
    type: 'optional',
  },
  {
    phase: 'verify',
    step: 'verify-result-transition',
    skill: 'comet-verify',
    type: 'protected',
  },
  { phase: 'archive', step: 'archive-delta-sync', skill: 'comet-archive', type: 'protected' },
];

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
  for (const step of steps) {
    const key = `${step.phase}:${step.step}`;
    callChainSkills.push(...(before.get(key) ?? []));
    if (!disabledKeys.has(key)) {
      callChainSkills.push(replacementByKey.get(key) ?? step.skill);
    }
    callChainSkills.push(...(after.get(key) ?? []));
  }

  return {
    retained: ['open / design / build / verify / archive'],
    additions,
    replacements,
    disabled,
    rejected,
    callChain: [...new Set(callChainSkills)].map((skill) => ({
      skill,
      preferenceIndex: null,
    })),
  };
}

export function isCometSkillMakerBuiltin(skill: string): boolean {
  return builtInSkillIds.has(skill);
}
