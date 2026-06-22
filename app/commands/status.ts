import path from 'path';
import { fileExists, readDir } from '../../platform/fs/file-system.js';
import { promises as fs } from 'fs';
import { ensureStrictClassicRuntimeRun } from '../../domains/comet-classic/classic-runtime-run.js';

interface ChangeStatus {
  name: string;
  workflow: string;
  phase: string;
  buildMode: string;
  isolation: string;
  verifyMode: string;
  verifyResult: string;
  designDoc: string | null;
  plan: string | null;
  tasksCompleted: number;
  tasksTotal: number;
  nextCommand: string | null;
  currentStep: string | null;
  error?: string;
}

function getNextCommand(phase: string): string | null {
  switch (phase) {
    case 'open':
      return '/comet-open';
    case 'design':
      return '/comet-design';
    case 'build':
      return '/comet-build';
    case 'verify':
      return '/comet-verify';
    case 'archive':
      return '/comet-archive';
    default:
      return null;
  }
}

async function countTasks(tasksPath: string): Promise<{ done: number; total: number }> {
  if (!(await fileExists(tasksPath))) return { done: 0, total: 0 };
  const content = await fs.readFile(tasksPath, 'utf-8');
  const lines = content.split('\n');
  const total = lines.filter((l) => /^\s*- \[[ x]\]/.test(l)).length;
  const done = lines.filter((l) => /^\s*- \[x\]/i.test(l)).length;
  return { done, total };
}

async function getActiveChanges(projectPath: string): Promise<ChangeStatus[]> {
  const changesDir = path.join(projectPath, 'openspec', 'changes');
  if (!(await fileExists(changesDir))) return [];

  const entries = await readDir(changesDir);
  const changes: ChangeStatus[] = [];

  for (const entry of entries) {
    if (entry === 'archive') continue;
    const changeDir = path.join(changesDir, entry);
    const stat = await fs.stat(changeDir);
    if (!stat.isDirectory()) continue;

    const yamlPath = path.join(changeDir, '.comet.yaml');
    if (!(await fileExists(yamlPath))) continue;
    try {
      const runtime = await ensureStrictClassicRuntimeRun(changeDir);
      if (runtime.classic.archived) continue;
      const { done, total } = await countTasks(path.join(changeDir, 'tasks.md'));
      changes.push({
        name: entry,
        workflow: runtime.classic.workflow,
        phase: runtime.classic.phase,
        buildMode: runtime.classic.buildMode ?? 'null',
        isolation: runtime.classic.isolation ?? 'null',
        verifyMode: runtime.classic.verifyMode ?? 'null',
        verifyResult: runtime.classic.verifyResult,
        designDoc: runtime.classic.designDoc,
        plan: runtime.classic.plan,
        tasksCompleted: done,
        tasksTotal: total,
        nextCommand: getNextCommand(runtime.classic.phase),
        currentStep: runtime.run.currentStep,
      });
    } catch (error) {
      changes.push({
        name: entry,
        workflow: 'unknown',
        phase: 'invalid',
        buildMode: 'null',
        isolation: 'null',
        verifyMode: 'null',
        verifyResult: 'pending',
        designDoc: null,
        plan: null,
        tasksCompleted: 0,
        tasksTotal: 0,
        nextCommand: null,
        currentStep: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return changes;
}

function displayStatus(changes: ChangeStatus[]): void {
  if (changes.length === 0) {
    console.log('No active changes.\n');
    return;
  }

  console.log('Active Changes:\n');

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const taskStr = c.tasksTotal > 0 ? ` [${c.tasksCompleted}/${c.tasksTotal} tasks]` : '';
    console.log(`  ${i + 1}. ${c.name} [phase: ${c.phase}${taskStr}]`);
    if (c.error) {
      console.log(`     error: ${c.error}`);
      console.log();
      continue;
    }
    console.log(`     workflow: ${c.workflow} | build_mode: ${c.buildMode}`);
    if (c.currentStep) console.log(`     run_step: ${c.currentStep}`);
    if (c.designDoc) console.log(`     design: ${c.designDoc}`);
    if (c.plan) console.log(`     plan:   ${c.plan}`);
    if (c.phase === 'verify') console.log(`     verify_result: ${c.verifyResult}`);
    if (c.nextCommand) console.log(`     next: ${c.nextCommand}`);
    console.log();
  }
}

interface StatusOptions {
  json?: boolean;
}

export async function statusCommand(
  targetPath: string,
  options: StatusOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const changes = await getActiveChanges(projectPath);

  if (options.json) {
    console.log(JSON.stringify({ changes }, null, 2));
    return;
  }

  displayStatus(changes);
}
