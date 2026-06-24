import { describe, expect, it } from 'vitest';
import {
  buildSkillMakerInstallText,
  buildSkillMakerPlanSummary,
  buildSkillMakerResumeText,
  formatSkillMakerPlanSummary,
} from '../../../domains/bundle/user-facing.js';

describe('Skill Maker user-facing summaries', () => {
  it('formats a customize-comet proposal without backend vocabulary first', () => {
    const summary = buildSkillMakerPlanSummary({
      intent: 'customize-comet',
      skillName: 'team-comet',
      goal: 'Add security review before verification.',
      retained: ['open / design / build / verify / archive'],
      additions: ['verify before: security-review'],
      replacements: ['build planning: writing-plans -> team-planning'],
      disabled: [],
      rejected: ['delete verify: verify is the Comet closure step'],
      generated: ['/team-comet', 'Skill files, rules, hooks, scripts'],
      validation: ['Quick validation is recommended before install'],
      install: ['Install/enable into the current Agent after preview'],
      advanced: ['Bundle Factory state is preserved for audit'],
    });

    const text = formatSkillMakerPlanSummary(summary);

    expect(text).toContain('You are making: Customize /comet');
    expect(text).toContain('Keep:');
    expect(text).toContain('Add:');
    expect(text).toContain('Replace:');
    expect(text).toContain('Cannot do:');
    expect(text).toContain('Validate:');
    expect(text).toContain('Install/enable:');
    expect(text.indexOf('Bundle Factory')).toBeGreaterThan(text.indexOf('Advanced details:'));
  });

  it('formats resume text around user progress and next action', () => {
    const text = buildSkillMakerResumeText({
      title: 'Found an unfinished Skill creation',
      completed: ['Plan confirmed', 'Skill files generated'],
      missing: ['Validate this Skill'],
      nextAction: 'Continue validation',
      choices: ['Continue', 'View details', 'Abandon this creation'],
    });

    expect(text).toContain('Found an unfinished Skill creation');
    expect(text).toContain('Completed:');
    expect(text).toContain('Still needed:');
    expect(text).toContain('Next step: Continue validation');
    expect(text).not.toContain('Factory state is draft');
  });

  it('formats install preview without forcing publish/distribute vocabulary', () => {
    const text = buildSkillMakerInstallText({
      preview: true,
      skillName: 'team-comet',
      platforms: ['claude'],
      plannedFiles: ['skill: .claude/skills/team-comet/SKILL.md', 'hook: before-tool'],
      disclosures: ['hook guard reads state before writes'],
    });

    expect(text).toContain('Install preview');
    expect(text).toContain('No files were written');
    expect(text).toContain('Planned files:');
    expect(text).toContain('Executable disclosures:');
    expect(text).not.toContain('Distribution preview');
  });
});
