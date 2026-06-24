import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  bundleDraftOptimizeCommand,
  bundleEvalRecordCommand,
} from '../../../app/commands/bundle.js';
import {
  publishApproveCommand,
  publishDistributeCommand,
  publishListCommand,
  publishReviewCommand,
  publishRunCommand,
  publishStatusCommand,
} from '../../../app/commands/publish.js';
import type { BundleEvalResult } from '../../../domains/bundle/eval.js';

async function writeBundle(root: string, name: string): Promise<void> {
  await fs.mkdir(path.join(root, 'skills', 'entry'), { recursive: true });
  await fs.mkdir(path.join(root, 'hooks'), { recursive: true });
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'skills', 'entry', 'SKILL.md'),
    '---\nname: entry\ndescription: entry.\n---\n\n# entry\n',
  );
  await fs.writeFile(
    path.join(root, 'hooks', 'guard.yaml'),
    `event: before_write
matcher: Write|Edit
script: guard
failure: block
requiresConfirmation: false
`,
  );
  await fs.writeFile(path.join(root, 'scripts', 'guard.mjs'), 'process.exit(0);\n');
  await fs.writeFile(
    path.join(root, 'bundle.yaml'),
    `apiVersion: comet/v1alpha1
kind: SkillBundle
metadata:
  name: ${name}
  version: 1.0.0
  description: Publish facade fixture
  defaultLocale: en
  locales: [en]
skills:
  - id: entry
    path: skills/entry
    visibility: entry
resources:
  rules: []
  hooks:
    - id: guard
      path: hooks/guard.yaml
  references: []
  scripts:
    - id: guard
      path: scripts/guard.mjs
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

function passingResult(hash: string): BundleEvalResult {
  return {
    schemaVersion: 1,
    provider: 'native-skill-creator',
    level: 'quick',
    bundleHash: hash,
    entries: [{ id: 'entry', passed: true, passRate: 1, evidence: ['entry.json'] }],
    bundle: { compilePassed: true, safetyPassed: true, evidence: ['compile.json'] },
    benchmark: {
      cases: 2,
      baselinePassRate: 0,
      withSkillPassRate: 1,
      tokenCount: 500,
      durationMs: 1000,
    },
    passed: true,
    summary: 'Publish facade gates passed.',
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

describe('publish command facade', () => {
  let root: string;
  let projectRoot: string;
  let sourceRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-publish-command-'));
    projectRoot = path.join(root, 'project');
    sourceRoot = path.join(root, 'source');
    await writeBundle(sourceRoot, 'publish-facade');
    await bundleDraftOptimizeCommand(sourceRoot, { project: projectRoot, json: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('lists and inspects publish candidates through the facade', async () => {
    const listed = await captureJson(() =>
      publishListCommand({ project: projectRoot, json: true }),
    );
    const status = await captureJson(() =>
      publishStatusCommand('publish-facade', { project: projectRoot, json: true }),
    );

    expect(listed).toMatchObject({
      bundles: [
        expect.objectContaining({
          resumeSummary: expect.objectContaining({
            currentStep: 'needs-eval',
          }),
        }),
      ],
    });
    expect(status).toMatchObject({
      name: 'publish-facade',
      status: 'draft',
      nextAction: { action: 'choose-eval-level' },
      resumeSummary: expect.objectContaining({
        recommendedNextStep: expect.objectContaining({
          category: 'eval',
        }),
      }),
    });

    const text = await captureText(() =>
      publishStatusCommand('publish-facade', { project: projectRoot }),
    );
    expect(text).toContain('Current step: needs-eval');
    expect(text).toContain('Suggested user command:');
  });

  it('reviews, approves, publishes, and distributes through the facade', async () => {
    const status = await captureJson(() =>
      publishStatusCommand('publish-facade', { project: projectRoot, json: true }),
    );
    const resultFile = path.join(root, 'eval.json');
    await fs.writeFile(resultFile, JSON.stringify(passingResult(String(status.currentHash))));
    await bundleEvalRecordCommand('publish-facade', {
      project: projectRoot,
      result: resultFile,
      json: true,
    });

    const review = await captureJson(() =>
      publishReviewCommand('publish-facade', {
        project: projectRoot,
        platform: 'claude',
        json: true,
      }),
    );
    const approved = await captureJson(() =>
      publishApproveCommand('publish-facade', {
        project: projectRoot,
        reviewer: 'alice',
        json: true,
      }),
    );
    const published = await captureJson(() =>
      publishRunCommand('publish-facade', {
        project: projectRoot,
        platform: 'claude',
        json: true,
      }),
    );
    const distributed = await captureJson(() =>
      publishDistributeCommand('publish-facade', {
        project: projectRoot,
        platform: ['claude'],
        scope: 'project',
        confirmExecutables: true,
        json: true,
      }),
    );

    expect(review).toMatchObject({
      name: 'publish-facade',
      readiness: { state: 'reviewable' },
    });

    const reviewText = await captureText(() =>
      publishReviewCommand('publish-facade', {
        project: projectRoot,
        platform: 'claude',
      }),
    );
    expect(reviewText).toContain('Publish readiness:');
    expect(reviewText).toContain('User next steps:');

    expect(approved).toMatchObject({ status: 'review-approved' });
    expect(published).toMatchObject({ status: 'ready' });
    expect(distributed).toMatchObject({
      platforms: [
        {
          platform: 'claude',
          status: 'installed',
          executableDisclosures: [
            expect.objectContaining({
              id: expect.stringContaining('guard'),
              sideEffect: 'read',
            }),
          ],
          plannedFiles: expect.arrayContaining([
            expect.objectContaining({ kind: 'skill' }),
            expect.objectContaining({ kind: 'hook' }),
            expect.objectContaining({ kind: 'script' }),
          ]),
        },
      ],
    });

    const text = await captureText(() =>
      publishDistributeCommand('publish-facade', {
        project: projectRoot,
        platform: ['claude'],
        scope: 'project',
        confirmExecutables: true,
      }),
    );

    expect(text).toContain('Executable hooks:');
    expect(text).toContain('claude/guard:');
    expect(text).toContain('(read) ->');
  });
});
