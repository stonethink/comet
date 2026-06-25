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
    expect(expanded.stageNameHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill: 'comet-open',
          phase: 'open',
          step: 'open',
          recommendedName: 'open',
        }),
        expect.objectContaining({
          skill: 'team-planning',
          phase: 'build',
          step: 'writing-plans',
          recommendedName: 'build-plan',
        }),
        expect.objectContaining({
          skill: 'security-review',
          phase: 'verify',
          recommendedName: 'verify-security-review',
        }),
      ]),
    );
    expect(expanded.stageNameHints.map((hint) => hint.skill)).not.toContain(
      'requesting-code-review',
    );
  });

  it('recommends user-editable stage names for inserted design grill steps', () => {
    const expanded = expandCometSkillMakerTemplate({
      baseTemplate: { skill: 'comet', profile: 'full' },
      templateDelta: {
        add: [{ phase: 'design', position: 'after', skill: 'grill-me' }],
        replace: [],
        disable: [],
      },
    });

    expect(expanded.stageNameHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill: 'grill-me',
          phase: 'design',
          recommendedName: 'design-grill',
        }),
      ]),
    );
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
