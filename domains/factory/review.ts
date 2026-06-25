import type { FactoryWorkflowSpec } from './protocol.js';
import type {
  FactoryArtifactProposal,
  FactoryAuthoringLane,
  FactoryGeneratedPackageReview,
  FactoryPackageArtifact,
  FactoryReviewFinding,
} from './artifacts.js';

export interface FactoryArtifactReviewInput {
  workflow: FactoryWorkflowSpec;
  protocolHash: string;
  proposals: FactoryArtifactProposal[];
  requiresEngineArtifacts?: boolean;
}

const BASE_REQUIRED_LANES: FactoryAuthoringLane[] = [
  'skill-core',
  'script-contract',
  'reference',
  'pause-points',
];

const REQUIRED_ARTIFACTS = [
  'SKILL.md',
  'reference/workflow-protocol.json',
  'reference/decision-points.md',
  'reference/recovery.md',
  'scripts/workflow-state.mjs',
  'scripts/workflow-guard.mjs',
  'scripts/workflow-handoff.mjs',
];

const REQUIRED_ENGINE_ARTIFACTS = [
  'comet/skill.yaml',
  'comet/guardrails.yaml',
  'comet/checks.yaml',
  'comet/eval.yaml',
];

function finding(
  code: string,
  message: string,
  path?: string,
  lane?: FactoryAuthoringLane,
): FactoryReviewFinding {
  return {
    severity: 'blocking',
    code,
    message,
    ...(path ? { path } : {}),
    ...(lane ? { lane } : {}),
  };
}

function artifactsByPath(artifacts: FactoryPackageArtifact[]): Map<string, FactoryPackageArtifact> {
  return new Map(artifacts.map((artifact) => [artifact.path.replace(/\\/gu, '/'), artifact]));
}

function scriptArtifactNames(artifacts: FactoryPackageArtifact[]): Set<string> {
  const names = new Set<string>();
  for (const artifact of artifacts) {
    if (artifact.kind !== 'script') continue;
    const normalized = artifact.path.replace(/\\/gu, '/');
    names.add(normalized);
    const slash = normalized.lastIndexOf('/');
    names.add(slash >= 0 ? normalized.slice(slash + 1) : normalized);
  }
  return names;
}

function referencedScripts(content: string): string[] {
  const scripts: string[] = [];
  const pattern =
    /(?:^|[\s"'`])(?:node\s+)?(?:[A-Za-z0-9._-]+\/)?scripts\/([A-Za-z0-9._-]+\.mjs)\b/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    scripts.push(match[1]!);
  }
  return scripts;
}

function reviewSkillArtifact(
  artifact: FactoryPackageArtifact,
  scripts: Set<string>,
): FactoryReviewFinding[] {
  const findings: FactoryReviewFinding[] = [];
  if (
    /## Generated (?:Source Evidence|Variant Routing|Internal Skill Usage)\b/u.test(
      artifact.content,
    )
  ) {
    findings.push(
      finding(
        'generated-audit-section',
        'User-visible Skill content must not contain generated audit sections.',
        artifact.path,
      ),
    );
  }
  if (
    /\b(?:Superpowers|Comet|OpenSpec)\s+`[A-Za-z][A-Za-z0-9_-]*`\s*技能/u.test(artifact.content)
  ) {
    findings.push(
      finding(
        'provider-prefixed-skill',
        'Nested Skill invocation must use the bare Skill name without a provider prefix.',
        artifact.path,
      ),
    );
  }
  if (
    /If any (?:phase objective|exit gate|stage objective|stage exit)|No blocking user decision point remains unresolved|Workflow state is ready/u.test(
      artifact.content,
    )
  ) {
    findings.push(
      finding(
        'english-flow-prose',
        'Chinese generated Skill prose must not leak English workflow instructions.',
        artifact.path,
      ),
    );
  }
  for (const script of referencedScripts(artifact.content)) {
    if (!scripts.has(script) && !scripts.has(`scripts/${script}`)) {
      findings.push(
        finding(
          'missing-script-artifact',
          `Generated Skill references scripts/${script}, but that script artifact is missing.`,
          artifact.path,
        ),
      );
    }
  }
  return findings;
}

