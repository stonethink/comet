import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectClassicEvidence } from './classic-evidence.js';
import { ensureClassicRun, type ClassicRunContext } from './classic-migrate.js';
import { resolveClassicStepId } from './classic-resolver.js';
import { readClassicState, writeClassicState } from './classic-store.js';
import type { ClassicState } from './classic-state.js';
import { appendTrajectory, readTrajectory } from '../../domains/engine/run-store.js';
import type { RunState } from '../../domains/engine/types.js';
import { loadRuntimePackage, loadSkillPackage } from '../../domains/skill/load.js';

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function classicRuntimeRoot(): Promise<string> {
  const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.COMET_RUNTIME_CLASSIC_ROOT,
    path.resolve(runtimeDirectory, '..', 'runtime', 'classic'),
    path.resolve(runtimeDirectory, '..', '..', 'comet', 'runtime', 'classic'),
    path.resolve(runtimeDirectory, '..', '..', 'assets', 'skills', 'comet', 'runtime', 'classic'),
    path.resolve('assets', 'skills', 'comet', 'runtime', 'classic'),
    process.env.COMET_CLASSIC_SKILL_ROOT,
    path.resolve(runtimeDirectory, '..', '..', 'comet-classic'),
    path.resolve(runtimeDirectory, '..', '..', 'assets', 'skills', 'comet-classic'),
    path.resolve('assets', 'skills', 'comet-classic'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return candidate;
  }
  throw new Error('Comet classic runtime package is not installed');
}

async function loadClassicRuntimePackage(root: string) {
  if (await fileExists(path.join(root, 'skill.yaml'))) {
    return loadRuntimePackage(root);
  }
  return loadSkillPackage(root);
}

export async function ensureClassicRuntimeRun(changeDir: string): Promise<ClassicRunContext> {
  const root = await classicRuntimeRoot();
  return ensureClassicRun(changeDir, {
    skillPackage: await loadClassicRuntimePackage(root),
  });
}

export async function ensureStrictClassicRuntimeRun(changeDir: string): Promise<ClassicRunContext> {
  const projection = await readClassicState(changeDir);
  if (projection.unknownKeys.length > 0) {
    throw new Error(
      `Invalid Classic state: unknown field(s): ${projection.unknownKeys.join(', ')}`,
    );
  }
  return ensureClassicRuntimeRun(changeDir);
}

export async function transitionClassicRuntimeRun(
  changeDir: string,
  classic: ClassicState,
  run: RunState,
  data: Record<string, unknown>,
): Promise<RunState> {
  const projection = await readClassicState(changeDir);
  if (!projection.classic || !projection.run) {
    throw new Error('Classic transition requires synchronized Classic and Run projections');
  }

  const evidence = await collectClassicEvidence(changeDir, {
    classic,
    run,
    unknownKeys: projection.unknownKeys,
  });
  const currentStep = resolveClassicStepId(classic, evidence);
  const nextRun: RunState = {
    ...run,
    currentStep,
    iteration: run.iteration + 1,
    status: currentStep === 'completed' ? 'completed' : 'running',
  };

  await writeClassicState(changeDir, {
    classic,
    run: nextRun,
    unknownKeys: projection.unknownKeys,
  });

  const trajectory = await readTrajectory(changeDir, nextRun.trajectoryRef);
  await appendTrajectory(changeDir, nextRun.trajectoryRef, {
    sequence: trajectory.length + 1,
    timestamp: new Date().toISOString(),
    type: 'state_transitioned',
    runId: nextRun.runId,
    data: {
      kind: 'classic',
      fromStep: run.currentStep,
      toStep: currentStep,
      ...data,
    },
  });
  return nextRun;
}
