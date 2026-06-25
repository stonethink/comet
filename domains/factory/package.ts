import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import type { FactorySkillPackagePlan, GeneratedFactorySkillPackage } from './types.js';
import { compileWorkflowSpec } from './protocol.js';
import { createDeterministicArtifactAuthor } from './authoring.js';
import { assembleFactoryPackageDraft } from './package-assembly.js';
import {
  workflowProtocolHash,
  type FactoryArtifactClaim,
  type FactoryArtifactAuthorMetadata,
  type FactoryArtifactProposal,
  type FactoryPackageArtifact,
  type FactoryPackageDraft,
  type FactoryStagePlan,
} from './artifacts.js';
import { renderSkillReviewMarkdown, reviewFactoryArtifactProposals } from './review.js';
import {
  buildSourceSummaries,
  buildStagePlans,
  stepId,
  workflowRouteItems,
  workflowRouteStageSkills,
} from './package-workflow.js';
import {
  factoryEntryDescription,
  renderCompositionReport,
  renderInternalStageSkillMarkdown,
  renderSkillMarkdown,
  renderWorkflowDecisionPointsMarkdown,
  renderWorkflowRecoveryMarkdown,
} from './package-rendering.js';
import {
  checkScript,
  hookGuardScript,
  planScript,
  workflowGuardScript,
  workflowHandoffScript,
  workflowStateScript,
} from './package-scripts.js';

