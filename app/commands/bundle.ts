import path from 'path';
import os from 'os';
import { discoverBundleCandidates } from '../../domains/bundle/candidates.js';
import {
  generateBundleDraftFromFactoryState,
  initializeBundleFactoryState,
} from '../../domains/bundle/factory.js';
import { resolveBundleFactoryCandidate } from '../../domains/bundle/factory-resolve.js';
import { readSkillPreferences } from '../../domains/bundle/preferences.js';
import { createBundleDraft, optimizeBundleDraft } from '../../domains/bundle/draft.js';
import { loadBundle } from '../../domains/bundle/load.js';
import {
  listBundleAuthoringStates,
  reconcileBundleAuthoringState,
} from '../../domains/bundle/state.js';
import { compileBundleIr } from '../../domains/bundle/compiler.js';
import { compileBundleForPlatform } from '../../domains/bundle/platform.js';
import { buildBundleReviewSummary } from '../../domains/bundle/review-summary.js';
import { listBundlePlatformTargets } from '../../domains/bundle/bundle-platform.js';
import { planBundleEval, recordBundleEval } from '../../domains/bundle/eval.js';
import { publishBundle, reviewBundle } from '../../domains/bundle/publish.js';
import { distributeBundle } from '../../domains/bundle/distribute.js';
import { buildBundleFactoryProposal } from '../../domains/bundle/factory-proposal.js';
import type { BundleCapability } from '../../domains/bundle/types.js';

interface BundleCommandOptions {
  project?: string;
  json?: boolean;
  platform?: string | string[];
  scope?: 'project' | 'global';
  locale?: string;
  level?: 'quick' | 'full';
  result?: string;
  approve?: boolean;
  reject?: boolean;
  reviewer?: string;
  overwrite?: boolean;
  skipCapability?: BundleCapability[];
  confirmExecutables?: boolean;
  name?: string;
  defaultLocale?: string;
  localeOption?: string[];
  engine?: boolean;
  file?: string;
  candidate?: string;
  source?: string;
  ignoreMissing?: boolean;
  reason?: string;
}

interface BundleNextAction {
  action:
    | 'resolve-candidates'
    | 'fix-composition'
    | 'generate-factory-package'
    | 'choose-eval-level'
    | 'request-review'
    | 'publish'
    | 'ask-distribution'
    | 'done';
  reason: string;
  command: string;
}

function projectRoot(options: BundleCommandOptions): string {
  return path.resolve(options.project ?? '.');
}

function emit(value: unknown, json: boolean | undefined, text: string): void {
  console.log(json ? JSON.stringify(value, null, 2) : text);
}

function platformIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatOptionalSection(title: string, lines: string[]): string[] {
  return lines.length > 0 ? [title, ...lines.map((line) => `- ${line}`)] : [];
}

function formatStateEval(
  evalState:
    | NonNullable<Awaited<ReturnType<typeof reconcileBundleAuthoringState>>['eval']>
    | undefined,
): string {
  if (!evalState) return 'Eval: missing; run comet bundle eval-plan and comet bundle eval-record';
  return `Eval: ${evalState.passed ? 'passed' : 'failed'} (${evalState.level}) @ ${evalState.hash}`;
}

function formatStateReview(
  reviewState:
    | NonNullable<Awaited<ReturnType<typeof reconcileBundleAuthoringState>>['review']>
    | undefined,
): string {
  if (!reviewState) return 'Review: missing; run comet bundle review-summary before approval';
  return `Review: ${reviewState.decision} by ${reviewState.reviewer} @ ${reviewState.hash}`;
}

