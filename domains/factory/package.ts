import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import type { FactorySkillPackagePlan, GeneratedFactorySkillPackage } from './types.js';
import {
  workflowProtocolHash,
  type FactoryArtifactClaim,
  type FactoryArtifactProposal,
  type FactoryPackageArtifact,
  type FactoryPackageDraft,
} from './artifacts.js';
import type { WorkflowNodeProtocol, WorkflowProtocol } from '../workflow-contract/index.js';

function factoryEntryDescription(plan: FactorySkillPackagePlan): string {
  return plan.description || `Use when running the generated ${plan.name} workflow.`;
}

function runtimeEvals(): Record<string, unknown> {
  return {
    runtime: [
      {
        id: 'completed',
        scope: 'completion',
        type: 'state_equals',
        field: 'status',
        equals: 'completed',
      },
    ],
  };
}

function artifact(
  path: string,
  kind: FactoryPackageArtifact['kind'],
  content: string,
  executable = false,
): FactoryPackageArtifact {
  return { path, kind, content, ...(executable ? { executable } : {}) };
}

function jsonArtifact(
  artifactPath: string,
  value: unknown,
  kind: FactoryPackageArtifact['kind'] = 'reference',
): FactoryPackageArtifact {
  return artifact(artifactPath, kind, `${JSON.stringify(value, null, 2)}\n`);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function generatedNodeSkillName(workflowName: string, nodeId: string): string {
  const base = slug(workflowName) || 'workflow';
  const suffix = slug(nodeId) || 'node';
  return `${base}-${suffix}`;
}

function workflowContractRoute(protocol: WorkflowProtocol): WorkflowNodeProtocol[] {
  return protocol.nodes.filter((node) => !node.disabled);
}

function workflowContractInternalSkillNames(protocol: WorkflowProtocol): string[] {
  return workflowContractRoute(protocol).map((node) =>
    generatedNodeSkillName(protocol.name, node.id),
  );
}

function nodeAuthoringMode(
  protocol: WorkflowProtocol,
  node: WorkflowNodeProtocol,
): 'delegates' | 'substance' {
  return protocol.kind === 'comet-five-phase-overlay' ? 'delegates' : 'substance';
}

const AUTHORING_PENDING_MARKER = '<!-- AUTHORING PENDING -->';

function entryDecisionCoreBody(plan: FactorySkillPackagePlan): string {
  const draft = plan.contentDrafts?.['SKILL.md'];
  if (draft !== undefined) return draft;
  return `${AUTHORING_PENDING_MARKER}\n**Not yet authored.** The Decision Core for this entry — how to detect the current Node, when to pause for the user, and the red flags — must be authored by the workflow-entry lane. Until then, rely on \`workflow-state.mjs next\` for routing and treat the rest of this file as scaffold only.`;
}

function nodeGuidanceBody(
  plan: FactorySkillPackagePlan,
  protocol: WorkflowProtocol,
  node: WorkflowNodeProtocol,
): string {
  const nodeSkillPath = `../${generatedNodeSkillName(protocol.name, node.id)}/SKILL.md`;
  const draft = plan.contentDrafts?.[nodeSkillPath];
  if (draft !== undefined) return draft;
  if (nodeAuthoringMode(protocol, node) === 'delegates') {
    return `This Node delegates to \`${node.implementation.skill}\`. Load that Skill, apply the Required Skill Calls below, and record the Output Schema evidence before running the Exit Check. Do not duplicate the delegate Skill's body here.`;
  }
  return `${AUTHORING_PENDING_MARKER}\n**Not yet authored.** This substance Node requires its decision content (prerequisites, step-by-step guidance, completion reasoning, red flags) from the skill-core lane. The control-plane sections below are scaffold only; they do not describe *how* to do this Node.`;
}

export function computeUnauthoredSubstanceNodes(plan: FactorySkillPackagePlan): string[] {
  const protocol = plan.workflowProtocol;
  if (!protocol) return [];
  return workflowContractRoute(protocol)
    .filter((node) => nodeAuthoringMode(protocol, node) === 'substance')
    .filter(
      (node) =>
        plan.contentDrafts?.[`../${generatedNodeSkillName(protocol.name, node.id)}/SKILL.md`] ===
        undefined,
    )
    .map((node) => generatedNodeSkillName(protocol.name, node.id));
}

function workflowContractEntryMarkdown(
  plan: FactorySkillPackagePlan,
  protocol: WorkflowProtocol,
  decisionCoreBody: string,
): string {
  const nodeLines = workflowContractRoute(protocol)
    .map((node, index) => {
      const required =
        node.requiredSkillCalls.length === 0
          ? ''
          : ` Required Skills: ${node.requiredSkillCalls.map((binding) => `\`${binding.skill}\``).join(', ')}.`;
      const schemas =
        node.outputSchemas.length === 0
          ? ''
          : ` Output Schemas: ${node.outputSchemas.map((schema) => `\`${schema}\``).join(', ')}.`;
      return `${index + 1}. \`${generatedNodeSkillName(protocol.name, node.id)}\` - ${node.label} (${node.kind}). Responsibility: ${node.responsibility}${required}${schemas}`;
    })
    .join('\n');
  const bindings = workflowContractRoute(protocol)
    .map(
      (node) =>
        `- \`${node.id}\`: implementation \`${node.implementation.skill}\` (${node.implementation.operation}); required calls ${
          node.requiredSkillCalls.map((binding) => `\`${binding.skill}\``).join(', ') || 'none'
        }.`,
    )
    .join('\n');
  const guardrails = workflowContractRoute(protocol)
    .flatMap((node) =>
      node.guardrails.map(
        (guardrail) =>
          `- \`${node.id}.${guardrail.id}\`: ${guardrail.label} (${guardrail.validation}).`,
      ),
    )
    .join('\n');
  return `---
name: ${plan.name}
description: ${factoryEntryDescription(plan)}
---

# ${protocol.name}

## Decision Core

${decisionCoreBody}

## Workflow Nodes

${nodeLines}

## Skill Bindings

${bindings || '- No Skill bindings.'}

## Guardrails And Evidence

${guardrails || '- No explicit guardrails.'}

## Runtime And Recovery

1. Run \`node ${plan.name}/scripts/workflow-state.mjs status\`.
2. If the workflow is not started, run \`node ${plan.name}/scripts/workflow-state.mjs init\`.
3. Run \`node ${plan.name}/scripts/workflow-state.mjs next\` and load only the returned Skill.
4. Before leaving a Node, run \`node ${plan.name}/scripts/workflow-guard.mjs exit <node> --apply\`.

The route, Output Schemas, required Skill calls, and recovery state are defined by \`reference/workflow-protocol.json\`.
`;
}

