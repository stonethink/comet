import os from 'os';
import { compileBundleIr } from './compiler.js';
import { planBundleEval, validateStableFactoryControlPlane } from './eval.js';
import { hashBundle } from './hash.js';
import { loadBundle } from './load.js';
import { compileBundleForPlatform, type PlatformCompileReport } from './platform.js';
import { reconcileBundleAuthoringState } from './state.js';
import type { BundleAuthoringState, BundleCompilerIr, SkillBundle } from './types.js';
import { listBundlePlatformTargets } from './bundle-platform.js';
import { readProjectSkillPreferences } from '../skill/preferences.js';
import {
  buildReadinessUserSummary,
  type BundleReadinessUserSummary,
} from './readiness-user-summary.js';

export interface BundleReviewReadiness {
  state: 'blocked' | 'reviewable' | 'publishable' | 'published';
  blockers: string[];
  warnings: string[];
  evidence: Record<string, string>;
}

export interface BundleReviewSummary {
  schemaVersion: 1;
  name: string;
  status: BundleAuthoringState['status'];
  hash: string | null;
  draftPath: string;
  factory: BundleAuthoringState['factory'] | null;
  compile: PlatformCompileReport;
  evalPlans: {
    quick: ReturnType<typeof planBundleEval>;
    full: ReturnType<typeof planBundleEval>;
  };
  eval: BundleAuthoringState['eval'] | null;
  review: BundleAuthoringState['review'] | null;
  ready: BundleAuthoringState['ready'] | null;
  readiness: BundleReviewReadiness;
  userSummary: BundleReadinessUserSummary;
}

