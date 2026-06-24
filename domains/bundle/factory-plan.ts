import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  BundleAuthoringState,
  BundleFactoryCallChainItem,
  BundleFactoryMetadata,
  BundleFactoryOrderDeviation,
} from './types.js';

export interface BundleFactoryPlanFile {
  goal: string;
  preferredSkills?: string[];
  callChain: Array<string | { skill: string; preferenceIndex?: number | null }>;
  deviations?: BundleFactoryOrderDeviation[];
  engineMode?: BundleFactoryMetadata['engineMode'];
  runnerMode?: BundleFactoryMetadata['runnerMode'];
  mode?: BundleAuthoringState['mode'];
  sourceRoot?: string;
  creator?: BundleAuthoringState['creator'];
  defaultLocale?: string;
  locales?: string[];
  engineEnabled?: boolean;
}

export interface NormalizedBundleFactoryPlan {
  goal: string;
  preferredSkills: string[];
  callChain: BundleFactoryCallChainItem[];
  deviations: BundleFactoryOrderDeviation[];
  engineMode: BundleFactoryMetadata['engineMode'];
  runnerMode: BundleFactoryMetadata['runnerMode'];
  mode: BundleAuthoringState['mode'];
  sourceRoot?: string;
  creator: NonNullable<BundleAuthoringState['creator']>;
  defaultLocale: string;
  locales: string[];
  engineEnabled: boolean;
}

interface PersistedBundleFactoryPlan extends NormalizedBundleFactoryPlan {
  schemaVersion: 1;
}

function persistedFactoryPlan(plan: NormalizedBundleFactoryPlan): PersistedBundleFactoryPlan {
  return {
    schemaVersion: 1,
    ...plan,
  };
}

export function hashBundleFactoryPlan(plan: NormalizedBundleFactoryPlan): string {
  return createHash('sha256')
    .update(JSON.stringify(persistedFactoryPlan(plan), null, 2) + '\n')
    .digest('hex');
}

function ensureStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`${label} must be a non-empty string array when provided`);
  }
  return value;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeCallChain(
  value: BundleFactoryPlanFile['callChain'],
  preferredSkills: string[],
): BundleFactoryCallChainItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('factory plan callChain must contain at least one Skill');
  }

  const preferredIndex = new Map(preferredSkills.map((skill, index) => [skill, index]));
  return value.map((item, index) => {
    if (typeof item === 'string') {
      return {
        skill: item,
        preferenceIndex: preferredIndex.get(item) ?? null,
      };
    }
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.skill !== 'string' ||
      item.skill.length === 0
    ) {
      throw new Error(`factory plan callChain[${index}] must be a Skill name or object`);
    }
    return {
      skill: item.skill,
      preferenceIndex:
        item.preferenceIndex === undefined
          ? (preferredIndex.get(item.skill) ?? null)
          : item.preferenceIndex,
    };
  });
}

export async function readBundleFactoryPlan(filePath: string): Promise<BundleFactoryPlanFile> {
  const absolutePath = path.resolve(filePath);
  const value = JSON.parse(await fs.readFile(absolutePath, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid factory plan: ${absolutePath}`);
  }
  const plan = value as Partial<BundleFactoryPlanFile>;
  if (typeof plan.goal !== 'string' || plan.goal.length === 0) {
    throw new Error(`Invalid factory plan: ${absolutePath} must include goal`);
  }
  if (!Array.isArray(plan.callChain)) {
    throw new Error(`Invalid factory plan: ${absolutePath} must include callChain`);
  }
  if (plan.preferredSkills !== undefined) {
    ensureStringArray(plan.preferredSkills, 'preferredSkills');
  }
  if (plan.locales !== undefined) {
    ensureStringArray(plan.locales, 'locales');
  }
  if (
    plan.deviations !== undefined &&
    (!Array.isArray(plan.deviations) ||
      plan.deviations.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          typeof item.skill !== 'string' ||
          typeof item.expectedIndex !== 'number' ||
          typeof item.actualIndex !== 'number' ||
          typeof item.reason !== 'string',
      ))
  ) {
    throw new Error(`Invalid factory plan: ${absolutePath} deviations must be structured objects`);
  }
  return plan as BundleFactoryPlanFile;
}

export function normalizeBundleFactoryPlan(options: {
  plan: BundleFactoryPlanFile;
  projectPreferredSkills?: string[] | null;
}): NormalizedBundleFactoryPlan {
  const { plan } = options;
  const preferredSkills = dedupe([
    ...(plan.preferredSkills ?? options.projectPreferredSkills ?? []),
    ...plan.callChain
      .map((item) => (typeof item === 'string' ? item : item.skill))
      .filter((skill) => skill.length > 0),
  ]);
  const callChain = normalizeCallChain(plan.callChain, preferredSkills);
  const defaultLocale = plan.defaultLocale ?? 'en';
  const locales = dedupe(plan.locales ?? [defaultLocale]);
  const engineMode = plan.engineMode ?? 'deterministic';
  const mode = plan.mode ?? 'create';
  if (mode === 'optimize' && !plan.sourceRoot) {
    throw new Error('factory plan sourceRoot is required for optimize mode');
  }

  return {
    goal: plan.goal,
    preferredSkills,
    callChain,
    deviations: structuredClone(plan.deviations ?? []),
    engineMode,
    runnerMode: plan.runnerMode ?? 'standalone',
    mode,
    ...(plan.sourceRoot ? { sourceRoot: plan.sourceRoot } : {}),
    creator: plan.creator ?? 'native',
    defaultLocale,
    locales,
    engineEnabled: plan.engineEnabled ?? engineMode !== 'none',
  };
}

function factoryPlanPath(projectRoot: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)) {
    throw new Error(`Invalid Bundle name: ${name}`);
  }
  return path.resolve(projectRoot, '.comet', 'bundle-factory-plans', name, 'plan.json');
}

export async function writeBundleFactoryPlanArtifact(options: {
  projectRoot: string;
  name: string;
  plan: NormalizedBundleFactoryPlan;
}): Promise<{ planPath: string; planHash: string }> {
  const planPath = factoryPlanPath(options.projectRoot, options.name);
  const document = persistedFactoryPlan(options.plan);
  const content = JSON.stringify(document, null, 2) + '\n';
  const temporary = path.join(path.dirname(planPath), `.plan.${randomUUID()}.tmp`);
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, planPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return {
    planPath,
    planHash: hashBundleFactoryPlan(options.plan),
  };
}
