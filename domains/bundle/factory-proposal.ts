import { createHash } from 'crypto';
import path from 'path';
import { discoverBundleCandidates } from './candidates.js';
import type { BundleCandidate, BundleCandidateSource } from './candidates.js';
import { composeBundleFactoryPlan } from './factory-compose.js';
import { normalizeBundleFactoryPlan, readBundleFactoryPlan } from './factory-plan.js';
import { readBundleSkillPreferences } from './preferences.js';
import { buildSkillMakerPlanSummary, type SkillMakerPlanSummary } from './user-facing.js';
import { isCometSkillMakerBuiltin } from './templates/comet-skill-maker-template.js';
import { resolveFactoryStageNames } from './factory-stage-names.js';
import type {
  BundleFactoryCallChainItem,
  BundleFactoryComposition,
  BundleFactoryProposalAction,
  BundleFactoryProposalSummary,
  BundleFactoryResolvedSkill,
} from './types.js';

export interface BundleFactoryProposal {
  schemaVersion: 1;
  name: string;
  goal: string;
  preference: {
    mode: 'advisory' | 'strict';
    source: string | null;
    hash: string | null;
    warnings: unknown[];
  };
  callChain: BundleFactoryCallChainItem[];
  resolvedSkills: BundleFactoryResolvedSkill[];
  composition: BundleFactoryComposition;
  blockers: string[];
  warnings: string[];
  canGenerate: boolean;
  userSummary: BundleFactoryProposalSummary;
  skillMakerSummary: SkillMakerPlanSummary;
  actions: BundleFactoryProposalAction[];
  proposalHash: string;
}

function proposalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function generatedControlPlane(): string[] {
  return [
    'SKILL.md',
    'scripts/',
    'rules/',
    'hooks/',
    'reference/',
    'comet/skill.yaml',
    'comet/guardrails.yaml',
    'comet/checks.yaml',
    'comet/eval.yaml',
    'bundle.yaml',
  ];
}

function validationPlan(): string[] {
  return ['quick smoke eval', 'generated Skill manifest eval', 'publish readiness review'];
}

function builtInCandidate(
  projectRoot: string,
  skill: string,
  preferenceIndex: number | null,
): BundleCandidate {
  const source: BundleCandidateSource = {
    name: skill,
    preferenceIndex,
    platform: 'builtin',
    scope: 'builtin',
    origin: 'builtin',
    factory: {
      query: skill,
    },
    root: path.join(projectRoot, '.comet', '__bundle_builtin__', skill),
    description: `Built-in Comet workflow step: ${skill}.`,
    skillMd: `# ${skill}\n`,
    references: [],
    scripts: [],
    hash: `builtin:${skill}`,
  };
  return {
    name: skill,
    preferenceIndex,
    status: 'available',
    sources: [source],
  };
}

function applyBuiltInCandidates(
  projectRoot: string,
  candidates: BundleCandidate[],
): BundleCandidate[] {
  return candidates.map((candidate) => {
    if (!isCometSkillMakerBuiltin(candidate.name) || candidate.status !== 'missing') {
      return candidate;
    }
    return builtInCandidate(projectRoot, candidate.name, candidate.preferenceIndex);
  });
}

