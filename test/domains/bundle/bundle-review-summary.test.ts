import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { parse, stringify } from 'yaml';
import { createBundleDraft } from '../../../domains/bundle/draft.js';
import { buildBundleReviewSummary } from '../../../domains/bundle/review-summary.js';
import {
  generateBundleDraftFromFactoryState,
  initializeBundleFactoryState,
} from '../../../domains/bundle/factory.js';
import {
  reconcileBundleAuthoringState,
  writeBundleAuthoringState,
} from '../../../domains/bundle/state.js';
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

async function writeFactorySkill(projectRoot: string, name: string): Promise<void> {
  const skillRoot = path.join(projectRoot, '.comet', 'skills', name);
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(
    path.join(skillRoot, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name}.\n---\n\n# ${name}\n`,
    'utf8',
  );
}

async function createFactoryStateWithGeneratedPackage(
  projectRoot: string,
  name: string,
): Promise<BundleAuthoringState> {
  await writeFactorySkill(projectRoot, `${name}-source`);
  const planFile = path.join(projectRoot, `${name}-plan.json`);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        goal: `Generate ${name}.`,
        preferredSkills: [`${name}-source`],
        callChain: [`${name}-source`],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
        defaultLocale: 'en',
        locales: ['en'],
      },
      null,
      2,
    ),
    'utf8',
  );
  const initialized = await initializeBundleFactoryState({ projectRoot, name, filePath: planFile });
  return generateBundleDraftFromFactoryState({ projectRoot, state: initialized });
}

async function writeGeneratedControlPlane(packageRoot: string): Promise<void> {
  const draftRoot = path.resolve(packageRoot, '..', '..');
  const name = path.basename(packageRoot);
  await fs.mkdir(path.join(packageRoot, 'comet'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'reference'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(draftRoot, 'rules'), { recursive: true });
  await fs.mkdir(path.join(draftRoot, 'hooks'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'SKILL.md'), '# Demo\n', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'comet', 'skill.yaml'), 'steps: []\n', 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'comet', 'guardrails.yaml'),
    'allowedSkills: []\n',
    'utf8',
  );
  await fs.writeFile(path.join(packageRoot, 'comet', 'checks.yaml'), 'runtime: []\n', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'comet', 'eval.yaml'), 'tasks: []\n', 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'reference', 'resolved-skills.json'),
    '{"resolvedSkills":[]}\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(packageRoot, 'reference', 'composition-report.md'),
    '# Composition\n',
    'utf8',
  );
  await fs.writeFile(path.join(packageRoot, 'scripts', 'comet-plan.mjs'), '\n', 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'scripts', 'comet-check.mjs'),
    "const command = process.argv[2] ?? 'verify';\nif (command !== 'verify') throw new Error('bad');\nconsole.log('control-plane-ok');\n// comet/skill.yaml scripts/comet-hook-guard.mjs\n",
    'utf8',
  );
  await fs.writeFile(path.join(packageRoot, 'scripts', 'comet-hook-guard.mjs'), '\n', 'utf8');
  await fs.writeFile(path.join(draftRoot, 'rules', `${name}-orchestration.md`), '# Rule\n', 'utf8');
  await fs.writeFile(
    path.join(draftRoot, 'hooks', `${name}-before-write-guard.yaml`),
    `event: before_write
matcher: Write|Edit
script: comet-hook-guard
failure: block
requiresConfirmation: false
`,
    'utf8',
  );
  await fs.writeFile(
    path.join(draftRoot, 'hooks', `${name}-before-tool-guard.yaml`),
    `event: before_tool
matcher: "*"
script: comet-hook-guard
failure: block
requiresConfirmation: false
`,
    'utf8',
  );
  await fs.writeFile(
    path.join(draftRoot, 'bundle.yaml'),
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
  rules:
    - id: ${name}-orchestration
      path: rules/${name}-orchestration.md
      mode: always
      required: true
  hooks:
    - id: ${name}-before-write-guard
      path: hooks/${name}-before-write-guard.yaml
    - id: ${name}-before-tool-guard
      path: hooks/${name}-before-tool-guard.yaml
  references:
    - skills/${name}/reference/resolved-skills.json
    - skills/${name}/reference/composition-report.md
  scripts:
    - id: comet-plan
      path: skills/${name}/scripts/comet-plan.mjs
      sideEffect: write
      runtime: node
    - id: comet-check
      path: skills/${name}/scripts/comet-check.mjs
      sideEffect: read
      runtime: node
    - id: comet-hook-guard
      path: skills/${name}/scripts/comet-hook-guard.mjs
      sideEffect: read
      runtime: node
  assets: []
platforms:
  requires: [skills, scripts, rules, hooks, references]
  optional: []
  overrides: []
engine:
  enabled: false
`,
    'utf8',
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

  it('surfaces Factory composition issues as readiness blockers', async () => {
    const state = await createBundleDraft({
      projectRoot,
      name: 'factory-composition-blocked',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
      factory: {
        goal: 'Demo',
        preferredSkills: ['task3-choice-flow'],
        resolvedSkills: [],
        callChain: [{ skill: 'task3-choice-flow', preferenceIndex: 0 }],
        deviations: [],
        composition: {
          schemaVersion: 1,
          entrySkills: ['task3-choice-flow'],
          steps: [],
          choices: [
            {
              id: 'review',
              fromSkill: 'task3-choice-flow',
              options: ['task3-missing-review'],
              selectedSkill: null,
              reason: 'No options are available in resolved Skills.',
            },
          ],
          issues: [
            {
              type: 'unresolved-choice',
              message: 'Choice review from task3-choice-flow has no available options.',
              choiceId: 'review',
            },
          ],
        },
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });
    await writeMinimalBundle(state.draftPath, 'factory-composition-blocked');

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-composition-blocked',
      platform: 'claude',
    });

    expect(summary.readiness.state).toBe('blocked');
    expect(summary.readiness.blockers).toContain(
      '[composition] Choice review from task3-choice-flow has no available options.',
    );
    expect(summary.readiness.evidence).toMatchObject({
      compositionIssues: '1 issue(s)',
      compositionChoices: '1 choice(s)',
    });
    expect(summary.readiness.evidence).not.toHaveProperty('composition');
  });

  it('surfaces preference hash evidence and drift warnings', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: advisory
prefer:
  - preference-drift-source
`,
      'utf8',
    );
    const state = await createFactoryStateWithGeneratedPackage(projectRoot, 'preference-drift');
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: advisory
prefer:
  - changed-skill
