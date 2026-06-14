import { describe, expect, it } from 'vitest';
import { acceptAdaptiveAction, decide, recordOutcome, startRun } from '../../src/engine/loop.js';
import type { SkillPackage } from '../../src/skill/types.js';

function deterministic(): SkillPackage {
  return {
    root: '/repo/demo',
    definition: {
      apiVersion: 'comet/v1alpha1',
      kind: 'Skill',
      metadata: { name: 'demo', version: '1', description: 'Demo' },
      goal: { statement: 'Done', inputs: [], outputs: [], success: ['done'] },
      orchestration: {
        mode: 'deterministic',
        entry: 'plan',
        steps: [
          {
            id: 'plan',
            action: { type: 'invoke_skill', ref: 'writing-plans' },
            next: 'finish',
          },
          { id: 'finish', action: { type: 'checkpoint' } },
        ],
      },
      skills: [{ id: 'writing-plans' }],
      agents: [],
      tools: [],
    },
    guardrails: {
      allowedSkills: ['writing-plans'],
      allowedAgents: [],
      allowedTools: [],
      maxIterations: 10,
      maxRetriesPerAction: 1,
      confirmationRequiredFor: [],
    },
    evals: [],
  };
}

describe('Skill Engine loop', () => {
  it('uses one loop for deterministic steps', () => {
    const pkg = deterministic();
    let state = startRun(pkg, 'run-1', 'a'.repeat(64));
    const first = decide(pkg, state, new Set());
    expect(first.action).toMatchObject({
      type: 'invoke_skill',
      ref: 'writing-plans',
      stepId: 'plan',
    });
    state = first.state;
    state = recordOutcome(pkg, state, {
      actionId: first.action!.id,
      status: 'succeeded',
      summary: 'plan written',
    });
    expect(state.currentStep).toBe('finish');
    expect(state.iteration).toBe(1);
  });

  it('accepts a guardrail-checked adaptive candidate', () => {
    const pkg = deterministic();
    pkg.definition.orchestration = { mode: 'adaptive' };
    const state = startRun(pkg, 'run-2', 'b'.repeat(64));
    const result = acceptAdaptiveAction(
      pkg,
      state,
      { id: 'candidate', stepId: null, type: 'invoke_skill', ref: 'writing-plans' },
      new Set(),
    );
    expect(result.action?.id).toBe('candidate');
    expect(result.state.pending).toBe('candidate');
  });

  it('fails closed when a candidate violates guardrails', () => {
    const pkg = deterministic();
    pkg.definition.orchestration = { mode: 'adaptive' };
    const state = startRun(pkg, 'run-3', 'c'.repeat(64));
    const result = acceptAdaptiveAction(
      pkg,
      state,
      { id: 'candidate', stepId: null, type: 'invoke_skill', ref: 'unknown' },
      new Set(),
    );
    expect(result.action).toBeNull();
    expect(result.reason).toBe('Skill is not allowed: unknown');
  });
});
