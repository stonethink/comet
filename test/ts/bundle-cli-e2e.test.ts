import { execFileSync, spawnSync } from 'child_process';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { BundleEvalResult } from '../../src/bundle/eval.js';

const repositoryRoot = path.resolve('.');
const cli = path.join(repositoryRoot, 'bin', 'comet.js');

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

async function writeFactoryState(projectRoot: string): Promise<void> {
  const draftPath = path.join(projectRoot, '.comet', 'bundle-drafts', 'factory-bundle');
  const statePath = path.join(projectRoot, '.comet', 'bundle-authoring', 'factory-bundle.json');
  await fs.mkdir(draftPath, { recursive: true });
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        name: 'factory-bundle',
        mode: 'create',
        status: 'draft',
        draftPath,
        currentHash: null,
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
      },
      null,
      2,
    ),
  );
}

function passingResult(hash: string): BundleEvalResult {
  return {
    schemaVersion: 1,
    provider: 'native-skill-creator',
    level: 'quick',
    bundleHash: hash,
    entries: [
      { id: 'alpha', passed: true, passRate: 1, evidence: ['alpha.json'] },
      { id: 'beta', passed: true, passRate: 1, evidence: ['beta.json'] },
    ],
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

  beforeAll(() => {
    execFileSync(process.execPath, ['build.js'], {
      cwd: repositoryRoot,
      stdio: 'pipe',
    });
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
      'eval-plan',
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
      'eval-record',
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

  it('generates a factory-authored Bundle draft and compiles it through the CLI', async () => {
    await writeFactoryState(projectRoot);

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

    expect(generated).toMatchObject({
      name: 'factory-bundle',
      status: 'draft',
      factory: {
        generatedSkillPackage: {
          entrySkill: 'factory-bundle',
        },
      },
    });
    expect(compiled).toMatchObject({
      platform: 'claude',
      entrySkills: ['factory-bundle'],
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
  });
});