function requiredSkillCallMarkdown(node: WorkflowNodeProtocol): string {
  if (node.requiredSkillCalls.length === 0) return '- This Node has no extra required Skill calls.';
  return node.requiredSkillCalls
    .map((binding) => {
      const check = `required-skill:${node.id}.${binding.skill}`;
      const reason = binding.reason ? ` Reason: ${binding.reason}` : '';
      if (binding.scope === 'handoff') {
        return `- When delegating this Node, the handoff prompt must require loading \`${binding.skill}\` and returning evidence with completed check \`${check}\`.${reason}`;
      }
      return `- Load \`${binding.skill}\` during this Node and record completed check \`${check}\`.${reason}`;
    })
    .join('\n');
}

function outputSchemaMarkdown(protocol: WorkflowProtocol, node: WorkflowNodeProtocol): string {
  if (node.outputSchemas.length === 0) return '- This Node has no declared Output Schema.';
  return node.outputSchemas
    .map((schemaId) => {
      const schema = protocol.outputSchemas.find((item) => item.id === schemaId);
      if (!schema) return `- \`${schemaId}\` (missing schema definition)`;
      const evidence = schema.evidence
        .filter((item) => item.required)
        .map((item) => `\`${item.id}\``)
        .join(', ');
      const artifacts = schema.artifacts
        .filter((item) => item.required)
        .map(
          (item) =>
            `\`${item.id}\` at ${item.paths.map((schemaPath) => `\`${schemaPath}\``).join(' or ')}`,
        )
        .join('; ');
      return `- \`${schema.id}\`: ${schema.description} Required evidence: ${evidence || 'none'}. Required artifacts: ${artifacts || 'none'}.`;
    })
    .join('\n');
}

function workflowContractNodeMarkdown(
  plan: FactorySkillPackagePlan,
  protocol: WorkflowProtocol,
  node: WorkflowNodeProtocol,
  guidanceBody: string,
): string {
  const skillName = generatedNodeSkillName(protocol.name, node.id);
  const next =
    workflowContractRoute(protocol)[
      workflowContractRoute(protocol).findIndex((item) => item.id === node.id) + 1
    ];
  const schemaLines = outputSchemaMarkdown(protocol, node);
  const guardrailLines =
    node.guardrails.length === 0
      ? '- This Node has no explicit guardrails.'
      : node.guardrails
          .map(
            (guardrail) => `- \`${guardrail.id}\`: ${guardrail.label} (${guardrail.validation}).`,
          )
          .join('\n');
  return `---
name: ${skillName}
description: Run the ${node.label} Node for ${protocol.name}.
---

# ${node.label}

## Node Goal

Complete the \`${node.id}\` Node for \`${protocol.name}\`.

Responsibility: ${node.responsibility}

## Guidance

${guidanceBody}

## Entry Check

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs entry ${node.id}
\`\`\`

## Skill Implementation

Load \`${node.implementation.skill}\` for this Node. Operation: \`${node.implementation.operation}\`.

## Required Skill Calls

${requiredSkillCallMarkdown(node)}

## Output Schemas

${schemaLines}

## Evidence Record

\`\`\`bash
node ${plan.name}/scripts/workflow-state.mjs record ${node.id} '{"summary":"record the real Node result","completedChecks":[]}'
\`\`\`

## Guardrails

${guardrailLines}

## Exit Check

\`\`\`bash
node ${plan.name}/scripts/workflow-guard.mjs exit ${node.id} --apply
\`\`\`

${next ? `If the script prints \`SKILL: ${generatedNodeSkillName(protocol.name, next.id)}\`, load that Skill next.` : 'If the script prints `NEXT: done`, summarize the workflow evidence and stop.'}

