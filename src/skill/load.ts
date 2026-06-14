import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'yaml';
import type {
  GuardrailDefinition,
  RuntimeEvalDefinition,
  SkillDefinition,
  SkillPackage,
} from './types.js';

type YamlObject = Record<string, unknown>;

function invalidDocument(filePath: string, message: string): Error {
  return new Error(`${filePath}: ${message}`);
}

function assertObject(
  value: unknown,
  filePath: string,
  field = 'document',
): asserts value is YamlObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidDocument(filePath, `${field} must be an object`);
  }
}

function assertStringField(document: YamlObject, field: string, filePath: string): void {
  if (typeof document[field] !== 'string') {
    throw invalidDocument(filePath, `${field} must be a string`);
  }
}

function assertArrayField(document: YamlObject, field: string, filePath: string): void {
  if (!Array.isArray(document[field])) {
    throw invalidDocument(filePath, `${field} must be an array`);
  }
}

function narrowSkillDefinition(document: unknown, filePath: string): SkillDefinition {
  assertObject(document, filePath);

  assertObject(document.metadata, filePath, 'metadata');
  assertObject(document.goal, filePath, 'goal');
  assertObject(document.orchestration, filePath, 'orchestration');
  assertStringField(document.metadata, 'name', filePath);
  assertStringField(document.metadata, 'version', filePath);
  assertStringField(document.metadata, 'description', filePath);
  assertArrayField(document, 'skills', filePath);
  assertArrayField(document, 'agents', filePath);
  assertArrayField(document, 'tools', filePath);

  return document as unknown as SkillDefinition;
}

function narrowGuardrails(document: unknown, filePath: string): Partial<GuardrailDefinition> {
  assertObject(document, filePath);

  for (const field of [
    'allowedSkills',
    'allowedAgents',
    'allowedTools',
    'confirmationRequiredFor',
  ]) {
    if (field in document) {
      assertArrayField(document, field, filePath);
    }
  }
  for (const field of ['maxIterations', 'maxRetriesPerAction']) {
    if (field in document && typeof document[field] !== 'number') {
      throw invalidDocument(filePath, `${field} must be a number`);
    }
  }

  return document as Partial<GuardrailDefinition>;
}

function narrowEvalDocument(
  document: unknown,
  filePath: string,
): { runtime?: RuntimeEvalDefinition[] } {
  assertObject(document, filePath);
  if ('runtime' in document && !Array.isArray(document.runtime)) {
    throw invalidDocument(filePath, 'runtime must be an array');
  }
  return document as { runtime?: RuntimeEvalDefinition[] };
}

async function readYaml(filePath: string): Promise<unknown> {
  const source = await fs.readFile(filePath, 'utf8');
  try {
    return parse(source) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw invalidDocument(filePath, message);
  }
}

async function readOptionalYaml(filePath: string): Promise<unknown | null> {
  try {
    return await readYaml(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function loadSkillPackage(root: string): Promise<SkillPackage> {
  const packageRoot = path.resolve(root);
  const cometRoot = path.join(packageRoot, 'comet');

  await fs.access(path.join(packageRoot, 'SKILL.md'));

  const skillPath = path.join(cometRoot, 'skill.yaml');
  const guardrailsPath = path.join(cometRoot, 'guardrails.yaml');
  const evalsPath = path.join(cometRoot, 'evals.yaml');
  const definition = narrowSkillDefinition(await readYaml(skillPath), skillPath);
  const rawGuardrails = await readOptionalYaml(guardrailsPath);
  const guardrailDocument =
    rawGuardrails === null ? null : narrowGuardrails(rawGuardrails, guardrailsPath);
  const rawEvals = await readOptionalYaml(evalsPath);
  const evalDocument = rawEvals === null ? null : narrowEvalDocument(rawEvals, evalsPath);

  const defaultGuardrails: GuardrailDefinition = {
    allowedSkills: definition.skills.map((skill) => skill.id),
    allowedAgents: definition.agents.map((agent) => agent.id),
    allowedTools: definition.tools.map((tool) => tool.id),
    maxIterations: 50,
    maxRetriesPerAction: 3,
    confirmationRequiredFor: definition.tools
      .filter((tool) => tool.requiresConfirmation)
      .map((tool) => tool.id),
  };

  return {
    root: packageRoot,
    definition,
    guardrails: {
      ...defaultGuardrails,
      ...guardrailDocument,
    },
    evals: evalDocument?.runtime ?? [],
  };
}
