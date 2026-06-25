import type {
  FactoryArtifactClaim,
  FactoryArtifactAuthorMetadata,
  FactoryArtifactAuthor,
  FactoryArtifactProposal,
  FactoryAuthoringInput,
  FactoryAuthoringLane,
  FactoryPackageArtifact,
} from './artifacts.js';

export function createDeterministicArtifactAuthor(
  lane: FactoryAuthoringLane,
  label: string,
  buildArtifacts: (input: FactoryAuthoringInput) => FactoryPackageArtifact[],
  buildClaims: (
    input: FactoryAuthoringInput,
    artifacts: FactoryPackageArtifact[],
  ) => FactoryArtifactClaim[],
): FactoryArtifactAuthor {
  const author: FactoryArtifactAuthorMetadata = {
    id: lane,
    kind: 'deterministic-adapter',
    label,
  };
  return {
    lane,
    author,
    draft(input) {
      const artifacts = buildArtifacts(input);
      return {
        lane,
        protocolHash: input.protocolHash,
        author,
        artifacts,
        claims: buildClaims(input, artifacts),
      };
    },
  };
}

export function createStaticArtifactAuthor(
  lane: FactoryAuthoringLane,
  buildArtifacts: (input: FactoryAuthoringInput) => FactoryPackageArtifact[],
): FactoryArtifactAuthor {
  return createDeterministicArtifactAuthor(
    lane,
    `${lane} deterministic author`,
    buildArtifacts,
    () => [],
  );
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
    proposals.push({
      ...proposal,
      author: proposal.author ?? author.author,
      claims: proposal.claims ?? [],
    });
  }
  return proposals;
}
