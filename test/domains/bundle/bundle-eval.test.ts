import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { optimizeBundleDraft } from '../../../domains/bundle/draft.js';
import {
  planBundleEval,
  recordBundleEval,
  type BundleEvalResult,
} from '../../../domains/bundle/eval.js';
import { readBundleAuthoringState } from '../../../domains/bundle/state.js';
import type { BundleCompilerIr } from '../../../domains/bundle/types.js';

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

  async function writeResult(
    value: BundleEvalResult,
    fileName = 'result-input.json',
  ): Promise<string> {
    const file = path.join(root, fileName);
    await fs.writeFile(file, JSON.stringify(value, null, 2));
    return file;
  }
});
