import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import type { Dirent } from 'fs';
import os from 'os';
import path from 'path';
import { parse } from 'yaml';
import { getPlatformSkillsDir, PLATFORMS, type Platform } from '../core/platforms.js';

export interface BundleCandidateSource {
  name: string;
  platform: string;
  scope: 'project' | 'global';
  root: string;
  description: string;
  skillMd: string;
  hash: string;
}

export interface BundleCandidate {
  name: string;
  status: 'available' | 'missing' | 'ambiguous';
  sources: BundleCandidateSource[];
}

interface CandidateRoot {
  platform: Platform;
  scope: 'project' | 'global';
  root: string;
}

interface HashedFile {
  relativePath: string;
  kind: 'file' | 'symlink';
  content: Buffer;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validSkillName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name);
}

function candidatePlatformId(platform: Platform): string {
  return platform.id === 'claude' ? 'claude-code' : platform.id;
}

function candidateRoots(options: { projectRoot: string; homeDir: string }): CandidateRoot[] {
  return PLATFORMS.flatMap((platform) => [
    {
      platform,
      scope: 'project' as const,
      root: path.resolve(options.projectRoot, platform.skillsDir, 'skills'),
    },
    {
      platform,
      scope: 'global' as const,
      root: path.resolve(options.homeDir, getPlatformSkillsDir(platform, 'global'), 'skills'),
    },
  ]);
}

async function directoryEntries(root: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function collectHashFiles(root: string, relative = ''): Promise<HashedFile[]> {
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((left, right) =>
    compareText(left.name, right.name),
  );
  const files: HashedFile[] = [];
  for (const entry of entries) {
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHashFiles(root, relativePath)));
    } else if (entry.isSymbolicLink()) {
      files.push({
        relativePath,
        kind: 'symlink',
        content: Buffer.from(await fs.readlink(target)),
      });
    } else if (entry.isFile()) {
      files.push({ relativePath, kind: 'file', content: await fs.readFile(target) });
    }
  }
  return files;
}

async function hashSkillDirectory(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await collectHashFiles(root)) {
    const pathBuffer = Buffer.from(file.relativePath.replaceAll('\\', '/'));
    hash.update(file.kind);
    hash.update('\0');
    hash.update(String(pathBuffer.length));
    hash.update('\0');
    hash.update(pathBuffer);
    hash.update('\0');
    hash.update(String(file.content.length));
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function skillDescription(skillMd: string): string {
  const match = skillMd.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) return '';
  const document = parse(match[1]) as unknown;
  if (
    document &&
    typeof document === 'object' &&
    !Array.isArray(document) &&
    typeof (document as Record<string, unknown>).description === 'string'
  ) {
    return (document as Record<string, string>).description;
  }
  return '';
}

async function readCandidateSource(
  name: string,
  candidateRoot: CandidateRoot,
): Promise<BundleCandidateSource | null> {
  const candidatePath = path.resolve(candidateRoot.root, name);
  const relative = path.relative(candidateRoot.root, candidatePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }

  let root: string;
  let skillMd: string;
  try {
    root = await fs.realpath(candidatePath);
    if (!(await fs.stat(root)).isDirectory()) return null;
    skillMd = await fs.readFile(path.join(root, 'SKILL.md'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  return {
    name,
    platform: candidatePlatformId(candidateRoot.platform),
    scope: candidateRoot.scope,
    root,
    description: skillDescription(skillMd),
    skillMd,
    hash: await hashSkillDirectory(root),
  };
}

async function discoveredNames(roots: CandidateRoot[]): Promise<string[]> {
  const names = new Set<string>();
  for (const candidateRoot of roots) {
    for (const entry of await directoryEntries(candidateRoot.root)) {
      if (entry.isDirectory() && validSkillName(entry.name)) names.add(entry.name);
    }
  }
  return [...names].sort(compareText);
}

export async function discoverBundleCandidates(options: {
  projectRoot: string;
  homeDir?: string;
  preferences?: string[] | null;
}): Promise<BundleCandidate[]> {
  const roots = candidateRoots({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir ?? os.homedir(),
  });
  const names =
    options.preferences === null || options.preferences === undefined
      ? await discoveredNames(roots)
      : options.preferences;
  const candidates: BundleCandidate[] = [];

  for (const name of names) {
    const sources: BundleCandidateSource[] = [];
    const physicalRoots = new Set<string>();
    if (validSkillName(name)) {
      for (const candidateRoot of roots) {
        const source = await readCandidateSource(name, candidateRoot);
        if (!source) continue;
        const identity =
          process.platform === 'win32' ? source.root.toLocaleLowerCase('en-US') : source.root;
        if (physicalRoots.has(identity)) continue;
        physicalRoots.add(identity);
        sources.push(source);
      }
    }
    candidates.push({
      name,
      status: sources.length === 0 ? 'missing' : sources.length === 1 ? 'available' : 'ambiguous',
      sources,
    });
  }
  return candidates;
}
