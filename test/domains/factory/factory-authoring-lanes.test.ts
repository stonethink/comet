import { describe, expect, it } from 'vitest';
import path from 'path';
import { draftFactorySkillArtifacts } from '../../../domains/factory/package.js';
import { compileWorkflowSpec } from '../../../domains/factory/protocol.js';
import {
  workflowProtocolHash,
  type FactoryArtifactProposal,
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
    expect(lanesArtifact?.content).toContain('"lane": "skill-core"');
    expect(lanesArtifact?.content).toContain('"lane": "skill-review"');

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
        'generated-audit-section',
        'provider-prefixed-skill',
        'english-flow-prose',
        'missing-script-artifact',
      ]),
    );
  });
});