## Recovery

Read \`reference/workflow-protocol.json\` and the configured workflow state. Resume the first Node that is not listed in \`${protocol.state.completedNodesField}\`.
`;
}

function workflowContractPlanScript(): string {
  return `#!/usr/bin/env node
import './workflow-state.mjs';
`;
}

function workflowContractCheckScript(requiredFiles: string[]): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const required = ${JSON.stringify(requiredFiles, null, 2)};

async function main() {
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
    console.error('Missing required workflow contract files: ' + missing.join(', '));
    process.exit(1);
  }
  const protocol = JSON.parse(await fs.readFile(path.join(packageRoot, 'reference', 'workflow-protocol.json'), 'utf8'));
  if (protocol.schemaVersion !== 1 || !Array.isArray(protocol.nodes)) {
    throw new Error('workflow-protocol.json must use the current schema with nodes');
  }
  console.log('workflow-contract-ok');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function workflowContractHookGuardScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const event = process.argv[2] ?? 'before_tool';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');

function statePath(protocol) {
  const preferred = String(protocol.state?.statePath ?? '');
  const fallback = String(protocol.state?.compatibilityStatePath ?? '.comet/runs/' + protocol.name + '/state.json');
  const relative = preferred.includes('*') ? fallback : preferred;
  return path.join(runRoot, ...relative.split('/').filter(Boolean));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function route(protocol) {
  return (protocol.nodes ?? []).filter((node) => !node.disabled);
}

function completedSet(state) {
  return new Set(Array.isArray(state.completedNodes) ? state.completedNodes : []);
}

function nextNode(protocol, state) {
  const completed = completedSet(state);
  return route(protocol).find((node) => !completed.has(node.id)) ?? null;
}

async function main() {
  const protocol = await readJson(protocolPath);
  if (protocol.schemaVersion !== 1 || !Array.isArray(protocol.nodes)) {
    throw new Error('workflow-protocol.json must use the current schema with nodes');
  }
  const nodes = route(protocol);
  if (nodes.length === 0) {
    throw new Error('workflow protocol has no enabled nodes');
  }
  let state;
  try {
    state = await readJson(statePath(protocol));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error('workflow state is missing; run workflow-state.mjs init first');
    }
    throw error;
  }
  if (state.workflow !== protocol.name) {
    throw new Error('workflow state does not match this workflow protocol');
  }
  if (state.status !== 'running') {
    throw new Error('workflow is not running; current status is ' + String(state.status));
  }
  const current = state.currentNode ?? nextNode(protocol, state)?.id ?? null;
  if (!current || !nodes.some((node) => node.id === current)) {
    throw new Error('workflow state has no valid current Node');
  }
  console.log('workflow-hook-guard-ok');
  console.log('EVENT: ' + event);
  console.log('NODE: ' + current);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function workflowContractStateScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'status';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function generatedNodeSkillName(protocol, nodeId) {
  return (slug(protocol.name) || 'workflow') + '-' + (slug(nodeId) || 'node');
}

function statePath(protocol) {
  const preferred = String(protocol.state?.statePath ?? '');
  const fallback = String(protocol.state?.compatibilityStatePath ?? '.comet/runs/' + protocol.name + '/state.json');
  const relative = preferred.includes('*') ? fallback : preferred;
  return path.join(runRoot, ...relative.split('/').filter(Boolean));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

function route(protocol) {
  return (protocol.nodes ?? []).filter((node) => !node.disabled);
}

function completedSet(state) {
  return new Set(Array.isArray(state.completedNodes) ? state.completedNodes : []);
}

function nextNode(protocol, state) {
  const completed = completedSet(state);
  return route(protocol).find((node) => !completed.has(node.id)) ?? null;
}

function printNext(protocol, node) {
  if (!node) {
    console.log('NEXT: done');
    return;
  }
  console.log('NEXT: auto');
  console.log('NODE: ' + node.id);
  console.log('SKILL: ' + generatedNodeSkillName(protocol, node.id));
}

function parseEvidence(raw) {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed };
  } catch {
    return { summary: raw };
  }
}

async function readState(protocol) {
  try {
    return await readJson(statePath(protocol));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error('Missing workflow state. Run workflow-state.mjs init first.');
    }
    throw error;
  }
}

