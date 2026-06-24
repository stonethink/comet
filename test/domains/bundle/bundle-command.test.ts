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
  bundleFactoryGuideCommand,
  bundleFactoryInitCommand,
  bundleFactoryGenerateCommand,
  bundleFactoryProposeCommand,
  bundleFactoryResolveCommand,
  bundleListCommand,
  bundlePublishCommand,
  bundleReviewSummaryCommand,
  bundleReviewCommand,
  bundleStatusCommand,
} from '../../../app/commands/bundle.js';
import type { BundleEvalResult } from '../../../domains/bundle/eval.js';
import { createBundleDraft } from '../../../domains/bundle/draft.js';
import { loadBundle } from '../../../domains/bundle/load.js';
import { readBundleAuthoringState } from '../../../domains/bundle/state.js';

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

async function writeFactorySkill(
  projectRoot: string,
  name: string,
  options: { description?: string; flow?: string } = {},
): Promise<string> {
  const skillRoot = path.join(projectRoot, '.comet', 'skills', name);
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(
    path.join(skillRoot, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${options.description ?? `${name}.`}\n---\n# ${name}\n`,
  );
  if (options.flow) {
    await fs.mkdir(path.join(skillRoot, 'comet'), { recursive: true });
    await fs.writeFile(path.join(skillRoot, 'comet', 'flow.yaml'), options.flow, 'utf8');
  }
  return skillRoot;
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
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - demo
  - missing
`,
    );
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

  it('prints the Factory first-use guide for /comet-any', async () => {
    await writeFactorySkill(projectRoot, 'brainstorming', {
      description: 'Explore intent before implementation.',
    });

    const result = await captureJson(() =>
      bundleFactoryGuideCommand({ project: projectRoot, json: true }),
    );

    expect(result).toMatchObject({
      schemaVersion: 1,
      preference: { state: 'missing' },
      userMessage: { title: 'Start with /comet-any' },
    });

    const text = await captureText(() => bundleFactoryGuideCommand({ project: projectRoot }));
    expect(text).toContain('Preference file: missing');
    expect(text).toContain('Next step:');
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
    expect(status).toMatchObject({
      name: 'optimized-bundle',
      status: 'draft',
      resumeSummary: {
        schemaVersion: 1,
        currentStep: 'needs-eval',
        recommendedNextStep: { action: 'choose-eval-level' },
      },
    });
    expect(status.currentHash).toMatch(/^[a-f0-9]{64}$/u);
    const text = await captureText(() => bundleStatusCommand('optimized-bundle', { project: projectRoot }));
    expect(text).toContain('Current step: needs-eval');
    expect(text).toContain('User next step: Run Eval for the generated Skill');
    expect(text).toContain('Suggested user command:');
    expect(text).toContain('Backend command: comet bundle eval-plan optimized-bundle --level quick');
  });

  it('lists recoverable Bundle authoring states with next actions', async () => {
    const source = path.join(root, 'source');
    await writeBundle(source, { name: 'optimized-bundle' });

    await captureJson(() =>
      bundleDraftCreateCommand('created-bundle', { project: projectRoot, json: true }),
    );
    await captureJson(() =>
      bundleDraftOptimizeCommand(source, { project: projectRoot, json: true }),
    );

    const result = await captureJson(() => bundleListCommand({ project: projectRoot, json: true }));

    expect(result).toMatchObject({
      bundles: [
        {
          name: 'created-bundle',
          status: 'draft',
          nextAction: {
            action: 'choose-eval-level',
          },
          resumeSummary: {
            currentStep: 'needs-eval',
            recommendedNextStep: { action: 'choose-eval-level' },
          },
        },
        {
          name: 'optimized-bundle',
          status: 'draft',
          nextAction: {
            action: 'choose-eval-level',
          },
          resumeSummary: {
            currentStep: 'needs-eval',
            recommendedNextStep: { action: 'choose-eval-level' },
          },
        },
      ],
    });

    const text = await captureText(() => bundleListCommand({ project: projectRoot }));
    expect(text).toContain('created-bundle: draft');
    expect(text).toContain('Next action: choose-eval-level');
    expect(text).toContain('optimized-bundle: draft');
  });

  it('initializes factory metadata from a structured plan file', async () => {
    const skillRoot = path.join(projectRoot, '.claude', 'skills', 'brainstorming');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - brainstorming
  - writing-plans
`,
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

  it('persists project Skill preference metadata in Factory state', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: strict
prefer:
  - factory-alpha
require:
  - factory-beta
policies:
  missing: fail
  ambiguous: ask
  deviation: fail
  scripts: disclose
  hooks: disclose
`,
    );
    await writeFactorySkill(projectRoot, 'factory-alpha');
    await writeFactorySkill(projectRoot, 'factory-beta');
    const planFile = path.join(root, 'factory-preference-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a preference-backed workflow.',
          callChain: ['factory-alpha'],
        },
        null,
        2,
      ),
    );

    await bundleFactoryInitCommand('preference-backed-factory', {
      project: projectRoot,
      file: planFile,
      json: true,
    });

    const state = await readBundleAuthoringState(projectRoot, 'preference-backed-factory');
    expect(state.factory).toMatchObject({
      preferredSkills: ['factory-alpha', 'factory-beta'],
      requiredSkills: ['factory-beta'],
      preferenceMode: 'strict',
      preferencePolicies: {
        missing: 'fail',
        ambiguous: 'ask',
        deviation: 'fail',
        scripts: 'disclose',
        hooks: 'disclose',
      },
      preferencePath: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      preferenceHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it('blocks Factory init when preferences deny generated scripts or hooks', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: strict
prefer:
  - factory-alpha
policies:
  scripts: deny
  hooks: disclose
`,
    );
    await writeFactorySkill(projectRoot, 'factory-alpha');
    const planFile = path.join(root, 'factory-deny-scripts-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a denied workflow.',
          callChain: ['factory-alpha'],
        },
        null,
        2,
      ),
    );

    await expect(
      bundleFactoryInitCommand('deny-scripts-factory', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    ).rejects.toThrow(/preference policy denies scripts/iu);
  });

  it('builds a Factory proposal without writing Bundle authoring state', async () => {
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: advisory
prefer:
  - factory-alpha
`,
    );
    await writeFactorySkill(projectRoot, 'factory-alpha');
    const planFile = path.join(root, 'factory-proposal-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a proposal first.',
          callChain: ['factory-alpha'],
        },
        null,
        2,
      ),
    );

    const proposal = await captureJson(() =>
      bundleFactoryProposeCommand('proposal-factory', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    );

    expect(proposal).toMatchObject({
      name: 'proposal-factory',
      goal: 'Create a proposal first.',
      preference: {
        mode: 'advisory',
        source: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      },
      callChain: [{ skill: 'factory-alpha', preferenceIndex: 0 }],
      resolvedSkills: [{ query: 'factory-alpha', status: 'available' }],
      canGenerate: true,
    });
    await expect(readBundleAuthoringState(projectRoot, 'proposal-factory')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('prints a user-decision Factory proposal before initialization', async () => {
    await writeFactorySkill(projectRoot, 'task3-guided-brainstorming', {
      description: 'Explore intent before implementation.',
    });
    const planFile = path.join(root, 'factory-decision-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a guided planning Skill',
          preferredSkills: ['task3-guided-brainstorming'],
          callChain: [{ skill: 'task3-guided-brainstorming' }],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
        },
        null,
        2,
      ),
    );

    const proposal = await captureJson(() =>
      bundleFactoryProposeCommand('guided-planning', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    );

    expect(proposal).toMatchObject({
      schemaVersion: 1,
      name: 'guided-planning',
      canGenerate: true,
      userSummary: {
        title: 'Create guided-planning as a Comet-native Skill',
        generatedControlPlane: expect.arrayContaining([
          'SKILL.md',
          'scripts/',
          'rules/',
          'hooks/',
          'comet/checks.yaml',
          'comet/eval.yaml',
        ]),
        requiredConfirmations: expect.arrayContaining([
          expect.objectContaining({ id: 'generate-scripts' }),
          expect.objectContaining({ id: 'generate-hooks' }),
        ]),
      },
      actions: expect.arrayContaining([
        expect.objectContaining({ id: 'confirm-generate' }),
        expect.objectContaining({ id: 'revise-proposal' }),
        expect.objectContaining({ id: 'cancel' }),
      ]),
      proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });

    const text = await captureText(() =>
      bundleFactoryProposeCommand('guided-planning', {
        project: projectRoot,
        file: planFile,
      }),
    );
    expect(text).toContain('Will reuse Skills:');
    expect(text).toContain('Will generate control plane:');
    expect(text).toContain('Required confirmations:');
    expect(text).toContain('Actions:');
  });

  it('records confirmation metadata through the factory-init command', async () => {
    await writeFactorySkill(projectRoot, 'task3-command-confirmed', {
      description: 'Command confirmation test skill.',
    });
    const planFile = path.join(root, 'factory-init-confirmed-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a command-confirmed Skill',
          preferredSkills: ['task3-command-confirmed'],
          callChain: [{ skill: 'task3-command-confirmed' }],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
        },
        null,
        2,
      ),
    );

    const initialized = await captureJson(() =>
      bundleFactoryInitCommand('command-confirmed-skill', {
        project: projectRoot,
        file: planFile,
        confirmedProposal: true,
        json: true,
      }),
    );

    expect(initialized).toMatchObject({
      factory: {
        proposalConfirmation: {
          confirmed: true,
          proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
      },
    });

    const state = await readBundleAuthoringState(projectRoot, 'command-confirmed-skill');
    expect(state.factory?.proposalConfirmation).toMatchObject({
      confirmed: true,
      proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it('stores composed flow metadata and uses it as the factory call chain', async () => {
    await writeFactorySkill(projectRoot, 'task3-review-flow', {
      description: 'Review flow.',
      flow: `steps:
  - use: task3-brainstorming
  - use: task3-writing-plans
`,
    });
    await writeFactorySkill(projectRoot, 'task3-brainstorming', {
      description: 'Explore the goal.',
    });
    await writeFactorySkill(projectRoot, 'task3-writing-plans', {
      description: 'Write the plan.',
    });
    const planFile = path.join(root, 'factory-composed-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a composed review workflow.',
          preferredSkills: ['task3-review-flow', 'task3-brainstorming', 'task3-writing-plans'],
          callChain: ['task3-review-flow'],
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
      bundleFactoryInitCommand('composed-factory', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    );

    expect(initialized).toMatchObject({
      factory: {
        callChain: [
          { skill: 'task3-brainstorming', preferenceIndex: 1 },
          { skill: 'task3-writing-plans', preferenceIndex: 2 },
        ],
        composition: {
          schemaVersion: 1,
          entrySkills: ['task3-review-flow'],
          issues: [],
        },
      },
    });
  });

  it('uses plan call-chain entries for atomic composition when preferred order differs', async () => {
    await writeFactorySkill(projectRoot, 'task3-atomic-first', {
      description: 'First atomic step.',
    });
    await writeFactorySkill(projectRoot, 'task3-atomic-second', {
      description: 'Second atomic step.',
    });
    const planFile = path.join(root, 'factory-atomic-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create an atomic-only workflow.',
          preferredSkills: ['task3-atomic-first', 'task3-atomic-second'],
          callChain: ['task3-atomic-second', 'task3-atomic-first'],
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
      bundleFactoryInitCommand('atomic-composed-factory', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    );

    expect(initialized).toMatchObject({
      factory: {
        callChain: [
          { skill: 'task3-atomic-second', preferenceIndex: 1 },
          { skill: 'task3-atomic-first', preferenceIndex: 0 },
        ],
        composition: {
          schemaVersion: 1,
          entrySkills: ['task3-atomic-second', 'task3-atomic-first'],
          issues: [],
        },
      },
    });
  });

  it('recomputes post-resolve composition from the original plan entry flow', async () => {
    await writeFactorySkill(projectRoot, 'task3-entry-review-flow', {
      description: 'Review flow entry.',
      flow: `steps:
  - use: task3-entry-brainstorming
  - use: task3-entry-writing-plans
`,
    });
    const selectedBrainstormingRoot = await writeFactorySkill(
      projectRoot,
      'task3-entry-brainstorming',
      {
        description: 'Selected brainstorming.',
      },
    );
    const alternateBrainstormingRoot = path.join(
      projectRoot,
      '.claude',
      'skills',
      'task3-entry-brainstorming',
    );
    await fs.mkdir(alternateBrainstormingRoot, { recursive: true });
    await fs.writeFile(
      path.join(alternateBrainstormingRoot, 'SKILL.md'),
      '---\nname: task3-entry-brainstorming\ndescription: Alternate brainstorming.\n---\n# task3-entry-brainstorming\n',
    );
    await writeFactorySkill(projectRoot, 'task3-entry-writing-plans', {
      description: 'Write the plan.',
    });
    const planFile = path.join(root, 'factory-recompute-entry-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a resolved entry workflow.',
          preferredSkills: [
            'task3-entry-review-flow',
            'task3-entry-brainstorming',
            'task3-entry-writing-plans',
          ],
          callChain: ['task3-entry-review-flow'],
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
      bundleFactoryInitCommand('recomputed-entry-factory', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    );

    expect(initialized).toMatchObject({
      factory: {
        compositionEntrySkills: ['task3-entry-review-flow'],
        callChain: [{ skill: 'task3-entry-writing-plans', preferenceIndex: 2 }],
        composition: {
          entrySkills: ['task3-entry-review-flow'],
          issues: [
            expect.objectContaining({
              type: 'unavailable-use',
              fromSkill: 'task3-entry-review-flow',
              skill: 'task3-entry-brainstorming',
            }),
          ],
        },
        resolvedSkills: [
          { query: 'task3-entry-review-flow', status: 'available' },
          { query: 'task3-entry-brainstorming', status: 'ambiguous' },
          { query: 'task3-entry-writing-plans', status: 'available' },
        ],
      },
    });

    const resolved = await captureJson(() =>
      bundleFactoryResolveCommand('recomputed-entry-factory', {
        project: projectRoot,
        candidate: 'task3-entry-brainstorming',
        source: selectedBrainstormingRoot,
        json: true,
      }),
    );

    expect(resolved).toMatchObject({
      factory: {
        compositionEntrySkills: ['task3-entry-review-flow'],
        resolvedSkills: [
          { query: 'task3-entry-review-flow', status: 'available' },
          {
            query: 'task3-entry-brainstorming',
            status: 'available',
            sources: [{ root: selectedBrainstormingRoot }],
          },
          { query: 'task3-entry-writing-plans', status: 'available' },
        ],
      },
    });
    expect(resolved.factory).not.toHaveProperty('composition');

    const generated = await captureJson(() =>
      bundleFactoryGenerateCommand('recomputed-entry-factory', {
        project: projectRoot,
        json: true,
      }),
    );

    expect(generated).toMatchObject({
      factory: {
        compositionEntrySkills: ['task3-entry-review-flow'],
        callChain: [
          { skill: 'task3-entry-brainstorming', preferenceIndex: 1 },
          { skill: 'task3-entry-writing-plans', preferenceIndex: 2 },
        ],
        composition: {
          entrySkills: ['task3-entry-review-flow'],
          issues: [],
        },
        generatedSkillPackage: {
          entrySkill: 'recomputed-entry-factory',
        },
      },
    });
    await expect(
      fs.readFile(
        path.join(
          projectRoot,
          '.comet',
          'bundle-drafts',
          'recomputed-entry-factory',
          'skills',
          'recomputed-entry-factory',
          'comet',
          'skill.yaml',
        ),
        'utf8',
      ),
    ).resolves.toMatch(/task3-entry-brainstorming[\s\S]*task3-entry-writing-plans/u);
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
        requiredSkills: ['verification-before-completion'],
        preferenceMode: 'strict',
        preferencePolicies: {
          missing: 'fail',
          ambiguous: 'ask',
          deviation: 'fail',
          scripts: 'disclose',
          hooks: 'disclose',
        },
        preferencePath: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
        preferenceHash: 'c'.repeat(64),
        preferenceWarnings: [],
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
          controlPlane: {
            checksPath: path.join(
              projectRoot,
              '.comet',
              'bundle-drafts',
              'factory-bundle',
              'skills',
              'factory-bundle',
              'comet',
              'checks.yaml',
            ),
            evalManifestPath: path.join(
              projectRoot,
              '.comet',
              'bundle-drafts',
              'factory-bundle',
              'skills',
              'factory-bundle',
              'comet',
              'eval.yaml',
            ),
            compositionReportPath: path.join(
              projectRoot,
              '.comet',
              'bundle-drafts',
              'factory-bundle',
              'skills',
              'factory-bundle',
              'reference',
              'composition-report.md',
            ),
            scripts: [
              path.join(
                projectRoot,
                '.comet',
                'bundle-drafts',
                'factory-bundle',
                'skills',
                'factory-bundle',
                'scripts',
                'comet-plan.mjs',
              ),
              path.join(
                projectRoot,
                '.comet',
                'bundle-drafts',
                'factory-bundle',
                'skills',
                'factory-bundle',
                'scripts',
                'comet-check.mjs',
              ),
              path.join(
                projectRoot,
                '.comet',
                'bundle-drafts',
                'factory-bundle',
                'skills',
                'factory-bundle',
                'scripts',
                'comet-hook-guard.mjs',
              ),
            ],
          },
        },
      },
    });
    expect(compiled).toMatchObject({
      platform: 'claude',
      entrySkills: ['factory-bundle'],
    });
    const draftRoot = path.join(projectRoot, '.comet', 'bundle-drafts', 'factory-bundle');
    const bundleYaml = await fs.readFile(path.join(draftRoot, 'bundle.yaml'), 'utf8');
    expect(bundleYaml).toContain('name: factory-bundle');
    expect(bundleYaml).toContain('rules:');
    expect(bundleYaml).toContain('hooks:');
    expect(bundleYaml).toContain('references:');
    expect(bundleYaml).toContain('scripts:');
    const bundle = await loadBundle(draftRoot);
    expect(bundle.manifest.platforms.requires).toEqual([
      'skills',
      'scripts',
      'rules',
      'hooks',
      'references',
    ]);
    expect(bundle.manifest.resources.rules).toEqual([
      {
        id: 'factory-bundle-orchestration',
        path: 'rules/factory-bundle-orchestration.md',
        mode: 'always',
        required: true,
      },
    ]);
    expect(bundle.manifest.resources.hooks).toEqual([
      {
        id: 'factory-bundle-before-write-guard',
        path: 'hooks/factory-bundle-before-write-guard.yaml',
      },
      {
        id: 'factory-bundle-before-tool-guard',
        path: 'hooks/factory-bundle-before-tool-guard.yaml',
      },
    ]);
    expect(bundle.manifest.resources.references).toEqual([
      'skills/factory-bundle/reference/resolved-skills.json',
      'skills/factory-bundle/reference/composition-report.md',
    ]);
    expect(bundle.manifest.resources.scripts).toEqual([
      {
        id: 'comet-plan',
        path: 'skills/factory-bundle/scripts/comet-plan.mjs',
        sideEffect: 'write',
        runtime: 'node',
      },
      {
        id: 'comet-check',
        path: 'skills/factory-bundle/scripts/comet-check.mjs',
        sideEffect: 'read',
        runtime: 'node',
      },
      {
        id: 'comet-hook-guard',
        path: 'skills/factory-bundle/scripts/comet-hook-guard.mjs',
        sideEffect: 'read',
        runtime: 'node',
      },
    ]);
    await expect(
      fs.access(path.join(draftRoot, 'rules', 'factory-bundle-orchestration.md')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(draftRoot, 'hooks', 'factory-bundle-before-write-guard.yaml')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(draftRoot, 'hooks', 'factory-bundle-before-tool-guard.yaml')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(
        path.join(draftRoot, 'skills', 'factory-bundle', 'reference', 'composition-report.md'),
      ),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(draftRoot, 'skills', 'factory-bundle', 'scripts', 'comet-plan.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      fs.readFile(
        path.join(
          draftRoot,
          'skills',
          'factory-bundle',
          'comet',
          'skill.yaml',
        ),
        'utf8',
      ),
    ).resolves.toContain('kind: Skill');
    const resolvedEvidence = JSON.parse(
      await fs.readFile(
        path.join(draftRoot, 'skills', 'factory-bundle', 'reference', 'resolved-skills.json'),
        'utf8',
      ),
    ) as unknown;
    expect(resolvedEvidence).toMatchObject({
      preference: {
        mode: 'strict',
        requiredSkills: ['verification-before-completion'],
        sourceHash: 'c'.repeat(64),
      },
    });
    await expect(
      fs.readFile(
        path.join(draftRoot, 'skills', 'factory-bundle', 'reference', 'composition-report.md'),
        'utf8',
      ),
    ).resolves.toContain('Preference mode: strict');
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

  it('blocks factory generation when composition choices are unresolved', async () => {
    await writeFactorySkill(projectRoot, 'task3-choice-flow', {
      description: 'Choice flow.',
      flow: `steps:
  - choose:
      id: review
      options:
        - task3-missing-review-a
        - task3-missing-review-b
`,
    });
    const planFile = path.join(root, 'factory-choice-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a workflow with an unresolved review choice.',
          preferredSkills: ['task3-choice-flow'],
          callChain: ['task3-choice-flow'],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
        },
        null,
        2,
      ),
    );
    await bundleFactoryInitCommand('composition-blocked-factory', {
      project: projectRoot,
      file: planFile,
      json: true,
    });

    await expect(
      bundleFactoryGenerateCommand('composition-blocked-factory', {
        project: projectRoot,
        json: true,
      }),
    ).rejects.toThrow(/composition.*Choice review/iu);
  });

  it('blocks factory generation when a flow compiles duplicate final steps', async () => {
    await writeFactorySkill(projectRoot, 'task3-duplicate-flow', {
      description: 'Duplicate flow.',
      flow: `steps:
  - use: task3-duplicate-final
  - use: task3-duplicate-final
`,
    });
    await writeFactorySkill(projectRoot, 'task3-duplicate-final', {
      description: 'Final step.',
    });
    const planFile = path.join(root, 'factory-duplicate-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a workflow with duplicate final steps.',
          preferredSkills: ['task3-duplicate-flow', 'task3-duplicate-final'],
          callChain: ['task3-duplicate-flow'],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
        },
        null,
        2,
      ),
    );
    await bundleFactoryInitCommand('duplicate-composition-factory', {
      project: projectRoot,
      file: planFile,
      json: true,
    });

    await expect(
      bundleFactoryGenerateCommand('duplicate-composition-factory', {
        project: projectRoot,
        json: true,
      }),
    ).rejects.toThrow(/composition.*duplicate.*task3-duplicate-final/iu);
  });

  it('blocks factory generation when a source flow is empty', async () => {
    await writeFactorySkill(projectRoot, 'task3-empty-flow', {
      description: 'Empty flow.',
      flow: `steps: []
`,
    });
    const planFile = path.join(root, 'factory-empty-flow-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a workflow from an empty flow.',
          preferredSkills: ['task3-empty-flow'],
          callChain: ['task3-empty-flow'],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
        },
        null,
        2,
      ),
    );
    await bundleFactoryInitCommand('empty-flow-composition-factory', {
      project: projectRoot,
      file: planFile,
      json: true,
    });

    await expect(
      bundleFactoryGenerateCommand('empty-flow-composition-factory', {
        project: projectRoot,
        json: true,
      }),
    ).rejects.toThrow(/composition.*empty flow/iu);
  });

  it('blocks factory generation when a composed source flow is referenced twice', async () => {
    await writeFactorySkill(projectRoot, 'task3-duplicate-composed-entry', {
      description: 'Duplicate composed entry.',
      flow: `steps:
  - use: task3-planning-flow
  - use: task3-planning-flow
`,
    });
    await writeFactorySkill(projectRoot, 'task3-planning-flow', {
      description: 'Nested planning flow.',
      flow: `steps:
  - use: task3-planning-brainstorm
  - use: task3-planning-write
`,
    });
    await writeFactorySkill(projectRoot, 'task3-planning-brainstorm', {
      description: 'Brainstorming step.',
    });
    await writeFactorySkill(projectRoot, 'task3-planning-write', {
      description: 'Writing step.',
    });
    const planFile = path.join(root, 'factory-duplicate-composed-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a workflow with duplicate composed flow references.',
          preferredSkills: [
            'task3-duplicate-composed-entry',
            'task3-planning-flow',
            'task3-planning-brainstorm',
            'task3-planning-write',
          ],
          callChain: ['task3-duplicate-composed-entry'],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
        },
        null,
        2,
      ),
    );
    await bundleFactoryInitCommand('duplicate-composed-flow-factory', {
      project: projectRoot,
      file: planFile,
      json: true,
    });

    await expect(
      bundleFactoryGenerateCommand('duplicate-composed-flow-factory', {
        project: projectRoot,
        json: true,
      }),
    ).rejects.toThrow(/composition.*duplicate.*task3-planning-flow/iu);
  });

  it('keeps composition blocking after resolving an ambiguous candidate to a flow with unresolved choice', async () => {
    const secondRoot = path.join(projectRoot, '.claude', 'skills', 'task3-review-choice-flow');
    await writeFactorySkill(projectRoot, 'task3-review-choice-flow', {
      description: 'Atomic fallback.',
    });
    await fs.mkdir(secondRoot, { recursive: true });
    await fs.writeFile(
      path.join(secondRoot, 'SKILL.md'),
      '---\nname: task3-review-choice-flow\ndescription: Flow with unresolved choice.\n---\n# task3-review-choice-flow\n',
    );
    await fs.mkdir(path.join(secondRoot, 'comet'), { recursive: true });
    await fs.writeFile(
      path.join(secondRoot, 'comet', 'flow.yaml'),
      `steps:
  - choose:
      id: review
      options:
        - task3-missing-review-a
        - task3-missing-review-b
`,
      'utf8',
    );
    const planFile = path.join(root, 'factory-resolved-choice-plan.json');
    await fs.writeFile(
      planFile,
      JSON.stringify(
        {
          goal: 'Create a workflow whose resolved source has an unresolved choice.',
          preferredSkills: ['task3-review-choice-flow'],
          callChain: ['task3-review-choice-flow'],
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
      bundleFactoryInitCommand('resolved-composition-blocked', {
        project: projectRoot,
        file: planFile,
        json: true,
      }),
    );
    expect(initialized).toMatchObject({
      factory: {
        resolvedSkills: [{ query: 'task3-review-choice-flow', status: 'ambiguous' }],
      },
    });
    expect(initialized.factory).toMatchObject({
      composition: {
        entrySkills: ['task3-review-choice-flow'],
        issues: [],
      },
    });

    const resolved = await captureJson(() =>
      bundleFactoryResolveCommand('resolved-composition-blocked', {
        project: projectRoot,
        candidate: 'task3-review-choice-flow',
        source: secondRoot,
        json: true,
      }),
    );
    expect(resolved).toMatchObject({
      factory: {
        resolvedSkills: [
          {
            query: 'task3-review-choice-flow',
            status: 'available',
            sources: [{ root: secondRoot }],
          },
        ],
      },
    });

    await expect(
      bundleFactoryGenerateCommand('resolved-composition-blocked', {
        project: projectRoot,
        json: true,
      }),
    ).rejects.toThrow(/composition.*Choice review/iu);

    await expect(
      fs.access(
        path.join(
          projectRoot,
          '.comet',
          'bundle-drafts',
          'resolved-composition-blocked',
          'skills',
          'resolved-composition-blocked',
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
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
        composition: {
          schemaVersion: 1,
          entrySkills: ['review-flow'],
          steps: [
            {
              id: 'step-1',
              skill: 'review-flow',
              source: 'atomic',
              preferenceIndex: 0,
            },
          ],
          choices: [],
          issues: [],
        },
        engineMode: 'deterministic',
        runnerMode: 'standalone',
        generatedSkillPackage: {
          entrySkill: 'resolvable-factory',
          internalSkills: [],
          packageRoot: path.join(projectRoot, '.comet', 'bundle-drafts', 'resolvable-factory'),
          enginePath: null,
          evalManifestPath: null,
        },
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
    expect(selected.factory).not.toHaveProperty('generatedSkillPackage');
    expect(selected.factory).not.toHaveProperty('composition');
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
    expect(ignored.factory).not.toHaveProperty('generatedSkillPackage');
    expect(ignored.factory).not.toHaveProperty('composition');
  });

  it('builds a factory review summary with compile and Eval workload evidence', async () => {
    const skillRoot = path.join(projectRoot, '.claude', 'skills', 'factory-alpha');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
prefer:
  - factory-alpha
`,
    );
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

  it('points composition-blocked factory states away from factory-generate as the next action', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'factory-composition-action',
      candidates: [],
      creator: 'native',
      defaultLocale: 'zh',
      locales: ['zh', 'en'],
      engineEnabled: true,
      factory: {
        goal: 'Create a workflow with a composition issue.',
        preferredSkills: ['task3-choice-flow'],
        compositionEntrySkills: ['task3-choice-flow'],
        resolvedSkills: [
          {
            query: 'task3-choice-flow',
            preferenceIndex: 0,
            status: 'available',
            sources: [
              {
                name: 'task3-choice-flow',
                preferenceIndex: 0,
                platform: 'project',
                scope: 'project',
                origin: 'project',
                factory: { query: 'task3-choice-flow' },
                root: path.join(projectRoot, '.comet', 'skills', 'task3-choice-flow'),
                description: 'Choice flow.',
                skillMd: '# Choice flow\n',
                hash: 'c'.repeat(64),
              },
            ],
          },
        ],
        callChain: [{ skill: 'task3-choice-flow', preferenceIndex: 0 }],
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
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });

    const status = await captureJson(() =>
      bundleStatusCommand('factory-composition-action', { project: projectRoot, json: true }),
    );
    const listed = await captureJson(() => bundleListCommand({ project: projectRoot, json: true }));

    expect(status.nextAction).toMatchObject({
      action: 'fix-composition',
      backendCommand:
        'comet bundle review-summary factory-composition-action --platform <reference-platform>',
    });
    expect(status.nextAction.action).not.toBe('generate-factory-package');
    expect(String(status.nextAction.reason)).toMatch(/composition/i);
    expect(status.resumeSummary).toMatchObject({
      currentStep: 'needs-composition-fix',
      recommendedNextStep: { action: 'fix-composition' },
    });
    expect(listed).toMatchObject({
      bundles: [
        {
          name: 'factory-composition-action',
          nextAction: {
            action: 'fix-composition',
          },
          resumeSummary: {
            currentStep: 'needs-composition-fix',
            recommendedNextStep: { action: 'fix-composition' },
          },
        },
      ],
    });
    const [listedBundle] = listed.bundles as Array<{ nextAction: { reason: string } }>;
    expect(String(listedBundle!.nextAction.reason)).toMatch(/composition/i);
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
    const distributed = await captureJson(() =>
      bundleDistributeCommand('invalid-bundle', {
        project: projectRoot,
        platform: ['claude'],
        scope: 'project',
        json: true,
      }),
    );
    expect(distributed).toMatchObject({
      platforms: [
        {
          platform: 'claude',
          status: 'cancelled',
          error: expect.stringMatching(/executable|confirm/iu),
          executableDisclosures: [
            expect.objectContaining({
              id: 'protect-write',
              sideEffect: 'read',
            }),
          ],
        },
      ],
    });

    const text = await captureText(() =>
      bundleDistributeCommand('invalid-bundle', {
        project: projectRoot,
        platform: ['claude'],
        scope: 'project',
      }),
    );
    expect(text).toContain('Executable hooks:');
    expect(text).toContain('protect-write');
  });
});
