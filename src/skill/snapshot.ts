import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { SkillPackage } from './types.js';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function hashSkillPackage(pkg: SkillPackage): string {
  const payload = JSON.stringify(
    stable({ definition: pkg.definition, guardrails: pkg.guardrails, evals: pkg.evals }),
  );
  return createHash('sha256').update(payload).digest('hex');
}

export async function createSkillSnapshot(
  pkg: SkillPackage,
  changeDir: string,
): Promise<{ hash: string; snapshotDir: string }> {
  const hash = hashSkillPackage(pkg);
  const snapshotDir = path.join(changeDir, '.comet', 'skill-snapshot');
  await fs.mkdir(snapshotDir, { recursive: true });
  await fs.copyFile(path.join(pkg.root, 'SKILL.md'), path.join(snapshotDir, 'SKILL.md'));
  await fs.writeFile(
    path.join(snapshotDir, 'package.json'),
    JSON.stringify(
      stable({ definition: pkg.definition, guardrails: pkg.guardrails, evals: pkg.evals }),
      null,
      2,
    ) + '\n',
  );
  await fs.writeFile(path.join(snapshotDir, 'sha256'), hash + '\n');
  return { hash, snapshotDir };
}
