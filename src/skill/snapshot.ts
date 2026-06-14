import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { SkillPackage } from './types.js';

interface SnapshotFile {
  path: string;
  content: Buffer;
}

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

function packageDocument(pkg: SkillPackage): unknown {
  return stable({ definition: pkg.definition, guardrails: pkg.guardrails, evals: pkg.evals });
}

function normalizedRelativePath(source: string): string {
  return path.posix.normalize(source.replaceAll('\\', '/'));
}

function assertInside(parent: string, target: string, label: string): void {
  const relative = path.relative(parent, target);
  if (relative === '' || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))) {
    return;
  }
  throw new Error(`${label} resolves outside the Skill package`);
}

async function readPackageFile(
  root: string,
  relativePath: string,
  label: string,
): Promise<SnapshotFile> {
  const normalized = normalizedRelativePath(relativePath);
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${label} resolves outside the Skill package`);
  }

  const target = path.resolve(root, ...normalized.split('/'));
  assertInside(root, target, label);

  let realTarget: string;
  try {
    realTarget = await fs.realpath(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${relativePath}`, { cause: error });
    }
    throw error;
  }
  assertInside(root, realTarget, label);
  if (!(await fs.stat(realTarget)).isFile()) {
    throw new Error(`${label} is not a file: ${relativePath}`);
  }

  return { path: normalized, content: await fs.readFile(realTarget) };
}

async function snapshotFiles(pkg: SkillPackage): Promise<SnapshotFile[]> {
  const root = await fs.realpath(pkg.root);
  const files = [await readPackageFile(root, 'SKILL.md', 'SKILL.md')];
  for (const tool of pkg.definition.tools) {
    if (tool.kind !== 'script') continue;
    files.push(await readPackageFile(root, tool.source, `Script tool ${tool.id}`));
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function hashSnapshot(document: unknown, files: SnapshotFile[]): string {
  const fileDigests = files.map((file) => ({
    path: file.path,
    sha256: createHash('sha256').update(file.content).digest('hex'),
  }));
  return createHash('sha256')
    .update(JSON.stringify(stable({ package: document, files: fileDigests })))
    .digest('hex');
}

async function snapshotMaterial(pkg: SkillPackage): Promise<{
  document: unknown;
  files: SnapshotFile[];
  hash: string;
}> {
  const document = packageDocument(pkg);
  const files = await snapshotFiles(pkg);
  return { document, files, hash: hashSnapshot(document, files) };
}

export async function hashSkillPackage(pkg: SkillPackage): Promise<string> {
  return (await snapshotMaterial(pkg)).hash;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function createSkillSnapshot(
  pkg: SkillPackage,
  changeDir: string,
): Promise<{ hash: string; snapshotDir: string }> {
  const material = await snapshotMaterial(pkg);
  const snapshotsRoot = path.resolve(changeDir, '.comet', 'skill-snapshots');
  const snapshotDir = path.join(snapshotsRoot, material.hash);
  await fs.mkdir(snapshotsRoot, { recursive: true });
  if (await pathExists(snapshotDir)) {
    return { hash: material.hash, snapshotDir };
  }

  const temporaryDir = path.join(snapshotsRoot, `.tmp-${randomUUID()}`);
  assertInside(snapshotsRoot, temporaryDir, 'Temporary snapshot');
  assertInside(snapshotsRoot, snapshotDir, 'Published snapshot');

  try {
    await fs.mkdir(temporaryDir);
    for (const file of material.files) {
      const destination = path.join(temporaryDir, ...file.path.split('/'));
      assertInside(temporaryDir, destination, `Snapshot file ${file.path}`);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.content);
    }
    await fs.writeFile(
      path.join(temporaryDir, 'package.json'),
      JSON.stringify(material.document, null, 2) + '\n',
    );
    await fs.writeFile(path.join(temporaryDir, 'sha256'), material.hash + '\n');
    await fs.rename(temporaryDir, snapshotDir);
  } catch (error) {
    if (
      ((error as NodeJS.ErrnoException).code === 'EEXIST' ||
        (error as NodeJS.ErrnoException).code === 'ENOTEMPTY') &&
      (await pathExists(snapshotDir))
    ) {
      await fs.rm(temporaryDir, { recursive: true, force: true });
      return { hash: material.hash, snapshotDir };
    }
    await fs.rm(temporaryDir, { recursive: true, force: true });
    throw error;
  }

  return { hash: material.hash, snapshotDir };
}
