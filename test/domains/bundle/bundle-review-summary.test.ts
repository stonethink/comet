import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createBundleDraft } from '../../../domains/bundle/draft.js';
import { buildBundleReviewSummary } from '../../../domains/bundle/review-summary.js';
import { reconcileBundleAuthoringState, writeBundleAuthoringState } from '../../../domains/bundle/state.js';
import type { BundleAuthoringState } from '../../../domains/bundle/types.js';

async function writeMinimalBundle(root: string, name: string): Promise<void> {
  await fs.mkdir(path.join(root, 'skills', name), { recursive: true });
  await fs.writeFile(
    path.join(root, 'skills', name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Demo.\n---\n\n# ${name}\n`,
  );
  await fs.writeFile(
    path.join(root, 'bundle.yaml'),
    `apiVersion: comet/v1alpha1
kind: SkillBundle
metadata:
  name: ${name}
  version: 1.0.0
  description: Demo
  defaultLocale: en
  locales: [en]
skills:
  - id: ${name}
    path: skills/${name}
    visibility: entry
resources:
  rules: []
  hooks: []
  references: []
  scripts: []
  assets: []
platforms:
  requires: [skills]
  optional: []
  overrides: []
engine:
  enabled: false
`,
  );
}

describe('Bundle review summary readiness', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-review-summary-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('blocks unresolved Factory candidates and missing eval evidence', async () => {
    const state = await createBundleDraft({
      projectRoot,
      name: 'factory-demo',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
      factory: {
        goal: 'Demo',
        preferredSkills: ['missing-skill'],
        resolvedSkills: [
          { query: 'missing-skill', preferenceIndex: 0, status: 'missing', sources: [] },
        ],
        callChain: [{ skill: 'missing-skill', preferenceIndex: 0 }],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });
    await writeMinimalBundle(state.draftPath, 'factory-demo');

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-demo',
      platform: 'claude',
    });

    expect(summary.readiness.state).toBe('blocked');
    expect(summary.readiness.blockers).toContain(
      'Unresolved Factory candidates: missing-skill (missing)',
    );
    expect(summary.readiness.blockers).toContain(
      'Eval evidence for the current draft hash is missing',
    );
  });

  it('is publishable only when eval and review match the current hash', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'factory-ready',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
    });
    const draftPath = path.join(projectRoot, '.comet', 'bundle-drafts', 'factory-ready');
    await writeMinimalBundle(draftPath, 'factory-ready');
    const state = await reconcileBundleAuthoringState(projectRoot, 'factory-ready');
    const readyState: BundleAuthoringState = {
      ...state,
      status: 'review-approved',
      currentHash: state.currentHash,
      eval: {
        level: 'quick',
        hash: state.currentHash!,
        resultPath: 'eval.json',
        passed: true,
      },
      review: {
        hash: state.currentHash!,
        decision: 'approved',
        reviewer: 'alice',
        at: '2026-06-22T00:00:00.000Z',
      },
    };
    await writeBundleAuthoringState(projectRoot, readyState);

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-ready',
      platform: 'claude',
    });

    expect(summary.readiness.state).toBe('publishable');
    expect(summary.readiness.blockers).toEqual([]);
  });
});
