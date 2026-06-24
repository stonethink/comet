import { describe, expect, it } from 'vitest';
import {
  buildBundleResumeSummary,
  determineBundleNextAction,
} from '../../../domains/bundle/next-action.js';
import type { BundleAuthoringState } from '../../../domains/bundle/types.js';

function state(overrides: Partial<BundleAuthoringState> = {}): BundleAuthoringState {
  return {
    schemaVersion: 1,
    name: 'demo-skill',
    mode: 'create',
    status: 'draft',
    draftPath: '/project/.comet/bundle-drafts/demo-skill',
    currentHash: 'a'.repeat(64),
    candidates: [],
    creator: 'native',
    defaultLocale: 'en',
    locales: ['en'],
    engineEnabled: true,
    ...overrides,
  };
}

describe('Bundle next action', () => {
  it('prefers user-facing publish commands after Factory generation', () => {
    const action = determineBundleNextAction(
      state({
        factory: {
          goal: 'Create a demo Skill',
          preferredSkills: ['brainstorming'],
          resolvedSkills: [
            { query: 'brainstorming', preferenceIndex: 0, status: 'available', sources: [] },
          ],
          callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          generatedSkillPackage: {
            entrySkill: 'demo-skill',
            internalSkills: [],
            packageRoot: '/project/.comet/bundle-drafts/demo-skill/skills/demo-skill',
            enginePath: null,
            evalManifestPath:
              '/project/.comet/bundle-drafts/demo-skill/skills/demo-skill/comet/eval.yaml',
          },
        },
      }),
    );

    expect(action).toMatchObject({
      action: 'choose-eval-level',
      category: 'eval',
      userCommand: 'comet eval run --manifest <generated-skill>/comet/eval.yaml --quick --html',
    });
    expect(action.backendCommand).toBe('comet bundle eval-plan demo-skill --level quick');
  });

  it('builds a resume summary with completed and missing steps', () => {
    const summary = buildBundleResumeSummary(
      state({
        factory: {
          goal: 'Create a resumable Skill',
          preferredSkills: ['brainstorming'],
          resolvedSkills: [
            { query: 'brainstorming', preferenceIndex: 0, status: 'available', sources: [] },
          ],
          callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          preferenceHash: 'old-hash',
          generatedSkillPackage: {
            entrySkill: 'demo-skill',
            internalSkills: [],
            packageRoot: '/draft/skills/demo-skill',
            enginePath: null,
            evalManifestPath: '/draft/skills/demo-skill/comet/eval.yaml',
          },
        },
      }),
      { currentPreferenceHash: 'new-hash' },
    );

    expect(summary).toMatchObject({
      schemaVersion: 1,
      name: 'demo-skill',
      goal: 'Create a resumable Skill',
      currentStep: 'needs-eval',
      preferenceDrift: {
        changed: true,
        storedHash: 'old-hash',
        currentHash: 'new-hash',
      },
      recommendedNextStep: {
        action: 'choose-eval-level',
      },
    });
    expect(summary.completed).toContain('Factory metadata initialized');
    expect(summary.missing).toContain('Passing Eval evidence for the current draft');
  });
});
