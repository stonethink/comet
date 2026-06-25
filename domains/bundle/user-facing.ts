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
  stageNames?: Array<{
    skill: string;
    name: string;
    recommendedName: string;
    source: 'recommended' | 'custom';
    phase?: string;
    label?: string;
  }>;
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

export function buildSkillMakerPlanSummary(
  options: Omit<SkillMakerPlanSummary, 'intentLabel'>,
): SkillMakerPlanSummary {
  return {
    ...options,
    intentLabel: skillMakerIntentLabel(options.intent),
  };
}

function section(title: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`${title}: None`];
  }
  return [`${title}:`, ...values.map((value) => `- ${value}`)];
}

function stageNameSection(summary: SkillMakerPlanSummary): string[] {
  const stageNames = summary.stageNames ?? [];
  if (stageNames.length === 0) {
    return ['Stage names: None'];
  }
  return [
    'Stage names:',
    ...stageNames.map((stage) => {
      const phase = stage.phase ? `; phase: ${stage.phase}` : '';
      const label = stage.label ? `; label: ${stage.label}` : '';
      return `- ${stage.skill}: ${stage.name} (recommended: ${stage.recommendedName}; ${stage.source}${phase}${label})`;
    }),
  ];
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
    ...stageNameSection(summary),
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
