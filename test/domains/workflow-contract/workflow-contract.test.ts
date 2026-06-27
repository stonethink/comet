import { describe, expect, it } from 'vitest';
import {
  builtinCometFivePhaseWorkflow,
  hashWorkflowProtocol,
  normalizeWorkflowDefinition,
  validateWorkflowDefinition,
} from '../../../domains/workflow-contract/index.js';

describe('workflow contract normalization', () => {
  it('normalizes the Comet five-phase template into Nodes with Output Schemas', () => {
    const workflow = normalizeWorkflowDefinition(
      builtinCometFivePhaseWorkflow({
        name: 'team-comet',
        goal: 'Use the project component library in Comet execution.',
      }),
    );

    expect(workflow.protocol.schemaVersion).toBe(1);
    expect(workflow.protocol.kind).toBe('comet-five-phase-overlay');
    expect(workflow.protocol.nodes.map((node) => node.id)).toEqual([
      'open',
      'design',
      'plan',
      'execute',
      'subagent-execute',
      'review',
      'verify',
      'archive',
    ]);
    expect(workflow.protocol.nodes.find((node) => node.id === 'open')).toMatchObject({
      kind: 'control',
      responsibility: expect.stringContaining('Intake'),
      operations: ['require', 'augment'],
      outputSchemas: ['comet.intake.v1'],
    });
    expect(workflow.protocol.nodes.find((node) => node.id === 'plan')).toMatchObject({
      kind: 'producer',
      responsibility: expect.stringContaining('implementation plan'),
      operations: ['require', 'augment', 'override'],
      outputSchemas: ['comet.plan.v1'],
    });
    expect(workflow.protocol.outputSchemas.map((schema) => schema.id)).toEqual(
      expect.arrayContaining(['comet.plan.v1', 'comet.handoff.v1', 'comet.review.v1']),
    );
  });

  it('allows required Skill calls without replacing Node implementations', () => {
    const workflow = normalizeWorkflowDefinition({
      ...builtinCometFivePhaseWorkflow({
        name: 'team-comet',
        goal: 'Require project Skills during execution.',
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
        'subagent-execute': {
          requiredSkillCalls: [{ skill: 'elementui', scope: 'handoff' }],
        },
        review: {
          requiredSkillCalls: [{ skill: 'whitebox-code-standard' }],
        },
      },
    });

    expect(workflow.protocol.nodes.find((node) => node.id === 'execute')).toMatchObject({
      implementation: { skill: 'comet-build', operation: 'default' },
      requiredSkillCalls: [expect.objectContaining({ skill: 'elementui', operation: 'require' })],
    });
    expect(workflow.requiredSkills).toEqual(
      expect.arrayContaining(['elementui', 'whitebox-code-standard']),
    );
  });

  it('rejects ordinary override of Comet control Nodes', () => {
    expect(() =>
      normalizeWorkflowDefinition({
        ...builtinCometFivePhaseWorkflow({
          name: 'unsafe-comet',
          goal: 'Replace execution.',
        }),
        nodes: {
          execute: {
            implementation: { skill: 'custom-executor', operation: 'override' },
            satisfies: ['comet.execution-evidence.v1'],
          },
        },
      }),
    ).toThrow(/execute.*control.*override/iu);
  });

  it('rejects producer override without a satisfied Output Schema', () => {
    expect(() =>
      normalizeWorkflowDefinition({
        ...builtinCometFivePhaseWorkflow({
          name: 'team-comet',
          goal: 'Replace planning.',
        }),
        nodes: {
          plan: {
            implementation: { skill: 'team-planning', operation: 'override' },
          },
        },
      }),
    ).toThrow(/plan.*Output Schema/iu);
  });

  it('accepts producer override when it satisfies the Node Output Schema', () => {
    const workflow = normalizeWorkflowDefinition({
      ...builtinCometFivePhaseWorkflow({
        name: 'team-comet',
        goal: 'Replace planning.',
      }),
      nodes: {
        plan: {
          implementation: { skill: 'team-planning', operation: 'override' },
          satisfies: ['comet.plan.v1'],
        },
      },
    });

    expect(workflow.protocol.nodes.find((node) => node.id === 'plan')).toMatchObject({
      implementation: { skill: 'team-planning', operation: 'override' },
    });
  });

  it('preserves required Skill calls declared by custom Workflow Nodes', () => {
    const workflow = normalizeWorkflowDefinition({
      kind: 'workflow-kernel',
      name: 'release-handoff',
      goal: 'Profile a change, delegate release notes, and run security review.',
      customNodes: [
        {
          id: 'delegate-notes',
          label: 'Delegate Notes',
          kind: 'handoff',
          responsibility: 'Delegate release note drafting and require returned evidence.',
          implementation: { skill: 'handoff-coordinator', operation: 'default', scope: 'handoff' },
          requiredSkillCalls: [
            {
              skill: 'release-notes',
              scope: 'handoff',
              reason: 'The delegated agent must write release notes.',
            },
          ],
          operations: ['require', 'augment'],
          outputSchemas: ['release.notes.v1'],
          guardrails: [
            { id: 'handoff-returned', label: 'Handoff returned evidence', validation: 'semantic' },
          ],
        },
      ],
      outputSchemas: [
        {
          id: 'release.notes.v1',
          description: 'Release note handoff result.',
          artifacts: [],
          evidence: [{ id: 'summary', required: true }],
        },
      ],
    });

    expect(workflow.protocol.nodes.find((node) => node.id === 'delegate-notes')).toMatchObject({
      responsibility: expect.stringContaining('Delegate'),
      requiredSkillCalls: [
        expect.objectContaining({
          skill: 'release-notes',
          operation: 'require',
          scope: 'handoff',
        }),
      ],
    });
    expect(workflow.requiredSkills).toEqual(
      expect.arrayContaining(['handoff-coordinator', 'release-notes']),
    );
  });

  it('hashes protocols deterministically', () => {
    const workflow = normalizeWorkflowDefinition(
      builtinCometFivePhaseWorkflow({ name: 'hashable-comet', goal: 'Hash protocol.' }),
    );

    expect(hashWorkflowProtocol(workflow.protocol)).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashWorkflowProtocol(workflow.protocol)).toBe(hashWorkflowProtocol(workflow.protocol));
  });

  it('returns validation findings for advanced callers', () => {
    const result = validateWorkflowDefinition({
      kind: 'comet-five-phase-overlay',
      name: 'bad-comet',
      goal: 'Bad override.',
      nodes: {
        archive: {
          implementation: { skill: 'skip-archive', operation: 'override' },
          satisfies: ['comet.archive.v1'],
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('control-node-override');
  });
});
