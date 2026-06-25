import { describe, expect, it } from 'vitest';
import {
  normalizeBundleFactoryPlan,
  type BundleFactoryPlanFile,
} from '../../../domains/bundle/factory-plan.js';

describe('bundle factory plan normalization', () => {
  it('merges project preferences with callChain order and defaults', () => {
    const normalized = normalizeBundleFactoryPlan({
      plan: {
        goal: 'Create a review-oriented Comet-native Skill.',
        callChain: ['brainstorming', 'writing-plans', 'requesting-code-review'],
      },
      projectPreferredSkills: ['brainstorming', 'writing-plans'],
    });

    expect(normalized).toEqual({
      goal: 'Create a review-oriented Comet-native Skill.',
      skillMakerIntent: 'new-skill',
      preferredSkills: ['brainstorming', 'writing-plans', 'requesting-code-review'],
      callChain: [
        { skill: 'brainstorming', preferenceIndex: 0 },
        { skill: 'writing-plans', preferenceIndex: 1 },
        { skill: 'requesting-code-review', preferenceIndex: 2 },
      ],
      deviations: [],
      engineMode: 'deterministic',
      runnerMode: 'standalone',
      mode: 'create',
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
    });
  });

  it('preserves explicit preference indexes and explicit plan overrides', () => {
    const plan: BundleFactoryPlanFile = {
      goal: 'Optimize an existing Bundle.',
      preferredSkills: ['brainstorming', 'writing-plans'],
      callChain: [{ skill: 'writing-plans', preferenceIndex: 5 }, { skill: 'brainstorming' }],
      deviations: [
        {
          skill: 'writing-plans',
          expectedIndex: 1,
          actualIndex: 0,
          reason: 'The user already supplied a concrete workflow.',
        },
      ],
      engineMode: 'none',
      runnerMode: 'change',
      mode: 'optimize',
      sourceRoot: './existing-bundle',
      creator: 'comet-fallback',
      defaultLocale: 'zh',
      locales: ['zh', 'en'],
      engineEnabled: false,
    };

    const normalized = normalizeBundleFactoryPlan({ plan });

    expect(normalized).toEqual({
      goal: 'Optimize an existing Bundle.',
      skillMakerIntent: 'upgrade-existing',
      preferredSkills: ['brainstorming', 'writing-plans'],
      callChain: [
        { skill: 'writing-plans', preferenceIndex: 5 },
        { skill: 'brainstorming', preferenceIndex: 0 },
      ],
      deviations: [
        {
          skill: 'writing-plans',
          expectedIndex: 1,
          actualIndex: 0,
          reason: 'The user already supplied a concrete workflow.',
        },
      ],
      engineMode: 'none',
      runnerMode: 'change',
      mode: 'optimize',
      sourceRoot: './existing-bundle',
      creator: 'comet-fallback',
      defaultLocale: 'zh',
      locales: ['zh', 'en'],
      engineEnabled: false,
    });
  });

  it('normalizes user-provided stage names for generated internal Skills', () => {
    const normalized = normalizeBundleFactoryPlan({
      plan: {
        goal: 'Customize /comet with a named grill stage.',
        callChain: ['comet-design', 'grill-me', 'comet-build'],
        stageNames: [
          {
            skill: 'grill-me',
            name: 'comet-grill-flow-design-pressure-test',
            phase: 'design',
            label: 'Design pressure test',
          },
        ],
      },
    });

    expect(normalized.stageNameOverrides).toEqual([
      {
        skill: 'grill-me',
        name: 'comet-grill-flow-design-pressure-test',
        phase: 'design',
        label: 'Design pressure test',
      },
    ]);
  });

  it('rejects invalid or duplicate custom stage names before proposal generation', () => {
    expect(() =>
      normalizeBundleFactoryPlan({
        plan: {
          goal: 'Customize /comet with duplicate stage names.',
          callChain: ['comet-design', 'grill-me'],
          stageNames: [
            { skill: 'comet-design', name: 'duplicate-stage' },
            { skill: 'grill-me', name: 'duplicate-stage' },
          ],
        },
      }),
    ).toThrow(/duplicate stage name/iu);

    expect(() =>
      normalizeBundleFactoryPlan({
        plan: {
          goal: 'Customize /comet with invalid stage names.',
          callChain: ['comet-design'],
          stageNames: [{ skill: 'comet-design', name: 'Bad Stage Name' }],
        },
      }),
    ).toThrow(/invalid stage name/iu);
  });

  it('rejects optimize mode without sourceRoot', () => {
    expect(() =>
      normalizeBundleFactoryPlan({
        plan: {
          goal: 'Optimize an existing Bundle.',
          mode: 'optimize',
          callChain: ['brainstorming'],
        },
      }),
    ).toThrow(/sourceRoot/i);
  });

  it('expands derive mode from the comet base template without changing persisted state mode', () => {
    const normalized = normalizeBundleFactoryPlan({
      plan: {
        goal: 'Customize /comet with security review.',
        mode: 'derive' as never,
        baseTemplate: { skill: 'comet', profile: 'full' } as never,
        templateDelta: {
          add: [{ phase: 'verify', position: 'before', skill: 'security-review' }],
          replace: [{ phase: 'build', step: 'writing-plans', skill: 'team-planning' }],
          disable: [{ phase: 'build', step: 'build-review' }],
        } as never,
      } as never,
    });

    expect(normalized).toMatchObject({
      skillMakerIntent: 'customize-comet',
      baseTemplate: { skill: 'comet', profile: 'full' },
      templateDelta: {
        add: [{ phase: 'verify', position: 'before', skill: 'security-review' }],
        replace: [{ phase: 'build', step: 'writing-plans', skill: 'team-planning' }],
        disable: [{ phase: 'build', step: 'build-review' }],
      },
      templateExpansion: {
        additions: ['verify before: security-review'],
        replacements: ['build writing-plans: writing-plans -> team-planning'],
        disabled: ['build build-review'],
      },
      mode: 'create',
    });
    expect(normalized.callChain.map((item) => item.skill)).toEqual([
      'comet-open',
      'comet-design',
      'team-planning',
      'comet-build',
      'security-review',
      'comet-verify',
      'comet-archive',
    ]);
  });
});
