import { spawnSync } from 'child_process';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { BundleEvalResult } from '../../../domains/bundle/eval.js';
import { workflowFor as workflowDefinitionFor } from '../../helpers/workflow-plan.js';
import { ensureCliBuilt } from '../../helpers/ensure-cli-built.js';

const repositoryRoot = path.resolve('.');
const cli = path.join(repositoryRoot, 'bin', 'comet.js');

function workflowFor(name: string, skills: string[]): ReturnType<typeof workflowDefinitionFor> {
  return workflowDefinitionFor(name, skills);
}

async function writeBundle(root: string): Promise<void> {
  for (const entry of ['alpha', 'beta']) {
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
  name: e2e-bundle
  version: 1.0.0
  description: CLI E2E fixture
  defaultLocale: en
  locales: [en]
skills:
  - id: alpha
    path: skills/alpha
    visibility: entry
  - id: beta
    path: skills/beta
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

async function writeFactoryPlan(planFile: string): Promise<void> {
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        goal: 'Create a review-oriented Comet-native Skill.',
        preferredSkills: ['factory-alpha'],
        workflow: workflowFor('factory-workflow', ['factory-alpha']),
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
        defaultLocale: 'zh',
        locales: ['zh', 'en'],
        creator: 'native',
        engineEnabled: true,
      },
      null,
      2,
    ),
  );
}

async function authorSubstanceNodes(
  root: string,
  projectRoot: string,
  name: string,
): Promise<void> {
  const status = runJson('bundle', 'status', name, '--project', projectRoot);
  const unauthored = status.factory?.generatedSkillPackage?.unauthoredSubstanceNodes ?? [];
  for (const nodeSkill of unauthored) {
    const draftFile = path.join(root, `${name}-${nodeSkill}-guidance.json`);
    await fs.writeFile(
      draftFile,
      JSON.stringify({
        lane: 'skill-core',
        status: 'DONE',
        dispatchMode: 'inline',
        artifacts: [
          {
            path: `../${nodeSkill}/SKILL.md`,
            kind: 'skill',
            content:
              '### Prerequisites\n\nConfirmed goal.\n\n### Steps\n\nRun the bound Skill and record evidence.\n\n### Completion reasoning\n\nEvidence recorded and Exit Check passes.\n\n### Red flags\n\nExiting without evidence.',
          },
        ],
        claims: [
          { id: `node-skill:${nodeSkill}`, kind: 'skill', paths: [`../${nodeSkill}/SKILL.md`] },
        ],
        findings: [],
      }),
    );
    runJson(
      'bundle',
      'authoring-record',
      name,
      '--project',
      projectRoot,
      '--lane',
      'skill-core',
      '--file',
      draftFile,
    );
  }
  if (unauthored.length > 0) {
    runJson('bundle', 'factory-generate', name, '--project', projectRoot);
  }
}

function passingResult(hash: string, entrySkills: string[] = ['alpha', 'beta']): BundleEvalResult {
  return {
    schemaVersion: 1,
    provider: 'native-skill-creator',
    level: 'quick',
    bundleHash: hash,
    entries: entrySkills.map((id) => ({
      id,
      passed: true,
      passRate: 1,
      evidence: [`${id}.json`],
    })),
    bundle: { compilePassed: true, safetyPassed: true, evidence: ['compile.json'] },
    benchmark: {
      cases: 4,
      baselinePassRate: 0.25,
      withSkillPassRate: 1,
      tokenCount: 800,
      durationMs: 1500,
    },
    passed: true,
    summary: 'CLI E2E gates passed.',
  };
}

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

