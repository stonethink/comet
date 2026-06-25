import { runFactoryAuthoringLanes } from './authoring.js';
import {
  collectProposalArtifacts,
  type FactoryArtifactAuthor,
  type FactoryArtifactProposal,
  type FactoryAuthoringInput,
  type FactoryGeneratedPackageReview,
  type FactoryPackageDraft,
} from './artifacts.js';
import { reviewFactoryArtifactProposals } from './review.js';

export interface FactoryReviewLaneDraftInput {
  review: FactoryGeneratedPackageReview;
  proposals: FactoryArtifactProposal[];
}

export interface FactoryPackageAssemblyOptions {
  input: FactoryAuthoringInput;
  authors: FactoryArtifactAuthor[];
  requiresEngineArtifacts: boolean;
  createReviewProposal(input: FactoryReviewLaneDraftInput): FactoryArtifactProposal;
}

export async function assembleFactoryPackageDraft(
  options: FactoryPackageAssemblyOptions,
): Promise<FactoryPackageDraft> {
  const proposals = await runFactoryAuthoringLanes(options.input, options.authors);
  const preReview = reviewFactoryArtifactProposals({
    workflow: options.input.workflow,
    protocolHash: options.input.protocolHash,
    proposals,
    requiresEngineArtifacts: options.requiresEngineArtifacts,
    requiresReviewArtifacts: false,
  });
  const provisionalReviewProposal = options.createReviewProposal({
    review: preReview,
    proposals,
  });
  const provisionalProposals = [...proposals, provisionalReviewProposal];
  const finalReview = reviewFactoryArtifactProposals({
    workflow: options.input.workflow,
    protocolHash: options.input.protocolHash,
    proposals: provisionalProposals,
    requiresEngineArtifacts: options.requiresEngineArtifacts,
  });
  const finalReviewProposal = options.createReviewProposal({
    review: finalReview,
    proposals,
  });
  const finalProposals = [...proposals, finalReviewProposal];

  return {
    workflow: options.input.workflow,
    protocolHash: options.input.protocolHash,
    proposals: finalProposals,
    artifacts: collectProposalArtifacts(finalProposals),
    review: finalReview,
  };
}
