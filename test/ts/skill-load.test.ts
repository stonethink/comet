import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadSkillPackage } from '../../src/skill/load.js';

const skillDefinition = `apiVersion: comet/v1alpha1
kind: Skill
metadata:
  name: demo
  version: 1.0.0
  description: Demo skill
goal:
  statement: Produce a report
  inputs: []
  outputs: []
  success:
    - Report exists
orchestration:
  mode: deterministic
skills:
  - id: writing-plans
agents: []
tools:
  - id: read-report
    kind: function
    source: readReport
    sideEffect: read
  - id: publish-report
    kind: function
    source: publishReport
    sideEffect: external
    requiresConfirmation: true
`;

describe('loadSkillPackage', () => {
  let tmpDir: string;
  let skillRoot: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-load-'));
    skillRoot = path.join(tmpDir, 'demo');
    await fs.mkdir(path.join(skillRoot, 'comet'), { recursive: true });
    await fs.writeFile(path.join(skillRoot, 'SKILL.md'), '# Demo\n');
    await fs.writeFile(path.join(skillRoot, 'comet', 'skill.yaml'), skillDefinition);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('normalizes defaults when optional package files are absent', async () => {
    const pkg = await loadSkillPackage(skillRoot);

    expect(pkg.root).toBe(path.resolve(skillRoot));
    expect(pkg.definition.metadata.name).toBe('demo');
    expect(pkg.guardrails).toEqual({
      allowedSkills: ['writing-plans'],
      allowedAgents: [],
      allowedTools: ['read-report', 'publish-report'],
      maxIterations: 50,
      maxRetriesPerAction: 3,
      confirmationRequiredFor: ['publish-report'],
    });
    expect(pkg.evals).toEqual([]);
  });

  it('loads explicit guardrails and runtime evals', async () => {
    await fs.writeFile(
      path.join(skillRoot, 'comet', 'guardrails.yaml'),
      `allowedSkills:
  - writing-plans
allowedAgents: []
allowedTools: []
maxIterations: 8
maxRetriesPerAction: 2
confirmationRequiredFor: []
`,
    );
    await fs.writeFile(
      path.join(skillRoot, 'comet', 'evals.yaml'),
      `runtime:
  - id: report
    scope: completion
    type: artifact_exists
    artifact: report.md
`,
    );

    const pkg = await loadSkillPackage(skillRoot);

    expect(pkg.guardrails).toEqual({
      allowedSkills: ['writing-plans'],
      allowedAgents: [],
      allowedTools: [],
      maxIterations: 8,
      maxRetriesPerAction: 2,
      confirmationRequiredFor: [],
    });
    expect(pkg.evals).toEqual([
      {
        id: 'report',
        scope: 'completion',
        type: 'artifact_exists',
        artifact: 'report.md',
      },
    ]);
  });

  it.each([
    {
      name: 'a missing skills array',
      yaml: skillDefinition.replace(`skills:\n  - id: writing-plans\n`, ''),
    },
    {
      name: 'a non-string metadata version',
      yaml: skillDefinition.replace('version: 1.0.0', 'version: 1'),
    },
  ])('rejects skill.yaml with $name', async ({ yaml }) => {
    await fs.writeFile(path.join(skillRoot, 'comet', 'skill.yaml'), yaml);

    await expect(loadSkillPackage(skillRoot)).rejects.toThrow(/comet[\\/]skill\.yaml/);
  });

  it('rejects guardrails.yaml with a top-level sequence', async () => {
    await fs.writeFile(
      path.join(skillRoot, 'comet', 'guardrails.yaml'),
      `- allowedSkills
- writing-plans
`,
    );

    await expect(loadSkillPackage(skillRoot)).rejects.toThrow(/comet[\\/]guardrails\.yaml/);
  });

  it.each([
    {
      name: 'a top-level sequence',
      yaml: `- runtime\n- report\n`,
    },
    {
      name: 'a non-array runtime',
      yaml: `runtime:\n  id: report\n`,
    },
  ])('rejects evals.yaml with $name', async ({ yaml }) => {
    await fs.writeFile(path.join(skillRoot, 'comet', 'evals.yaml'), yaml);

    await expect(loadSkillPackage(skillRoot)).rejects.toThrow(/comet[\\/]evals\.yaml/);
  });

  it('loads a structurally complete nested skill definition', async () => {
    await fs.writeFile(
      path.join(skillRoot, 'comet', 'skill.yaml'),
      `apiVersion: comet/v1alpha1
kind: Skill
metadata:
  name: complete
  version: 1.0.0
  description: Complete skill
goal:
  statement: Produce a report
  inputs:
    - name: topic
      description: Report topic
      required: true
  outputs:
    - name: report
      description: Generated report
  success:
    - Report exists
orchestration:
  mode: deterministic
  entry: plan
  steps:
    - id: plan
      action:
        type: invoke_skill
        ref: writing-plans
        prompt: Create a plan
        question: Continue?
        options:
          - yes
          - no
      next: done
      completionEvals:
        - report
skills:
  - id: writing-plans
    source: bundled
    version: 1.0.0
agents:
  - id: writer
    role: Writes reports
    instructions: Be concise
tools:
  - id: publish-report
    kind: function
    source: publishReport
    sideEffect: external
    requiresConfirmation: true
`,
    );

    const pkg = await loadSkillPackage(skillRoot);

    expect(pkg.definition.metadata.name).toBe('complete');
    expect(pkg.definition.orchestration.steps?.[0]?.action.type).toBe('invoke_skill');
  });

  it.each([
    {
      name: 'a null skill reference',
      yaml: skillDefinition.replace(
        `skills:
  - id: writing-plans`,
        `skills:
  - null`,
      ),
      field: 'skills\\[0\\]',
    },
    {
      name: 'a scalar skill reference',
      yaml: skillDefinition.replace(
        `skills:
  - id: writing-plans`,
        `skills:
  - writing-plans`,
      ),
      field: 'skills\\[0\\]',
    },
    {
      name: 'an invalid optional skill source',
      yaml: skillDefinition.replace(
        `  - id: writing-plans`,
        `  - id: writing-plans
    source: 7`,
      ),
      field: 'skills\\[0\\]\\.source',
    },
    {
      name: 'an agent missing role',
      yaml: skillDefinition.replace(
        'agents: []',
        `agents:
  - id: writer`,
      ),
      field: 'agents\\[0\\]\\.role',
    },
    {
      name: 'an agent with a non-string id',
      yaml: skillDefinition.replace(
        'agents: []',
        `agents:
  - id: 7
    role: writer`,
      ),
      field: 'agents\\[0\\]\\.id',
    },
    {
      name: 'a non-object tool',
      yaml: skillDefinition.replace(/tools:[\s\S]*$/u, `tools:\n  - publish-report\n`),
      field: 'tools\\[0\\]',
    },
    {
      name: 'an invalid tool kind',
      yaml: skillDefinition.replace('kind: function', 'kind: command'),
      field: 'tools\\[0\\]\\.kind',
    },
    {
      name: 'an invalid tool side effect',
      yaml: skillDefinition.replace('sideEffect: read', 'sideEffect: network'),
      field: 'tools\\[0\\]\\.sideEffect',
    },
    {
      name: 'an invalid named contract',
      yaml: skillDefinition.replace(
        'inputs: []',
        `inputs:
    - name: topic
      description: Topic
      required: yes`,
      ),
      field: 'goal\\.inputs\\[0\\]\\.required',
    },
    {
      name: 'a non-string success condition',
      yaml: skillDefinition.replace(
        `success:
    - Report exists`,
        `success:
    - 7`,
      ),
      field: 'goal\\.success\\[0\\]',
    },
    {
      name: 'a malformed deterministic step action',
      yaml: skillDefinition.replace(
        `orchestration:
  mode: deterministic`,
        `orchestration:
  mode: deterministic
  steps:
    - id: plan
      action:
        type: unsupported`,
      ),
      field: 'orchestration\\.steps\\[0\\]\\.action\\.type',
    },
  ])('rejects skill.yaml with $name and reports its field path', async ({ yaml, field }) => {
    await fs.writeFile(path.join(skillRoot, 'comet', 'skill.yaml'), yaml);

    await expect(loadSkillPackage(skillRoot)).rejects.toThrow(
      new RegExp(`comet[\\\\/]skill\\.yaml.*${field}`),
    );
  });

  it.each([
    {
      name: 'a non-string array entry',
      yaml: `allowedSkills:\n  - writing-plans\n  - 7\n`,
      field: 'allowedSkills\\[1\\]',
    },
    {
      name: 'a NaN iteration budget',
      yaml: `maxIterations: .nan\n`,
      field: 'maxIterations',
    },
    {
      name: 'a non-number retry budget',
      yaml: `maxRetriesPerAction: many\n`,
      field: 'maxRetriesPerAction',
    },
  ])('rejects guardrails.yaml with $name and reports its field path', async ({ yaml, field }) => {
    await fs.writeFile(path.join(skillRoot, 'comet', 'guardrails.yaml'), yaml);

    await expect(loadSkillPackage(skillRoot)).rejects.toThrow(
      new RegExp(`comet[\\\\/]guardrails\\.yaml.*${field}`),
    );
  });

  it.each([
    {
      name: 'a null runtime eval',
      yaml: `runtime:\n  - null\n`,
      field: 'runtime\\[0\\]',
    },
    {
      name: 'a non-string eval id',
      yaml: `runtime:\n  - id: 7\n    scope: completion\n    type: artifact_exists\n`,
      field: 'runtime\\[0\\]\\.id',
    },
    {
      name: 'an invalid eval scope',
      yaml: `runtime:\n  - id: report\n    scope: final\n    type: artifact_exists\n`,
      field: 'runtime\\[0\\]\\.scope',
    },
    {
      name: 'an invalid eval type',
      yaml: `runtime:\n  - id: report\n    scope: completion\n    type: script\n`,
      field: 'runtime\\[0\\]\\.type',
    },
  ])('rejects evals.yaml with $name and reports its field path', async ({ yaml, field }) => {
    await fs.writeFile(path.join(skillRoot, 'comet', 'evals.yaml'), yaml);

    await expect(loadSkillPackage(skillRoot)).rejects.toThrow(
      new RegExp(`comet[\\\\/]evals\\.yaml.*${field}`),
    );
  });
});