`,
      'utf8',
    );

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: state.name,
      platform: 'claude',
    });

    expect(summary.readiness.evidence).toHaveProperty(
      'preferenceHash',
      state.factory?.preferenceHash,
    );
    expect(summary.readiness.warnings).toContain(
      '[preference] Project Skill preferences changed after Factory initialization',
    );
  });

  it('blocks strict preference drift', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: strict
prefer:
  - strict-preference-drift-source
`,
      'utf8',
    );
    const state = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      'strict-preference-drift',
    );
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: strict
prefer:
  - changed-skill
`,
      'utf8',
    );

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: state.name,
      platform: 'claude',
    });

    expect(summary.readiness.blockers).toContain(
      '[preference] Project Skill preferences changed after Factory initialization',
    );
  });

  it('blocks unresolved required Skills in strict preference mode', async () => {
    const state = await createBundleDraft({
      projectRoot,
      name: 'strict-required-missing',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
      factory: {
        goal: 'Demo',
        preferredSkills: ['missing-skill'],
        requiredSkills: ['missing-skill'],
        preferenceMode: 'strict',
        resolvedSkills: [
          { query: 'missing-skill', preferenceIndex: 0, status: 'missing', sources: [] },
        ],
        callChain: [{ skill: 'missing-skill', preferenceIndex: 0 }],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });
    await writeMinimalBundle(state.draftPath, 'strict-required-missing');

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'strict-required-missing',
      platform: 'claude',
    });

    expect(summary.readiness.blockers).toContain(
      '[preference] Required Skill candidates are unresolved: missing-skill (missing)',
    );
  });

  it('surfaces missing factory control-plane files as readiness blockers', async () => {
    const state = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      'stable-missing-control',
    );
    await fs.rm(
      path.join(
        state.draftPath,
        'skills',
        'stable-missing-control',
        'scripts',
        'comet-check.mjs',
      ),
    );

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'stable-missing-control',
      platform: 'claude',
    });

    expect(summary.readiness.blockers).toEqual(
      expect.arrayContaining(['[control-plane] missing scripts/comet-check.mjs']),
    );
    expect(summary.readiness.evidence.controlPlane).toEqual(expect.stringMatching(/file\(s\)$/u));
    expect(summary.readiness.evidence.controlPlaneErrors).toEqual(
      expect.stringMatching(/error\(s\)$/u),
    );
  });

  it('surfaces degraded factory bundle.yaml capabilities as readiness blockers', async () => {
    const state = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      'stable-degraded-capabilities',
    );
    const manifestPath = path.join(state.draftPath, 'bundle.yaml');
    const manifest = parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.platforms = {
      requires: ['skills', 'scripts', 'rules', 'hooks'],
      optional: [],
      overrides: [],
    };
    await fs.writeFile(manifestPath, stringify(manifest), 'utf8');

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'stable-degraded-capabilities',
      platform: 'claude',
    });

    expect(summary.readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\[control-plane\].*references|required capabilities/iu),
      ]),
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
    const draftPath = path.join(projectRoot, '.comet', 'bundle-drafts', 'factory-classified');
    const generatedPackageRoot = path.join(draftPath, 'skills', 'factory-classified');
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
          entrySkill: 'factory-classified',
          internalSkills: [],
          packageRoot: generatedPackageRoot,
          enginePath: null,
          evalManifestPath: path.join(generatedPackageRoot, 'comet', 'eval.yaml'),
        },
      },
    });
    await writeMinimalBundle(draftPath, 'factory-classified');
    await writeGeneratedControlPlane(generatedPackageRoot);

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
    expect(blocked.userSummary).toMatchObject({
      conclusion: 'blocked',
      title: 'Cannot publish yet',
    });
    expect(blocked.userSummary.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'candidate',
          severity: 'blocker',
          nextAction: expect.objectContaining({
            label: expect.stringContaining('Resolve'),
          }),
        }),
        expect.objectContaining({
          code: 'eval',
          severity: 'blocker',
          nextAction: expect.objectContaining({
            command: expect.stringContaining('comet eval run'),
          }),
        }),
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
    expect(reviewable.userSummary).toMatchObject({
      conclusion: 'needs-confirmation',
      title: 'Ready for review approval',
    });
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
    expect(publishable.userSummary).toMatchObject({
      conclusion: 'can-publish',
      title: 'Ready to publish',
    });

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
    expect(published.userSummary).toMatchObject({
      conclusion: 'published',
      title: 'Already published',
    });
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
