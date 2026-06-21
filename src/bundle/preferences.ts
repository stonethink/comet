import { readSkillPreferenceEntries } from '../skill/find.js';

export { readSkillPreferenceEntries } from '../skill/find.js';

export async function readSkillPreferences(projectRoot: string): Promise<string[] | null> {
  const entries = await readSkillPreferenceEntries(projectRoot);
  return entries?.map((entry) => entry.query) ?? null;
}
