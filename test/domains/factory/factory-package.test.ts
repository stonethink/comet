import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { parse } from 'yaml';
import { generateFactorySkillPackage } from '../../../domains/factory/package.js';
import type { FactorySkillPackagePlan } from '../../../domains/factory/types.js';
import {
  builtinCometFivePhaseWorkflow,
  normalizeWorkflowDefinition,
  type NormalizedWorkflowDefinition,
  type WorkflowDefinitionInput,
} from '../../../domains/workflow-contract/index.js';

const execFileAsync = promisify(execFile);

function packagePlan(options: {
  root: string;
  name: string;
  workflow: NormalizedWorkflowDefinition;
  engineMode?: FactorySkillPackagePlan['engineMode'];
}): FactorySkillPackagePlan {
  return {
    root: options.root,
    name: options.name,
    version: '1.0.0',
    description: `${options.name} workflow.`,
    goal: options.workflow.protocol.goal,
    defaultLocale: 'zh',
    callChain: options.workflow.requiredSkills.map((skill, index) => ({
      skill,
      preferenceIndex: index,
    })),
    workflowDefinition: options.workflow.input,
    workflowProtocol: options.workflow.protocol,
    skillCreator: {
      intent:
        options.workflow.protocol.kind === 'comet-five-phase-overlay'
          ? 'customize-comet'
          : 'new-skill',
    },
    resolvedSkills: [],
    deviations: [],
    engineMode: options.engineMode ?? 'deterministic',
  };
}

function customWorkflow(name: string): WorkflowDefinitionInput {
  return {
    kind: 'workflow-kernel',
    name,
    goal: 'Create a research and writing workflow.',
    customNodes: [
      {
        id: 'research',
        label: 'Research',
        kind: 'producer',
        responsibility: 'Collect research notes for the writing workflow.',
        implementation: { skill: 'research-skill', operation: 'default', scope: 'main' },
        operations: ['require', 'augment', 'override'],
        outputSchemas: ['research.notes.v1'],
        guardrails: [{ id: 'notes', label: 'Research notes exist', validation: 'artifact-exists' }],
      },
    ],
    outputSchemas: [
      {
        id: 'research.notes.v1',
        description: 'Research notes.',
        artifacts: [
          {
            id: 'notes',
            kind: 'file',
            required: true,
            paths: ['notes/*.md'],
            validations: ['artifact-exists'],
          },
        ],
        evidence: [{ id: 'summary', required: true }],
      },
    ],
  };
}

