import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import { discoverBundleCandidates } from './candidates.js';
import { createBundleDraft, optimizeBundleDraft } from './draft.js';
import {
  normalizeBundleFactoryPlan,
  readBundleFactoryPlan,
  writeBundleFactoryPlanArtifact,
} from './factory-plan.js';
import { readSkillPreferences } from './preferences.js';
import { reconcileBundleAuthoringState, writeBundleAuthoringState } from './state.js';
import { generateFactorySkillPackage } from '../factory/package.js';
import { hashBundle } from './hash.js';
import { loadBundle } from './load.js';
import type { BundleAuthoringState, BundleFactoryMetadata, BundleManifest } from './types.js';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function entrySkillId(state: BundleAuthoringState): string {
  return slug(state.name);
}

function isMissingStateError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function bundleManifest(state: BundleAuthoringState, skillId: string): BundleManifest {
  return {
    apiVersion: 'comet/v1alpha1',
    kind: 'SkillBundle',
    metadata: {
      name: state.name,
      version: state.base?.version ?? '1.0.0',
      description: state.factory?.goal ?? `Generated Comet Skill Factory bundle for ${state.name}.`,
      defaultLocale: state.defaultLocale,
      locales: [...state.locales],
    },
    skills: [
      {
        id: skillId,
        path: `skills/${skillId}`,
        visibility: 'entry',
      },
    ],
    resources: {
      rules: [],
      hooks: [],
      references: [],
      scripts: [],
      assets: [],
    },
    platforms: {
      requires: ['skills'],
      optional: [],
      overrides: [],
    },
    // Bundle-level engine packaging is a separate legacy channel. Factory output
    // currently embeds Comet-native runtime files inside the generated entry Skill.
    engine: { enabled: false },
  };
}

async function clearDirectory(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(root, entry.name), {
        recursive: true,
        force: true,
      }),
    ),
  );
}

function assertFactoryCandidatesResolved(state: BundleAuthoringState): void {
  const unresolved = state.factory?.resolvedSkills.filter(
    (skill) => skill.status === 'missing' || skill.status === 'ambiguous',
  );
  if (!unresolved || unresolved.length === 0) return;
  throw new Error(
    `Bundle ${state.name} has unresolved factory Skill candidates: ${unresolved
      .map((skill) => `${skill.query} (${skill.status})`)
      .join(', ')}`,
  );
}

export async function generateBundleDraftFromFactoryState(options: {
  projectRoot: string;
  state: BundleAuthoringState;
}): Promise<BundleAuthoringState> {
  const { state } = options;
  if (!state.factory) {
    throw new Error(`Bundle ${state.name} does not have factory metadata`);
  }
  assertFactoryCandidatesResolved(state);

  const skillId = entrySkillId(state);
  await clearDirectory(state.draftPath);
  await fs.writeFile(
    path.join(state.draftPath, 'bundle.yaml'),
    stringify(bundleManifest(state, skillId)),
    'utf8',
  );

  const generated = await generateFactorySkillPackage({
    root: state.draftPath,
    name: skillId,
    version: state.base?.version ?? '1.0.0',
    description: state.factory.goal,
    goal: state.factory.goal,
    defaultLocale: state.defaultLocale,
    callChain: state.factory.callChain,
    resolvedSkills: state.factory.resolvedSkills,
    deviations: state.factory.deviations,
    engineMode: state.factory.engineMode,
  });

  const bundle = await loadBundle(state.draftPath);
  const currentHash = await hashBundle(bundle);
  const updated: BundleAuthoringState = {
    ...state,
    status: 'draft',
    currentHash,
    factory: {
      ...state.factory,
      generatedSkillPackage: {
        entrySkill: skillId,
        internalSkills: [],
        packageRoot: generated.packageRoot,
        enginePath: generated.enginePath,
      },
    },
  };
  delete updated.eval;
  delete updated.review;
  delete updated.ready;
  delete updated.conflict;
  await writeBundleAuthoringState(options.projectRoot, updated);
  return updated;
}

export async function initializeBundleFactoryState(options: {
  projectRoot: string;
  name: string;
  filePath: string;
}): Promise<BundleAuthoringState> {
  const projectRoot = path.resolve(options.projectRoot);
  const plan = normalizeBundleFactoryPlan({
    plan: await readBundleFactoryPlan(path.resolve(options.filePath)),
    projectPreferredSkills: await readSkillPreferences(projectRoot),
  });
  const resolvedSkills = await discoverBundleCandidates({
    projectRoot,
    preferences: plan.preferredSkills.length > 0 ? plan.preferredSkills : null,
  });
  const planArtifact = await writeBundleFactoryPlanArtifact({
    projectRoot,
    name: options.name,
    plan,
  });
  const flattenedCandidates = resolvedSkills.flatMap((candidate) => candidate.sources);
  const factory: BundleFactoryMetadata = {
    goal: plan.goal,
    preferredSkills: plan.preferredSkills,
    resolvedSkills: resolvedSkills.map((candidate) => ({
      query: candidate.name,
      preferenceIndex: candidate.preferenceIndex,
      status: candidate.status,
      sources: candidate.sources,
    })),
    callChain: plan.callChain,
    deviations: structuredClone(plan.deviations),
    engineMode: plan.engineMode,
    runnerMode: plan.runnerMode,
    planPath: planArtifact.planPath,
    planHash: planArtifact.planHash,
  };

  let state: BundleAuthoringState | null = null;
  try {
    state = await reconcileBundleAuthoringState(projectRoot, options.name);
  } catch (error) {
    if (!isMissingStateError(error)) throw error;
  }

  if (!state) {
    const optimizeSourceRoot =
      plan.mode === 'optimize' ? path.resolve(projectRoot, plan.sourceRoot!) : null;
    state =
      plan.mode === 'optimize'
        ? await optimizeBundleDraft({
            projectRoot,
            name: options.name,
            sourceRoot: optimizeSourceRoot!,
            candidates: flattenedCandidates,
            creator: plan.creator,
            defaultLocale: plan.defaultLocale,
            locales: plan.locales,
            engineEnabled: plan.engineEnabled,
            factory,
          })
        : await createBundleDraft({
            projectRoot,
            name: options.name,
            candidates: flattenedCandidates,
            creator: plan.creator,
            defaultLocale: plan.defaultLocale,
            locales: plan.locales,
            engineEnabled: plan.engineEnabled,
            factory,
          });
    return state;
  }

  if (plan.mode && plan.mode !== state.mode) {
    throw new Error(`Bundle ${state.name} already exists in ${state.mode} mode`);
  }

  const updated: BundleAuthoringState = {
    ...state,
    status: 'draft',
    currentHash: null,
    candidates: flattenedCandidates,
    creator: plan.creator,
    defaultLocale: plan.defaultLocale,
    locales: plan.locales,
    engineEnabled: plan.engineEnabled,
    factory,
  };
  delete updated.eval;
  delete updated.review;
  delete updated.ready;
  delete updated.conflict;
  await writeBundleAuthoringState(projectRoot, updated);
  return updated;
}
