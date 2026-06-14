import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { parse, stringify } from 'yaml';
import type { RunState } from './types.js';

export type StateDocument = Record<string, unknown>;

const field = (doc: StateDocument, key: string): string | null => {
  const value = doc[key];
  return value === null || value === undefined ? null : String(value);
};

function requiredString(doc: StateDocument, key: string): string {
  const value = doc[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid Run state: ${key} must be a non-empty string`);
  }
  return value;
}

function retries(doc: StateDocument): Record<string, number> {
  const raw = doc.run_retries ?? '{}';
  let value: unknown;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    throw new Error('Invalid Run state: run_retries must be a JSON object', { cause: error });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Run state: run_retries must be a JSON object');
  }
  for (const count of Object.values(value)) {
    if (!Number.isInteger(count) || Number(count) < 0) {
      throw new Error('Invalid Run state: retry counts must be non-negative integers');
    }
  }
  return value as Record<string, number>;
}

export function runStateFromDocument(doc: StateDocument): RunState | null {
  if (!doc.run_id) return null;
  const runId = requiredString(doc, 'run_id');
  const skill = requiredString(doc, 'skill');
  const skillVersion = requiredString(doc, 'skill_version');
  const skillHash = requiredString(doc, 'skill_hash');
  const pendingRef = requiredString(doc, 'pending_ref');
  const trajectoryRef = requiredString(doc, 'trajectory_ref');
  const contextRef = requiredString(doc, 'context_ref');
  const artifactsRef = requiredString(doc, 'artifacts_ref');
  const checkpointRef = requiredString(doc, 'checkpoint_ref');
  const iteration = Number(doc.iteration);
  if (!Number.isInteger(iteration) || iteration < 0) {
    throw new Error('Invalid Run state: iteration must be a non-negative integer');
  }
  if (doc.orchestration !== 'deterministic' && doc.orchestration !== 'adaptive') {
    throw new Error('Invalid Run state: orchestration must be deterministic or adaptive');
  }
  if (
    doc.run_status !== 'running' &&
    doc.run_status !== 'waiting' &&
    doc.run_status !== 'completed' &&
    doc.run_status !== 'failed'
  ) {
    throw new Error('Invalid Run state: run_status is invalid');
  }
  return {
    runId,
    skill,
    skillVersion,
    skillHash,
    orchestration: doc.orchestration,
    currentStep: field(doc, 'current_step'),
    iteration,
    pending: field(doc, 'pending'),
    pendingRef,
    trajectoryRef,
    contextRef,
    artifactsRef,
    checkpointRef,
    status: doc.run_status,
    retries: retries(doc),
  };
}

export function applyRunStateToDocument(doc: StateDocument, state: RunState): void {
  Object.assign(doc, {
    run_id: state.runId,
    skill: state.skill,
    skill_version: state.skillVersion,
    skill_hash: state.skillHash,
    orchestration: state.orchestration,
    current_step: state.currentStep,
    iteration: state.iteration,
    pending: state.pending,
    pending_ref: state.pendingRef,
    trajectory_ref: state.trajectoryRef,
    context_ref: state.contextRef,
    artifacts_ref: state.artifactsRef,
    checkpoint_ref: state.checkpointRef,
    run_status: state.status,
    run_retries: JSON.stringify(state.retries),
  });
}

export async function readRunState(changeDir: string): Promise<RunState | null> {
  const file = path.join(changeDir, '.comet.yaml');
  const doc = parse(await fs.readFile(file, 'utf8')) as StateDocument;
  return runStateFromDocument(doc);
}

export async function writeRunState(changeDir: string, state: RunState): Promise<void> {
  const file = path.join(changeDir, '.comet.yaml');
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    raw = '';
  }
  const doc = (raw ? parse(raw) : {}) as StateDocument;
  applyRunStateToDocument(doc, state);

  await fs.mkdir(changeDir, { recursive: true });
  const temporary = path.join(changeDir, `.comet.yaml.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, stringify(doc), 'utf8');
  await fs.rename(temporary, file);
}
