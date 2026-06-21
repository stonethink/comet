import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  bundleCandidatesCommand,
  bundleCompileCommand,
  bundleDistributeCommand,
  bundleDraftCreateCommand,
  bundleDraftOptimizeCommand,
  bundleEvalPlanCommand,
  bundleEvalRecordCommand,
  bundleFactoryGenerateCommand,
  bundlePublishCommand,
  bundleReviewCommand,
  bundleStatusCommand,
} from '../../src/commands/bundle.js';
import type { BundleEvalResult } from '../../src/bundle/eval.js';
import { createBundleDraft } from '../../src/bundle/draft.js';

async function writeBundle(
  root: string,
  options: { name: string; entries?: string[]; requiresHooks?: boolean },
): Promise<void> {
  const entries = options.entries ?? ['entry'];
  for (const entry of entries) {
    await fs.mkdir(path.join(root, 'skills', entry), { recursive: true });
    await fs.writeFile(
      path.join(root, 'skills', entry, 'SKILL.md'),
      `---\nname: ${entry}\ndescription: ${entry}.\n---\n\n# ${entry}\n`,
    );
  }
  await fs.writeFile(
    path.join(root, 'bundle.yaml'),
    `apiVersion: comet/v1alpha1
kind: SkillBundle
metadata:
  name: ${options.name}
  version: 1.0.0
  description: Command fixture
  defaultLocale: en
  locales: [en]
skills:
${entries
  .map(
    (entry) => `  - id: ${entry}
    path: skills/${entry}
    visibility: entry`,
  )
  .join('\n')}
resources:
  rules: []
  hooks:${
    options.requiresHooks
      ? `
    - id: protect-write
      path: hooks/protect-write.yaml`
      : ' []'
  }
  references: []
  scripts:${
    options.requiresHooks
      ? `
    - id: verify
      path: scripts/verify.mjs
      sideEffect: read
      runtime: node`
      : ' []'
  }
  assets: []
platforms:
  requires: [skills${options.requiresHooks ? ', hooks' : ''}]
  optional: []
  overrides: []
engine:
  enabled: false
`,
  );
  if (options.requiresHooks) {
    await fs.mkdir(path.join(root, 'hooks'), { recursive: true });
    await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'hooks', 'protect-write.yaml'),
      `event: before_write
matcher: Write|Edit
script: verify
failure: block
requiresConfirmation: false
`,
    );
    await fs.writeFile(path.join(root, 'scripts', 'verify.mjs'), 'process.exit(0);\n');
  }
}

function passingResult(hash: string, entries = ['entry']): BundleEvalResult {
  return {
    schemaVersion: 1,
    provider: 'native-skill-creator',
    level: 'quick',
    bundleHash: hash,
    entries: entries.map((id) => ({ id, passed: true, passRate: 1, evidence: [`${id}.json`] })),
    bundle: { compilePassed: true, safetyPassed: true, evidence: ['compile.json'] },
    benchmark: {
      cases: 2,
      baselinePassRate: 0,
      withSkillPassRate: 1,
      tokenCount: 500,
      durationMs: 1000,
    },
    passed: true,
    summary: 'Command gates passed.',
  };
}

async function captureJson(run: () => Promise<void>): Promise<Record<string, unknown>> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await run();
    return JSON.parse(log.mock.calls.map((call) => call.join(' ')).join('\n'));
  } finally {
    log.mockRestore();
  }
}

async function captureText(run: () => Promise<void>): Promise<string> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await run();
    return log.mock.calls.map((call) => call.join(' ')).join('\n');
  } finally {
    log.mockRestore();
  }
}

