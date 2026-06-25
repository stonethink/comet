import type {
  FactoryArtifactClaim,
  FactoryArtifactAuthor,
  FactoryAuthoringInput,
  FactoryAuthoringLane,
  FactoryPackageArtifact,
} from './artifacts.js';

export interface FactorySubagentAuthoringTask {
  lane: FactoryAuthoringLane;
  prompt: string;
  context: FactoryAuthoringInput;
}

export interface FactorySubagentAuthoringResult {
  artifacts: FactoryPackageArtifact[];
  claims: FactoryArtifactClaim[];
}

export interface FactorySubagentAuthoringExecutor {
  draft(task: FactorySubagentAuthoringTask): Promise<FactorySubagentAuthoringResult>;
}

function defaultSubagentPrompt(lane: FactoryAuthoringLane, label: string): string {
  return [
    `Draft the ${lane} artifacts for a /comet-any generated Skill package.`,
    `Author role: ${label}.`,
    'Return only artifact files and semantic claims; the assembler will run the mandatory review gate.',
  ].join('\n');
}

export function createSubagentArtifactAuthor(
  lane: FactoryAuthoringLane,
  label: string,
  executor: FactorySubagentAuthoringExecutor,
): FactoryArtifactAuthor {
  return {
    lane,
    author: {
      id: lane,
      kind: 'subagent',
      label,
    },
    async draft(input) {
      const result = await executor.draft({
        lane,
        prompt: defaultSubagentPrompt(lane, label),
        context: input,
      });
      return {
        lane,
        protocolHash: input.protocolHash,
        author: {
          id: lane,
          kind: 'subagent',
          label,
        },
        artifacts: result.artifacts,
        claims: result.claims,
      };
    },
  };
}
