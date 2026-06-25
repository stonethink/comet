import { describe, expect, it } from 'vitest';
import path from 'path';
import {
  createDeterministicArtifactAuthor,
  runFactoryAuthoringLanes,
} from '../../../domains/factory/authoring.js';
import { createSubagentArtifactAuthor } from '../../../domains/factory/subagent-author.js';
import { draftFactorySkillArtifacts } from '../../../domains/factory/package.js';
import { compileWorkflowSpec } from '../../../domains/factory/protocol.js';
import {
  workflowProtocolHash,
  type FactoryArtifactProposal,
  type FactoryAuthoringInput,
} from '../../../domains/factory/artifacts.js';
import { reviewFactoryArtifactProposals } from '../../../domains/factory/review.js';
import type { FactorySkillPackagePlan } from '../../../domains/factory/types.js';

function workflowPlan(root: string): FactorySkillPackagePlan {
  return {
    root,
    name: 'lane-workflow',
    version: '1.0.0',
    description: 'Lane workflow.',
    goal: 'Generate a workflow through authoring lanes.',
    defaultLocale: 'zh',
    callChain: [
      { skill: 'brainstorming', preferenceIndex: 0 },
      { skill: 'writing-plans', preferenceIndex: 1 },
    ],
    resolvedSkills: [
      {
        query: 'brainstorming',
        preferenceIndex: 0,
        status: 'available',
        sources: [
          {
            name: 'brainstorming',
            preferenceIndex: 0,
            platform: 'codex',
            scope: 'project',
            origin: 'project',
            factory: { query: 'brainstorming' },
            root: path.join(root, '.codex', 'skills', 'brainstorming'),
            description: 'Explore intent before implementation.',
            skillMd: '# Brainstorming\n\nAsk questions before changing behavior.\n',
            hash: 'a'.repeat(64),
          },
        ],
      },
    ],
    deviations: [],
    engineMode: 'deterministic',
  };
}

