import { createHash } from 'crypto';
import type { FactoryWorkflowSlot, FactoryWorkflowSpec, FactoryWorkflowStage } from './protocol.js';
import type { FactoryResolvedSkill, FactorySkillPackagePlan, FactoryStageName } from './types.js';

export type FactoryAuthoringLane =
  | 'skill-core'
  | 'script-contract'
  | 'reference'
  | 'pause-points'
  | 'eval'
  | 'skill-review';

export type FactoryPackageArtifactKind = 'skill' | 'script' | 'reference' | 'engine';

export type FactoryArtifactAuthorKind = 'deterministic-adapter' | 'subagent';

export type FactoryArtifactClaimKind =
  | 'workflow-entry'
  | 'stage-skill'
  | 'script'
  | 'reference'
  | 'pause-point'
  | 'eval'
  | 'review';

export interface FactoryPackageArtifact {
  path: string;
  kind: FactoryPackageArtifactKind;
  content: string;
  executable?: boolean;
}

export interface FactoryArtifactAuthorMetadata {
  id: string;
  kind: FactoryArtifactAuthorKind;
  label: string;
}

export interface FactoryArtifactClaim {
  kind: FactoryArtifactClaimKind;
  id: string;
  paths: string[];
  summary: string;
  stageSkill?: string;
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
  author?: FactoryArtifactAuthorMetadata;
  artifacts: FactoryPackageArtifact[];
  claims?: FactoryArtifactClaim[];
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

export interface FactoryResolvedSkillSourceSummary {
  query: string;
  preferenceIndex: number | null;
  status: FactoryResolvedSkill['status'];
  source: {
    name: string;
    platform: string;
    scope: string;
    root: string;
    hash: string;
    description: string;
    references: Array<{ path: string; contentHash: string }>;
    scripts: Array<{
      path: string;
      sideEffect: 'unknown' | 'none' | 'read' | 'write' | 'external';
    }>;
  };
  summary: string;
}

export interface FactoryStagePlan extends FactoryStageName {
  sourceSkill: string;
  workflowStage: FactoryWorkflowStage;
  workflowSlot?: FactoryWorkflowSlot;
  parentStage?: FactoryWorkflowStage;
  kind: 'stage' | 'slot';
}

export interface FactoryAuthoringInput {
  plan: FactorySkillPackagePlan;
  workflow: FactoryWorkflowSpec;
  protocolHash: string;
  sourceSummaries: FactoryResolvedSkillSourceSummary[];
  stagePlans: FactoryStagePlan[];
}

export interface FactoryArtifactAuthor {
  lane: FactoryAuthoringLane;
  author: FactoryArtifactAuthorMetadata;
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
