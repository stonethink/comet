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

async function writeHookedBundle(root: string, name: string): Promise<void> {
  await fs.mkdir(path.join(root, 'skills', name), { recursive: true });
  await fs.mkdir(path.join(root, 'hooks'), { recursive: true });
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'skills', name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Demo.\n---\n\n# ${name}\n`,
  );
  await fs.writeFile(
    path.join(root, 'hooks', 'protect-write.yaml'),
    `event: before_write
script: verify
failure: block
requiresConfirmation: false
`,
  );
  await fs.writeFile(path.join(root, 'scripts', 'verify.mjs'), 'console.log("verify");\n');
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
  hooks:
    - id: protect-write
      path: hooks/protect-write.yaml
  references: []
  scripts:
    - id: verify
      path: scripts/verify.mjs
      sideEffect: read
      runtime: node
  assets: []
platforms:
  requires: [skills, hooks]
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
      '[candidate] Unresolved Factory candidates: missing-skill (missing)',
    );
    expect(summary.readiness.blockers).toContain(
      '[eval] Eval evidence for the current draft hash is missing',
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

  it('classifies readiness blockers by type and exposes all readiness states', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'factory-classified',
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
        generatedSkillPackage: {
          entrySkill: 'demo',
          internalSkills: [],
          packageRoot: path.join(projectRoot, 'pkg'),
          enginePath: null,
          evalManifestPath: path.join(projectRoot, 'pkg', 'comet', 'eval.yaml'),
        },
      },
    });
    const draftPath = path.join(projectRoot, '.comet', 'bundle-drafts', 'factory-classified');
    await writeMinimalBundle(draftPath, 'factory-classified');

    const blockedState = await reconcileBundleAuthoringState(projectRoot, 'factory-classified');
    await writeBundleAuthoringState(projectRoot, {
      ...blockedState,
      status: 'draft',
      currentHash: blockedState.currentHash,
    });

    const blocked = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-classified',
      platform: 'claude',
    });
    expect(blocked.readiness.state).toBe('blocked');
    expect(blocked.readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[candidate]'),
        expect.stringContaining('[eval]'),
      ]),
    );

    await writeBundleAuthoringState(projectRoot, {
      ...blockedState,
      status: 'eval-passed',
      currentHash: blockedState.currentHash,
      factory: {
        ...blockedState.factory!,
        resolvedSkills: [
          {
            query: 'missing-skill',
            preferenceIndex: 0,
            status: 'available',
            sources: [
              {
                hash: 'sha256:demo',
                root: path.join(projectRoot, 'skills', 'missing-skill'),
                scope: 'project',
                skillMd: path.join(projectRoot, 'skills', 'missing-skill', 'SKILL.md'),
                references: [],
                scripts: [],
              },
            ],
          },
        ],
      },
      eval: {
        level: 'quick',
        hash: blockedState.currentHash!,
        resultPath: path.join(projectRoot, 'eval.json'),
        passed: true,
      },
    });

    const reviewable = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-classified',
      platform: 'claude',
    });
    expect(reviewable.readiness.state).toBe('reviewable');
    expect(reviewable.readiness.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('[review]')]),
    );

    await writeBundleAuthoringState(projectRoot, {
      ...(await reconcileBundleAuthoringState(projectRoot, 'factory-classified')),
      status: 'review-approved',
      currentHash: blockedState.currentHash,
      eval: {
        level: 'quick',
        hash: blockedState.currentHash!,
        resultPath: path.join(projectRoot, 'eval.json'),
        passed: true,
      },
      review: {
        hash: blockedState.currentHash!,
        decision: 'approved',
        reviewer: 'alice',
        at: '2026-06-23T00:00:00.000Z',
      },
    });

    const publishable = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-classified',
      platform: 'claude',
    });
    expect(publishable.readiness.state).toBe('publishable');

    await writeBundleAuthoringState(projectRoot, {
      ...(await reconcileBundleAuthoringState(projectRoot, 'factory-classified')),
      status: 'ready',
      currentHash: blockedState.currentHash,
      eval: {
        level: 'quick',
        hash: blockedState.currentHash!,
        resultPath: path.join(projectRoot, 'eval.json'),
        passed: true,
      },
      review: {
        hash: blockedState.currentHash!,
        decision: 'approved',
        reviewer: 'alice',
        at: '2026-06-23T00:00:00.000Z',
      },
      ready: {
        hash: blockedState.currentHash!,
        path: path.join(projectRoot, '.comet', 'bundles', 'factory-classified'),
        publishedAt: '2026-06-23T00:00:00.000Z',
      },
    });
    await fs.mkdir(path.join(projectRoot, '.comet', 'bundles'), { recursive: true });
    await fs.cp(draftPath, path.join(projectRoot, '.comet', 'bundles', 'factory-classified'), {
      recursive: true,
    });

    const published = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-classified',
      platform: 'claude',
    });
    expect(published.status).toBe('ready');
    expect(published.readiness.state).toBe('published');
  });

  it('surfaces capability and executable-disclosure readiness hints from real platform compile output', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'factory-capability',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: false,
    });
    const draftPath = path.join(projectRoot, '.comet', 'bundle-drafts', 'factory-capability');
    await writeHookedBundle(draftPath, 'factory-capability');
    const state = await reconcileBundleAuthoringState(projectRoot, 'factory-capability');
    await writeBundleAuthoringState(projectRoot, {
      ...state,
      status: 'eval-passed',
      eval: {
        level: 'quick',
        hash: state.currentHash!,
        resultPath: path.join(projectRoot, 'eval.json'),
        passed: true,
      },
    });

    const kimiSummary = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-capability',
      platform: 'kimicode',
    });
    expect(kimiSummary.readiness.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining('[capability]')]),
    );

    const claudeSummary = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-capability',
      platform: 'claude',
    });
    expect(claudeSummary.readiness.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('[executable]')]),
    );
  });
});
