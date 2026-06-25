import { createHash } from 'crypto';
import type { FactoryWorkflowSpec } from './protocol.js';

export type FactoryAuthoringLane =
  | 'skill-core'
  | 'script-contract'
  | 'reference'
  | 'pause-points'
  | 'eval'
  | 'skill-review';

export type FactoryPackageArtifactKind = 'skill' | 'script' | 'reference' | 'engine';

export interface FactoryPackageArtifact {
  path: string;
  kind: FactoryPackageArtifactKind;
  content: string;
  executable?: boolean;
}

export interface FactoryReviewFinding {
  severity: 'blocking' | 'warning';
  code: string;
  message: string;
  lane?: FactoryAuthoringLane;
  path?: string;
}

export interface FactoryArtifactProposal {
  lane: FactoryAuthoringLane;
  protocolHash: string;
  artifacts: FactoryPackageArtifact[];
  findings?: FactoryReviewFinding[];
}

export interface FactoryGeneratedPackageReview {
  passed: boolean;
  blockingFindings: FactoryReviewFinding[];
  warnings: FactoryReviewFinding[];
}

export interface FactoryPackageDraft {
  workflow: FactoryWorkflowSpec;
  protocolHash: string;
  proposals: FactoryArtifactProposal[];
  artifacts: FactoryPackageArtifact[];
  review: FactoryGeneratedPackageReview;
}

export interface FactoryAuthoringInput {
  workflow: FactoryWorkflowSpec;
  protocolHash: string;
}

export interface FactoryArtifactAuthor {
  lane: FactoryAuthoringLane;
  draft(input: FactoryAuthoringInput): FactoryArtifactProposal | Promise<FactoryArtifactProposal>;
}

export function workflowProtocolHash(workflow: FactoryWorkflowSpec): string {
  return createHash('sha256').update(JSON.stringify(workflow)).digest('hex');
}

export function collectProposalArtifacts(
  proposals: FactoryArtifactProposal[],
): FactoryPackageArtifact[] {
  return proposals.flatMap((proposal) => proposal.artifacts);
}