function skillDefinition(plan: FactorySkillPackagePlan): Record<string, unknown> {
  const workflow = compileWorkflowSpec(plan);
  const route = workflowRouteItems(workflow);
  const steps = route.map((item, index) => ({
    id: stepId(index, item.stageSkill),
    action: { type: 'invoke_skill', ref: item.stageSkill },
    ...(index + 1 < route.length ? { next: stepId(index + 1, route[index + 1]!.stageSkill) } : {}),
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
      statement: plan.goal,
      inputs: [],
      outputs: [{ name: 'result', description: 'Generated workflow result' }],
      success: ['The generated workflow completes according to its compiled workflow protocol'],
    },
    orchestration:
      plan.engineMode === 'adaptive'
        ? { mode: 'adaptive' }
        : {
            mode: 'deterministic',
            entry: steps[0]?.id ?? 'complete',
            steps: steps.length > 0 ? steps : [{ id: 'complete', action: { type: 'checkpoint' } }],
          },
    skills: route.map((item) => ({
      id: item.stageSkill,
    })),
    agents: [],
    tools: [],
  };
}

function guardrails(plan: FactorySkillPackagePlan): Record<string, unknown> {
  const route = workflowRouteStageSkills(compileWorkflowSpec(plan));
  return {
    allowedSkills: route,
    allowedAgents: [],
    allowedTools: [],
    maxIterations: Math.max(route.length + 2, 5),
    maxRetriesPerAction: 2,
    confirmationRequiredFor: [],
  };
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

function evalManifest(plan: FactorySkillPackagePlan): Record<string, unknown> {
  const workflow = compileWorkflowSpec(plan);
  const route = workflowRouteStageSkills(workflow);
  return {
    apiVersion: 'comet.eval/v1alpha1',
    kind: 'SkillEvalManifest',
    metadata: {
      name: plan.name,
      description: factoryEntryDescription(plan),
    },
    skill: {
      name: plan.name,
      source: '..',
      profile: 'authoring-skill',
    },
    evaluation: {
      recommendedTasks: ['authoring-skill-smoke', 'workflow-route-conformance'],
      requiredSkills: plan.callChain.map((item) => item.skill),
      generatedStageSkills: route,
      expectedArtifacts: [
        'reference/resolved-skills.json',
        'reference/workflow-protocol.json',
        'reference/decision-points.md',
        'reference/recovery.md',
      ],
      routeConformance: {
        task: 'workflow-route-conformance',
        expectedStageOrder: route,
      },
    },
    interaction: {
      mode: 'none',
      maxTurns: 8,
    },
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

function claim(
  kind: FactoryArtifactClaim['kind'],
  id: string,
  paths: string[],
  summary: string,
  stageSkill?: string,
): FactoryArtifactClaim {
  return {
    kind,
    id,
    paths,
    summary,
    ...(stageSkill ? { stageSkill } : {}),
  };
}

function skillCoreClaims(stagePlans: FactoryStagePlan[]): FactoryArtifactClaim[] {
  return [
    claim(
      'workflow-entry',
      'workflow-entry',
      ['SKILL.md'],
      'Entry Skill routes the generated workflow.',
    ),
    ...stagePlans.map((stage) =>
      claim(
        'stage-skill',
        `stage-skill:${stage.name}`,
        [`../${stage.name}/SKILL.md`],
        `Internal stage Skill ${stage.name} handles ${stage.label ?? stage.sourceSkill}.`,
        stage.name,
      ),
    ),
  ];
}

function scriptClaims(): FactoryArtifactClaim[] {
  return [
    claim(
      'script',
      'script:workflow-state',
      ['scripts/workflow-state.mjs'],
      'Workflow state script records stage evidence and emits the next generated Skill.',
    ),
    claim(
      'script',
      'script:workflow-guard',
      ['scripts/workflow-guard.mjs'],
      'Workflow guard script blocks stage exit until protocol checks pass.',
    ),
    claim(
      'script',
      'script:workflow-handoff',
      ['scripts/workflow-handoff.mjs'],
      'Workflow handoff script records resumable context across sessions.',
    ),
  ];
}

function referenceClaims(): FactoryArtifactClaim[] {
  return [
    claim(
      'reference',
      'reference:workflow-protocol',
      ['reference/workflow-protocol.json'],
      'Workflow protocol is the route authority for generated Skills and scripts.',
    ),
    claim(
      'reference',
      'reference:resolved-skills',
      ['reference/resolved-skills.json'],
      'Resolved source Skill evidence is preserved outside user-facing Skill prose.',
    ),
    claim(
      'reference',
      'reference:composition-report',
      ['reference/composition-report.md'],
      'Composition report explains preference and source-skill decisions for audits.',
    ),
  ];
}

function pausePointClaims(): FactoryArtifactClaim[] {
  return [
    claim(
      'pause-point',
      'pause:decision-points',
      ['reference/decision-points.md'],
      'Decision point reference describes user pauses before risky workflow transitions.',
    ),
    claim(
      'pause-point',
      'pause:recovery',
      ['reference/recovery.md'],
      'Recovery reference describes cross-session workflow resume behavior.',
    ),
  ];
}

function evalClaims(engineArtifacts: FactoryPackageArtifact[]): FactoryArtifactClaim[] {
  if (!engineArtifacts.some((item) => item.path === 'comet/eval.yaml')) return [];
  return [
    claim(
      'eval',
      'eval:manifest',
      ['comet/eval.yaml'],
      'Eval manifest covers generated workflow route conformance.',
    ),
  ];
}

function reviewAuthor(): FactoryArtifactAuthorMetadata {
  return {
    id: 'skill-review',
    kind: 'deterministic-adapter',
    label: 'Skill review author',
  };
}

function reviewClaims(): FactoryArtifactClaim[] {
  return [
    claim(
      'review',
      'review:skill-review',
      ['reference/skill-review.md'],
      'Skill review report records the final authoring gate result.',
    ),
    claim(
      'reference',
      'reference:authoring-lanes',
      ['reference/authoring-lanes.json'],
      'Authoring lane manifest records lane authors, claims, artifacts, and review findings.',
    ),
  ];
}

function authoringLanesJson(
  protocolHash: string,
  proposals: FactoryArtifactProposal[],
  review: ReturnType<typeof reviewFactoryArtifactProposals>,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      protocolHash,
      lanes: proposals.map((proposal) => ({
        lane: proposal.lane,
        protocolHash: proposal.protocolHash,
        author: proposal.author ?? null,
        claims: proposal.claims ?? [],
        artifacts: proposal.artifacts.map((item) => ({
          path: item.path,
          kind: item.kind,
        })),
        findings: proposal.findings ?? [],
      })),
      review: {
        passed: review.passed,
        blockingFindings: review.blockingFindings,
        warnings: review.warnings,
      },
    },
    null,
    2,
  )}\n`;
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
  const sourceSummaries = buildSourceSummaries(plan);
  const stagePlans = buildStagePlans(plan);
  const workflow = compileWorkflowSpec(plan);
  const protocolHash = workflowProtocolHash(workflow);
  const input = { plan, workflow, protocolHash, sourceSummaries, stagePlans };
  const scriptArtifacts = [
    artifact('scripts/comet-plan.mjs', 'script', planScript(plan), true),
    artifact('scripts/comet-check.mjs', 'script', checkScript(plan), true),
    artifact('scripts/comet-hook-guard.mjs', 'script', hookGuardScript(plan), true),
    artifact('scripts/workflow-state.mjs', 'script', workflowStateScript(plan), true),
    artifact('scripts/workflow-guard.mjs', 'script', workflowGuardScript(), true),
    artifact('scripts/workflow-handoff.mjs', 'script', workflowHandoffScript(), true),
  ];
  const engineArtifacts =
    plan.engineMode === 'none'
      ? []
      : [
          artifact('comet/skill.yaml', 'engine', stringify(skillDefinition(plan))),
          artifact('comet/guardrails.yaml', 'engine', stringify(guardrails(plan))),
          artifact('comet/checks.yaml', 'engine', stringify(runtimeEvals())),
          artifact('comet/eval.yaml', 'engine', stringify(evalManifest(plan))),
        ];
  const authors = [
    createDeterministicArtifactAuthor(
      'skill-core',
      'Skill core author',
      () => [
        artifact('SKILL.md', 'skill', renderSkillMarkdown(plan)),
        ...stagePlans.map((stage) =>
          artifact(
            `../${stage.name}/SKILL.md`,
            'skill',
            renderInternalStageSkillMarkdown(plan, stage),
          ),
        ),
      ],
      () => skillCoreClaims(stagePlans),
    ),
    createDeterministicArtifactAuthor(
      'script-contract',
      'Workflow script contract author',
      () => scriptArtifacts,
      () => scriptClaims(),
    ),
    createDeterministicArtifactAuthor(
      'reference',
      'Reference author',
      () => [
        jsonArtifact('reference/resolved-skills.json', {
          schemaVersion: 1,
          resolvedSkills: plan.resolvedSkills ?? [],
          sourceSummaries,
          stageNames: stagePlans,
          preference: plan.preference ?? null,
        }),
        jsonArtifact('reference/workflow-protocol.json', workflow),
        artifact('reference/composition-report.md', 'reference', renderCompositionReport(plan)),
      ],
      () => referenceClaims(),
    ),
    createDeterministicArtifactAuthor(
      'pause-points',
      'User pause point author',
      () => [
        artifact(
          'reference/decision-points.md',
          'reference',
          renderWorkflowDecisionPointsMarkdown(workflow),
        ),
        artifact('reference/recovery.md', 'reference', renderWorkflowRecoveryMarkdown(workflow)),
      ],
      () => pausePointClaims(),
    ),
    createDeterministicArtifactAuthor(
      'eval',
      'Workflow eval author',
      () => engineArtifacts,
      () => evalClaims(engineArtifacts),
    ),
  ];

  return assembleFactoryPackageDraft({
    input,
    authors,
    requiresEngineArtifacts: plan.engineMode !== 'none',
    createReviewProposal({ review, proposals }) {
      const reviewProposal: FactoryArtifactProposal = {
        lane: 'skill-review',
        protocolHash,
        author: reviewAuthor(),
        artifacts: [],
        claims: reviewClaims(),
      };
      const allProposals = [...proposals, reviewProposal];
      reviewProposal.artifacts = [
        artifact('reference/skill-review.md', 'reference', renderSkillReviewMarkdown(review)),
        artifact(
          'reference/authoring-lanes.json',
          'reference',
          authoringLanesJson(protocolHash, allProposals, review),
        ),
      ];
      return reviewProposal;
    },
  });
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
  const stagePlans = buildStagePlans(plan);
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
    internalSkills: stagePlans.map((stage) => stage.name),
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
