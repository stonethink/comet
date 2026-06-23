import { spawnSync } from 'child_process';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureCliBuilt } from '../helpers/ensure-cli-built.js';

const repositoryRoot = path.resolve('.');
const cli = path.join(repositoryRoot, 'bin', 'comet.js');

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

describe('CLI help text', () => {
  beforeAll(async () => {
    await ensureCliBuilt(repositoryRoot);
  }, 120_000);

  it('marks bundle as the advanced backend and publish as the user-facing path', () => {
    const publishHelp = runCli('publish', '--help');
    const bundleHelp = runCli('bundle', '--help');

    expect(publishHelp.status, publishHelp.stderr).toBe(0);
    expect(bundleHelp.status, bundleHelp.stderr).toBe(0);
    expect(publishHelp.stdout).toContain('Skill publish candidates');
    expect(bundleHelp.stdout).toContain('Advanced Bundle backend');
  });

  it('clarifies that skill eval is the Engine Run runtime path', () => {
    const help = runCli('skill', 'eval', '--help');

    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('Evaluate deterministic Engine Run runtime checks.');
    expect(help.stdout).toContain('comet eval run');
  });
});
