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
  bundleFactoryInitCommand,
  bundleFactoryGenerateCommand,
  bundleFactoryResolveCommand,
  bundlePublishCommand,
  bundleReviewSummaryCommand,
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

  it('initializes factory metadata from a structured plan file', async () => {
    const skillRoot = path.join(projectRoot, '.claude', 'skills', 'brainstorming');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skills.txt'),
      'brainstorming\nwriting-plans\n',
    );
    await fs.writeFile(
      path.join(skillRoot, 'SKILL.md'),
      '---\nname: brainstorming\ndescription: Brainstorming.\n---\n# Brainstorming\n',
    );
    const planFile = path.join(root, 'factory-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a review-oriented Comet-native Skill.',
          callChain: ['brainstorming', 'writing-plans', 'requesting-code-review'],
          deviations: [
            {
              skill: 'requesting-code-review',
              expectedIndex: 2,
              actualIndex: 1,
              reason: 'Review should happen before final drafting for this workflow.',
            },
          ],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
        },
        null,
        2,
      ),
    );

    const initialized = await captureJson(() =>
      bundleFactoryInitCommand('factory-bundle', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    );

    expect(initialized).toMatchObject({
      name: 'factory-bundle',
      status: 'draft',
      defaultLocale: 'zh',
      locales: ['zh', 'en'],
      factory: {
        preferredSkills: ['brainstorming', 'writing-plans', 'requesting-code-review'],
        callChain: [
          { skill: 'brainstorming', preferenceIndex: 0 },
          { skill: 'writing-plans', preferenceIndex: 1 },
          { skill: 'requesting-code-review', preferenceIndex: 2 },
        ],
        deviations: [
          {
            skill: 'requesting-code-review',
            expectedIndex: 2,
            actualIndex: 1,
            reason: 'Review should happen before final drafting for this workflow.',
          },
        ],
      },
    });
    expect(initialized.factory).toMatchObject({
      resolvedSkills: [
        { query: 'brainstorming', status: 'ambiguous', preferenceIndex: 0 },
        { query: 'writing-plans', status: 'available', preferenceIndex: 1 },
        { query: 'requesting-code-review', status: 'available', preferenceIndex: 2 },
      ],
      planPath: path.join(
        projectRoot,
        '.comet',
        'bundle-factory-plans',
        'factory-bundle',
        'plan.json',
      ),
      planHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    await expect(
      fs.readFile(
        path.join(projectRoot, '.comet', 'bundle-factory-plans', 'factory-bundle', 'plan.json'),
        'utf8',
      ),
    ).resolves.toContain('"schemaVersion": 1');
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

  it('blocks factory generation when candidates still need user resolution', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'blocked-factory',
      candidates: [],
      creator: 'native',
      defaultLocale: 'zh',
      locales: ['zh', 'en'],
      engineEnabled: true,
      factory: {
        goal: 'Create a workflow that still has unresolved candidates.',
        preferredSkills: ['ambiguous-skill', 'missing-skill'],
        resolvedSkills: [
          {
            query: 'ambiguous-skill',
            preferenceIndex: 0,
            status: 'ambiguous',
            sources: [
              {
                name: 'ambiguous-skill',
                preferenceIndex: 0,
                platform: 'codex',
                scope: 'project',
                origin: 'project',
                factory: { query: 'ambiguous-skill' },
                root: path.join(projectRoot, '.codex', 'skills', 'ambiguous-skill'),
                description: 'First candidate.',
                skillMd: '# Ambiguous\n',
                hash: 'a'.repeat(64),
              },
              {
                name: 'ambiguous-skill',
                preferenceIndex: 0,
                platform: 'agents',
                scope: 'global',
                origin: 'global',
                factory: { query: 'ambiguous-skill' },
                root: path.join(root, 'global', 'ambiguous-skill'),
                description: 'Second candidate.',
                skillMd: '# Ambiguous\n',
                hash: 'b'.repeat(64),
              },
            ],
          },
          {
            query: 'missing-skill',
            preferenceIndex: 1,
            status: 'missing',
            sources: [],
          },
        ],
        callChain: [{ skill: 'ambiguous-skill', preferenceIndex: 0 }],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });

    await expect(
      bundleFactoryGenerateCommand('blocked-factory', { project: projectRoot, json: true }),
    ).rejects.toThrow(/ambiguous-skill.*missing-skill|missing-skill.*ambiguous-skill/iu);
  });

  it('resolves ambiguous and ignored missing factory candidates through command state updates', async () => {
    const firstRoot = path.join(projectRoot, '.codex', 'skills', 'review-flow');
    const secondRoot = path.join(projectRoot, '.claude', 'skills', 'review-flow');
    await createBundleDraft({
      projectRoot,
      name: 'resolvable-factory',
      candidates: [],
      creator: 'native',
      defaultLocale: 'zh',
      locales: ['zh', 'en'],
      engineEnabled: true,
      factory: {
        goal: 'Create a workflow that can recover candidate choices.',
        preferredSkills: ['review-flow', 'optional-missing'],
        resolvedSkills: [
          {
            query: 'review-flow',
            preferenceIndex: 0,
            status: 'ambiguous',
            sources: [
              {
                name: 'review-flow',
                preferenceIndex: 0,
                platform: 'codex',
                scope: 'project',
                origin: 'project',
                factory: { query: 'review-flow' },
                root: firstRoot,
                description: 'First candidate.',
                skillMd: '# First\n',
                hash: 'a'.repeat(64),
              },
              {
                name: 'review-flow',
                preferenceIndex: 0,
                platform: 'claude',
                scope: 'project',
                origin: 'project',
                factory: { query: 'review-flow' },
                root: secondRoot,
                description: 'Second candidate.',
                skillMd: '# Second\n',
                hash: 'b'.repeat(64),
              },
            ],
          },
          {
            query: 'optional-missing',
            preferenceIndex: 1,
            status: 'missing',
            sources: [],
          },
        ],
        callChain: [
          { skill: 'review-flow', preferenceIndex: 0 },
          { skill: 'optional-missing', preferenceIndex: 1 },
        ],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });

    const selected = await captureJson(() =>
      bundleFactoryResolveCommand('resolvable-factory', {
        project: projectRoot,
        candidate: 'review-flow',
        source: secondRoot,
        json: true,
      }),
    );
    const ignored = await captureJson(() =>
      bundleFactoryResolveCommand('resolvable-factory', {
        project: projectRoot,
        candidate: 'optional-missing',
        ignoreMissing: true,
        reason: 'The optional preference is not required for this generated Skill.',
        json: true,
      }),
    );

    expect(selected).toMatchObject({
      factory: {
        resolvedSkills: [
          {
            query: 'review-flow',
            status: 'available',
            sources: [{ root: secondRoot, hash: 'b'.repeat(64) }],
          },
          { query: 'optional-missing', status: 'missing' },
        ],
      },
    });
    expect(ignored).toMatchObject({
      factory: {
        preferredSkills: ['review-flow'],
        resolvedSkills: [{ query: 'review-flow', status: 'available' }],
        callChain: [{ skill: 'review-flow', preferenceIndex: 0 }],
        deviations: [
          {
            skill: 'optional-missing',
            expectedIndex: 1,
            actualIndex: -1,
            reason: 'The optional preference is not required for this generated Skill.',
          },
        ],
      },
    });
  });

  it('builds a factory review summary with compile and Eval workload evidence', async () => {
    const skillRoot = path.join(projectRoot, '.claude', 'skills', 'factory-alpha');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(projectRoot, '.comet', 'skills.txt'), 'factory-alpha\n');
    await fs.writeFile(
      path.join(skillRoot, 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    const planFile = path.join(root, 'review-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify({
        goal: 'Create a reviewable factory Skill.',
        callChain: ['factory-alpha'],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
        defaultLocale: 'zh',
        locales: ['zh', 'en'],
      }),
    );
    await bundleFactoryInitCommand('review-factory', {
      project: projectRoot,
      file: planFile,
      json: true,
    });
    await bundleFactoryGenerateCommand('review-factory', { project: projectRoot, json: true });

    const summary = await captureJson(() =>
      bundleReviewSummaryCommand('review-factory', {
        project: projectRoot,
        platform: 'claude',
        json: true,
      }),
    );

    expect(summary).toMatchObject({
      schemaVersion: 1,
      name: 'review-factory',
      status: 'draft',
      factory: {
        goal: 'Create a reviewable factory Skill.',
        planPath: path.join(
          projectRoot,
          '.comet',
          'bundle-factory-plans',
          'review-factory',
          'plan.json',
        ),
        planHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        generatedSkillPackage: {
          entrySkill: 'review-factory',
        },
      },
      compile: {
        platform: 'claude',
        entrySkills: ['review-factory'],
      },
      evalPlans: {
        quick: { level: 'quick', tokenWorkload: 'low' },
        full: { level: 'full', tokenWorkload: 'high' },
      },
      eval: null,
      review: null,
    });
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