function determineNextAction(
  state: Awaited<ReturnType<typeof reconcileBundleAuthoringState>>,
): BundleNextAction {
  const unresolved =
    state.factory?.resolvedSkills.filter(
      (skill) => skill.status === 'missing' || skill.status === 'ambiguous',
    ) ?? [];
  if (unresolved.length > 0) {
    const first = unresolved[0];
    return {
      action: 'resolve-candidates',
      reason: `${unresolved.length} unresolved Factory candidate(s) remain`,
      command: `comet bundle factory-resolve ${state.name} --candidate ${first.query}`,
    };
  }

  const compositionIssues = state.factory?.composition?.issues ?? [];
  if (compositionIssues.length > 0) {
    const first = compositionIssues[0];
    return {
      action: 'fix-composition',
      reason: `Factory composition has ${compositionIssues.length} issue(s): ${first.message}`,
      command: `comet bundle review-summary ${state.name} --platform <reference-platform>`,
    };
  }

  if (state.factory && !state.factory.generatedSkillPackage) {
    return {
      action: 'generate-factory-package',
      reason: 'Factory metadata exists but no generated Skill package is recorded yet',
      command: `comet bundle factory-generate ${state.name}`,
    };
  }

  if (!state.eval || state.eval.hash !== state.currentHash || !state.eval.passed) {
    return {
      action: 'choose-eval-level',
      reason: 'Current draft hash is missing passing Eval evidence',
      command: `comet bundle eval-plan ${state.name} --level quick`,
    };
  }

  if (!state.review || state.review.hash !== state.currentHash) {
    return {
      action: 'request-review',
      reason: 'Current draft hash is missing review approval',
      command: `comet bundle review-summary ${state.name} --platform <reference-platform>`,
    };
  }

  if (state.status === 'review-approved' && !state.ready) {
    return {
      action: 'publish',
      reason: 'Eval and review are present; the draft is ready to publish',
      command: `comet bundle publish ${state.name} --platform <reference-platform>`,
    };
  }

  if (state.ready) {
    return {
      action: 'ask-distribution',
      reason: 'Ready Bundle exists; the next step is distribution after user confirmation',
      command: `comet bundle distribute ${state.name} --platform <platform> --scope project`,
    };
  }

  return {
    action: 'done',
    reason: 'No further automatic Bundle action is required',
    command: 'none',
  };
}

function formatStatusText(
  state: Awaited<ReturnType<typeof reconcileBundleAuthoringState>>,
): string {
  const factoryPackage =
    state.factory?.generatedSkillPackage?.packageRoot ??
    state.factory?.planPath ??
    'missing; run comet bundle factory-generate or inspect factory-init plan';

  const nextAction = determineNextAction(state);

  return [
    `Bundle: ${state.name}`,
    `Status: ${state.status}`,
    `Hash: ${state.currentHash ?? '(invalid)'}`,
    `Draft: ${state.draftPath}`,
    `Factory package: ${factoryPackage}`,
    formatStateEval(state.eval),
    formatStateReview(state.review),
    `Next action: ${nextAction.action}`,
    `Reason: ${nextAction.reason}`,
    `Suggested command: ${nextAction.command}`,
    ...(state.ready ? [`Ready: ${state.ready.path}`] : []),
  ].join('\n');
}

function formatListText(
  states: Array<
    Awaited<ReturnType<typeof reconcileBundleAuthoringState>> & { nextAction: BundleNextAction }
  >,
): string {
  if (states.length === 0) return 'No Bundle authoring states found.';
  return states
    .map((state) =>
      [
        `${state.name}: ${state.status}`,
        `Hash: ${state.currentHash ?? '(invalid)'}`,
        `Draft: ${state.draftPath}`,
        `Next action: ${state.nextAction.action}`,
        `Reason: ${state.nextAction.reason}`,
      ].join('\n'),
    )
    .join('\n\n');
}

function formatReviewSummaryText(
  summary: Awaited<ReturnType<typeof buildBundleReviewSummary>>,
): string {
  const readinessLines = [
    `Readiness: ${summary.readiness.state}`,
    ...formatOptionalSection('Blockers:', summary.readiness.blockers),
    ...formatOptionalSection('Warnings:', summary.readiness.warnings),
    ...formatOptionalSection(
      'Evidence:',
      Object.entries(summary.readiness.evidence).map(([key, value]) => `${key}: ${value}`),
    ),
  ];

  return [
    `Bundle: ${summary.name}`,
    `Status: ${summary.status}`,
    `Hash: ${summary.hash ?? '(invalid)'}`,
    `Platform: ${summary.compile.platform}`,
    `Quick Eval runs: ${summary.evalPlans.quick.estimatedRuns}`,
    `Full Eval runs: ${summary.evalPlans.full.estimatedRuns}`,
    ...readinessLines,
  ].join('\n');
}

