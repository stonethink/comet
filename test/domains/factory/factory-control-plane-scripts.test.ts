import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import { generateFactorySkillPackage } from '../../../domains/factory/package.js';
import type { FactorySkillPackagePlan } from '../../../domains/factory/types.js';

function basePlan(root: string): FactorySkillPackagePlan {
  return {
    root,
    name: 'stable-workflow',
    version: '1.0.0',
    description: 'Stable workflow.',
    goal: 'Create a stable workflow.',
    defaultLocale: 'zh',
    callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
    resolvedSkills: [],
    deviations: [],
    composition: {
      schemaVersion: 1,
      entrySkills: ['stable-workflow'],
      steps: [
        {
          id: 'step-1-brainstorming',
          skill: 'brainstorming',
          source: 'atomic',
          preferenceIndex: 0,
        },
      ],
      choices: [],
      issues: [],
    },
    engineMode: 'deterministic',
  };
}

function node(script: string, args: string[], cwd: string, env?: Record<string, string | undefined>) {
  const childEnv = { ...process.env };
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value === undefined) {
      delete childEnv[key];
    } else {
      childEnv[key] = value;
    }
  }
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: childEnv,
  });
}

describe('generated factory control-plane scripts', () => {
  let root: string;
  let runRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-control-plane-scripts-'));
    runRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-control-plane-run-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(runRoot, { recursive: true, force: true });
  });

  it('validates required generated files with comet-check.mjs from a project run root', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const script = path.join(output.packageRoot, 'scripts', 'comet-check.mjs');

    const result = node(script, ['verify'], runRoot, { COMET_RUN_ROOT: runRoot });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('control-plane-ok');
  });

  it('fails closed when a required file is missing', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    await fs.rm(path.join(output.packageRoot, 'comet', 'skill.yaml'));

    const result = node(path.join(output.packageRoot, 'scripts', 'comet-check.mjs'), ['verify'], runRoot, {
      COMET_RUN_ROOT: runRoot,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('comet/skill.yaml');
  });

  it('supports init, status, and complete-step state operations from a project run root', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const script = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');
    const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');

    expect(node(script, ['init'], runRoot, { COMET_RUN_ROOT: runRoot }).status).toBe(0);
    const initialized = JSON.parse(await fs.readFile(statePath, 'utf8')) as unknown;
    expect(initialized).toMatchObject({
      schemaVersion: 1,
      status: 'running',
      currentStep: 'step-1-brainstorming',
      completedSteps: [],
      outcomes: {},
      planHash: expect.any(String),
    });
    const status = node(script, ['status'], runRoot, { COMET_RUN_ROOT: runRoot });
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('"status": "running"');
    const complete = node(
      script,
      ['complete-step', 'step-1-brainstorming', '{"accepted":true}'],
      runRoot,
      {
        COMET_RUN_ROOT: runRoot,
      },
    );
    expect(complete.status).toBe(0);
    const completed = node(script, ['status'], runRoot, { COMET_RUN_ROOT: runRoot });
    const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as unknown;

    expect(completed.status).toBe(0);
    expect(completed.stdout).toContain('step-1-brainstorming');
    expect(state).toMatchObject({
      schemaVersion: 1,
      status: 'completed',
      currentStep: null,
      completedSteps: ['step-1-brainstorming'],
      outcomes: { 'step-1-brainstorming': { accepted: true } },
      planHash: expect.any(String),
    });
  });

  it('rejects completing a step that is not the current step', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const script = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');

    expect(node(script, ['init'], runRoot, { COMET_RUN_ROOT: runRoot }).status).toBe(0);
    const result = node(script, ['complete-step', 'not-current'], runRoot, {
      COMET_RUN_ROOT: runRoot,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/currentStep|not-current/u);
  });

  it('fails status when the current plan hash drifts', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const script = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');

    expect(node(script, ['init'], runRoot, { COMET_RUN_ROOT: runRoot }).status).toBe(0);
    await fs.appendFile(path.join(output.packageRoot, 'comet', 'skill.yaml'), '\n# drift\n');
    const result = node(script, ['status'], runRoot, { COMET_RUN_ROOT: runRoot });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/plan hash|drift/u);
  });

  it('blocks hook execution when state is missing', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const result = node(
      path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'),
      ['before_write'],
      runRoot,
      { COMET_RUN_ROOT: runRoot },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('state');
  });

  it('blocks hook execution when state status is not running', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(
      statePath,
      JSON.stringify({ schemaVersion: 1, status: 'completed' }, null, 2) + '\n',
      'utf8',
    );

    const result = node(
      path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'),
      ['before_write'],
      runRoot,
      { COMET_RUN_ROOT: runRoot },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/status|running/u);
  });

  it('blocks hook execution when state JSON is invalid', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, '{not json', 'utf8');

    const result = node(
      path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'),
      ['before_write'],
      runRoot,
      { COMET_RUN_ROOT: runRoot },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/invalid|state/u);
  });

  it('allows hook execution when state status is running', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const planScript = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');
    const hookScript = path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs');
    expect(node(planScript, ['init'], runRoot, { COMET_RUN_ROOT: runRoot }).status).toBe(0);

    const result = node(hookScript, ['before_write'], runRoot, { COMET_RUN_ROOT: runRoot });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('hook-guard-ok');
  });

  it('allows before_tool hook execution when state status is running', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const planScript = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');
    const hookScript = path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs');
    expect(node(planScript, ['init'], runRoot, { COMET_RUN_ROOT: runRoot }).status).toBe(0);

    const result = node(hookScript, ['before_tool'], runRoot, { COMET_RUN_ROOT: runRoot });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('hook-guard-ok');
  });

  it('blocks hook execution after the final step completes', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const planScript = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');
    const hookScript = path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs');
    expect(node(planScript, ['init'], runRoot, { COMET_RUN_ROOT: runRoot }).status).toBe(0);
    expect(
      node(planScript, ['complete-step', 'step-1-brainstorming'], runRoot, {
        COMET_RUN_ROOT: runRoot,
      }).status,
    ).toBe(0);

    const result = node(hookScript, ['before_write'], runRoot, { COMET_RUN_ROOT: runRoot });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/status|running|completed/u);
  });

  it('blocks hook execution when the plan hash drifts', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const planScript = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');
    const hookScript = path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs');
    expect(node(planScript, ['init'], runRoot, { COMET_RUN_ROOT: runRoot }).status).toBe(0);
    await fs.appendFile(path.join(output.packageRoot, 'comet', 'skill.yaml'), '\n# drift\n');

    const result = node(hookScript, ['before_tool'], runRoot, { COMET_RUN_ROOT: runRoot });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/plan hash|drift/u);
  });

  it('uses cwd as the run root when COMET_RUN_ROOT is not set', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const planScript = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');
    const hookScript = path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs');
    const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');

    expect(node(planScript, ['init'], runRoot, { COMET_RUN_ROOT: undefined }).status).toBe(0);
    await expect(fs.access(statePath)).resolves.toBeUndefined();

    const result = node(hookScript, ['before_write'], runRoot, { COMET_RUN_ROOT: undefined });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('hook-guard-ok');
  });
});
