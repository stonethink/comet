import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  skillEvalCommand,
  skillInspectCommand,
  skillInstallCommand,
  skillResumeCommand,
  skillRunCommand,
  skillValidateCommand,
} from '../../src/commands/skill.js';

async function writeSkill(root: string, version = '1'): Promise<void> {
  await fs.mkdir(path.join(root, 'comet'), { recursive: true });
  await fs.writeFile(path.join(root, 'SKILL.md'), '# Demo\n');
  await fs.writeFile(
    path.join(root, 'comet', 'skill.yaml'),
    `apiVersion: comet/v1alpha1
kind: Skill
metadata:
  name: demo
  version: "${version}"
  description: Demo skill
goal:
  statement: Complete the demo
  inputs: []
  outputs: []
  success:
    - Done
orchestration:
  mode: deterministic
  entry: finish
  steps:
    - id: finish
      action:
        type: checkpoint
skills: []
agents: []
tools: []
`,
  );
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

describe('skill validate and inspect commands', () => {
  let root: string;
  let projectRoot: string;
  let skillRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-command-'));
    projectRoot = path.join(root, 'project');
    skillRoot = path.join(projectRoot, '.comet', 'skills', 'demo');
    await writeSkill(skillRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('validates a project Skill and reports its stable identity', async () => {
    const result = await captureJson(() =>
      skillValidateCommand('demo', { project: projectRoot, json: true }),
    );

    expect(result).toMatchObject({
      valid: true,
      name: 'demo',
      version: '1',
      origin: 'project',
    });
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('installs an explicit Skill into a different project', async () => {
    const targetProject = path.join(root, 'target');

    const result = await captureJson(() =>
      skillInstallCommand(skillRoot, { project: targetProject, json: true }),
    );

    expect(result).toMatchObject({
      name: 'demo',
      version: '1',
      destination: path.join(targetProject, '.comet', 'skills', 'demo'),
    });
  });

  it('runs, resumes, and evaluates a deterministic Skill as JSON', async () => {
    const changeDir = path.join(root, 'change');
    await fs.writeFile(
      path.join(skillRoot, 'comet', 'evals.yaml'),
      `runtime:
  - id: report
    scope: completion
    type: artifact_exists
    artifact: report
`,
    );

    const started = await captureJson(() =>
      skillRunCommand('demo', {
        project: projectRoot,
        change: changeDir,
        json: true,
      }),
    );
    expect(started).toMatchObject({
      state: { skill: 'demo', status: 'waiting' },
      action: { type: 'checkpoint', stepId: 'finish' },
      evals: [],
    });

    const completed = await captureJson(() =>
      skillResumeCommand({
        change: changeDir,
        status: 'succeeded',
        summary: 'Finished',
        artifact: ['report=report.md'],
        state: ['reviewed=true'],
        json: true,
      }),
    );
    expect(completed).toMatchObject({
      state: { status: 'completed' },
      action: null,
      evals: [{ evalId: 'report', passed: true }],
    });

    const evaluated = await captureJson(() =>
      skillEvalCommand({ change: changeDir, scope: 'completion', json: true }),
    );
    expect(evaluated).toMatchObject({
      scope: 'completion',
      evals: [{ evalId: 'report', passed: true }],
    });
  });

  it('explicitly upgrades a completed Run to a compatible Skill snapshot', async () => {
    const changeDir = path.join(root, 'upgrade-change');
    await skillRunCommand('demo', {
      project: projectRoot,
      change: changeDir,
      json: true,
    });
    await skillResumeCommand({
      change: changeDir,
      status: 'succeeded',
      summary: 'Finished',
      json: true,
    });
    await writeSkill(skillRoot, '2');

    const result = await captureJson(() =>
      skillResumeCommand({
        project: projectRoot,
        change: changeDir,
        upgrade: 'demo',
        json: true,
      }),
    );

    expect(result).toMatchObject({
      changed: true,
      state: { skill: 'demo', skillVersion: '2' },
    });
  });

  it('inspects orchestration, dependencies and guardrails without modifying the Skill', async () => {
    const before = await fs.readFile(path.join(skillRoot, 'comet', 'skill.yaml'), 'utf8');

    const result = await captureJson(() =>
      skillInspectCommand('demo', { project: projectRoot, json: true }),
    );

    expect(result).toMatchObject({
      name: 'demo',
      origin: 'project',
      orchestration: {
        mode: 'deterministic',
        entry: 'finish',
      },
      skills: [],
      agents: [],
      tools: [],
      evals: [],
    });
    expect(await fs.readFile(path.join(skillRoot, 'comet', 'skill.yaml'), 'utf8')).toBe(before);
  });
});