function formatDistributionText(result: Awaited<ReturnType<typeof distributeBundle>>): string {
  const summary = result.platforms.map((platform) => `${platform.platform}: ${platform.status}`);
  const disclosures = result.platforms.flatMap((platform) =>
    platform.executableDisclosures.map((disclosure) => ({
      platform: platform.platform,
      disclosure,
    })),
  );
  if (disclosures.length === 0) return summary.join('\n');
  return [
    ...summary,
    'Executable hooks:',
    ...disclosures.map(
      ({ platform, disclosure }) =>
        `  - ${platform}/${disclosure.id}: ${disclosure.command} (${disclosure.sideEffect}) -> ${disclosure.destination}`,
    ),
  ].join('\n');
}

async function compileDraft(
  name: string,
  options: BundleCommandOptions,
): Promise<{
  state: Awaited<ReturnType<typeof reconcileBundleAuthoringState>>;
  ir: Awaited<ReturnType<typeof compileBundleIr>>;
}> {
  const state = await reconcileBundleAuthoringState(projectRoot(options), name);
  const bundle = await loadBundle(state.draftPath);
  return {
    state,
    ir: await compileBundleIr(bundle, { locale: options.locale ?? state.defaultLocale }),
  };
}

export async function bundleCandidatesCommand(options: BundleCommandOptions = {}): Promise<void> {
  const root = projectRoot(options);
  const preferences = await readSkillPreferences(root);
  const candidates = await discoverBundleCandidates({ projectRoot: root, preferences });
  emit(
    { candidates },
    options.json,
    candidates.map((candidate) => `${candidate.name}: ${candidate.status}`).join('\n'),
  );
}

export async function bundleDraftCreateCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const state = await createBundleDraft({
    projectRoot: projectRoot(options),
    name,
    candidates: [],
    creator: null,
    defaultLocale: options.defaultLocale ?? options.locale ?? 'en',
    locales: options.localeOption ?? [options.defaultLocale ?? options.locale ?? 'en'],
    engineEnabled: options.engine ?? false,
  });
  emit(state, options.json, `Created Bundle draft ${state.name}\nDraft: ${state.draftPath}`);
}

export async function bundleDraftOptimizeCommand(
  source: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const sourceRoot = path.resolve(source);
  const bundle = await loadBundle(sourceRoot);
  const state = await optimizeBundleDraft({
    projectRoot: projectRoot(options),
    name: options.name ?? bundle.manifest.metadata.name,
    sourceRoot,
    candidates: [],
    creator: null,
    defaultLocale: options.defaultLocale ?? bundle.manifest.metadata.defaultLocale,
    locales: options.localeOption ?? bundle.manifest.metadata.locales,
    engineEnabled: bundle.manifest.engine.enabled,
  });
  emit(state, options.json, `Optimized Bundle draft ${state.name}\nDraft: ${state.draftPath}`);
}

export async function bundleStatusCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const state = await reconcileBundleAuthoringState(projectRoot(options), name);
  const nextAction = determineNextAction(state);
  emit({ ...state, nextAction }, options.json, formatStatusText(state));
}

export async function bundleListCommand(options: BundleCommandOptions = {}): Promise<void> {
  const states = (await listBundleAuthoringStates(projectRoot(options))).map((state) => ({
    ...state,
    nextAction: determineNextAction(state),
  }));
  emit({ bundles: states }, options.json, formatListText(states));
}

export async function bundleFactoryGenerateCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const root = projectRoot(options);
  const state = await reconcileBundleAuthoringState(root, name);
  const updated = await generateBundleDraftFromFactoryState({ projectRoot: root, state });
  emit(
    updated,
    options.json,
    `Generated factory Bundle draft ${updated.name}\nDraft: ${updated.draftPath}`,
  );
}

export async function bundleFactoryInitCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  if (!options.file) throw new Error('--file is required');
  const updated = await initializeBundleFactoryState({
    projectRoot: projectRoot(options),
    name,
    filePath: options.file,
  });
  emit(
    updated,
    options.json,
    `Initialized factory Bundle state ${updated.name}\nDraft: ${updated.draftPath}`,
  );
}