async function main() {
  const protocol = await readJson(protocolPath);
  if (protocol.schemaVersion !== 1 || !Array.isArray(protocol.nodes)) {
    throw new Error('workflow-protocol.json must use the current schema with nodes');
  }
  const file = statePath(protocol);
  if (command === 'init') {
    const node = nextNode(protocol, { completedNodes: [] });
    await writeJson(file, {
      schemaVersion: 1,
      workflow: protocol.name,
      status: node ? 'running' : 'completed',
      currentNode: node?.id ?? null,
      completedNodes: [],
      evidence: {},
      history: [],
    });
    printNext(protocol, node);
    return;
  }
  if (command === 'status') {
    try {
      console.log(JSON.stringify(await readJson(file), null, 2));
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        console.log(JSON.stringify({ status: 'not-started' }, null, 2));
        return;
      }
      throw error;
    }
    return;
  }
  if (command === 'next') {
    printNext(protocol, nextNode(protocol, await readState(protocol)));
    return;
  }
  if (command === 'record') {
    const nodeId = process.argv[3];
    if (!nodeId) throw new Error('record requires a Node id.');
    const node = route(protocol).find((item) => item.id === nodeId || generatedNodeSkillName(protocol, item.id) === nodeId);
    if (!node) throw new Error('Unknown workflow Node: ' + nodeId);
    const state = await readState(protocol);
    state.evidence = state.evidence && typeof state.evidence === 'object' ? state.evidence : {};
    state.history = Array.isArray(state.history) ? state.history : [];
    state.evidence[node.id] = { ...parseEvidence(process.argv.slice(4).join(' ')), recordedAt: new Date().toISOString() };
    state.history.push({ event: 'evidence-recorded', node: node.id, at: new Date().toISOString() });
    await writeJson(file, state);
    console.log('EVIDENCE: ' + node.id);
    printNext(protocol, nextNode(protocol, state));
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

function workflowContractGuardScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const command = process.argv[2] ?? 'verify';
const nodeId = process.argv[3] ?? null;
const apply = process.argv.includes('--apply');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const runRoot = process.env.COMET_RUN_ROOT ? path.resolve(process.env.COMET_RUN_ROOT) : process.cwd();
const protocolPath = path.join(packageRoot, 'reference', 'workflow-protocol.json');

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function generatedNodeSkillName(protocol, id) {
  return (slug(protocol.name) || 'workflow') + '-' + (slug(id) || 'node');
}

function statePath(protocol) {
  const preferred = String(protocol.state?.statePath ?? '');
  const fallback = String(protocol.state?.compatibilityStatePath ?? '.comet/runs/' + protocol.name + '/state.json');
  const relative = preferred.includes('*') ? fallback : preferred;
  return path.join(runRoot, ...relative.split('/').filter(Boolean));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

function route(protocol) {
  return protocol.nodes.filter((node) => !node.disabled);
}

function findNode(protocol, id) {
  return route(protocol).find((node) => node.id === id || generatedNodeSkillName(protocol, node.id) === id) ?? null;
}

function completedSet(state) {
  return new Set(Array.isArray(state.completedNodes) ? state.completedNodes : []);
}

function nextNode(protocol, state) {
  const completed = completedSet(state);
  return route(protocol).find((node) => !completed.has(node.id)) ?? null;
}

function printNext(protocol, node) {
  if (!node) {
    console.log('NEXT: done');
    return;
  }
  console.log('NEXT: auto');
  console.log('NODE: ' + node.id);
  console.log('SKILL: ' + generatedNodeSkillName(protocol, node.id));
}

function evidenceFor(state, id) {
  const value = state.evidence && typeof state.evidence === 'object' ? state.evidence[id] : null;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function missingRequiredSkillChecks(node, evidence) {
  const values = Array.isArray(evidence?.completedChecks) ? evidence.completedChecks : [];
  return (node.requiredSkillCalls ?? [])
    .map((binding) => 'required-skill:' + node.id + '.' + binding.skill)
    .filter((check) => !values.includes(check));
}

function hasEvidenceField(evidence, id) {
  if (Object.prototype.hasOwnProperty.call(evidence, id)) return true;
  const schemaEvidence = evidence.schemaEvidence;
  return !!(
    schemaEvidence &&
    typeof schemaEvidence === 'object' &&
    !Array.isArray(schemaEvidence) &&
    Object.prototype.hasOwnProperty.call(schemaEvidence, id)
  );
}

function schemaMap(protocol) {
  return new Map((protocol.outputSchemas ?? []).map((schema) => [schema.id, schema]));
}

function missingRequiredSchemaEvidence(protocol, node, evidence) {
  const schemas = schemaMap(protocol);
  const missing = [];
  for (const schemaId of node.outputSchemas ?? []) {
    const schema = schemas.get(schemaId);
    for (const field of schema?.evidence ?? []) {
      if (field.required && !hasEvidenceField(evidence, field.id)) {
        missing.push(schemaId + '.' + field.id);
      }
    }
  }
  return missing;
}

function escapeRegExp(value) {
  return String(value).replace(/[|\\\\{}()[\\]^$+?.]/gu, '\\\\$&');
}

function patternToRegExp(pattern) {
  return new RegExp('^' + String(pattern).split('*').map(escapeRegExp).join('.*') + '$', 'u');
}

async function pathPatternExists(root, relativePattern) {
  const parts = String(relativePattern).split('/').filter(Boolean);
  async function walk(current, index) {
    if (index >= parts.length) {
      try {
        await fs.stat(current);
        return true;
      } catch {
        return false;
      }
    }
    const part = parts[index];
    if (!part.includes('*')) {
      return walk(path.join(current, part), index + 1);
    }
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return false;
    }
    const matcher = patternToRegExp(part);
    for (const entry of entries) {
      if (matcher.test(entry.name) && (await walk(path.join(current, entry.name), index + 1))) {
        return true;
      }
    }
    return false;
  }
  return walk(root, 0);
}

async function missingRequiredArtifacts(protocol, node) {
  const schemas = schemaMap(protocol);
  const missing = [];
  for (const schemaId of node.outputSchemas ?? []) {
    const schema = schemas.get(schemaId);
    for (const artifact of schema?.artifacts ?? []) {
      if (!artifact.required) continue;
      const exists = (
        await Promise.all(
          (artifact.paths ?? []).map((artifactPath) => pathPatternExists(runRoot, artifactPath)),
        )
      ).some(Boolean);
      if (!exists) missing.push(schemaId + '.' + artifact.id);
    }
  }
  return missing;
}

async function main() {
  const protocol = await readJson(protocolPath);
  if (protocol.schemaVersion !== 1 || !Array.isArray(protocol.nodes)) {
    throw new Error('workflow-protocol.json must use the current schema with nodes');
  }
  if (command === 'verify') {
    console.log('workflow-guard-ok');
    return;
  }
  if (command !== 'entry' && command !== 'exit') throw new Error('Unknown command: ' + command);
  if (!nodeId) throw new Error(command + ' requires a Node id.');
  const node = findNode(protocol, nodeId);
  if (!node) throw new Error('Unknown workflow Node: ' + nodeId);
  const file = statePath(protocol);
  const state = await readJson(file);
  state.completedNodes = Array.isArray(state.completedNodes) ? state.completedNodes : [];
  state.evidence = state.evidence && typeof state.evidence === 'object' ? state.evidence : {};
  if (command === 'entry') {
    const current = state.currentNode ?? nextNode(protocol, state)?.id ?? null;
    if (current !== node.id && !state.completedNodes.includes(node.id)) {
      console.error('BLOCKED: current Node is ' + String(current) + ', cannot enter ' + node.id + '.');
      process.exit(1);
    }
    console.log('ENTRY OK: ' + node.id);
    return;
  }
  const evidence = evidenceFor(state, node.id);
  if (!evidence) {
    console.error('BLOCKED: missing evidence for Node ' + node.id + '.');
    process.exit(1);
  }
  const missingSchemaEvidence = missingRequiredSchemaEvidence(protocol, node, evidence);
  if (missingSchemaEvidence.length > 0) {
    console.error('BLOCKED: missing Output Schema evidence: ' + missingSchemaEvidence.join(', '));
    process.exit(1);
  }
  const missingArtifacts = await missingRequiredArtifacts(protocol, node);
  if (missingArtifacts.length > 0) {
    console.error('BLOCKED: missing Output Schema artifacts: ' + missingArtifacts.join(', '));
    process.exit(1);
  }
  const missingRequired = missingRequiredSkillChecks(node, evidence);
  if (missingRequired.length > 0) {
    console.error('BLOCKED: missing required Skill evidence: ' + missingRequired.join(', '));
    process.exit(1);
  }
  if (apply) {
    const completed = completedSet(state);
    completed.add(node.id);
    state.completedNodes = route(protocol).filter((item) => completed.has(item.id)).map((item) => item.id);
    const next = nextNode(protocol, state);
    state.currentNode = next?.id ?? null;
    state.status = next ? 'running' : 'completed';
    state.history = Array.isArray(state.history) ? state.history : [];
    state.history.push({ event: 'exit-applied', node: node.id, at: new Date().toISOString() });
    await writeJson(file, state);
    console.log('ALL CHECKS PASSED');
    printNext(protocol, next);
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

function workflowContractHandoffScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

async function main() {
  const protocol = JSON.parse(await fs.readFile(path.join(packageRoot, 'reference', 'workflow-protocol.json'), 'utf8'));
  console.log(JSON.stringify({
    workflow: protocol.name,
    nodes: protocol.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      requiredSkillCalls: node.requiredSkillCalls ?? [],
      outputSchemas: node.outputSchemas ?? [],
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}

function workflowContractSkillDefinition(
  plan: FactorySkillPackagePlan,
  protocol: WorkflowProtocol,
): Record<string, unknown> {
  const route = workflowContractRoute(protocol);
  const steps = route.map((node, index) => ({
    id: `node-${index + 1}-${slug(node.id)}`,
    action: { type: 'invoke_skill', ref: generatedNodeSkillName(protocol.name, node.id) },
    ...(route[index + 1] ? { next: `node-${index + 2}-${slug(route[index + 1]!.id)}` } : {}),
  }));
  return {
    apiVersion: 'comet/v1alpha1',
    kind: 'Skill',
    metadata: {
      name: plan.name,
      version: plan.version,
      description: factoryEntryDescription(plan),
    },
    goal: {
      statement: protocol.goal,
      inputs: [],
      outputs: [{ name: 'result', description: 'Generated workflow result' }],
      success: ['The generated workflow completes according to its workflow protocol'],
    },
    orchestration: {
      mode: plan.engineMode === 'adaptive' ? 'adaptive' : 'deterministic',
      entry: steps[0]?.id ?? 'complete',
      steps: steps.length > 0 ? steps : [{ id: 'complete', action: { type: 'checkpoint' } }],
    },
    skills: route.map((node) => ({ id: generatedNodeSkillName(protocol.name, node.id) })),
    agents: [],
    tools: [],
  };
}

function workflowContractEvalManifest(
  plan: FactorySkillPackagePlan,
  protocol: WorkflowProtocol,
): Record<string, unknown> {
  const route = workflowContractInternalSkillNames(protocol);
  const expectedArtifacts = protocol.nodes.flatMap((node) =>
    node.outputSchemas.flatMap((schemaId) => {
      const schema = protocol.outputSchemas.find((item) => item.id === schemaId);
      return (schema?.artifacts ?? [])
        .filter((item) => item.required)
        .map((item) => ({
          node: node.id,
          schema: schemaId,
          artifact: item.id,
          paths: item.paths,
        }));
    }),
  );
  return {
    apiVersion: 'comet.eval/v1alpha1',
    kind: 'SkillEvalManifest',
    metadata: { name: plan.name, description: factoryEntryDescription(plan) },
    skill: { name: plan.name, source: '..', profile: 'authoring-skill' },
    evaluation: {
      recommendedTasks: ['authoring-skill-smoke', 'workflow-route-conformance'],
      requiredSkills: [plan.name, ...route],
      generatedNodeSkills: route,
      expectedArtifacts,
      routeConformance: {
        task: 'workflow-route-conformance',
        expectedNodeOrder:
          protocol.evals[0]?.expectedNodeOrder ?? protocol.nodes.map((node) => node.id),
      },
    },
    interaction: { mode: 'none', maxTurns: 8 },
  };
}

function workflowContractCompositionReport(
  plan: FactorySkillPackagePlan,
  protocol: WorkflowProtocol,
): string {
  const callChain =
    plan.callChain.length === 0
      ? '- None'
      : plan.callChain.map((item) => `- ${item.skill}`).join('\n');
  const compositionSteps =
    !plan.composition || plan.composition.steps.length === 0
      ? '- None'
      : plan.composition.steps
          .map((step) => `- ${step.id}: ${step.skill} (${step.source})`)
          .join('\n');
  const resolved =
    !plan.resolvedSkills || plan.resolvedSkills.length === 0
      ? '- None'
      : plan.resolvedSkills.map((skill) => `- ${skill.query}: ${skill.status}`).join('\n');
  const preferenceMode = plan.preference?.mode ?? 'not configured';
  const preferenceHash = plan.preference?.sourceHash ?? 'none';
  return `# Composition Report

## Workflow Contract

- Kind: ${protocol.kind}
- Nodes: ${protocol.nodes.length}
- Required Skill Calls: ${protocol.nodes.reduce((count, node) => count + node.requiredSkillCalls.length, 0)}
- Output Schemas: ${protocol.outputSchemas.map((schema) => schema.id).join(', ')}

## Source Skills

${callChain}

## Composition Steps

${compositionSteps}

## Resolved Skills

${resolved}

## Preferences

- Preference mode: ${preferenceMode}
- Preference hash: ${preferenceHash}
`;
}

function renderSkillReviewMarkdown(plan: FactorySkillPackagePlan): string {
  const draft = plan.contentDrafts?.['reference/skill-review.md'];
  if (draft) return draft;
  const review = plan.authoringReview;
  if (review) {
    const findings =
      review.findings.length === 0
        ? '- None.'
        : review.findings
            .map(
              (finding) =>
                `- [${finding.severity}]${finding.path ? ` ${finding.path}` : ''}: ${finding.problem}${finding.fix ? ` -> ${finding.fix}` : ''}`,
            )
            .join('\n');
    return `# Skill Review\n\nEvidence source: ${review.evidenceSource}.\nPassed: ${review.passed ? 'yes' : 'no'}.\nVoters: ${review.voters ?? 'n/a'}.\nLenses: ${(review.lenses ?? []).join(', ') || 'n/a'}.\nRounds: ${review.rounds ?? 'n/a'}.\nReviewed at: ${review.reviewedAt}.\n\n## Findings\n\n${findings}\n`;
  }
  return '# Skill Review\n\nEvidence source: deterministic-check-only.\n\nNo LLM authoring review has been recorded for this Bundle yet. This file is an honest placeholder, not a review approval. Run the `/comet-any` skill-review lane and record its verdict via `comet bundle authoring-record <name> --lane skill-review --file <review.json>` to replace this with a real multi-vote review summary.\n';
}

function authoringLanesReview(plan: FactorySkillPackagePlan): {
  passed: boolean | null;
  evidenceSource: string;
  voters: number | null;
  lenses: string[];
  rounds: number | null;
  blockingFindings: string[];
  warnings: string[];
} {
  const review = plan.authoringReview;
  if (review) {
    return {
      passed: review.passed,
      evidenceSource: review.evidenceSource,
      voters: review.voters ?? null,
      lenses: review.lenses ?? [],
      rounds: review.rounds ?? null,
      blockingFindings: review.findings
        .filter((finding) => finding.severity === 'critical' || finding.severity === 'important')
        .map((finding) => finding.problem),
      warnings: review.findings
        .filter((finding) => finding.severity === 'minor')
        .map((finding) => finding.problem),
    };
  }
  return {
    passed: null,
    evidenceSource: 'deterministic-check-only',
    voters: null,
    lenses: [],
    rounds: null,
    blockingFindings: [],
    warnings: ['No LLM authoring review recorded for this Bundle'],
  };
}

function workflowContractArtifacts(plan: FactorySkillPackagePlan): FactoryPackageDraft {
  const protocol = plan.workflowProtocol;
  if (!protocol)
    throw new Error('workflowProtocol is required for workflow contract package generation');
  const protocolHash = workflowProtocolHash(protocol);
  const nodeSkills = workflowContractInternalSkillNames(protocol);
  const requiredFiles = [
    'SKILL.md',
    ...nodeSkills.map((name) => `../${name}/SKILL.md`),
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
    ...(plan.engineMode === 'none'
      ? []
      : ['comet/skill.yaml', 'comet/guardrails.yaml', 'comet/checks.yaml', 'comet/eval.yaml']),
  ];
  const artifacts: FactoryPackageArtifact[] = [
    artifact(
      'SKILL.md',
      'skill',
      workflowContractEntryMarkdown(plan, protocol, entryDecisionCoreBody(plan)),
    ),
    ...workflowContractRoute(protocol).map((node) =>
      artifact(
        `../${generatedNodeSkillName(protocol.name, node.id)}/SKILL.md`,
        'skill',
        workflowContractNodeMarkdown(plan, protocol, node, nodeGuidanceBody(plan, protocol, node)),
      ),
    ),
    artifact('scripts/comet-plan.mjs', 'script', workflowContractPlanScript(), true),
    artifact('scripts/comet-check.mjs', 'script', workflowContractCheckScript(requiredFiles), true),
    artifact('scripts/comet-hook-guard.mjs', 'script', workflowContractHookGuardScript(), true),
    artifact('scripts/workflow-state.mjs', 'script', workflowContractStateScript(), true),
    artifact('scripts/workflow-guard.mjs', 'script', workflowContractGuardScript(), true),
    artifact('scripts/workflow-handoff.mjs', 'script', workflowContractHandoffScript(), true),
    jsonArtifact('reference/resolved-skills.json', {
      schemaVersion: 1,
      resolvedSkills: plan.resolvedSkills ?? [],
      workflow: {
        kind: protocol.kind,
        nodes: protocol.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          implementation: node.implementation,
          requiredSkillCalls: node.requiredSkillCalls,
          outputSchemas: node.outputSchemas,
        })),
      },
      preference: plan.preference ?? null,
    }),
    jsonArtifact('reference/workflow-protocol.json', protocol),
    artifact(
      'reference/decision-points.md',
      'reference',
      plan.contentDrafts?.['reference/decision-points.md'] ??
        `# Workflow Decision Points\n\n${workflowContractRoute(protocol)
          .map(
            (node) =>
              `- \`${node.id}\`: confirm Output Schemas ${node.outputSchemas.join(', ') || 'none'}.`,
          )
          .join('\n')}\n`,
    ),
    artifact(
      'reference/recovery.md',
      'reference',
      plan.contentDrafts?.['reference/recovery.md'] ??
        `# Workflow Recovery\n\n- State path: \`${protocol.state.statePath}\`\n- Compatibility state path: \`${protocol.state.compatibilityStatePath ?? 'none'}\`\n- Resume by reading the first incomplete Workflow Node.\n`,
    ),
    artifact(
      'reference/composition-report.md',
      'reference',
      workflowContractCompositionReport(plan, protocol),
    ),
    artifact('reference/skill-review.md', 'reference', renderSkillReviewMarkdown(plan)),
    jsonArtifact('reference/authoring-lanes.json', {
      schemaVersion: 1,
      protocolHash,
      lanes: [
        'workflow-entry',
        'skill-core',
        'script-contract',
        'reference',
        'eval',
        'skill-review',
      ],
      review: authoringLanesReview(plan),
    }),
    ...(plan.engineMode === 'none'
      ? []
      : [
          artifact(
            'comet/skill.yaml',
            'engine',
            stringify(workflowContractSkillDefinition(plan, protocol)),
          ),
          artifact(
            'comet/guardrails.yaml',
            'engine',
            stringify({
              allowedSkills: [plan.name, ...nodeSkills],
              allowedAgents: [],
              allowedTools: [],
              maxIterations: Math.max(nodeSkills.length + 2, 5),
              maxRetriesPerAction: 2,
              confirmationRequiredFor: [],
            }),
          ),
          artifact('comet/checks.yaml', 'engine', stringify(runtimeEvals())),
          artifact(
            'comet/eval.yaml',
            'engine',
            stringify(workflowContractEvalManifest(plan, protocol)),
          ),
        ]),
  ];
  const proposals: FactoryArtifactProposal[] = [
    {
      lane: 'workflow-entry',
      protocolHash,
      artifacts: artifacts.filter((item) => item.path === 'SKILL.md'),
      claims: workflowEntryClaims(),
    },
    {
      lane: 'skill-core',
      protocolHash,
      artifacts: artifacts.filter((item) => item.kind === 'skill' && item.path !== 'SKILL.md'),
      claims: nodeSkills.map((name) =>
        claim(
          'node-skill',
          `node-skill:${name}`,
          [`../${name}/SKILL.md`],
          `Workflow Node Skill ${name}.`,
          name,
        ),
      ),
    },
  ];
  return {
    workflow: protocol,
    protocolHash,
    proposals,
    artifacts,
    review: { passed: true, blockingFindings: [], warnings: [] },
  };
}

function claim(
  kind: FactoryArtifactClaim['kind'],
  id: string,
  paths: string[],
  summary: string,
  nodeSkill?: string,
): FactoryArtifactClaim {
  return {
    kind,
    id,
    paths,
    summary,
    ...(nodeSkill ? { nodeSkill } : {}),
  };
}

function workflowEntryClaims(): FactoryArtifactClaim[] {
  return [
    claim(
      'workflow-entry',
      'workflow-entry',
      ['SKILL.md'],
      'Entry Skill routes the generated workflow.',
    ),
  ];
}

function artifactTarget(packageRoot: string, artifactPath: string): string {
  const skillsRoot = path.dirname(packageRoot);
  const target = path.resolve(packageRoot, artifactPath);
  const relative = path.relative(skillsRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Generated artifact escapes skills root: ${artifactPath}`);
  }
  return target;
}

export async function draftFactorySkillArtifacts(
  plan: FactorySkillPackagePlan,
): Promise<FactoryPackageDraft> {
  if (!plan.workflowProtocol) {
    throw new Error('workflowProtocol is required for workflow contract package generation');
  }
  return workflowContractArtifacts(plan);
}

async function writeFactoryArtifacts(
  packageRoot: string,
  artifacts: FactoryPackageArtifact[],
): Promise<void> {
  for (const item of artifacts) {
    const target = artifactTarget(packageRoot, item.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, item.content, 'utf8');
  }
}

export async function generateFactorySkillPackage(
  plan: FactorySkillPackagePlan,
): Promise<GeneratedFactorySkillPackage> {
  const packageRoot = path.resolve(plan.root, 'skills', plan.name);
  const cometRoot = path.join(packageRoot, 'comet');
  const referenceRoot = path.join(packageRoot, 'reference');
  if (!plan.workflowProtocol) {
    throw new Error('workflowProtocol is required for workflow contract package generation');
  }
  const internalSkillIds = workflowContractInternalSkillNames(plan.workflowProtocol);
  const draft = await draftFactorySkillArtifacts(plan);
  const compositionReportPath = path.join(referenceRoot, 'composition-report.md');
  if (!draft.review.passed) {
    const findings = draft.review.blockingFindings
      .map(
        (finding) =>
          `${finding.code}${finding.path ? ` (${finding.path})` : ''}: ${finding.message}`,
      )
      .join('\n');
    throw new Error(`Generated Skill package failed authoring review:\n${findings}`);
  }

  await fs.mkdir(packageRoot, { recursive: true });
  await writeFactoryArtifacts(packageRoot, draft.artifacts);

  return {
    packageRoot,
    skillPath: path.join(packageRoot, 'SKILL.md'),
    internalSkills: internalSkillIds,
    unauthoredSubstanceNodes: computeUnauthoredSubstanceNodes(plan),
    enginePath: plan.engineMode === 'none' ? null : cometRoot,
    evalManifestPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'eval.yaml'),
    controlPlane: {
      checksPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'checks.yaml'),
      evalManifestPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'eval.yaml'),
      compositionReportPath,
      scripts: draft.artifacts
        .filter((item) => item.kind === 'script')
        .map((item) => artifactTarget(packageRoot, item.path)),
    },
  };
}
