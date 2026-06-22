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
      callChain: [
        { skill: 'writing-plans', preferenceIndex: 5 },
        { skill: 'brainstorming' },
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
    };

    const normalized = normalizeBundleFactoryPlan({ plan });

    expect(normalized).toEqual({
      goal: 'Optimize an existing Bundle.',
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
});