export async function buildBundleFactoryProposal(options: {
  projectRoot: string;
  name: string;
  filePath: string;
}): Promise<BundleFactoryProposal> {
  const projectRoot = path.resolve(options.projectRoot);
  const projectPreferences = await readBundleSkillPreferences(projectRoot);
  const plan = normalizeBundleFactoryPlan({
    plan: await readBundleFactoryPlan(path.resolve(options.filePath)),
    projectPreferredSkills: projectPreferences?.names ?? null,
  });
  const candidates = applyBuiltInCandidates(
    projectRoot,
    await discoverBundleCandidates({
      projectRoot,
      preferences: plan.preferredSkills.length > 0 ? plan.preferredSkills : null,
    }),
  );
  const resolvedSkills = candidates.map((candidate) => ({
    query: candidate.name,
    preferenceIndex: candidate.preferenceIndex,
    status: candidate.status,
    sources: candidate.sources,
  }));
  const composed = await composeBundleFactoryPlan({
    entrySkills: plan.callChain.map((item) => item.skill),
    preferredSkills: plan.preferredSkills,
    resolvedSkills,
  });
  const callChain = composed.callChain.length > 0 ? composed.callChain : plan.callChain;
  const stageNames = resolveFactoryStageNames({
    bundleName: options.name,
    callChain,
    hints: plan.templateExpansion?.stageNameHints,
    overrides: plan.stageNameOverrides,
  });

  const blockers = [
    ...resolvedSkills
      .filter((skill) => skill.status === 'missing' || skill.status === 'ambiguous')
      .map((skill) => `[candidate] ${skill.query} (${skill.status})`),
    ...composed.composition.issues.map((issue) => `[composition] ${issue.message}`),
  ];
  const policies = projectPreferences?.preferences.policies;
  if (policies?.scripts === 'deny') blockers.push('[policy] preference policy denies scripts');
  if (policies?.hooks === 'deny') blockers.push('[policy] preference policy denies hooks');

  const userSummary: BundleFactoryProposalSummary = {
    title: `Create ${options.name} as a Comet-native Skill`,
    goal: plan.goal,
    reusedSkills: resolvedSkills.map((skill) => ({
      skill: skill.query,
      status: skill.status,
      sourceCount: skill.sources.length,
      preferenceIndex: skill.preferenceIndex,
      fromProjectPreference: skill.preferenceIndex !== null,
    })),
    generatedControlPlane: generatedControlPlane(),
    validationPlan: validationPlan(),
    requiredConfirmations: [
      {
        id: 'generate-scripts',
        label: 'Allow Comet to generate scripts as part of the control plane',
        required: true,
        reason: 'Scripts let the generated Skill perform deterministic checks and recovery steps.',
      },
      {
        id: 'generate-rules',
        label: 'Allow Comet to generate orchestration rules',
        required: true,
        reason: 'Rules keep the Agent aligned with the generated workflow.',
      },
      {
        id: 'generate-hooks',
        label: 'Allow Comet to generate portable hook descriptors',
        required: true,
        reason:
          'Hooks guard unsafe progression and are compiled per target platform during distribution.',
      },
      {
        id: 'run-eval',
        label: 'Run Eval before publish',
        required: true,
        reason: 'Eval evidence is required before the candidate can become publishable.',
      },
    ],
    preferenceNotes: [
      ...plan.deviations.map((item) => `${item.skill}: ${item.reason}`),
      ...blockers.filter((item) => item.startsWith('[policy]')),
    ],
  };
  const skillMakerSummary = buildSkillMakerPlanSummary({
    intent: plan.skillMakerIntent,
    skillName: options.name,
    goal: plan.goal,
    retained: plan.templateExpansion?.retained ?? [],
    additions: plan.templateExpansion?.additions ?? plan.callChain.map((item) => item.skill),
    replacements: plan.templateExpansion?.replacements ?? [],
    disabled: plan.templateExpansion?.disabled ?? [],
    rejected: [...(plan.templateExpansion?.rejected ?? []), ...blockers],
    stageNames,
    generated: generatedControlPlane(),
    validation: validationPlan(),
    install: ['Install/enable into the current Agent after validation and preview.'],
    advanced: [
      `Preference mode: ${projectPreferences?.preferences.mode ?? 'advisory'}`,
      'Factory proposal hash will be recorded after confirmation.',
    ],
  });
  const canGenerate = blockers.length === 0;
  const actions: BundleFactoryProposalAction[] = [
    ...(canGenerate
      ? [
          {
            id: 'confirm-generate' as const,
            label: 'Confirm and initialize generation',
            command: `comet bundle factory-init ${options.name} --file ${path.resolve(options.filePath)} --confirmed-proposal`,
            writesState: true,
          },
        ]
      : []),
    {
      id: 'revise-proposal',
      label: 'Revise the plan before generating',
      command: 'Ask /comet-any to revise the goal, preferences, or candidate choices',
      writesState: false,
    },
    {
      id: 'cancel',
      label: 'Cancel without writing Bundle state',
      command: 'No command',
      writesState: false,
    },
  ];

  const proposal = {
    schemaVersion: 1 as const,
    name: options.name,
    goal: plan.goal,
    preference: {
      mode: projectPreferences?.preferences.mode ?? 'advisory',
      source: projectPreferences?.path ?? null,
      hash: projectPreferences?.hash ?? null,
      warnings: projectPreferences?.warnings ?? [],
    },
    callChain,
    resolvedSkills,
    composition: composed.composition,
    blockers,
    warnings: plan.deviations.map((item) => `[deviation] ${item.skill}: ${item.reason}`),
    canGenerate,
    userSummary,
    skillMakerSummary,
    actions,
  };
  return { ...proposal, proposalHash: proposalHash(proposal) };
}