export async function bundleFactoryProposeCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  if (!options.file) throw new Error('--file is required');
  const proposal = await buildBundleFactoryProposal({
    projectRoot: projectRoot(options),
    name,
    filePath: options.file,
  });
  emit(
    proposal,
    options.json,
    [
      `Factory proposal ${proposal.name}`,
      `Goal: ${proposal.goal}`,
      `Preference mode: ${proposal.preference.mode}`,
      `Can generate: ${proposal.canGenerate ? 'yes' : 'no'}`,
      ...formatOptionalSection('Blockers:', proposal.blockers),
    ].join('\n'),
  );
}

export async function bundleFactoryResolveCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  if (!options.candidate) throw new Error('--candidate is required');
  const updated = await resolveBundleFactoryCandidate({
    projectRoot: projectRoot(options),
    name,
    candidate: options.candidate,
    ...(options.source ? { source: options.source } : {}),
    ...(options.ignoreMissing ? { ignoreMissing: true } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
  });
  emit(
    updated,
    options.json,
    `Resolved factory candidate ${options.candidate} for ${updated.name}`,
  );
}

export async function bundleCompileCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const ids = platformIds(options.platform);
  if (ids.length !== 1) throw new Error('--platform is required exactly once');
  const { state, ir } = await compileDraft(name, options);
  const target = listBundlePlatformTargets({
    projectRoot: projectRoot(options),
    homeDir: os.homedir(),
    scope: options.scope ?? 'project',
  }).find((candidate) => candidate.id === ids[0]);
  if (!target) throw new Error(`Unknown platform: ${ids[0]}`);
  const report = await compileBundleForPlatform(ir, target, {
    projectRoot: projectRoot(options),
    scope: options.scope ?? 'project',
    locale: options.locale ?? state.defaultLocale,
  });
  emit(
    report,
    options.json,
    `Compiled ${name} for ${report.platform}: ${report.files.length} file(s)`,
  );
}

export async function bundleEvalPlanCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const { ir } = await compileDraft(name, options);
  const plan = planBundleEval(ir, options.level ?? 'quick');
  emit(
    plan,
    options.json,
    [
      `Eval level: ${plan.level}`,
      `Estimated runs: ${plan.estimatedRuns}`,
      `Token workload: ${plan.tokenWorkload}`,
      plan.explanation,
    ].join('\n'),
  );
}

export async function bundleEvalRecordCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  if (!options.result) throw new Error('--result is required');
  const state = await recordBundleEval(projectRoot(options), name, path.resolve(options.result));
  emit(state, options.json, `Recorded Eval for ${state.name}: ${state.status}`);
}

export async function bundleReviewCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  if (options.approve === options.reject) {
    throw new Error('Pass exactly one of --approve or --reject');
  }
  if (!options.reviewer) throw new Error('--reviewer is required');
  const state = await reviewBundle({
    projectRoot: projectRoot(options),
    name,
    decision: options.approve ? 'approved' : 'rejected',
    reviewer: options.reviewer,
  });
  emit(state, options.json, `Review ${state.review?.decision ?? 'recorded'}: ${state.status}`);
}

export async function bundleReviewSummaryCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const ids = platformIds(options.platform);
  if (ids.length !== 1) throw new Error('--platform is required exactly once');
  const summary = await buildBundleReviewSummary({
    projectRoot: projectRoot(options),
    name,
    platform: ids[0],
    scope: options.scope ?? 'project',
    locale: options.locale,
  });
  emit(summary, options.json, formatReviewSummaryText(summary));
}

export async function bundlePublishCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const ids = platformIds(options.platform);
  if (ids.length !== 1) throw new Error('--platform is required exactly once');
  const state = await publishBundle({
    projectRoot: projectRoot(options),
    name,
    overwrite: options.overwrite,
    referencePlatform: ids[0],
  });
  emit(state, options.json, `Published ${state.name}: ${state.ready?.path}`);
}

export async function bundleDistributeCommand(
  name: string,
  options: BundleCommandOptions = {},
): Promise<void> {
  const ids = platformIds(options.platform);
  if (ids.length === 0) throw new Error('At least one --platform is required');
  const result = await distributeBundle({
    projectRoot: projectRoot(options),
    name,
    platforms: ids,
    scope: options.scope ?? 'project',
    locale: options.locale,
    overwrite: options.overwrite,
    skipCapabilities: options.skipCapability,
    confirmedExecutables: options.confirmExecutables,
  });
  emit(result, options.json, formatDistributionText(result));
}

export type { BundleCommandOptions };
