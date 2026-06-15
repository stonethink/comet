import { promises as fs } from 'fs';
import path from 'path';

export async function readSkillPreferences(projectRoot: string): Promise<string[] | null> {
  const preferencesPath = path.resolve(projectRoot, '.comet', 'skills.txt');
  let source: string;
  try {
    source = await fs.readFile(preferencesPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const seen = new Set<string>();
  const preferences: string[] = [];
  for (const line of source.split(/\r?\n/u)) {
    const name = line.trim();
    if (!name || name.startsWith('#') || seen.has(name)) continue;
    seen.add(name);
    preferences.push(name);
  }
  return preferences;
}