function buildReadiness(
  state: BundleAuthoringState,
  controlPlane: Awaited<ReturnType<typeof validateStableFactoryControlPlane>>,
  compile?: PlatformCompileReport,
  currentPreferenceHash?: string | null,
): BundleReviewReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const workflowProtocol = state.factory?.workflowProtocol;
  const unresolved =
    state.factory?.resolvedSkills.filter(
      (skill) => skill.status === 'missing' || skill.status === 'ambiguous',
    ) ?? [];
  if (unresolved.length > 0) {
    blockers.push(
      `[candidate] Unresolved Factory candidates: ${unresolved
        .map((skill) => `${skill.query} (${skill.status})`)
        .join(', ')}`,
    );
  }
  const required = new Set(state.factory?.requiredSkills ?? []);
  const unresolvedRequired = unresolved.filter((skill) => required.has(skill.query));
  if (state.factory?.preferenceMode === 'strict' && unresolvedRequired.length > 0) {
    blockers.push(
      `[preference] Required Skill candidates are unresolved: ${unresolvedRequired
        .map((skill) => `${skill.query} (${skill.status})`)
        .join(', ')}`,
    );
  }
  if (state.factory && state.factory.proposalConfirmation?.confirmed !== true) {
    blockers.push('[proposal] Factory proposal confirmation is missing');
  }
  const storedPreferenceHash = state.factory?.preferenceHash ?? null;
  if (storedPreferenceHash && currentPreferenceHash !== storedPreferenceHash) {
    const message = '[preference] Project Skill preferences changed after Factory initialization';
    if (state.factory?.preferenceMode === 'strict') blockers.push(message);
    else warnings.push(message);
  }
  for (const issue of state.factory?.composition?.issues ?? []) {
    blockers.push(`[composition] ${issue.message}`);
  }
  for (const node of workflowProtocol?.nodes ?? []) {
    if (node.kind === 'control' && node.implementation.operation === 'override') {
      blockers.push(`[workflow] ${node.id}: control Node cannot be overridden`);
    }
    if (node.kind === 'producer' && node.implementation.operation === 'override') {
      const missing = node.outputSchemas.filter((schema) => !node.satisfies.includes(schema));
      if (missing.length > 0) {
        blockers.push(
          `[workflow] ${node.id}: producer override missing Output Schema ${missing.join(', ')}`,
        );
      }
    }
  }
  for (const error of controlPlane.errors) {
    blockers.push(`[control-plane] ${error}`);
  }
  if (!state.currentHash) blockers.push('[draft] Current draft hash is missing');
  if (!state.eval || state.eval.hash !== state.currentHash || !state.eval.passed) {
    blockers.push('[benchmark] Benchmark evidence for the current draft hash is missing');
  }
  if (state.eval?.passed && (!state.review || state.review.hash !== state.currentHash)) {
    warnings.push('[review] Review approval for the current draft hash is missing');
  }
  const generatedPackage = state.factory?.generatedSkillPackage;
  const authoringReview = state.factory?.authoringReview;
  if (generatedPackage) {
    const unauthored = generatedPackage.unauthoredSubstanceNodes ?? [];
    if (unauthored.length > 0) {
      blockers.push(
        `[authoring] Substance nodes lack authored content (run skill-core lane): ${unauthored.join(', ')}`,
      );
    }
    if (!authoringReview) {
      warnings.push('[authoring] No LLM authoring review recorded; run the skill-review lane');
    } else if (authoringReview.evidenceSource === 'deterministic-check-only') {
      warnings.push('[authoring] Authoring review is deterministic-check-only, not an LLM review');
    } else if (!authoringReview.passed) {
      const blockingFindings = authoringReview.findings
        .filter((finding) => finding.severity === 'critical' || finding.severity === 'important')
        .map((finding) => finding.problem);
      blockers.push(
        `[authoring] LLM authoring review did not pass${
          blockingFindings.length > 0 ? `: ${blockingFindings.join('; ')}` : ''
        }`,
      );
    }
  }
  if (state.status === 'ready' && !state.ready) {
    blockers.push('[publish] Ready Bundle metadata is missing');
  }
  for (const unsupported of compile?.unsupported ?? []) {
    const message = `[capability] ${unsupported.capability}: ${unsupported.reason}`;
    if (unsupported.required) blockers.push(message);
    else warnings.push(message);
  }
  for (const disclosure of compile?.executableDisclosures ?? []) {
    warnings.push(
      `[executable] ${disclosure.id}: ${disclosure.command} -> ${disclosure.destination} (${disclosure.sideEffect})`,
    );
  }
  const publishable =
    blockers.length === 0 &&
    state.status === 'review-approved' &&
    state.review?.hash === state.currentHash &&
    state.review.decision === 'approved';
  const published =
    blockers.length === 0 &&
    state.status === 'ready' &&
    state.ready?.hash === state.currentHash &&
    Boolean(state.ready.path);
  return {
    state: published
      ? 'published'
      : publishable
        ? 'publishable'
        : blockers.length === 0
          ? 'reviewable'
          : 'blocked',
    blockers,
    warnings,
    evidence: {
      draftPath: state.draftPath,
      ...(generatedPackage
        ? authoringReview
          ? {
              authoringReview: `${authoringReview.passed ? 'passed' : 'failed'} (${
                authoringReview.evidenceSource
              }${authoringReview.voters ? `, ${authoringReview.voters} voters` : ''})`,
            }
          : { authoringReview: 'missing' }
        : {}),
      ...(state.factory?.generatedSkillPackage?.packageRoot
        ? { generatedPackage: state.factory.generatedSkillPackage.packageRoot }
        : {}),
      ...(state.factory?.generatedSkillPackage?.evalManifestPath
        ? { evalManifest: state.factory.generatedSkillPackage.evalManifestPath }
        : {}),
      ...(state.factory?.composition
        ? {
            compositionIssues: `${state.factory.composition.issues.length} issue(s)`,
            compositionChoices: `${state.factory.composition.choices.length} choice(s)`,
          }
        : {}),
      ...(workflowProtocol
        ? {
            workflow: `${workflowProtocol.nodes.length} node(s), ${workflowProtocol.outputSchemas.length} output schema(s)`,
            workflowRequiredSkillCalls: `${workflowProtocol.nodes.reduce(
              (count, node) => count + node.requiredSkillCalls.length,
              0,
            )} required Skill call(s)`,
            workflowOutputSchemas: workflowProtocol.outputSchemas
              .map((schema) => schema.id)
              .join(', '),
          }
        : {}),
      ...(state.factory?.generatedSkillPackage
        ? {
            controlPlane: `${controlPlane.evidence.length}/${
              controlPlane.evidence.length + controlPlane.errors.length
            } file(s)`,
            ...(controlPlane.errors.length > 0
              ? { controlPlaneErrors: `${controlPlane.errors.length} error(s)` }
              : {}),
          }
        : {}),
      ...(state.eval?.resultPath ? { evalResult: state.eval.resultPath } : {}),
      ...(state.factory?.planPath ? { factoryPlan: state.factory.planPath } : {}),
      ...(state.factory?.preferenceHash ? { preferenceHash: state.factory.preferenceHash } : {}),
      ...(state.factory?.preferenceMode ? { preferenceMode: state.factory.preferenceMode } : {}),
      ...(state.ready?.path ? { publishedBundle: state.ready.path } : {}),
    },
  };
}

