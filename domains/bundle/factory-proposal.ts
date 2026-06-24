import path from 'path';
import { discoverBundleCandidates } from './candidates.js';
import { composeBundleFactoryPlan } from './factory-compose.js';
import { normalizeBundleFactoryPlan, readBundleFactoryPlan } from './factory-plan.js';
import { readBundleSkillPreferences } from './preferences.js';
import type {
  BundleFactoryCallChainItem,
  BundleFactoryComposition,
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
  const candidates = await discoverBundleCandidates({
    projectRoot,
    preferences: plan.preferredSkills.length > 0 ? plan.preferredSkills : null,
  });
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

  const blockers = [
    ...resolvedSkills
      .filter((skill) => skill.status === 'missing' || skill.status === 'ambiguous')
      .map((skill) => `[candidate] ${skill.query} (${skill.status})`),
    ...composed.composition.issues.map((issue) => `[composition] ${issue.message}`),
  ];
  const policies = projectPreferences?.preferences.policies;
  if (policies?.scripts === 'deny') blockers.push('[policy] preference policy denies scripts');
  if (policies?.hooks === 'deny') blockers.push('[policy] preference policy denies hooks');

  return {
    schemaVersion: 1,
    name: options.name,
    goal: plan.goal,
    preference: {
      mode: projectPreferences?.preferences.mode ?? 'advisory',
      source: projectPreferences?.path ?? null,
      hash: projectPreferences?.hash ?? null,
      warnings: projectPreferences?.warnings ?? [],
    },
    callChain: composed.callChain.length > 0 ? composed.callChain : plan.callChain,
    resolvedSkills,
    composition: composed.composition,
    blockers,
    warnings: plan.deviations.map((item) => `[deviation] ${item.skill}: ${item.reason}`),
    canGenerate: blockers.length === 0,
  };
}