function reviewProtocol(workflow: FactoryWorkflowSpec): FactoryReviewFinding[] {
  if (workflow.kind !== 'comet-overlay') return [];
  const phases = new Set(workflow.stages.map((stage) => stage.id));
  const missing = ['open', 'design', 'build', 'verify', 'archive'].filter(
    (phase) => !phases.has(phase),
  );
  if (missing.length === 0) return [];
  return [
    finding(
      'missing-comet-phase',
      `Comet overlay protocols must keep the protected five phases. Missing: ${missing.join(', ')}.`,
    ),
  ];
}

export function reviewFactoryArtifactProposals(
  input: FactoryArtifactReviewInput,
): FactoryGeneratedPackageReview {
  const blockingFindings: FactoryReviewFinding[] = [];
  const warnings: FactoryReviewFinding[] = [];
  const lanes = new Set(input.proposals.map((proposal) => proposal.lane));
  const requiredLanes = input.requiresEngineArtifacts
    ? [...BASE_REQUIRED_LANES, 'eval' as const]
    : BASE_REQUIRED_LANES;

  for (const lane of requiredLanes) {
    if (!lanes.has(lane)) {
      blockingFindings.push(
        finding('missing-lane', `Missing authoring lane: ${lane}.`, undefined, lane),
      );
    }
  }

  for (const proposal of input.proposals) {
    if (proposal.protocolHash !== input.protocolHash) {
      blockingFindings.push(
        finding(
          'protocol-hash-mismatch',
          `Proposal ${proposal.lane} was drafted for a stale protocol hash.`,
          undefined,
          proposal.lane,
        ),
      );
    }
    for (const proposalFinding of proposal.findings ?? []) {
      if (proposalFinding.severity === 'blocking') blockingFindings.push(proposalFinding);
      else warnings.push(proposalFinding);
    }
  }

  const artifacts = input.proposals.flatMap((proposal) => proposal.artifacts);
  const byPath = artifactsByPath(artifacts);
  const requiredArtifacts = input.requiresEngineArtifacts
    ? [...REQUIRED_ARTIFACTS, ...REQUIRED_ENGINE_ARTIFACTS]
    : REQUIRED_ARTIFACTS;
  for (const artifactPath of requiredArtifacts) {
    if (!byPath.has(artifactPath)) {
      blockingFindings.push(
        finding('missing-artifact', `Missing generated artifact: ${artifactPath}.`, artifactPath),
      );
    }
  }

  const scripts = scriptArtifactNames(artifacts);
  for (const artifact of artifacts) {
    if (artifact.kind === 'skill' && artifact.path.endsWith('SKILL.md')) {
      blockingFindings.push(...reviewSkillArtifact(artifact, scripts));
    }
  }
  blockingFindings.push(...reviewProtocol(input.workflow));

  return {
    passed: blockingFindings.length === 0,
    blockingFindings,
    warnings,
  };
}

export function renderSkillReviewMarkdown(review: FactoryGeneratedPackageReview): string {
  const status = review.passed ? 'Review passed' : 'Review blocked';
  const blocking =
    review.blockingFindings.length === 0
      ? '- None.'
      : review.blockingFindings
          .map((item) => `- **${item.code}**${item.path ? ` (${item.path})` : ''}: ${item.message}`)
          .join('\n');
  const warnings =
    review.warnings.length === 0
      ? '- None.'
      : review.warnings
          .map((item) => `- **${item.code}**${item.path ? ` (${item.path})` : ''}: ${item.message}`)
          .join('\n');
  return `# Skill Review

Status: ${status}

## Blocking Findings

${blocking}

## Warnings

${warnings}
`;
}