async function fallbackIrForBundle(bundle: SkillBundle, locale: string): Promise<BundleCompilerIr> {
  return {
    bundle: {
      name: bundle.manifest.metadata.name,
      version: bundle.manifest.metadata.version,
      locale,
      hash: await hashBundle(bundle),
    },
    capabilities: {
      requires: [...bundle.manifest.platforms.requires],
      optional: [...bundle.manifest.platforms.optional],
    },
    skills: bundle.manifest.skills.map((skill) => ({
      id: skill.id,
      logicalRoot: skill.path,
      visibility: skill.visibility,
      sourceRoot: `${bundle.root}/${skill.path}`,
      files: [],
    })),
    rules: [],
    hooks: [],
    scripts: [],
    references: [],
    assets: [],
    overrides: [],
    engine: null,
  };
}

function fallbackCompileReport(options: {
  bundle: SkillBundle;
  platform: string;
  scope: 'project' | 'global';
}): PlatformCompileReport {
  return {
    platform: options.platform,
    scope: options.scope,
    files: [],
    entrySkills: options.bundle.manifest.skills
      .filter((skill) => skill.visibility === 'entry')
      .map((skill) => skill.id),
    unsupported: [],
    executableDisclosures: [],
  };
}

export async function buildBundleReviewSummary(options: {
  projectRoot: string;
  name: string;
  platform: string;
  scope?: 'project' | 'global';
  locale?: string;
}): Promise<BundleReviewSummary> {
  const state = await reconcileBundleAuthoringState(options.projectRoot, options.name);
  const currentPreferences = await readProjectSkillPreferences(options.projectRoot);
  const bundle = await loadBundle(state.draftPath);
  const locale = options.locale ?? state.defaultLocale;
  const scope = options.scope ?? 'project';
  const target = listBundlePlatformTargets({
    projectRoot: options.projectRoot,
    homeDir: os.homedir(),
    scope,
  }).find((candidate) => candidate.id === options.platform);
  if (!target) throw new Error(`Unknown platform: ${options.platform}`);
  const controlPlane = await validateStableFactoryControlPlane(state);
  const ir = controlPlane.passed
    ? await compileBundleIr(bundle, { locale })
    : await fallbackIrForBundle(bundle, locale);
  const compile = controlPlane.passed
    ? await compileBundleForPlatform(ir, target, {
        projectRoot: options.projectRoot,
        scope,
        locale,
      })
    : fallbackCompileReport({ bundle, platform: target.id, scope });
  const readiness = buildReadiness(state, controlPlane, compile, currentPreferences?.hash ?? null);

  return {
    schemaVersion: 1,
    name: state.name,
    status: state.status,
    hash: state.currentHash,
    draftPath: state.draftPath,
    factory: state.factory ?? null,
    compile,
    evalPlans: {
      quick: planBundleEval(ir, 'quick'),
      full: planBundleEval(ir, 'full'),
    },
    eval: state.eval ?? null,
    review: state.review ?? null,
    ready: state.ready ?? null,
    readiness,
    userSummary: buildReadinessUserSummary(state.name, readiness),
  };
}
