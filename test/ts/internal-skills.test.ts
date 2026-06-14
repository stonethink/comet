import { describe, expect, it } from 'vitest';
import {
  getManagedSkillPaths,
  getManifestSkills,
  getUserFacingSkillNames,
  readManifest,
  type Manifest,
} from '../../src/core/skills.js';

const manifest: Manifest = {
  version: '1.0.0',
  skills: ['comet/SKILL.md', 'comet-open/SKILL.md', 'comet/scripts/runtime.mjs'],
  internalSkills: ['comet-classic/SKILL.md', 'comet-classic/comet/skill.yaml'],
};

describe('internal Skill assets', () => {
  it('includes internal Skills in managed lifecycle paths', () => {
    expect(getManagedSkillPaths(manifest)).toEqual([
      'comet/SKILL.md',
      'comet-open/SKILL.md',
      'comet/scripts/runtime.mjs',
      'comet-classic/SKILL.md',
      'comet-classic/comet/skill.yaml',
    ]);
  });

  it('excludes internal Skills from user-facing command names', () => {
    expect(getUserFacingSkillNames(manifest)).toEqual(['comet', 'comet-open']);
  });

  it('declares the internalSkills collection in the shipped manifest', async () => {
    const shipped = await readManifest();

    expect(shipped.internalSkills).toEqual([
      'comet-classic/SKILL.md',
      'comet-classic/comet/skill.yaml',
      'comet-classic/comet/guardrails.yaml',
      'comet-classic/comet/evals.yaml',
    ]);
    expect(getUserFacingSkillNames(shipped)).not.toContain('comet-classic');
    expect(await getManifestSkills()).toEqual(getManagedSkillPaths(shipped));
  });
});
