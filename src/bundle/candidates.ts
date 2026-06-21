import os from 'os';
import path from 'path';
import { findPreferredSkills, type FoundSkillSource } from '../skill/find.js';

export interface BundleCandidateSource {
  name: string;
  preferenceIndex: number | null;
  platform: string;
  scope: 'project' | 'global';
  origin: FoundSkillSource['origin'];
  root: string;
  description: string;
  skillMd: string;
  hash: string;
}

export interface BundleCandidate {
  name: string;
  preferenceIndex: number | null;
  status: 'available' | 'missing' | 'ambiguous';
  sources: BundleCandidateSource[];
}

function bundleScope(origin: FoundSkillSource['origin']): BundleCandidateSource['scope'] {
  return origin === 'global' ? 'global' : 'project';
}

export async function discoverBundleCandidates(options: {
  projectRoot: string;
  homeDir?: string;
  preferences?: string[] | null;
}): Promise<BundleCandidate[]> {
  const preferences =
    options.preferences === undefined
      ? undefined
      : (options.preferences?.map((query, preferenceIndex) => ({ query, preferenceIndex })) ??
        null);
  const found = await findPreferredSkills({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir ?? os.homedir(),
    builtinRoot: path.join(options.projectRoot, '.comet', '__bundle_builtin_disabled__'),
    preferences,
  });

  return found.map((candidate) => ({
    name: candidate.query,
    preferenceIndex: candidate.preferenceIndex,
    status: candidate.status,
    sources: candidate.sources.map((source) => ({
      name: source.name,
      preferenceIndex: candidate.preferenceIndex,
      platform: source.platform ?? source.origin,
      scope: bundleScope(source.origin),
      origin: source.origin,
      root: source.root,
      description: source.description,
      skillMd: source.skillMd,
      hash: source.hash,
    })),
  }));
}