describe('Factory skill package generation', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-factory-package-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('generates workflow contract packages from Nodes and Output Schemas', async () => {
    const workflow = normalizeWorkflowDefinition({
      ...builtinCometFivePhaseWorkflow({
        name: 'team-comet',
        goal: 'Require component and review Skills in the Comet workflow.',
      }),
      nodes: {
        execute: {
          requiredSkillCalls: [
            {
              skill: 'elementui',
              reason: 'Use project component library during direct implementation.',
            },
          ],
        },
        review: {
          requiredSkillCalls: [{ skill: 'whitebox-code-standard', scope: 'review' }],
        },
      },
    });

    const output = await generateFactorySkillPackage(
      packagePlan({ root, name: 'team-comet', workflow }),
    );

    const entry = await fs.readFile(output.skillPath, 'utf8');
    const protocol = JSON.parse(
      await fs.readFile(
        path.join(output.packageRoot, 'reference', 'workflow-protocol.json'),
        'utf8',
      ),
    ) as {
      kind: string;
      nodes: Array<{ id: string; requiredSkillCalls?: Array<{ skill: string }> }>;
    };
    const skillYaml = parse(
      await fs.readFile(path.join(output.packageRoot, 'comet', 'skill.yaml'), 'utf8'),
    ) as { orchestration?: { steps?: Array<{ action?: { ref?: string } }> } };

    expect(protocol.kind).toBe('comet-five-phase-overlay');
    expect(protocol.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['execute', 'subagent-execute', 'review']),
    );
    expect(protocol.nodes.find((node) => node.id === 'execute')).toMatchObject({
      requiredSkillCalls: [expect.objectContaining({ skill: 'elementui' })],
    });
    expect(entry).toContain('## Workflow Nodes');
    expect(entry).toContain('Output Schemas');
    expect(skillYaml.orchestration?.steps?.[0]?.action?.ref).toBe('team-comet-open');

    const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-workflow-contract-run-'));
    const env = { ...process.env, COMET_RUN_ROOT: runRoot };
    const stateScript = path.join(output.packageRoot, 'scripts', 'workflow-state.mjs');
    const guardScript = path.join(output.packageRoot, 'scripts', 'workflow-guard.mjs');
    const hookGuardScript = path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs');
    try {
      await expect(
        execFileAsync(process.execPath, [hookGuardScript, 'before_write'], { env }),
      ).rejects.toThrow(/workflow state is missing/iu);

      const init = await execFileAsync(process.execPath, [stateScript, 'init'], { env });
      expect(init.stdout).toContain('NODE: open');

      const changeRoot = path.join(runRoot, 'openspec', 'changes', 'contract-test');
      await fs.mkdir(path.join(changeRoot, 'specs', 'demo'), { recursive: true });
      await fs.mkdir(path.join(runRoot, 'docs', 'superpowers', 'specs'), { recursive: true });
      await fs.mkdir(path.join(runRoot, 'docs', 'superpowers', 'plans'), { recursive: true });
      await fs.writeFile(path.join(changeRoot, '.comet.yaml'), 'phase: open\n', 'utf8');
      await fs.writeFile(
        path.join(changeRoot, 'specs', 'demo', 'spec.md'),
        '# Demo Spec\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(runRoot, 'docs', 'superpowers', 'specs', 'design.md'),
        '# Design\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(runRoot, 'docs', 'superpowers', 'plans', 'plan.md'),
        '# Plan\n',
        'utf8',
      );
      await fs.writeFile(path.join(changeRoot, 'tasks.md'), '- [x] Done\n', 'utf8');

      const hook = await execFileAsync(process.execPath, [hookGuardScript, 'before_write'], {
        env,
      });
      expect(hook.stdout).toContain('workflow-hook-guard-ok');

      await expect(
        execFileAsync(process.execPath, [guardScript, 'exit', 'open', '--apply'], { env }),
      ).rejects.toThrow(/missing evidence/iu);

      const nodeEvidence: Record<string, string> = {
        open: '{"intake-summary":"done"}',
        design: '{"design-summary":"done","user-confirmation":"yes"}',
        plan: '{"producer-summary":"done"}',
      };
      for (const node of ['open', 'design', 'plan']) {
        await execFileAsync(process.execPath, [stateScript, 'record', node, nodeEvidence[node]!], {
          env,
        });
        const exit = await execFileAsync(process.execPath, [guardScript, 'exit', node, '--apply'], {
          env,
        });
        expect(exit.stdout).toContain('ALL CHECKS PASSED');
      }

      await execFileAsync(
        process.execPath,
        [
          stateScript,
          'record',
          'execute',
          '{"implementation-summary":"done","test-evidence":"done"}',
        ],
        { env },
      );
      await expect(
        execFileAsync(process.execPath, [guardScript, 'exit', 'execute', '--apply'], { env }),
      ).rejects.toThrow(/required Skill evidence/iu);

      await execFileAsync(
        process.execPath,
        [
          stateScript,
          'record',
          'execute',
          '{"implementation-summary":"done","test-evidence":"done","completedChecks":["required-skill:execute.elementui"]}',
        ],
        { env },
      );
      const executeExit = await execFileAsync(
        process.execPath,
        [guardScript, 'exit', 'execute', '--apply'],
        { env },
      );
      expect(executeExit.stdout).toContain('NODE: subagent-execute');
    } finally {
      await fs.rm(runRoot, { recursive: true, force: true });
    }
  });

  it('renders augmentations into entry, node, and handoff outputs', async () => {
    const workflow = normalizeWorkflowDefinition({
      ...builtinCometFivePhaseWorkflow({
        name: 'augmented-comet',
        goal: 'Use grill-me as an enforced review augmentation.',
      }),
      nodes: {
        verify: {
          augmentations: [
            {
              skill: 'grill-me',
              scope: 'review',
              reason: 'Stress-test verification evidence.',
              enforcement: 'guarded',
            },
          ],
        },
      },
    });
    const output = await generateFactorySkillPackage(
      packagePlan({ root, name: 'augmented-comet', workflow }),
    );

    const entry = await fs.readFile(output.skillPath, 'utf8');
    const verifySkill = await fs.readFile(
      path.join(output.packageRoot, '..', 'augmented-comet-verify', 'SKILL.md'),
      'utf8',
    );
    const handoff = await execFileAsync(
      process.execPath,
      [path.join(output.packageRoot, 'scripts', 'workflow-handoff.mjs')],
      { env: { ...process.env, COMET_RUN_ROOT: root } },
    );

    expect(entry).toContain('Augmentations: `grill-me`');
    expect(entry).toContain('guarded');
    expect(verifySkill).toContain('## Augmentations');
    expect(verifySkill).toContain('augmentation:verify.grill-me');
    expect(handoff.stdout).toContain('"augmentations"');
    expect(handoff.stdout).toContain('"grill-me"');

    const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-augmentation-run-'));
    const env = { ...process.env, COMET_RUN_ROOT: runRoot };
    const stateScript = path.join(output.packageRoot, 'scripts', 'workflow-state.mjs');
    const guardScript = path.join(output.packageRoot, 'scripts', 'workflow-guard.mjs');
    try {
      await execFileAsync(process.execPath, [stateScript, 'init'], { env });
      await execFileAsync(
        process.execPath,
        [
          stateScript,
          'record',
          'verify',
          '{"verification-commands":"npx vitest","verification-result":"pass"}',
        ],
        { env },
      );
      await expect(
        execFileAsync(process.execPath, [guardScript, 'exit', 'verify', '--apply'], { env }),
      ).rejects.toThrow(/missing augmentation evidence/iu);

      await execFileAsync(
        process.execPath,
        [
          stateScript,
          'record',
          'verify',
          '{"verification-commands":"npx vitest","verification-result":"pass","completedChecks":["augmentation:verify.grill-me"]}',
        ],
        { env },
      );
      const exit = await execFileAsync(
        process.execPath,
        [guardScript, 'exit', 'verify', '--apply'],
        { env },
      );
      expect(exit.stdout).toContain('ALL CHECKS PASSED');
    } finally {
      await fs.rm(runRoot, { recursive: true, force: true });
    }
  });

  it('does not generate engine manifests when engine mode is none', async () => {
    const workflow = normalizeWorkflowDefinition(customWorkflow('plain-workflow'));
    const output = await generateFactorySkillPackage(
      packagePlan({ root, name: 'plain-workflow', workflow, engineMode: 'none' }),
    );

    expect(output.enginePath).toBeNull();
    expect(output.evalManifestPath).toBeNull();
    await expect(
      fs.access(path.join(output.packageRoot, 'comet', 'skill.yaml')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(output.packageRoot, 'reference', 'workflow-protocol.json')),
    ).resolves.toBeUndefined();
  });

  it('rejects package generation without a workflow contract', async () => {
    await expect(
      generateFactorySkillPackage({
        root,
        name: 'legacy-package',
        version: '1.0.0',
        description: 'Legacy package.',
        goal: 'Generate without a workflow.',
        defaultLocale: 'zh',
        callChain: [{ skill: 'research-skill', preferenceIndex: 0 }],
        resolvedSkills: [],
        deviations: [],
        engineMode: 'deterministic',
      }),
    ).rejects.toThrow(/workflowProtocol is required/iu);
  });
});
