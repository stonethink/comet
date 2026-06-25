import type {
  FactoryArtifactAuthor,
  FactoryArtifactProposal,
  FactoryAuthoringInput,
  FactoryAuthoringLane,
  FactoryPackageArtifact,
} from './artifacts.js';

export function createStaticArtifactAuthor(
  lane: FactoryAuthoringLane,
  buildArtifacts: (input: FactoryAuthoringInput) => FactoryPackageArtifact[],
): FactoryArtifactAuthor {
  return {
    lane,
    draft(input) {
      return {
        lane,
        protocolHash: input.protocolHash,
        artifacts: buildArtifacts(input),
      };
    },
  };
}

export async function runFactoryAuthoringLanes(
  input: FactoryAuthoringInput,
  authors: FactoryArtifactAuthor[],
): Promise<FactoryArtifactProposal[]> {
  const proposals: FactoryArtifactProposal[] = [];
  for (const author of authors) {
    const proposal = await author.draft(input);
    if (proposal.lane !== author.lane) {
      throw new Error(
        `Factory authoring lane mismatch: expected ${author.lane}, got ${proposal.lane}.`,
      );
    }
    if (proposal.protocolHash !== input.protocolHash) {
      throw new Error(
        `Factory authoring protocol hash drift in ${proposal.lane}: expected ${input.protocolHash}, got ${proposal.protocolHash}.`,
      );
    }
    proposals.push(proposal);
  }
  return proposals;
}
