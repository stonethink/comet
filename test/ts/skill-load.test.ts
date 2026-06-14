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
});
