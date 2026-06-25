import type {
  BundleFactoryCallChainItem,
  BundleFactoryStageName,
  BundleFactoryStageNameHint,
  BundleFactoryStageNameOverride,
} from './types.js';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function stageKey(skill: string, phase?: string, step?: string): string {
  return [skill, phase ?? '', step ?? ''].join('\0');
}

function defaultStageName(bundleName: string, skill: string): string {
  const base = slug(bundleName) || 'generated-skill';
  const suffix = slug(skill) || 'stage';
  return `${base}-${suffix}`;
}

function scopedRecommendedName(bundleName: string, hint: BundleFactoryStageNameHint): string {
  const recommended = slug(hint.recommendedName);
  if (!recommended) return defaultStageName(bundleName, hint.skill);
  const base = slug(bundleName) || 'generated-skill';
  return recommended.startsWith(`${base}-`) ? recommended : `${base}-${recommended}`;
}

function matchesOverride(
  override: BundleFactoryStageNameOverride,
  skill: string,
  hint?: BundleFactoryStageNameHint,
): boolean {
  if (override.skill !== skill) return false;
  if (!hint) return true;
  if (override.phase && override.phase !== hint?.phase) return false;
  if (override.step && override.step !== hint?.step) return false;
  return true;
}

export function resolveFactoryStageNames(options: {
  bundleName: string;
  callChain: BundleFactoryCallChainItem[];
  hints?: BundleFactoryStageNameHint[];
  overrides?: BundleFactoryStageNameOverride[];
}): BundleFactoryStageName[] {
  const hintQueues = new Map<string, BundleFactoryStageNameHint[]>();
  for (const hint of options.hints ?? []) {
    const entries = hintQueues.get(hint.skill) ?? [];
    entries.push(hint);
    hintQueues.set(hint.skill, entries);
  }

  const usedNames = new Set<string>();
  const result: BundleFactoryStageName[] = [];
  const availableOverrides = [...(options.overrides ?? [])];
  for (const item of options.callChain) {
    const queue = hintQueues.get(item.skill) ?? [];
    const hint = queue.shift();
    const recommendedName = hint
      ? scopedRecommendedName(options.bundleName, hint)
      : defaultStageName(options.bundleName, item.skill);
    const overrideIndex = availableOverrides.findIndex((candidate) =>
      matchesOverride(candidate, item.skill, hint),
    );
    const override =
      overrideIndex >= 0 ? availableOverrides.splice(overrideIndex, 1)[0] : undefined;
    const name = override?.name ?? recommendedName;
    if (name === slug(options.bundleName)) {
      throw new Error(`Stage name must not match entry Skill name: ${name}`);
    }
    if (usedNames.has(name)) {
      throw new Error(`Duplicate resolved stage name: ${name}`);
    }
    usedNames.add(name);
    result.push({
      skill: item.skill,
      name,
      recommendedName,
      source: override && override.name !== recommendedName ? 'custom' : 'recommended',
      ...((hint?.phase ?? override?.phase) ? { phase: hint?.phase ?? override?.phase } : {}),
      ...((hint?.step ?? override?.step) ? { step: hint?.step ?? override?.step } : {}),
      ...((override?.label ?? hint?.label) ? { label: override?.label ?? hint?.label } : {}),
    });
  }

  const unresolvedOverrides = availableOverrides.filter(
    (override) =>
      !result.some(
        (stage) =>
          matchesOverride(override, stage.skill, stage) ||
          stageKey(stage.skill, stage.phase, stage.step) ===
            stageKey(override.skill, override.phase, override.step) ||
          (stage.skill === override.skill && !override.phase && !override.step),
      ),
  );
  if (unresolvedOverrides.length > 0) {
    throw new Error(
      `Stage name override does not match callChain: ${unresolvedOverrides
        .map((item) => item.skill)
        .join(', ')}`,
    );
  }

  return result;
}
