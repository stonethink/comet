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

  it('marks bundle as the advanced backend and keeps skill focused on common user actions', () => {
    const publishHelp = runCli('publish', '--help');
    const bundleHelp = runCli('bundle', '--help');
    const skillHelp = runCli('skill', '--help');

    expect(publishHelp.status, publishHelp.stderr).toBe(0);
    expect(bundleHelp.status, bundleHelp.stderr).toBe(0);
    expect(skillHelp.status, skillHelp.stderr).toBe(0);
    expect(publishHelp.stdout).toContain('Skill publish candidates');
    expect(bundleHelp.stdout).toContain('Advanced Bundle backend');
    expect(skillHelp.stdout).toContain('Install, inspect, and run local Skill packages');
    expect(skillHelp.stdout).toContain('add [options] <path>');
    expect(skillHelp.stdout).toContain('show [options] <skill>');
    expect(skillHelp.stdout).toContain('run [options] <skill>');
    expect(skillHelp.stdout).toContain('continue [options]');
    expect(skillHelp.stdout).not.toContain('install [options] <path>');
    expect(skillHelp.stdout).not.toContain('validate [options] <skill>');
    expect(skillHelp.stdout).not.toContain('inspect [options] <skill>');
    expect(skillHelp.stdout).not.toContain('resume [options]');
  });

  it('separates benchmark evals from Engine Run runtime checks', () => {
    const evalHelp = runCli('eval', '--help');
    const skillCheckHelp = runCli('skill', 'check', '--help');

    expect(evalHelp.status, evalHelp.stderr).toBe(0);
    expect(skillCheckHelp.status, skillCheckHelp.stderr).toBe(0);
    expect(evalHelp.stdout).toContain('Benchmark a Skill or eval manifest with one command');
    expect(evalHelp.stdout).toContain('Usage: comet eval [options] [target]');
    expect(evalHelp.stdout).toContain('--collect');
    expect(evalHelp.stdout).not.toContain('run [options]');
    expect(evalHelp.stdout).not.toContain('collect [options]');
    expect(skillCheckHelp.stdout).toContain('Check deterministic Engine Run runtime checks.');
    expect(skillCheckHelp.stdout).toContain('Use comet eval');
    expect(skillCheckHelp.stdout).toContain('benchmark');
    expect(skillCheckHelp.stdout).toContain('reports');
    expect(skillCheckHelp.stdout).toContain('Runtime check scope');
    expect(skillCheckHelp.stdout).not.toContain('Runtime eval scope');
    expect(skillCheckHelp.stdout).not.toContain('general Skill evals');
  });

  it('does not expose the old skill eval command', () => {
    const help = runCli('skill', '--help');

    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('check [options]');
    expect(help.stdout).not.toContain('eval [options]');
  });

  it('uses benchmark wording for advanced Bundle evidence commands', () => {
    const help = runCli('bundle', '--help');

    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('benchmark-plan');
    expect(help.stdout).toContain('benchmark-record');
    expect(help.stdout).not.toContain('eval-plan');
    expect(help.stdout).not.toContain('eval-record');
  });
});
