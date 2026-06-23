import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { parse, stringify } from 'yaml';
import { optimizeBundleDraft } from '../../../domains/bundle/draft.js';
import {
  planBundleEval,
  recordBundleEval,
  validateStableFactoryControlPlane,
  type BundleEvalResult,
} from '../../../domains/bundle/eval.js';
import {
  readBundleAuthoringState,
  reconcileBundleAuthoringState,
  writeBundleAuthoringState,
} from '../../../domains/bundle/state.js';
import {
  generateBundleDraftFromFactoryState,
  initializeBundleFactoryState,
} from '../../../domains/bundle/factory.js';
import type { BundleAuthoringState, BundleCompilerIr } from '../../../domains/bundle/types.js';

function evalIr(entryCount = 1): BundleCompilerIr {
  return {
    bundle: {
      name: 'eval-bundle',
      version: '1.0.0',
      locale: 'en',
      hash: 'a'.repeat(64),
    },
    capabilities: { requires: ['skills'], optional: [] },
    skills: Array.from({ length: entryCount }, (_, index) => ({
      id: `entry-${index + 1}`,
      logicalRoot: `skills/entry-${index + 1}`,
      visibility: 'entry' as const,
      sourceRoot: path.resolve(`fixtures/skills/entry-${index + 1}`),
      files: [],
    })),
    rules: [],
    hooks: [],
    scripts: [],
    references: [],
    assets: [],
    overrides: [],
    engine: null,
  };
}

