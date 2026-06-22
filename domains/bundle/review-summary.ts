import os from 'os';
import { compileBundleIr } from './compiler.js';
import { planBundleEval } from './eval.js';
import { loadBundle } from './load.js';
import { compileBundleForPlatform, type PlatformCompileReport } from './platform.js';
import { reconcileBundleAuthoringState } from './state.js';
import type { BundleAuthoringState } from './types.js';
import { listBundlePlatformTargets } from './bundle-platform.js';

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
}

export async function buildBundleReviewSummary(options: {
  projectRoot: string;
  name: string;
  platform: string;
  scope?: 'project' | 'global';
  locale?: string;
}): Promise<BundleReviewSummary> {
  const state = await reconcileBundleAuthoringState(options.projectRoot, options.name);
  const bundle = await loadBundle(state.draftPath);
  const locale = options.locale ?? state.defaultLocale;
  const ir = await compileBundleIr(bundle, { locale });
  const scope = options.scope ?? 'project';
  const target = listBundlePlatformTargets({
    projectRoot: options.projectRoot,
    homeDir: os.homedir(),
    scope,
  }).find((candidate) => candidate.id === options.platform);
  if (!target) throw new Error(`Unknown platform: ${options.platform}`);

  return {
    schemaVersion: 1,
    name: state.name,
    status: state.status,
    hash: state.currentHash,
    draftPath: state.draftPath,
    factory: state.factory ?? null,
    compile: await compileBundleForPlatform(ir, target, {
      projectRoot: options.projectRoot,
      scope,
      locale,
    }),
    evalPlans: {
      quick: planBundleEval(ir, 'quick'),
      full: planBundleEval(ir, 'full'),
    },
    eval: state.eval ?? null,
    review: state.review ?? null,
    ready: state.ready ?? null,
  };
}