describe('bundle commands', () => {
  let root: string;
  let projectRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-bundle-command-'));
    projectRoot = path.join(root, 'project');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reports candidates from project preferences', async () => {
    const skillRoot = path.join(projectRoot, '.claude', 'skills', 'demo');
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, '.comet', 'skills.txt'), 'demo\nmissing\n');
    await fs.writeFile(
      path.join(skillRoot, 'SKILL.md'),
      '---\nname: demo\ndescription: Demo skill.\n---\n# Demo\n',
    );

    const result = await captureJson(() =>
      bundleCandidatesCommand({ project: projectRoot, json: true }),
    );

    expect(result).toMatchObject({
      candidates: [
        { name: 'demo', status: 'available' },
        { name: 'missing', status: 'missing' },
      ],
    });

    const text = await captureText(() => bundleCandidatesCommand({ project: projectRoot }));
    expect(text).toContain('demo: available');
    expect(text).toContain('missing: missing');
  });

  it('creates and optimizes drafts, then reports status', async () => {
    const source = path.join(root, 'source');
    await writeBundle(source, { name: 'optimized-bundle' });

    const created = await captureJson(() =>
      bundleDraftCreateCommand('created-bundle', { project: projectRoot, json: true }),
    );
    const optimized = await captureJson(() =>
      bundleDraftOptimizeCommand(source, { project: projectRoot, json: true }),
    );
    const status = await captureJson(() =>
      bundleStatusCommand('optimized-bundle', { project: projectRoot, json: true }),
    );

    expect(created).toMatchObject({ name: 'created-bundle', status: 'draft' });
    expect(optimized).toMatchObject({ name: 'optimized-bundle', status: 'draft' });
    expect(status).toMatchObject({ name: 'optimized-bundle', status: 'draft' });
    expect(status.currentHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('generates a draft bundle source from stored factory metadata', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'factory-bundle',
      candidates: [
        {
          name: 'brainstorming',
          preferenceIndex: 0,
          platform: 'codex',
          scope: 'project',
          origin: 'project',
          factory: { query: 'brainstorming' },
          root: path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
          description: 'Explore intent.',
          skillMd: '# Brainstorming\n',
          hash: 'a'.repeat(64),
        },
      ],
      creator: 'native',
      defaultLocale: 'zh',
      locales: ['zh', 'en'],
      engineEnabled: true,
      factory: {
        goal: 'Create a review-oriented Comet-native Skill.',
        preferredSkills: ['brainstorming', 'writing-plans'],
        resolvedSkills: [
          {
            query: 'brainstorming',
            preferenceIndex: 0,
            status: 'available',
            sources: [
              {
                name: 'brainstorming',
                preferenceIndex: 0,
                platform: 'codex',
                scope: 'project',
                origin: 'project',
                factory: { query: 'brainstorming' },
                root: path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
                description: 'Explore intent.',
                skillMd: '# Brainstorming\n',
                hash: 'a'.repeat(64),
              },
            ],
          },
        ],
        callChain: [
          { skill: 'brainstorming', preferenceIndex: 0 },
          { skill: 'writing-plans', preferenceIndex: 1 },
        ],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });

    const generated = await captureJson(() =>
      bundleFactoryGenerateCommand('factory-bundle', { project: projectRoot, json: true }),
    );
    const compiled = await captureJson(() =>
      bundleCompileCommand('factory-bundle', {
        project: projectRoot,
        platform: 'claude',
        json: true,
      }),
    );

    expect(generated).toMatchObject({
      name: 'factory-bundle',
      status: 'draft',
      factory: {
        generatedSkillPackage: {
          entrySkill: 'factory-bundle',
          internalSkills: [],
        },
      },
    });
    expect(compiled).toMatchObject({
      platform: 'claude',
      entrySkills: ['factory-bundle'],
    });
    await expect(
      fs.readFile(
        path.join(projectRoot, '.comet', 'bundle-drafts', 'factory-bundle', 'bundle.yaml'),
        'utf8',
      ),
    ).resolves.toContain('name: factory-bundle');
    await expect(
      fs.readFile(
        path.join(
          projectRoot,
          '.comet',
          'bundle-drafts',
          'factory-bundle',
          'skills',
          'factory-bundle',
          'comet',
          'skill.yaml',
        ),
        'utf8',
      ),
    ).resolves.toContain('kind: Skill');
  });

  it('compiles a Bundle, plans Eval, records Eval, approves, publishes, and distributes', async () => {
    const source = path.join(root, 'lifecycle-source');
    await writeBundle(source, { name: 'lifecycle-bundle' });
    await bundleDraftOptimizeCommand(source, { project: projectRoot, json: true });
    const status = await captureJson(() =>
      bundleStatusCommand('lifecycle-bundle', { project: projectRoot, json: true }),
    );

    const compiled = await captureJson(() =>
      bundleCompileCommand('lifecycle-bundle', {
        project: projectRoot,
        platform: 'claude',
        json: true,
      }),
    );
    const evalPlan = await captureJson(() =>
      bundleEvalPlanCommand('lifecycle-bundle', {
        project: projectRoot,
        level: 'quick',
        json: true,
      }),
    );
    const resultFile = path.join(root, 'eval.json');
    await fs.writeFile(resultFile, JSON.stringify(passingResult(String(status.currentHash))));
    const evaluated = await captureJson(() =>
      bundleEvalRecordCommand('lifecycle-bundle', {
        project: projectRoot,
        result: resultFile,
        json: true,
      }),
    );
    const reviewed = await captureJson(() =>
      bundleReviewCommand('lifecycle-bundle', {
        project: projectRoot,
        approve: true,
        reviewer: 'alice',
        json: true,
      }),
    );
    const published = await captureJson(() =>
      bundlePublishCommand('lifecycle-bundle', {
        project: projectRoot,
        platform: 'claude',
        json: true,
      }),
    );
    const distributed = await captureJson(() =>
      bundleDistributeCommand('lifecycle-bundle', {
        project: projectRoot,
        platform: ['claude'],
        scope: 'project',
        json: true,
      }),
    );

    expect(compiled).toMatchObject({ platform: 'claude', entrySkills: ['entry'] });
    expect(evalPlan).toMatchObject({ level: 'quick', tokenWorkload: 'low' });
    expect(evaluated).toMatchObject({ status: 'eval-passed' });
    expect(reviewed).toMatchObject({ status: 'review-approved' });
    expect(published).toMatchObject({ status: 'ready' });
    expect(distributed).toMatchObject({
      platforms: [{ platform: 'claude', status: 'installed' }],
    });
  });

  it('rejects invalid lifecycle command combinations', async () => {
    const source = path.join(root, 'invalid-source');
    await writeBundle(source, { name: 'invalid-bundle', requiresHooks: true });
    await bundleDraftOptimizeCommand(source, { project: projectRoot, json: true });

    await expect(
      bundleReviewCommand('invalid-bundle', {
        project: projectRoot,
        approve: true,
        reject: true,
      }),
    ).rejects.toThrow(/approve.*reject|reject.*approve/iu);
    await expect(
      bundlePublishCommand('invalid-bundle', {
        project: projectRoot,
        platform: 'claude',
      }),
    ).rejects.toThrow(/Eval|review/iu);
    await expect(
      bundleDistributeCommand('invalid-bundle', {
        project: projectRoot,
        scope: 'project',
      }),
    ).rejects.toThrow(/platform/iu);

    const status = await captureJson(() =>
      bundleStatusCommand('invalid-bundle', { project: projectRoot, json: true }),
    );
    const resultFile = path.join(root, 'invalid-eval.json');
    await fs.writeFile(resultFile, JSON.stringify(passingResult(String(status.currentHash))));
    await bundleEvalRecordCommand('invalid-bundle', {
      project: projectRoot,
      result: resultFile,
    });
    await bundleReviewCommand('invalid-bundle', {
      project: projectRoot,
      approve: true,
      reviewer: 'alice',
    });
    await bundlePublishCommand('invalid-bundle', {
      project: projectRoot,
      platform: 'claude',
    });
    await expect(
      bundleDistributeCommand('invalid-bundle', {
        project: projectRoot,
        platform: ['claude'],
        scope: 'project',
      }),
    ).rejects.toThrow(/executable|confirm/iu);
  });
});
