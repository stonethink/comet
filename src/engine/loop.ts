import { createHash } from 'crypto';
import type { ActionOutcome, EngineAction, RunState } from './types.js';
import { checkAction } from './guardrails.js';
import type { SkillPackage, SkillStep } from '../skill/types.js';

export interface Decision {
  state: RunState;
  action: EngineAction | null;
  reason?: string;
}

function actionId(runId: string, iteration: number, stepId: string | null): string {
  return createHash('sha256')
    .update(`${runId}:${iteration}:${stepId ?? 'adaptive'}`)
    .digest('hex')
    .slice(0, 16);
}

function stepFor(pkg: SkillPackage, id: string | null): SkillStep | undefined {
  return pkg.definition.orchestration.steps?.find((step) => step.id === id);
}

export function startRun(pkg: SkillPackage, runId: string, skillHash: string): RunState {
  return {
    runId,
    skill: pkg.definition.metadata.name,
    skillVersion: pkg.definition.metadata.version,
    skillHash,
    orchestration: pkg.definition.orchestration.mode,
    currentStep: pkg.definition.orchestration.entry ?? null,
    iteration: 0,
    pending: null,
    pendingRef: '.comet/pending-action.json',
    trajectoryRef: '.comet/trajectory.jsonl',
    contextRef: '.comet/context.md',
    artifactsRef: '.comet/artifacts.json',
    checkpointRef: '.comet/checkpoint.json',
    status: 'running',
    retries: {},
  };
}

export function decide(
  pkg: SkillPackage,
  state: RunState,
  confirmations: ReadonlySet<string>,
): Decision {
  if (state.status !== 'running') return { state, action: null, reason: `Run is ${state.status}` };
  if (state.pending)
    return { state, action: null, reason: `Action already pending: ${state.pending}` };
  if (state.orchestration === 'adaptive') {
    return { state, action: null, reason: 'Adaptive orchestration requires an Agent candidate' };
  }
  const step = stepFor(pkg, state.currentStep);
  if (!step) return { state: { ...state, status: 'completed' }, action: null };
  const action: EngineAction = {
    ...step.action,
    id: actionId(state.runId, state.iteration, step.id),
    stepId: step.id,
  };
  return acceptAction(pkg, state, action, confirmations);
}

function acceptAction(
  pkg: SkillPackage,
  state: RunState,
  action: EngineAction,
  confirmations: ReadonlySet<string>,
): Decision {
  const guard = checkAction(action, state, pkg.guardrails, confirmations);
  if (!guard.allowed) return { state, action: null, reason: guard.reason };
  return { state: { ...state, pending: action.id, status: 'waiting' }, action };
}

export function acceptAdaptiveAction(
  pkg: SkillPackage,
  state: RunState,
  action: EngineAction,
  confirmations: ReadonlySet<string>,
): Decision {
  if (state.orchestration !== 'adaptive') {
    return { state, action: null, reason: 'Run is not adaptive' };
  }
  return acceptAction(pkg, state, action, confirmations);
}

export function recordOutcome(
  pkg: SkillPackage,
  state: RunState,
  outcome: ActionOutcome,
): RunState {
  if (!state.pending || state.pending !== outcome.actionId) {
    throw new Error(`Outcome does not match pending action: ${outcome.actionId}`);
  }
  if (outcome.status === 'failed') {
    const retries = {
      ...state.retries,
      [outcome.actionId]: (state.retries[outcome.actionId] ?? 0) + 1,
    };
    return { ...state, pending: null, status: 'running', retries };
  }
  const step = stepFor(pkg, state.currentStep);
  const next = state.orchestration === 'deterministic' ? (step?.next ?? null) : state.currentStep;
  return {
    ...state,
    currentStep: next,
    iteration: state.iteration + 1,
    pending: null,
    status: next === null && state.orchestration === 'deterministic' ? 'completed' : 'running',
  };
}
