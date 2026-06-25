import type { FactorySkillPackagePlan } from './types.js';
import { compileWorkflowSpec } from './protocol.js';
import { buildStagePlans, stepId, workflowRouteItems } from './package-workflow.js';

function planScript(plan: FactorySkillPackagePlan): string {
  const workflow = compileWorkflowSpec(plan);
  const planSourcePath = plan.engineMode === 'none' ? ['SKILL.md'] : ['comet', 'skill.yaml'];
  const planSteps = workflowRouteItems(workflow).map((item, index) =>
    stepId(index, item.stageSkill),
  );
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'status';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const workflowStatePath = path.join(runRoot, ${workflow.recovery.statePath
    .split('/')
    .map((item) => `'${item}'`)
    .join(', ')});
const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');
const planSteps = ${JSON.stringify(planSteps, null, 2)};
const planSourcePath = path.join(packageRoot, ${planSourcePath.map((item) => `'${item}'`).join(', ')});

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function currentPlanHash() {
  return sha256(await fs.readFile(planSourcePath, 'utf8'));
}

async function readState() {
  try {
    return await readJson(workflowStatePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return readJson(statePath);
    }
    throw error;
  }
}

async function assertPlanHash(state) {
  const actual = await currentPlanHash();
  if (state?.planHash !== actual) {
    throw new Error('Comet control plane plan hash drift: expected ' + String(state?.planHash) + ', got ' + actual);
  }
}

async function main() {
  if (command === 'status') {
    try {
      const state = await readState();
      await assertPlanHash(state);
      console.log(JSON.stringify(state, null, 2));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        console.log(JSON.stringify({ status: 'not-started' }, null, 2));
        return;
      }
      throw error;
    }
    return;
  }
  if (command === 'init') {
    const state = {
      schemaVersion: 1,
      status: 'running',
      currentStep: planSteps[0] ?? null,
      completedSteps: [],
      outcomes: {},
      planHash: await currentPlanHash(),
    };
    await writeJson(workflowStatePath, state);
    await writeJson(statePath, state);
    return;
  }
  if (command === 'complete-step') {
    const step = process.argv[3];
    if (!step) throw new Error('complete-step requires a step id');
    const state = await readState();
    await assertPlanHash(state);
    if (state.status !== 'running') {
      throw new Error('complete-step requires running state; got ' + String(state.status));
    }
    if (state.currentStep !== step) {
      throw new Error('complete-step expected currentStep ' + String(state.currentStep) + ', got ' + step);
    }
    const outcomeArg = process.argv[4];
    let outcome = null;
    if (outcomeArg !== undefined) {
      outcome = JSON.parse(outcomeArg);
    }
    const completedSteps = Array.isArray(state.completedSteps) ? state.completedSteps : [];
    const nextIndex = planSteps.indexOf(step) + 1;
    const nextStep = planSteps[nextIndex] ?? null;
    state.completedSteps = [...completedSteps, step];
    state.outcomes = {
      ...(state.outcomes && typeof state.outcomes === 'object' && !Array.isArray(state.outcomes)
        ? state.outcomes
        : {}),
      [step]: outcome,
    };
    state.currentStep = nextStep;
    state.status = nextStep === null ? 'completed' : 'running';
    await writeJson(workflowStatePath, state);
    await writeJson(statePath, state);
    return;
  }
  throw new Error('Unknown command: ' + command);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function checkScript(plan: FactorySkillPackagePlan): string {
  const stagePlans = buildStagePlans(plan);
  const required = [
    'SKILL.md',
    ...stagePlans.map((stage) => `../${stage.name}/SKILL.md`),
    ...(plan.engineMode === 'none'
      ? []
      : ['comet/skill.yaml', 'comet/guardrails.yaml', 'comet/checks.yaml', 'comet/eval.yaml']),
    'reference/resolved-skills.json',
    'reference/workflow-protocol.json',
    'reference/decision-points.md',
    'reference/recovery.md',
    'reference/authoring-lanes.json',
    'reference/skill-review.md',
    'reference/composition-report.md',
    'scripts/comet-plan.mjs',
    'scripts/comet-check.mjs',
    'scripts/comet-hook-guard.mjs',
    'scripts/workflow-state.mjs',
    'scripts/workflow-guard.mjs',
    'scripts/workflow-handoff.mjs',
  ];
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const command = process.argv[2] ?? 'verify';

const required = ${JSON.stringify(required, null, 2)};

async function main() {
  if (command !== 'verify') {
    throw new Error('Unknown command: ' + command);
  }
  const missing = [];
  for (const relative of required) {
    try {
      const stats = await fs.stat(path.join(packageRoot, relative));
      if (!stats.isFile()) missing.push(relative);
    } catch {
      missing.push(relative);
    }
  }
  if (missing.length > 0) {
    console.error('Missing required control plane files: ' + missing.join(', '));
    process.exit(1);
  }
  console.log('control-plane-ok');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function hookGuardScript(plan: FactorySkillPackagePlan): string {
  const planSourcePath = plan.engineMode === 'none' ? ['SKILL.md'] : ['comet', 'skill.yaml'];
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const planSourcePath = path.join(packageRoot, ${planSourcePath.map((item) => `'${item}'`).join(', ')});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function currentPlanHash() {
  return sha256(await fs.readFile(planSourcePath, 'utf8'));
}

async function main() {
  const event = process.argv[2];
  if (event !== 'before_write' && event !== 'before_tool') {
    console.error('Comet hook guard only supports before_write and before_tool events.');
    process.exit(1);
  }
  const statePath = path.join(runRoot, '.comet', 'runs', 'state.json');
  let state;
  try {
    await fs.access(packageRoot);
    state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch (error) {
    const message = error instanceof SyntaxError ? 'invalid' : 'missing';
    console.error('Comet control plane state is ' + message + ': ' + statePath);
    process.exit(1);
  }
  if (state?.status !== 'running') {
    console.error(
      'Comet control plane state status must be running before guarded writes; got ' +
        String(state?.status) +
        '.',
    );
    process.exit(1);
  }
  const actualPlanHash = await currentPlanHash();
  if (state.planHash !== actualPlanHash) {
    console.error('Comet control plane plan hash drift: expected ' + String(state.planHash) + ', got ' + actualPlanHash + '.');
    process.exit(1);
  }
  console.log('hook-guard-ok');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function workflowStateScript(plan: FactorySkillPackagePlan): string {
  const workflow = compileWorkflowSpec(plan);
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'status';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');
const statePath = path.join(runRoot, ${workflow.recovery.statePath
    .split('/')
    .map((item) => `'${item}'`)
    .join(', ')});
const compatibilityStatePath = path.join(runRoot, '.comet', 'runs', 'state.json');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

function flattenRoute(protocol) {
  const route = [];
  for (const stage of protocol.stages ?? []) {
    route.push({
      kind: 'stage',
      id: stage.id,
      stageSkill: stage.stageSkill,
      parentStage: null,
    });
    for (const slot of stage.slots ?? []) {
      route.push({
        kind: 'slot',
        id: slot.id,
        stageSkill: slot.stageSkill,
        parentStage: stage.stageSkill,
      });
    }
  }
  return route;
}

function completedSet(state) {
  return new Set(Array.isArray(state.completedStages) ? state.completedStages : []);
}

function nextItem(protocol, state) {
  const completed = completedSet(state);
  return flattenRoute(protocol).find((item) => !completed.has(item.stageSkill)) ?? null;
}

function printNext(next) {
  if (!next) {
    console.log('NEXT: done');
    return;
  }
  console.log('NEXT: auto');
  console.log('SKILL: ' + next.stageSkill);
}

function parseEvidence(raw) {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return { value: parsed };
  } catch {
    return { summary: raw };
  }
}

async function readState() {
  try {
    return await readJson(statePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('缺少 workflow 状态，请先运行 workflow-state.mjs init。');
    }
    throw error;
  }
}

async function writeState(state) {
  await writeJson(statePath, state);
  await writeJson(compatibilityStatePath, state);
}

async function initialState() {
  const protocol = await readJson(protocolPath);
  const current = nextItem(protocol, { completedStages: [] });
  return {
    schemaVersion: 1,
    workflow: protocol.name,
    status: 'running',
    currentStage: current?.stageSkill ?? null,
    completedStages: [],
    evidence: {},
    history: [],
  };
}

async function main() {
  const protocol = await readJson(protocolPath);
  if (command === 'init') {
    const state = await initialState();
    await writeState(state);
    return;
  }
  if (command === 'status') {
    try {
      console.log(JSON.stringify(await readJson(statePath), null, 2));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        console.log(JSON.stringify({ status: 'not-started' }, null, 2));
        return;
      }
      throw error;
    }
    return;
  }
  if (command === 'next') {
    const state = await readState();
    printNext(nextItem(protocol, state));
    return;
  }
  if (command === 'record') {
    const stageSkill = process.argv[3];
    if (!stageSkill) throw new Error('record requires a stage Skill name.');
    const target = flattenRoute(protocol).find(
      (item) => item.stageSkill === stageSkill || item.id === stageSkill,
    );
    if (!target) throw new Error('Unknown workflow stage: ' + stageSkill);
    const rawEvidence = process.argv.slice(4).join(' ');
    const state = await readState();
    state.evidence = state.evidence && typeof state.evidence === 'object' ? state.evidence : {};
    state.history = Array.isArray(state.history) ? state.history : [];
    state.evidence[target.stageSkill] = {
      ...parseEvidence(rawEvidence),
      recordedAt: new Date().toISOString(),
    };
    state.history.push({
      event: 'evidence-recorded',
      stageSkill: target.stageSkill,
      at: new Date().toISOString(),
    });
    if (!state.currentStage) {
      state.currentStage = nextItem(protocol, state)?.stageSkill ?? null;
    }
    await writeState(state);
    console.log('EVIDENCE: ' + target.stageSkill);
    printNext(nextItem(protocol, state));
    return;
  }
  throw new Error('Unknown command: ' + command);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function workflowGuardScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'verify';
const stageId = process.argv[3] ?? null;
const apply = process.argv.includes('--apply');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');

function slashPath(root, value) {
  return path.join(root, ...String(value).split('/').filter(Boolean));
}

function flattenRoute(protocol) {
  const route = [];
  for (const stage of protocol.stages ?? []) {
    route.push({
      kind: 'stage',
      id: stage.id,
      stageSkill: stage.stageSkill,
      parentStage: null,
      slots: stage.slots ?? [],
      semanticChecks: stage.semanticChecks ?? [],
    });
    for (const slot of stage.slots ?? []) {
      route.push({
        kind: 'slot',
        id: slot.id,
        stageSkill: slot.stageSkill,
        parentStage: stage.stageSkill,
        slots: [],
        semanticChecks: slot.semanticChecks ?? [],
      });
    }
  }
  return route;
}

function completedSet(state) {
  return new Set(Array.isArray(state.completedStages) ? state.completedStages : []);
}

function nextItem(protocol, state) {
  const completed = completedSet(state);
  return flattenRoute(protocol).find((item) => !completed.has(item.stageSkill)) ?? null;
}

function printNext(next) {
  if (!next) {
    console.log('NEXT: done');
    return;
  }
  console.log('NEXT: auto');
  console.log('SKILL: ' + next.stageSkill);
}

function findNode(protocol, id) {
  return flattenRoute(protocol).find((item) => item.stageSkill === id || item.id === id) ?? null;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

async function readState(protocol) {
  const primary = slashPath(runRoot, protocol.recovery.statePath);
  const compatibility = slashPath(runRoot, protocol.recovery.compatibilityStatePath);
  try {
    return { path: primary, compatibilityPath: compatibility, state: await readJson(primary) };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      try {
        return {
          path: primary,
          compatibilityPath: compatibility,
          state: await readJson(compatibility),
        };
      } catch {
        throw new Error('缺少 workflow 状态，请先运行 workflow-state.mjs init。');
      }
    }
    throw error;
  }
}

async function writeState(paths, state) {
  await writeJson(paths.path, state);
  await writeJson(paths.compatibilityPath, state);
}

function hasEvidence(state, stageSkill) {
  return Boolean(state.evidence && typeof state.evidence === 'object' && state.evidence[stageSkill]);
}

function evidenceFor(state, stageSkill) {
  if (!state.evidence || typeof state.evidence !== 'object') return null;
  const evidence = state.evidence[stageSkill];
  return evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : null;
}

function hasEvidenceValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function missingEvidence(node, state) {
  const missing = [];
  if (!hasEvidence(state, node.stageSkill)) missing.push(node.stageSkill);
  if (node.kind === 'stage') {
    for (const slot of node.slots) {
      if (!hasEvidence(state, slot.stageSkill)) missing.push(slot.stageSkill);
    }
  }
  return missing;
}

function parseSimpleYaml(content) {
  const result = {};
  for (const rawLine of content.split(/\\r?\\n/u)) {
    const line = rawLine.replace(/\\s+#.*$/u, '').trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):\\s*(.*?)\\s*$/u.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'true') result[key] = true;
    else if (value === 'false') result[key] = false;
    else if (value === 'null') result[key] = null;
    else result[key] = value;
  }
  return result;
}

async function fileExists(file) {
  try {
    const stats = await fs.stat(file);
    return stats.isFile();
  } catch {
    return false;
  }
}

function evidenceChangeNames(state) {
  const names = new Set();
  if (process.env.COMET_CHANGE) names.add(process.env.COMET_CHANGE);
  const values =
    state.evidence && typeof state.evidence === 'object' ? Object.values(state.evidence) : [];
  for (const evidence of values) {
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) continue;
    for (const key of ['changeName', 'change', 'cometChange']) {
      const value = evidence[key];
      if (typeof value === 'string' && value.trim()) names.add(value.trim());
    }
  }
  return [...names];
}

async function cometYamlCandidates(state) {
  const candidates = [];
  for (const name of evidenceChangeNames(state)) {
    candidates.push(path.join(runRoot, 'openspec', 'changes', name, '.comet.yaml'));
  }
  const changesRoot = path.join(runRoot, 'openspec', 'changes');
  try {
    const entries = await fs.readdir(changesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        candidates.push(path.join(changesRoot, entry.name, '.comet.yaml'));
      }
    }
  } catch {
    // No active OpenSpec changes in this run root.
  }
  return [...new Set(candidates)];
}

async function checkCometState(check, state) {
  const candidates = await cometYamlCandidates(state);
  const readable = [];
  for (const file of candidates) {
    if (await fileExists(file)) readable.push(file);
  }
  if (readable.length === 0) {
    return '.comet.yaml not found for original Comet state';
  }
  const observed = [];
  for (const file of readable) {
    const parsed = parseSimpleYaml(await fs.readFile(file, 'utf8'));
    observed.push({ file, parsed });
    if (check.expectedPhase && parsed.phase === check.expectedPhase) return null;
    if (check.expectedArchived && parsed.archived === true) return null;
  }
  const first = observed[0];
  if (check.expectedPhase) {
    return (
      '原始 Comet .comet.yaml phase 必须是 ' +
      check.expectedPhase +
      '，当前是 ' +
      String(first?.parsed?.phase ?? 'unknown') +
      ': ' +
      String(first?.file ?? '')
    );
  }
  if (check.expectedArchived) {
    return (
      '原始 Comet .comet.yaml 必须包含 archived: true，当前是 ' +
      String(first?.parsed?.archived ?? 'unknown') +
      ': ' +
      String(first?.file ?? '')
    );
  }
  return null;
}

async function missingSemanticChecks(node, state) {
  const missing = [];
  const targets = node.kind === 'stage' ? [node, ...node.slots] : [node];
  for (const target of targets) {
    const checks = Array.isArray(target.semanticChecks) ? target.semanticChecks : [];
    if (checks.length === 0) continue;
    const evidence = evidenceFor(state, target.stageSkill);
    if (!evidence) continue;
    for (const check of checks) {
      if (check.kind === 'evidence-field') {
        if (!hasEvidenceValue(evidence[check.field])) {
          missing.push(target.stageSkill + ': ' + String(check.field ?? check.id));
        }
        continue;
      }
      if (check.kind === 'completed-check') {
        const values = Array.isArray(evidence[check.field ?? 'completedChecks'])
          ? evidence[check.field ?? 'completedChecks']
          : [];
        const expected = check.value ?? check.id;
        if (!values.includes(expected)) {
          missing.push(target.stageSkill + ': ' + expected);
        }
        continue;
      }
      if (check.kind === 'comet-state') {
        const message = await checkCometState(check, state);
        if (message) missing.push(message);
      }
    }
  }
  return missing;
}

async function main() {
  const protocol = await readJson(protocolPath);
  if (command !== 'entry' && command !== 'exit' && command !== 'verify') {
    throw new Error('Unknown command: ' + command);
  }
  if (command === 'verify') {
    if (!Array.isArray(protocol.stages)) throw new Error('Invalid workflow protocol: stages missing.');
    console.log('workflow-guard-ok');
    return;
  }
  if (!stageId) throw new Error(command + ' requires a stage Skill name.');
  const node = findNode(protocol, stageId);
  if (!node) throw new Error('Unknown workflow stage: ' + stageId);
  const paths = await readState(protocol);
  const state = paths.state;
  state.completedStages = Array.isArray(state.completedStages) ? state.completedStages : [];
  state.evidence = state.evidence && typeof state.evidence === 'object' ? state.evidence : {};
  state.history = Array.isArray(state.history) ? state.history : [];

  if (command === 'entry') {
    const current = state.currentStage ?? nextItem(protocol, state)?.stageSkill ?? null;
    const allowed =
      state.completedStages.includes(node.stageSkill) ||
      current === node.stageSkill ||
      (node.kind === 'slot' && current === node.parentStage);
    if (!allowed) {
      console.error(
        'BLOCKED: 当前断点是 ' +
          String(current) +
          '，不能直接进入 ' +
          node.stageSkill +
          '。请先完成前置阶段。',
      );
      process.exit(1);
    }
    console.log('ENTRY OK: ' + node.stageSkill);
    return;
  }

  const missing = missingEvidence(node, state);
  if (missing.length > 0) {
    console.error('BLOCKED: 缺少阶段证据: ' + missing.join(', '));
    console.error(
      '先运行: node ' +
        path.relative(runRoot, path.join(packageRoot, 'scripts', 'workflow-state.mjs')) +
        ' record <stage-skill> ' +
        '\\'{"summary":"已完成的真实产物"}\\'',
    );
    process.exit(1);
  }

  const semanticMissing = await missingSemanticChecks(node, state);
  if (semanticMissing.length > 0) {
    console.error('BLOCKED: 缺少语义证据: ' + semanticMissing.join(', '));
    process.exit(1);
  }

  if (apply) {
    const completed = completedSet(state);
    completed.add(node.stageSkill);
    if (node.kind === 'stage') {
      for (const slot of node.slots) completed.add(slot.stageSkill);
    }
    state.completedStages = flattenRoute(protocol)
      .filter((item) => completed.has(item.stageSkill))
      .map((item) => item.stageSkill);
    state.history.push({
      event: 'exit-applied',
      stageSkill: node.stageSkill,
      at: new Date().toISOString(),
    });
    const next = nextItem(protocol, state);
    state.currentStage = next?.stageSkill ?? null;
    state.status = next ? 'running' : 'completed';
    await writeState(paths, state);
    console.log('ALL CHECKS PASSED');
    printNext(next);
    return;
  }

  console.log('ALL CHECKS PASSED');
  console.log('APPLY: rerun with --apply to update workflow state');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function workflowHandoffScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');

async function main() {
  const protocol = JSON.parse(await fs.readFile(protocolPath, 'utf8'));
  const summary = {
    workflow: protocol.name,
    stages: protocol.stages.map((stage) => ({
      stageSkill: stage.stageSkill,
      nextStage: stage.nextStage,
      evidence: stage.evidence,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

export {
  checkScript,
  hookGuardScript,
  planScript,
  workflowGuardScript,
  workflowHandoffScript,
  workflowStateScript,
};
