import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { parse, stringify } from 'yaml';
import type { RunState } from './types.js';

type StateDocument = Record<string, unknown>;

const field = (doc: StateDocument, key: string): string | null => {
  const value = doc[key];
  return value === null || value === undefined ? null : String(value);
};

export async function readRunState(changeDir: string): Promise<RunState | null> {
  const file = path.join(changeDir, '.comet.yaml');
  const doc = parse(await fs.readFile(file, 'utf8')) as StateDocument;
  if (!doc.run_id) return null;
  return {
    runId: String(doc.run_id),
    skill: String(doc.skill),
    skillVersion: String(doc.skill_version),
    skillHash: String(doc.skill_hash),
    orchestration: doc.orchestration as RunState['orchestration'],
    currentStep: field(doc, 'current_step'),
    iteration: Number(doc.iteration ?? 0),
    pending: field(doc, 'pending'),
    pendingRef: String(doc.pending_ref),
    trajectoryRef: String(doc.trajectory_ref),
    contextRef: String(doc.context_ref),
    artifactsRef: String(doc.artifacts_ref),
    checkpointRef: String(doc.checkpoint_ref),
    status: (doc.run_status ?? 'running') as RunState['status'],
    retries: doc.run_retries ? JSON.parse(String(doc.run_retries)) : {},
  };
}

export async function writeRunState(changeDir: string, state: RunState): Promise<void> {
  const file = path.join(changeDir, '.comet.yaml');
  const raw = await fs.readFile(file, 'utf8').catch(() => '');
  const doc = (raw ? parse(raw) : {}) as StateDocument;
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

  await fs.mkdir(changeDir, { recursive: true });
  const temporary = path.join(changeDir, `.comet.yaml.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, stringify(doc), 'utf8');
  await fs.rename(temporary, file);
}
