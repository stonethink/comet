import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'yaml';
import type {
  GuardrailDefinition,
  RuntimeEvalDefinition,
  SkillDefinition,
  SkillPackage,
} from './types.js';

async function readYaml<T>(filePath: string): Promise<T> {
  return parse(await fs.readFile(filePath, 'utf8')) as T;
}

async function readOptionalYaml<T>(filePath: string): Promise<T | null> {
  try {
    return await readYaml<T>(filePath);
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

  const definition = await readYaml<SkillDefinition>(path.join(cometRoot, 'skill.yaml'));
  const guardrailDocument = await readOptionalYaml<Partial<GuardrailDefinition>>(
    path.join(cometRoot, 'guardrails.yaml'),
  );
  const evalDocument = await readOptionalYaml<{ runtime?: RuntimeEvalDefinition[] }>(
    path.join(cometRoot, 'evals.yaml'),
  );

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
