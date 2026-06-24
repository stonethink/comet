import { describe, expect, it } from 'vitest';
import { expandCometSkillMakerTemplate } from '../../../domains/bundle/templates/comet-skill-maker-template.js';

describe('Comet Skill Maker template expansion', () => {
  it('expands add, replace, and disable operations into a call chain summary', () => {
    const expanded = expandCometSkillMakerTemplate({
      baseTemplate: { skill: 'comet', profile: 'full' },
      templateDelta: {
        add: [{ phase: 'verify', position: 'before', skill: 'security-review' }],
        replace: [{ phase: 'build', step: 'writing-plans', skill: 'team-planning' }],
        disable: [{ phase: 'build', step: 'build-review' }],
      },
    });

    expect(expanded.callChain.map((step) => step.skill)).toEqual([
      'comet-open',
      'comet-design',
      'team-planning',
      'comet-build',
      'security-review',
      'comet-verify',
      'comet-archive',
    ]);
    expect(expanded.additions).toContain('verify before: security-review');
    expect(expanded.replacements).toContain('build writing-plans: writing-plans -> team-planning');
    expect(expanded.disabled).toContain('build build-review');
    expect(expanded.rejected).toEqual([]);
  });

  it('rejects replacing protected closure steps', () => {
    const expanded = expandCometSkillMakerTemplate({
      baseTemplate: { skill: 'comet', profile: 'full' },
      templateDelta: {
        add: [],
        replace: [{ phase: 'verify', step: 'verify-result-transition', skill: 'skip-verify' }],
        disable: [],
      },
    });

    expect(expanded.rejected).toEqual([
      'verify verify-result-transition: protected steps cannot be replaced',
    ]);
    expect(expanded.callChain.map((step) => step.skill)).toContain('comet-verify');
  });
});
