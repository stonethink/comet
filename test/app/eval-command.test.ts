import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();

vi.mock('child_process', () => ({
  execFileSync,
}));

describe('eval command', () => {
  beforeEach(() => {
    execFileSync.mockReset();
    execFileSync.mockReturnValue(Buffer.from(''));
  });

  it('runs a manifest-backed quick eval from the repo root', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const { evalRunCommand } = await import('../../app/commands/eval.js');
      await evalRunCommand({
        project: 'D:/Project/Comet',
        manifest: 'D:/tmp/demo/comet/eval.yaml',
        quick: true,
      });
    } finally {
      log.mockRestore();
    }

    expect(execFileSync).toHaveBeenCalledWith(
      'uv',
      [
        'run',
        'pytest',
        'local/tests/tasks/test_tasks.py',
        `--eval-manifest=${'D:\\tmp\\demo\\comet\\eval.yaml'}`,
        '-v',
      ],
      {
        cwd: 'D:\\Project\\Comet\\eval',
        stdio: 'inherit',
      },
    );
  });

  it('uses generic-skill-smoke for local skill quick runs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const { evalRunCommand } = await import('../../app/commands/eval.js');
      await evalRunCommand({
        project: 'D:/Project/Comet',
        skillPath: 'D:/tmp/demo-skill',
        skillName: 'demo-skill',
        profile: 'generic',
        quick: true,
      });
    } finally {
      log.mockRestore();
    }

    expect(execFileSync).toHaveBeenCalledWith(
      'uv',
      [
        'run',
        'pytest',
        'local/tests/tasks/test_tasks.py',
        '--task=generic-skill-smoke',
        `--skill-path=${'D:\\tmp\\demo-skill'}`,
        '--skill-name=demo-skill',
        '--profile=generic',
        '-v',
      ],
      {
        cwd: 'D:\\Project\\Comet\\eval',
        stdio: 'inherit',
      },
    );
  });

  it('uses collect-only discovery for manifest smoke checks', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const { evalCollectCommand } = await import('../../app/commands/eval.js');
      await evalCollectCommand({
        project: 'D:/Project/Comet',
        manifest: 'D:/tmp/demo/comet/eval.yaml',
      });
    } finally {
      log.mockRestore();
    }

    expect(execFileSync).toHaveBeenCalledWith(
      'uv',
      [
        'run',
        'pytest',
        'local/tests/tasks/test_tasks.py',
        `--eval-manifest=${'D:\\tmp\\demo\\comet\\eval.yaml'}`,
        '--collect-only',
      ],
      {
        cwd: 'D:\\Project\\Comet\\eval',
        stdio: 'inherit',
      },
    );
  });

  it('prints eval execution details and report path for manifest runs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';
    try {
      const { evalRunCommand } = await import('../../app/commands/eval.js');
      await evalRunCommand({
        project: 'D:/Project/Comet',
        manifest: 'D:/tmp/demo/comet/eval.yaml',
        profile: 'authoring-skill',
        task: 'generic-skill-smoke',
        html: true,
      });
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(output).toContain('Eval root: D:\\Project\\Comet\\eval');
    expect(output).toContain('Mode: run');
    expect(output).toContain('Profile: authoring-skill');
    expect(output).toContain('Task: generic-skill-smoke');
    expect(output).toContain('Experiment:');
    expect(output).toContain('Report path:');
    expect(output).toContain('Report config:');
    expect(output).toContain('Failure attribution:');
  });

  it('surfaces a focused target error before invoking uv', async () => {
    const { evalRunCommand } = await import('../../app/commands/eval.js');

    await expect(
      evalRunCommand({
        project: 'D:/Project/Comet',
      }),
    ).rejects.toThrow('Pass one of --manifest or --skill-path');

    expect(execFileSync).not.toHaveBeenCalled();
  });
});