async function writeBundle(root: string, name: string): Promise<void> {
  await fs.mkdir(path.join(root, 'skills', 'entry'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'bundle.yaml'),
    `apiVersion: comet/v1alpha1
kind: SkillBundle
metadata:
  name: ${name}
  version: 1.0.0
  description: Eval fixture
  defaultLocale: en
  locales: [en]
skills:
  - id: entry
    path: skills/entry
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
  await fs.writeFile(
    path.join(root, 'skills', 'entry', 'SKILL.md'),
    '---\nname: entry\ndescription: Entry fixture.\n---\n\n# Entry\n',
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
  planRoot: string,
  name: string,
  engineMode: 'none' | 'deterministic' | 'adaptive' = 'deterministic',
): Promise<BundleAuthoringState> {
  await writeFactorySkill(projectRoot, `${name}-source`);
  const planFile = path.join(planRoot, `${name}-plan.json`);
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        goal: `Generate ${name}.`,
        preferredSkills: [`${name}-source`],
        callChain: [`${name}-source`],
        engineMode,
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

function result(bundleHash: string, overrides: Partial<BundleEvalResult> = {}): BundleEvalResult {
  return {
    schemaVersion: 1,
    provider: 'native-skill-creator',
    level: 'quick',
    bundleHash,
    entries: [
      {
        id: 'entry',
        passed: true,
        passRate: 1,
        evidence: ['entry-smoke.json'],
      },
    ],
    bundle: {
      compilePassed: true,
      safetyPassed: true,
      evidence: ['compile.json', 'safety.json'],
    },
    benchmark: {
      cases: 4,
      baselinePassRate: 0.25,
      withSkillPassRate: 1,
      tokenCount: 1200,
      durationMs: 5000,
    },
    passed: true,
    summary: 'All quick gates passed.',
    ...overrides,
  };
}

describe('Bundle Eval planning and evidence', () => {
  let root: string;
  let projectRoot: string;
  let stateHash: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-bundle-eval-'));
    projectRoot = path.join(root, 'project');
    const sourceRoot = path.join(root, 'source');
    await writeBundle(sourceRoot, 'eval-bundle');
    const state = await optimizeBundleDraft({
      projectRoot,
      name: 'eval-bundle',
      sourceRoot,
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: false,
    });
    stateHash = state.currentHash!;
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('plans descriptive quick and full workloads that scale with entry count', () => {
    expect(planBundleEval(evalIr(), 'quick')).toMatchObject({
      level: 'quick',
      components: ['static', 'entry-smoke', 'baseline', 'assertion-grading', 'platform-compile'],
      estimatedRuns: 6,
      tokenWorkload: 'low',
    });

    const largerQuick = planBundleEval(evalIr(3), 'quick');
    const full = planBundleEval(evalIr(3), 'full');
    expect(largerQuick.estimatedRuns).toBeGreaterThan(6);
    expect(largerQuick.tokenWorkload).toBe('medium');
    expect(full.estimatedRuns).toBeGreaterThan(largerQuick.estimatedRuns);
    expect(full.tokenWorkload).toBe('high');
    expect(full.components).toEqual(
      expect.arrayContaining(['trigger-accuracy', 'routing-overlap', 'blind-comparison']),
    );
    expect(full.explanation).toContain('estimate');
  });

  it('records passing evidence and advances the current hash to eval-passed', async () => {
    const resultFile = await writeResult(result(stateHash));

    const state = await recordBundleEval(projectRoot, 'eval-bundle', resultFile);

    expect(state).toMatchObject({
      status: 'eval-passed',
      eval: {
        level: 'quick',
        hash: stateHash,
        passed: true,
        resultPath: expect.stringContaining(
          path.join('.comet', 'bundle-evals', 'eval-bundle', stateHash, 'result.json'),
        ),
      },
    });
    await expect(fs.access(state.eval!.resultPath)).resolves.toBeUndefined();
  });

  it('requires one result for every entry Skill and Bundle compile/safety evidence', async () => {
    const missingEntry = await writeResult(
      result(stateHash, { entries: [] }),
      'missing-entry.json',
    );
    await expect(recordBundleEval(projectRoot, 'eval-bundle', missingEntry)).rejects.toThrow(
      /entry.*entry/iu,
    );

    const missingBundleEvidence = await writeResult(
      result(stateHash, {
        bundle: { compilePassed: true, safetyPassed: true, evidence: [] },
      }),
      'missing-bundle.json',
    );
    await expect(
      recordBundleEval(projectRoot, 'eval-bundle', missingBundleEvidence),
    ).rejects.toThrow(/bundle.*evidence/iu);
  });

  it('requires variance for full results but not quick results', async () => {
    const full = result(stateHash, {
      level: 'full',
      benchmark: {
        cases: 10,
        baselinePassRate: 0.2,
        withSkillPassRate: 0.9,
        tokenCount: 5000,
        durationMs: 20_000,
      },
    });
    const resultFile = await writeResult(full, 'full.json');

    await expect(recordBundleEval(projectRoot, 'eval-bundle', resultFile)).rejects.toThrow(
      /variance/iu,
    );
  });

  it('keeps failed Eval in draft while retaining its evidence', async () => {
    const failed = result(stateHash, {
      entries: [{ id: 'entry', passed: false, passRate: 0.5, evidence: ['failure.json'] }],
      passed: false,
      summary: 'Entry benchmark failed.',
    });

    const state = await recordBundleEval(
      projectRoot,
      'eval-bundle',
      await writeResult(failed, 'failed.json'),
    );

    expect(state).toMatchObject({
      status: 'draft',
      eval: { hash: stateHash, passed: false },
    });
    await expect(fs.access(state.eval!.resultPath)).resolves.toBeUndefined();
  });

  it('retains stale-hash evidence without allowing a lifecycle transition', async () => {
    const state = await readBundleAuthoringState(projectRoot, 'eval-bundle');
    await fs.appendFile(path.join(state.draftPath, 'skills', 'entry', 'SKILL.md'), 'changed\n');

    const recorded = await recordBundleEval(
      projectRoot,
      'eval-bundle',
      await writeResult(result(stateHash), 'stale.json'),
    );

    expect(recorded.status).toBe('draft');
    expect(recorded.currentHash).not.toBe(stateHash);
    expect(recorded.eval).toBeUndefined();
    await expect(
      fs.access(
        path.join(projectRoot, '.comet', 'bundle-evals', 'eval-bundle', stateHash, 'result.json'),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects passing eval evidence when a factory Bundle lacks required control-plane files', async () => {
    const generated = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      root,
      'stable-missing-control',
    );
    await fs.rm(
      path.join(
        generated.draftPath,
        'skills',
        'stable-missing-control',
        'scripts',
        'comet-check.mjs',
      ),
    );
    const changed = await reconcileBundleAuthoringState(projectRoot, 'stable-missing-control');
    const resultFile = await writeResult(
      result(changed.currentHash!, {
        entries: [
          {
            id: 'stable-missing-control',
            passed: true,
            passRate: 1,
            evidence: ['entry-smoke.json'],
          },
        ],
      }),
      'missing-control-plane.json',
    );

    await expect(
      recordBundleEval(projectRoot, 'stable-missing-control', resultFile),
    ).rejects.toThrow(/control plane/iu);

    await expect(
      fs.access(
        path.join(
          projectRoot,
          '.comet',
          'bundle-evals',
          'stable-missing-control',
          changed.currentHash!,
          'result.json',
        ),
      ),
    ).resolves.toBeUndefined();
    const state = await readBundleAuthoringState(projectRoot, 'stable-missing-control');
    expect(state.status).not.toBe('eval-passed');
    expect(state.eval).toBeUndefined();
  });

  it('rejects passing eval evidence when bundle.yaml drops required stable capabilities', async () => {
    const generated = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      root,
      'stable-degraded-capabilities',
    );
    const manifestPath = path.join(generated.draftPath, 'bundle.yaml');
    const manifest = parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.platforms = {
      requires: ['skills', 'scripts', 'rules', 'hooks'],
      optional: [],
      overrides: [],
    };
    await fs.writeFile(manifestPath, stringify(manifest), 'utf8');
    const changed = await reconcileBundleAuthoringState(projectRoot, 'stable-degraded-capabilities');
    const resultFile = await writeResult(
      result(changed.currentHash!, {
        entries: [
          {
            id: 'stable-degraded-capabilities',
            passed: true,
            passRate: 1,
            evidence: ['entry-smoke.json'],
          },
        ],
      }),
      'degraded-capabilities.json',
    );

    await expect(
      recordBundleEval(projectRoot, 'stable-degraded-capabilities', resultFile),
    ).rejects.toThrow(/control plane.*references|required capabilities/iu);
  });

  it('rejects passing eval evidence when a generated hook descriptor is not block-mode portable', async () => {
    const generated = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      root,
      'stable-degraded-hook',
    );
    await fs.writeFile(
      path.join(generated.draftPath, 'hooks', 'stable-degraded-hook-before-write-guard.yaml'),
      `event: before_write
matcher: Write|Edit
script: comet-hook-guard
failure: warn
requiresConfirmation: false
`,
      'utf8',
    );
    const changed = await reconcileBundleAuthoringState(projectRoot, 'stable-degraded-hook');
    const resultFile = await writeResult(
      result(changed.currentHash!, {
        entries: [
          {
            id: 'stable-degraded-hook',
            passed: true,
            passRate: 1,
            evidence: ['entry-smoke.json'],
          },
        ],
      }),
      'degraded-hook.json',
    );

    await expect(recordBundleEval(projectRoot, 'stable-degraded-hook', resultFile)).rejects.toThrow(
      /control plane[\s\S]*failure must be block/iu,
    );
  });

  it('retains failed eval evidence when a factory Bundle lacks control-plane files', async () => {
    const generated = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      root,
      'stable-failed-missing-control',
    );
    await fs.rm(
      path.join(
        generated.draftPath,
        'skills',
        'stable-failed-missing-control',
        'scripts',
        'comet-check.mjs',
      ),
    );
    const changed = await reconcileBundleAuthoringState(
      projectRoot,
      'stable-failed-missing-control',
    );
    const resultFile = await writeResult(
      result(changed.currentHash!, {
        entries: [
          {
            id: 'stable-failed-missing-control',
            passed: false,
            passRate: 0.25,
            evidence: ['entry-failure.json'],
          },
        ],
        passed: false,
        summary: 'Entry failed before control-plane completion.',
      }),
      'failed-missing-control-plane.json',
    );

    const state = await recordBundleEval(projectRoot, 'stable-failed-missing-control', resultFile);

    expect(state).toMatchObject({
      status: 'draft',
      eval: {
        hash: changed.currentHash,
        passed: false,
        resultPath: expect.stringContaining(
          path.join(
            '.comet',
            'bundle-evals',
            'stable-failed-missing-control',
            changed.currentHash!,
            'result.json',
          ),
        ),
      },
    });
    await expect(fs.access(state.eval!.resultPath)).resolves.toBeUndefined();
  });

  it('does not require Engine control-plane files for none-mode factory packages', async () => {
    const state = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      root,
      'stable-none-control',
      'none',
    );

    await expect(validateStableFactoryControlPlane(state)).resolves.toMatchObject({
      passed: true,
      errors: [],
    });
  });

  it('rejects stale generated package roots before validating old package contents', async () => {
    const generated = await createFactoryStateWithGeneratedPackage(
      projectRoot,
      root,
      'stable-stale-root',
    );
    const staleRoot = path.join(root, 'stale-generated-package');
    await fs.cp(generated.factory!.generatedSkillPackage!.packageRoot, staleRoot, {
      recursive: true,
    });
    await writeBundleAuthoringState(projectRoot, {
      ...generated,
      factory: {
        ...generated.factory!,
        generatedSkillPackage: {
          ...generated.factory!.generatedSkillPackage!,
          packageRoot: staleRoot,
        },
      },
    });
    const resultFile = await writeResult(
      result(generated.currentHash!, {
        entries: [
          {
            id: 'stable-stale-root',
            passed: true,
            passRate: 1,
            evidence: ['entry-smoke.json'],
          },
        ],
      }),
      'stale-package-root.json',
    );

    await expect(recordBundleEval(projectRoot, 'stable-stale-root', resultFile)).rejects.toThrow(
      /control plane.*packageRoot|control plane.*generated package root/iu,
    );
  });

  async function writeResult(
    value: BundleEvalResult,
    fileName = 'result-input.json',
  ): Promise<string> {
    const file = path.join(root, fileName);
    await fs.writeFile(file, JSON.stringify(value, null, 2));
    return file;
  }
});