function runJson(...args: string[]): Record<string, unknown> {
  const result = runCli(...args, '--json');
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('comet bundle CLI end to end', () => {
  let root: string;
  let projectRoot: string;
  let sourceRoot: string;

  beforeAll(async () => {
    await ensureCliBuilt(repositoryRoot);
  }, 120_000);

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-bundle-cli-'));
    projectRoot = path.join(root, 'project');
    sourceRoot = path.join(root, 'source');
    await writeBundle(sourceRoot);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('optimizes, evaluates, approves, publishes, and distributes a Bundle', async () => {
    const draft = runJson('bundle', 'draft', 'optimize', sourceRoot, '--project', projectRoot);
    expect(draft).toMatchObject({ name: 'e2e-bundle', status: 'draft' });

    const status = runJson('bundle', 'status', 'e2e-bundle', '--project', projectRoot);
    expect(status).toMatchObject({ name: 'e2e-bundle', status: 'draft' });
    expect(status.currentHash).toMatch(/^[a-f0-9]{64}$/u);

    const compiled = runJson(
      'bundle',
      'compile',
      'e2e-bundle',
      '--project',
      projectRoot,
      '--platform',
      'claude',
    );
    expect(compiled).toMatchObject({
      platform: 'claude',
      entrySkills: ['alpha', 'beta'],
    });

    const evalPlan = runJson(
      'bundle',
      'benchmark-plan',
      'e2e-bundle',
      '--project',
      projectRoot,
      '--level',
      'quick',
    );
    expect(evalPlan).toMatchObject({ level: 'quick', tokenWorkload: 'low' });

    const resultFile = path.join(root, 'eval.json');
    await fs.writeFile(resultFile, JSON.stringify(passingResult(String(status.currentHash))));
    const evaluated = runJson(
      'bundle',
      'benchmark-record',
      'e2e-bundle',
      '--project',
      projectRoot,
      '--result',
      resultFile,
    );
    expect(evaluated).toMatchObject({ status: 'eval-passed' });

    const reviewed = runJson(
      'bundle',
      'review',
      'e2e-bundle',
      '--project',
      projectRoot,
      '--approve',
      '--reviewer',
      'alice',
    );
    expect(reviewed).toMatchObject({ status: 'review-approved' });

    const published = runJson(
      'bundle',
      'publish',
      'e2e-bundle',
      '--project',
      projectRoot,
      '--platform',
      'claude',
    );
    expect(published).toMatchObject({ status: 'ready' });

    const distributed = runJson(
      'bundle',
      'distribute',
      'e2e-bundle',
      '--project',
      projectRoot,
      '--platform',
      'claude',
      '--scope',
      'project',
    );
    expect(distributed).toMatchObject({
      platforms: [{ platform: 'claude', status: 'installed' }],
    });
    await expect(
      fs.access(path.join(projectRoot, '.claude', 'skills', 'alpha', 'SKILL.md')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(projectRoot, '.claude', 'skills', 'beta', 'SKILL.md')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(projectRoot, '.claude', 'skills', 'alpha', '.comet')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('lists recoverable authoring states through the built CLI', async () => {
    runJson('bundle', 'draft', 'create', 'recoverable-bundle', '--project', projectRoot);

    const listed = runJson('bundle', 'list', '--project', projectRoot);

    expect(listed).toMatchObject({
      bundles: [
        {
          name: 'recoverable-bundle',
          status: 'draft',
          nextAction: {
            action: 'choose-benchmark-level',
          },
        },
      ],
    });
  });

  it('exposes publish facade commands through the built CLI', async () => {
    runJson('bundle', 'draft', 'create', 'publish-facade-bundle', '--project', projectRoot);

    const listed = runJson('publish', 'list', '--project', projectRoot);
    const status = runJson('publish', 'status', 'publish-facade-bundle', '--project', projectRoot);

    expect(listed).toMatchObject({
      bundles: [
        {
          name: 'publish-facade-bundle',
          status: 'draft',
          nextAction: { action: 'choose-benchmark-level' },
        },
      ],
    });
    expect(status).toMatchObject({
      name: 'publish-facade-bundle',
      status: 'draft',
      nextAction: { action: 'choose-benchmark-level' },
    });
  });

  it('prints a JSON Skill Creator proposal before draft creation', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.comet', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
`,
    );
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    const planFile = path.join(root, 'proposal-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a proposal.',
          workflow: workflowFor('proposal-factory', ['factory-alpha']),
        },
        null,
        2,
      ),
    );

    const result = runJson(
      'bundle',
      'factory-propose',
      'proposal-factory',
      '--file',
      planFile,
      '--project',
      projectRoot,
    );

    expect(result).toMatchObject({
      name: 'proposal-factory',
      goal: 'Create a proposal.',
      preference: {
        mode: 'advisory',
        source: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      },
      callChain: [{ skill: 'factory-alpha', preferenceIndex: 0 }],
      resolvedSkills: [{ query: 'factory-alpha', status: 'available' }],
      canGenerate: true,
    });
  });

  it('shows Skill Creator language before backend details in factory proposal text', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    const planFile = path.join(root, 'factory-proposal-text-plan.json');
    await writeFactoryPlan(planFile);

    const result = runCli(
      'bundle',
      'factory-propose',
      'skill-maker-alpha',
      '--project',
      projectRoot,
      '--file',
      planFile,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('You are making: Create a new Skill');
    expect(result.stdout).toContain('Will generate:');
    expect(result.stdout).toContain('Validate:');
    expect(result.stdout).toContain('Install/enable:');
    expect(result.stdout.indexOf('You are making:')).toBeLessThan(
      result.stdout.indexOf('Advanced details:'),
    );
  });

  it('runs the factory path from plan to review summary through the CLI', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.claude', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.mkdir(path.join(projectRoot, '.codex', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
`,
    );
    await fs.writeFile(
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    await fs.writeFile(
      path.join(projectRoot, '.codex', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Project Codex alpha.\n---\n# Project Alpha\n',
    );
    const planFile = path.join(root, 'factory-plan.json');
    await writeFactoryPlan(planFile);

    const initialized = runJson(
      'bundle',
      'factory-init',
      'factory-bundle',
      '--project',
      projectRoot,
      '--file',
      planFile,
    );
    expect(initialized).toMatchObject({
      name: 'factory-bundle',
      factory: {
        resolvedSkills: [{ query: 'factory-alpha', status: 'ambiguous' }],
      },
    });

    const blocked = runCli(
      'bundle',
      'factory-generate',
      'factory-bundle',
      '--project',
      projectRoot,
      '--json',
    );
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain('unresolved factory Skill candidates');

    const resolved = runJson(
      'bundle',
      'factory-resolve',
      'factory-bundle',
      '--project',
      projectRoot,
      '--candidate',
      'factory-alpha',
      '--source',
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha'),
    );
    expect(resolved).toMatchObject({
      factory: {
        resolvedSkills: [
          {
            query: 'factory-alpha',
            status: 'available',
            sources: [{ platform: 'claude-code' }],
          },
        ],
      },
    });
    runJson(
      'bundle',
      'factory-init',
      'factory-bundle',
      '--project',
      projectRoot,
      '--file',
      planFile,
      '--confirmed-proposal',
    );

    const generated = runJson(
      'bundle',
      'factory-generate',
      'factory-bundle',
      '--project',
      projectRoot,
    );
    const compiled = runJson(
      'bundle',
      'compile',
      'factory-bundle',
      '--project',
      projectRoot,
      '--platform',
      'claude',
    );
    const quickEvalPlan = runJson(
      'bundle',
      'benchmark-plan',
      'factory-bundle',
      '--project',
      projectRoot,
      '--level',
      'quick',
    );
    const fullEvalPlan = runJson(
      'bundle',
      'benchmark-plan',
      'factory-bundle',
      '--project',
      projectRoot,
      '--level',
      'full',
    );
    const reviewSummary = runJson(
      'bundle',
      'review-summary',
      'factory-bundle',
      '--project',
      projectRoot,
      '--platform',
      'claude',
    );

    expect(generated).toMatchObject({
      name: 'factory-bundle',
      status: 'draft',
      factory: {
        generatedSkillPackage: {
          entrySkill: 'factory-bundle',
        },
      },
    });
    expect(resolved).toMatchObject({
      name: 'factory-bundle',
      factory: {
        preferredSkills: ['factory-alpha'],
        planPath: path.join(
          projectRoot,
          '.comet',
          'bundle-factory-plans',
          'factory-bundle',
          'plan.json',
        ),
        planHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
    expect(compiled).toMatchObject({
      platform: 'claude',
      entrySkills: ['factory-bundle'],
    });
    expect(quickEvalPlan).toMatchObject({ level: 'quick', tokenWorkload: 'low' });
    expect(fullEvalPlan).toMatchObject({ level: 'full', tokenWorkload: 'high' });
    expect(reviewSummary).toMatchObject({
      name: 'factory-bundle',
      compile: { platform: 'claude', entrySkills: ['factory-bundle'] },
      evalPlans: {
        quick: { level: 'quick' },
        full: { level: 'full' },
      },
    });
    await expect(
      fs.access(
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
      ),
    ).resolves.toBeUndefined();
    await expect(
      fs.readFile(
        path.join(
          projectRoot,
          '.comet',
          'bundle-drafts',
          'factory-bundle',
          'skills',
          'factory-bundle',
          'reference',
          'resolved-skills.json',
        ),
        'utf8',
      ),
    ).resolves.toContain('factory-alpha');
    await expect(
      fs.readFile(
        path.join(
          projectRoot,
          '.comet',
          'bundle-drafts',
          'factory-bundle',
          'skills',
          'factory-bundle',
          'reference',
          'resolved-skills.json',
        ),
        'utf8',
      ),
    ).resolves.toContain('Alpha factory step.');
  });

  it('recovers missing Skill Creator candidates through factory-resolve and keeps generated state invalidated', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
  - missing-skill
`,
    );
    await fs.mkdir(path.join(projectRoot, '.claude', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    const planFile = path.join(root, 'factory-missing-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a review-oriented Skill.',
          preferredSkills: ['factory-alpha', 'missing-skill'],
          workflow: workflowFor('factory-missing', ['factory-alpha', 'missing-skill']),
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
          creator: 'native',
          engineEnabled: true,
        },
        null,
        2,
      ),
    );

    const initialized = runJson(
      'bundle',
      'factory-init',
      'factory-missing',
      '--project',
      projectRoot,
      '--file',
      planFile,
    );
    expect(initialized).toMatchObject({
      factory: {
        resolvedSkills: [
          { query: 'factory-alpha', status: 'available' },
          { query: 'missing-skill', status: 'missing' },
        ],
      },
    });

    const blocked = runCli(
      'bundle',
      'factory-generate',
      'factory-missing',
      '--project',
      projectRoot,
      '--json',
    );
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain('unresolved factory Skill candidates');

    const resolved = runJson(
      'bundle',
      'factory-resolve',
      'factory-missing',
      '--project',
      projectRoot,
      '--candidate',
      'missing-skill',
      '--ignore-missing',
      '--reason',
      'The target workflow can proceed with factory-alpha only.',
    );
    expect(resolved.factory).toMatchObject({
      deviations: [expect.objectContaining({ skill: 'missing-skill', actualIndex: -1 })],
    });
    runJson(
      'bundle',
      'factory-init',
      'factory-missing',
      '--project',
      projectRoot,
      '--file',
      planFile,
      '--confirmed-proposal',
    );

    const generated = runJson(
      'bundle',
      'factory-generate',
      'factory-missing',
      '--project',
      projectRoot,
    );
    await authorSubstanceNodes(root, projectRoot, 'factory-missing');
    const summary = runJson(
      'bundle',
      'review-summary',
      'factory-missing',
      '--project',
      projectRoot,
      '--platform',
      'claude',
    );
    expect(generated.factory).toMatchObject({
      generatedSkillPackage: {
        entrySkill: 'factory-missing',
      },
    });
    expect(summary.readiness).toMatchObject({
      blockers: ['[benchmark] Benchmark evidence for the current draft hash is missing'],
    });
  });

  it('prints readiness blockers and evidence in review-summary text mode', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
  - missing-skill
`,
    );
    await fs.mkdir(path.join(projectRoot, '.claude', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    const planFile = path.join(root, 'factory-text-mode-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a review-oriented Skill.',
          preferredSkills: ['factory-alpha', 'missing-skill'],
          workflow: workflowFor('factory-text-mode', ['factory-alpha', 'missing-skill']),
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
          creator: 'native',
          engineEnabled: true,
        },
        null,
        2,
      ),
    );

    runJson(
      'bundle',
      'factory-init',
      'factory-text-mode',
      '--project',
      projectRoot,
      '--file',
      planFile,
    );
    runJson(
      'bundle',
      'factory-resolve',
      'factory-text-mode',
      '--project',
      projectRoot,
      '--candidate',
      'missing-skill',
      '--ignore-missing',
      '--reason',
      'The target workflow can proceed with factory-alpha only.',
    );
    runJson(
      'bundle',
      'factory-init',
      'factory-text-mode',
      '--project',
      projectRoot,
      '--file',
      planFile,
      '--confirmed-proposal',
    );
    runJson('bundle', 'factory-generate', 'factory-text-mode', '--project', projectRoot);

    const reviewSummary = runCli(
      'bundle',
      'review-summary',
      'factory-text-mode',
      '--project',
      projectRoot,
      '--platform',
      'claude',
    );

    expect(reviewSummary.status, reviewSummary.stderr).toBe(0);
    expect(reviewSummary.stdout).toContain('Readiness: blocked');
    expect(reviewSummary.stdout).toContain('Blockers:');
    expect(reviewSummary.stdout).toContain(
      'Benchmark evidence for the current draft hash is missing',
    );
    expect(reviewSummary.stdout).toContain('Evidence:');
  });

  it('prints review-summary warnings in text mode when eval passed but approval is missing', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.claude', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.mkdir(path.join(projectRoot, '.codex', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
`,
    );
    await fs.writeFile(
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    await fs.writeFile(
      path.join(projectRoot, '.codex', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Project Codex alpha.\n---\n# Project Alpha\n',
    );
    const planFile = path.join(root, 'factory-warning-text-mode-plan.json');
    await writeFactoryPlan(planFile);

    runJson(
      'bundle',
      'factory-init',
      'factory-warning-text-mode',
      '--project',
      projectRoot,
      '--file',
      planFile,
    );
    runJson(
      'bundle',
      'factory-resolve',
      'factory-warning-text-mode',
      '--project',
      projectRoot,
      '--candidate',
      'factory-alpha',
      '--source',
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha'),
    );
    runJson(
      'bundle',
      'factory-init',
      'factory-warning-text-mode',
      '--project',
      projectRoot,
      '--file',
      planFile,
      '--confirmed-proposal',
    );
    runJson('bundle', 'factory-generate', 'factory-warning-text-mode', '--project', projectRoot);
    await authorSubstanceNodes(root, projectRoot, 'factory-warning-text-mode');
    const status = runJson(
      'bundle',
      'status',
      'factory-warning-text-mode',
      '--project',
      projectRoot,
    );
    const resultFile = path.join(root, 'warning-text-mode-eval.json');
    await fs.writeFile(
      resultFile,
      JSON.stringify(passingResult(String(status.currentHash), ['factory-warning-text-mode'])),
    );
    runJson(
      'bundle',
      'benchmark-record',
      'factory-warning-text-mode',
      '--project',
      projectRoot,
      '--result',
      resultFile,
    );

    const reviewSummary = runCli(
      'bundle',
      'review-summary',
      'factory-warning-text-mode',
      '--project',
      projectRoot,
      '--platform',
      'claude',
    );

    expect(reviewSummary.status, reviewSummary.stderr).toBe(0);
    expect(reviewSummary.stdout).toContain('Readiness: reviewable');
    expect(reviewSummary.stdout).toContain('Warnings:');
    expect(reviewSummary.stdout).toContain('Review approval for the current draft hash is missing');
    expect(reviewSummary.stdout).toContain('Evidence:');
  });

  it('prints explicit recovery hints in bundle status text mode when eval and review are missing', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.claude', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.mkdir(path.join(projectRoot, '.codex', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
`,
    );
    await fs.writeFile(
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    await fs.writeFile(
      path.join(projectRoot, '.codex', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Project Codex alpha.\n---\n# Project Alpha\n',
    );
    const planFile = path.join(root, 'factory-status-text-mode-plan.json');
    await writeFactoryPlan(planFile);

    const initialized = runJson(
      'bundle',
      'factory-init',
      'factory-status-text-mode',
      '--project',
      projectRoot,
      '--file',
      planFile,
    );
    expect(initialized).toMatchObject({
      factory: {
        resolvedSkills: [{ query: 'factory-alpha', status: 'ambiguous' }],
      },
    });
    runJson(
      'bundle',
      'factory-resolve',
      'factory-status-text-mode',
      '--project',
      projectRoot,
      '--candidate',
      'factory-alpha',
      '--source',
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha'),
    );
    runJson(
      'bundle',
      'factory-init',
      'factory-status-text-mode',
      '--project',
      projectRoot,
      '--file',
      planFile,
      '--confirmed-proposal',
    );
    runJson('bundle', 'factory-generate', 'factory-status-text-mode', '--project', projectRoot);

    const bundleStatus = runCli(
      'bundle',
      'status',
      'factory-status-text-mode',
      '--project',
      projectRoot,
    );

    expect(bundleStatus.status, bundleStatus.stderr).toBe(0);
    expect(bundleStatus.stdout).toContain('Status: draft');
    expect(bundleStatus.stdout).toContain('Skill Creator package:');
    expect(bundleStatus.stdout).toContain(
      'Benchmark: missing; run comet bundle benchmark-plan and comet bundle benchmark-record',
    );
    expect(bundleStatus.stdout).toContain(
      'Review: missing; run comet bundle review-summary before approval',
    );
    expect(bundleStatus.stdout).toContain('Next action: choose-benchmark-level');
    expect(bundleStatus.stdout).toContain('Suggested user command: comet eval ');
    expect(bundleStatus.stdout).toContain(
      'Backend command: comet bundle benchmark-plan factory-status-text-mode --level quick',
    );
  });

  it('reports next action metadata in bundle status JSON output', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.claude', 'skills', 'factory-alpha'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
`,
    );
    await fs.writeFile(
      path.join(projectRoot, '.claude', 'skills', 'factory-alpha', 'SKILL.md'),
      '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
    );
    const planFile = path.join(root, 'factory-next-action-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a review-oriented Skill.',
          preferredSkills: ['factory-alpha'],
          workflow: workflowFor('factory-next-action', ['factory-alpha']),
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
          creator: 'native',
          engineEnabled: true,
        },
        null,
        2,
      ),
    );

    runJson(
      'bundle',
      'factory-init',
      'factory-next-action',
      '--project',
      projectRoot,
      '--file',
      planFile,
      '--confirmed-proposal',
    );
    runJson('bundle', 'factory-generate', 'factory-next-action', '--project', projectRoot);

    const status = runJson('bundle', 'status', 'factory-next-action', '--project', projectRoot);

    expect(status).toMatchObject({
      nextAction: {
        action: 'choose-benchmark-level',
        backendCommand: 'comet bundle benchmark-plan factory-next-action --level quick',
        userCommand: expect.stringContaining('comet eval '),
      },
    });
  });

  it('points unresolved factory states at factory-resolve as the next action', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - missing-skill
`,
    );
    const planFile = path.join(root, 'factory-resolve-action-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a review-oriented Skill.',
          preferredSkills: ['missing-skill'],
          workflow: workflowFor('factory-resolve-action', ['missing-skill']),
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
          creator: 'native',
          engineEnabled: true,
        },
        null,
        2,
      ),
    );

    runJson(
      'bundle',
      'factory-init',
      'factory-resolve-action',
      '--project',
      projectRoot,
      '--file',
      planFile,
    );

    const status = runCli('bundle', 'status', 'factory-resolve-action', '--project', projectRoot);

    expect(status.status, status.stderr).toBe(0);
    expect(status.stdout).toContain('Next action: resolve-candidates');
    expect(status.stdout).toContain(
      'Suggested user command: Ask /comet-any to resolve missing-skill',
    );
    expect(status.stdout).toContain(
      'Backend command: comet bundle factory-resolve factory-resolve-action --candidate missing-skill',
    );
  });
});
