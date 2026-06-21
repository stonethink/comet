import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import { generateFactorySkillPackage } from '../factory/package.js';
import { hashBundle } from './hash.js';
import { loadBundle } from './load.js';
import { writeBundleAuthoringState } from './state.js';
import type { BundleAuthoringState, BundleManifest } from './types.js';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function entrySkillId(state: BundleAuthoringState): string {
  return slug(state.name);
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

export async function generateBundleDraftFromFactoryState(options: {
  projectRoot: string;
  state: BundleAuthoringState;
}): Promise<BundleAuthoringState> {
  const { state } = options;
  if (!state.factory) {
    throw new Error(`Bundle ${state.name} does not have factory metadata`);
  }

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