describe('Factory authoring lanes', () => {
  it('can run a lane through a subagent executor adapter', async () => {
    const plan = workflowPlan('/tmp/comet-authoring-lanes');
    const workflow = compileWorkflowSpec(plan);
    const protocolHash = workflowProtocolHash(workflow);
    const seenTasks: string[] = [];
    const author = createSubagentArtifactAuthor('script-contract', 'Script authoring subagent', {
      async draft(task) {
        seenTasks.push(task.prompt);
        expect(task.context.plan.name).toBe('lane-workflow');
        expect(task.context.protocolHash).toBe(protocolHash);
        return {
          artifacts: [
            {
              path: 'scripts/probe.mjs',
              kind: 'script',
              content: '#!/usr/bin/env node\n',
              executable: true,
            },
          ],
          claims: [
            {
              kind: 'script',
              id: 'script:probe',
              paths: ['scripts/probe.mjs'],
              summary: 'Subagent drafted a script artifact.',
            },
          ],
        };
      },
    });

    const proposals = await runFactoryAuthoringLanes(
      {
        plan,
        workflow,
        protocolHash,
        sourceSummaries: [],
        stagePlans: [],
      },
      [author],
    );

    expect(seenTasks[0]).toContain('script-contract');
    expect(proposals[0]).toMatchObject({
      lane: 'script-contract',
      author: {
        id: 'script-contract',
        kind: 'subagent',
        label: 'Script authoring subagent',
      },
      artifacts: [expect.objectContaining({ path: 'scripts/probe.mjs' })],
      claims: [expect.objectContaining({ id: 'script:probe' })],
    });
  });

  it('gives lane authors the complete subagent-ready authoring context', async () => {
    const plan = workflowPlan('/tmp/comet-authoring-lanes');
    const workflow = compileWorkflowSpec(plan);
    const protocolHash = workflowProtocolHash(workflow);
    let received: FactoryAuthoringInput | null = null;

    const proposals = await runFactoryAuthoringLanes(
      {
        plan,
        workflow,
        protocolHash,
        sourceSummaries: [],
        stagePlans: [],
      },
      [
        createDeterministicArtifactAuthor(
          'reference',
          'Probe reference author',
          (input) => {
            received = input;
            return [
              {
                path: 'reference/probe.md',
                kind: 'reference',
                content: '# Probe\n',
              },
            ];
          },
          () => [
            {
              kind: 'reference',
              id: 'reference:probe',
              paths: ['reference/probe.md'],
              summary: 'Probe reference artifact was drafted from the full authoring context.',
            },
          ],
        ),
      ],
    );

    expect(received?.plan.name).toBe('lane-workflow');
    expect(received?.workflow.name).toBe('lane-workflow');
    expect(received?.protocolHash).toBe(protocolHash);
    expect(received?.sourceSummaries).toEqual([]);
    expect(received?.stagePlans).toEqual([]);
    expect(proposals[0]?.author).toMatchObject({
      kind: 'deterministic-adapter',
      id: 'reference',
      label: 'Probe reference author',
    });
    expect(proposals[0]?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'reference',
          id: 'reference:probe',
          paths: ['reference/probe.md'],
        }),
      ]),
    );
  });

  it('drafts generated packages as reviewed authoring lane proposals', async () => {
    const plan = workflowPlan('/tmp/comet-authoring-lanes');
    const draft = await draftFactorySkillArtifacts(plan);

    expect(draft.protocolHash).toBe(workflowProtocolHash(draft.workflow));
    expect(draft.proposals.map((proposal) => proposal.lane)).toEqual(
      expect.arrayContaining([
        'skill-core',
        'script-contract',
        'reference',
        'pause-points',
        'eval',
        'skill-review',
      ]),
    );
    expect(draft.proposals.every((proposal) => proposal.protocolHash === draft.protocolHash)).toBe(
      true,
    );
    expect(draft.proposals.every((proposal) => proposal.author !== undefined)).toBe(true);
    expect(draft.proposals.every((proposal) => (proposal.claims ?? []).length > 0)).toBe(true);
    expect(draft.review.passed).toBe(true);
    expect(draft.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        'SKILL.md',
        '../lane-workflow-brainstorming/SKILL.md',
        'reference/workflow-protocol.json',
        'reference/decision-points.md',
        'reference/recovery.md',
        'reference/authoring-lanes.json',
        'reference/skill-review.md',
        'scripts/workflow-state.mjs',
        'scripts/workflow-guard.mjs',
        'scripts/workflow-handoff.mjs',
        'comet/eval.yaml',
      ]),
    );

    const lanesArtifact = draft.artifacts.find(
      (artifact) => artifact.path === 'reference/authoring-lanes.json',
    );
    expect(lanesArtifact).toBeDefined();
    const laneManifest = JSON.parse(lanesArtifact!.content) as {
      lanes: Array<{
        lane: string;
        author: { id: string; kind: string; label: string } | null;
        claims: Array<{ id: string; paths: string[] }>;
      }>;
      review: { passed: boolean };
    };
    expect(laneManifest.review.passed).toBe(true);
    expect(laneManifest.lanes.map((lane) => lane.lane)).toEqual(
      expect.arrayContaining(['skill-core', 'skill-review']),
    );
    expect(laneManifest.lanes.every((lane) => lane.author?.kind === 'deterministic-adapter')).toBe(
      true,
    );
    expect(laneManifest.lanes.every((lane) => lane.claims.length > 0)).toBe(true);
    expect(laneManifest.lanes.find((lane) => lane.lane === 'skill-core')?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'workflow-entry', paths: ['SKILL.md'] }),
        expect.objectContaining({
          id: 'stage-skill:lane-workflow-brainstorming',
          paths: ['../lane-workflow-brainstorming/SKILL.md'],
        }),
      ]),
    );
    expect(laneManifest.lanes.find((lane) => lane.lane === 'skill-review')?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'review:skill-review' }),
        expect.objectContaining({ id: 'reference:authoring-lanes' }),
      ]),
    );

    const reviewArtifact = draft.artifacts.find(
      (artifact) => artifact.path === 'reference/skill-review.md',
    );
    expect(reviewArtifact?.content).toContain('Review passed');
  });

  it('blocks generated Skill proposals that would produce unusable Comet-like Skills', () => {
    const plan = workflowPlan('/tmp/comet-authoring-lanes');
    const workflow = compileWorkflowSpec(plan);
    const protocolHash = workflowProtocolHash(workflow);
    const proposals: FactoryArtifactProposal[] = [
      {
        lane: 'skill-core',
        protocolHash,
        artifacts: [
          {
            path: 'SKILL.md',
            kind: 'skill',
            content: `---
name: bad-workflow
description: Use when running bad workflow
---

# Bad Workflow

## Generated Source Evidence

If any phase objective or slot evidence is incomplete, stay in this phase and continue the work instead of advancing.

必须使用 Skill 工具加载 Superpowers \`writing-plans\` 技能。

\`\`\`bash
node bad-workflow/scripts/missing.mjs
\`\`\`
`,
          },
        ],
      },
      {
        lane: 'script-contract',
        protocolHash,
        artifacts: [
          { path: 'scripts/workflow-state.mjs', kind: 'script', content: '#!/usr/bin/env node\n' },
          { path: 'scripts/workflow-guard.mjs', kind: 'script', content: '#!/usr/bin/env node\n' },
          {
            path: 'scripts/workflow-handoff.mjs',
            kind: 'script',
            content: '#!/usr/bin/env node\n',
          },
        ],
      },
      {
        lane: 'reference',
        protocolHash,
        artifacts: [
          {
            path: 'reference/workflow-protocol.json',
            kind: 'reference',
            content: JSON.stringify(workflow, null, 2),
          },
        ],
      },
      {
        lane: 'pause-points',
        protocolHash,
        artifacts: [
          { path: 'reference/decision-points.md', kind: 'reference', content: '# Pauses\n' },
          { path: 'reference/recovery.md', kind: 'reference', content: '# Recovery\n' },
        ],
      },
      {
        lane: 'eval',
        protocolHash,
        artifacts: [
          { path: 'comet/eval.yaml', kind: 'engine', content: 'kind: SkillEvalManifest\n' },
        ],
      },
    ];

    const review = reviewFactoryArtifactProposals({
      workflow,
      protocolHash,
      proposals,
      requiresEngineArtifacts: true,
    });

    expect(review.passed).toBe(false);
    expect(review.blockingFindings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'missing-lane',
        'missing-artifact',
        'missing-claim',
        'generated-audit-section',
        'provider-prefixed-skill',
        'english-flow-prose',
        'missing-script-artifact',
      ]),
    );
    expect(review.blockingFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-lane', lane: 'skill-review' }),
        expect.objectContaining({
          code: 'missing-artifact',
          path: 'reference/skill-review.md',
        }),
        expect.objectContaining({
          code: 'missing-artifact',
          path: 'reference/authoring-lanes.json',
        }),
      ]),
    );
  });
});
