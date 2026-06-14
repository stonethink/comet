import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const sourceCommit = '367887e';
const scriptNames = [
  'comet-env.sh',
  'comet-state.sh',
  'comet-yaml-validate.sh',
  'comet-guard.sh',
  'comet-handoff.sh',
  'comet-archive.sh',
  'comet-hook-guard.sh',
] as const;

const referenceRoot = path.resolve('test', 'fixtures', 'classic-0.3.8');
const referenceScripts = path.join(referenceRoot, 'scripts');
const activeScripts = path.resolve('assets', 'skills', 'comet', 'scripts');
const temporaryRoots: string[] = [];

function findUsableBash(): string | null {
  const candidates = [
    process.env.COMET_TEST_BASH,
    'bash',
    ...(process.platform === 'win32'
      ? [
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
          'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
        ]
      : []),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of [...new Set(candidates)]) {
    const probe = spawnSync(candidate, ['-lc', 'uname -s'], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim() && !/linux/i.test(probe.stdout)) {
      return candidate;
    }
    if (process.platform !== 'win32' && probe.status === 0 && probe.stdout.trim()) {
      return candidate;
    }
  }
  return null;
}

const bashCommand = findUsableBash();
const describeBash = bashCommand ? describe : describe.skip;

function toBashPath(filePath: string): string {
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  const drive = resolved.match(/^([A-Za-z]):\/(.*)$/);
  return drive ? `/${drive[1].toLowerCase()}/${drive[2]}` : resolved;
}

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await fs.readFile(filePath))
    .digest('hex');
}

async function copyScripts(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  await Promise.all(
    scriptNames.map(async (name) => {
      await fs.copyFile(path.join(source, name), path.join(destination, name));
    }),
  );
}

function runScript(cwd: string, scripts: string, name: string, args: string[]) {
  if (!bashCommand) throw new Error('Bash is required for differential contract execution');
  return spawnSync(bashCommand, [toBashPath(path.join(scripts, name)), ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function normalizeOutput(value: string, root: string): string {
  return value.replaceAll(root, '<ROOT>').replaceAll(toBashPath(root), '<ROOT>');
}

function legacyProjection(document: Record<string, unknown>): Record<string, unknown> {
  const runKeys = new Set([
    'skill',
    'classic_profile',
    'classic_migration',
    'run_id',
    'skill_version',
    'skill_hash',
    'orchestration',
    'current_step',
    'iteration',
    'pending',
    'pending_ref',
    'trajectory_ref',
    'context_ref',
    'artifacts_ref',
    'checkpoint_ref',
    'run_status',
    'run_retries',
  ]);
  return Object.fromEntries(Object.entries(document).filter(([key]) => !runKeys.has(key)));
}

interface StateObservation {
  status: number | null;
  stdout: string;
  stderr: string;
  yaml: Record<string, unknown>;
}

async function observeState(
  sourceScripts: string,
  profile: 'full' | 'hotfix' | 'tweak',
  followUp?: string[],
): Promise<StateObservation> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `comet-classic-${profile}-`));
  temporaryRoots.push(root);
  const scripts = path.join(root, 'scripts');
  await copyScripts(sourceScripts, scripts);

  const name = `${profile}-change`;
  const init = runScript(root, scripts, 'comet-state.sh', ['init', name, profile]);
  if (init.status !== 0) {
    return {
      status: init.status,
      stdout: normalizeOutput(init.stdout, root),
      stderr: normalizeOutput(init.stderr, root),
      yaml: {},
    };
  }

  const result = followUp ? runScript(root, scripts, 'comet-state.sh', [...followUp, name]) : init;
  const yamlPath = path.join(root, 'openspec', 'changes', name, '.comet.yaml');
  const yaml = parse(await fs.readFile(yamlPath, 'utf8')) as Record<string, unknown>;

  return {
    status: result.status,
    stdout: normalizeOutput(result.stdout, root),
    stderr: normalizeOutput(result.stderr, root),
    yaml: legacyProjection(yaml),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })),
  );
});

describe('frozen Classic 0.3.8 reference', () => {
  it('records the source commit and checksums for every compatibility script', async () => {
    const readme = await fs.readFile(path.join(referenceRoot, 'README.md'), 'utf8');
    const checksums = JSON.parse(
      await fs.readFile(path.join(referenceRoot, 'checksums.json'), 'utf8'),
    ) as Record<string, string>;

    expect(readme).toContain(sourceCommit);
    expect(Object.keys(checksums).sort()).toEqual([...scriptNames].sort());

    for (const name of scriptNames) {
      expect(await sha256(path.join(referenceScripts, name))).toBe(checksums[name]);
    }
  });
});

describeBash('Classic 0.3.8 differential contract', () => {
  for (const profile of ['full', 'hotfix', 'tweak'] as const) {
    it(`preserves ${profile} initialization`, async () => {
      expect(await observeState(activeScripts, profile)).toEqual(
        await observeState(referenceScripts, profile),
      );
    });

    it(`preserves ${profile} next-skill routing`, async () => {
      expect(await observeState(activeScripts, profile, ['next'])).toEqual(
        await observeState(referenceScripts, profile, ['next']),
      );
    });
  }

  it('preserves rejection of an invalid transition', async () => {
    expect(await observeState(activeScripts, 'full', ['transition', 'build-complete'])).toEqual(
      await observeState(referenceScripts, 'full', ['transition', 'build-complete']),
    );
  });
});
