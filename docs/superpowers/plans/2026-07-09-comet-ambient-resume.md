# Comet Ambient Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Comet Ambient Resume so agents can safely recover a single relevant active Comet workflow without attaching unrelated work to it.

**Architecture:** Add a read-only Classic resume probe domain module, expose it through both Classic runtime and the top-level `comet resume-probe` CLI, then inject a managed XML-tagged rule block into project `AGENTS.md` and `CLAUDE.md`. Keep `.comet.yaml`, existing Classic diagnostics, and existing install/update/uninstall flows as the source of truth.

**Tech Stack:** TypeScript, Node.js 20 ESM, Commander, Vitest, existing Classic runtime bundling, existing platform install/uninstall helpers.

## Global Constraints

- 回答和 user-facing 中文内容保持中文；Changelog 写英文。
- Do not modify original Superpowers or OpenSpec Skills.
- Keep `.comet.yaml` and existing Classic runtime diagnostics as the workflow source of truth.
- Runtime probe must not call an LLM, OpenSpec, Superpowers, build, test, or git commands.
- Do not add `test/ts/`; tests must follow current ownership roots.
- Skill content changes start in `assets/skills-zh/` and then sync to `assets/skills/`.
- After runtime source changes, run `node scripts/build/build-classic-runtime.mjs` to sync `assets/skills/comet/scripts/comet-runtime.mjs` and new launchers.
- If adding a Classic launcher, update `config/repository-layout.json`, `assets/manifest.json`, and `test/domains/comet-classic/comet-scripts.test.ts`.
- Project instruction injection must preserve user-authored content outside `<comet-ambient-resume>...</comet-ambient-resume>`.
- Before changelog edits, re-check `package.json`, `origin/master:package.json`, existing top changelog entry, and last tag.

---

## File Structure

- Create `domains/comet-classic/classic-resume-probe.ts`: pure read-only probe domain logic, input validation, active change discovery, deterministic request classification, and result shaping.
- Create `domains/comet-classic/classic-resume-probe-command.ts`: Classic command handler for `resume-probe probe <json>` and `resume-probe probe --stdin`.
- Create `domains/comet-classic/classic-resume-probe-entry.ts`: thin launcher entry for `comet-resume-probe.mjs`.
- Modify `domains/comet-classic/classic-cli.ts`: register `resume-probe` as a Classic runtime command.
- Modify `domains/comet-classic/index.ts`: export probe domain and command APIs for app-level CLI reuse.
- Create `app/commands/resume-probe.ts`: top-level `comet resume-probe` command wrapper with `--utterance`, `--stdin`, `--json`, `--no-workflow-work`, and `--already-in-comet-flow`.
- Modify `app/cli/index.ts`: register top-level `resume-probe [path]`.
- Create `domains/skill/managed-markdown.ts`: generic XML-style managed markdown block merge/remove helper.
- Create `domains/skill/project-instructions.ts`: render and install/remove the Comet Ambient Resume block for `AGENTS.md` and `CLAUDE.md`.
- Modify `domains/skill/platform-install.ts`: export and call project instruction installation through `createWorkingDirs`.
- Modify `domains/skill/uninstall.ts`: remove only the managed Ambient Resume block during project-scope uninstall.
- Modify `app/commands/update.ts`: refresh project instruction block for project-scope updates.
- Modify `app/commands/uninstall.ts`: report removed project instruction blocks and handle stale blocks even when no platform target remains.
- Modify `config/repository-layout.json`: add Classic `resumeProbe` entry and output.
- Modify `assets/manifest.json`: add `comet/scripts/comet-resume-probe.mjs`.
- Modify generated assets under `assets/skills/comet/scripts/` after running the Classic runtime build.
- Modify `assets/skills-zh/comet/SKILL.md`, `assets/skills/comet/SKILL.md`, `assets/skills-zh/comet/reference/context-recovery.md`, `assets/skills/comet/reference/context-recovery.md`, `README-zh.md`, `README.md`, and `CHANGELOG.md`.
- Add tests in `test/domains/comet-classic/`, `test/app/`, `test/domains/skill/`, and existing repository/skill test files.

---

### Task 1: Resume Probe Domain Logic

**Files:**
- Create: `domains/comet-classic/classic-resume-probe.ts`
- Test: `test/domains/comet-classic/classic-resume-probe.test.ts`

**Interfaces:**
- Produces:
  - `COMET_RESUME_PROBE_SCHEMA_VERSION = 'comet.resume_probe.v1'`
  - `type CometResumeProbeAction = 'none' | 'auto_resume' | 'ask_user' | 'out_of_scope'`
  - `type CometResumeProbeConfidence = 'none' | 'low' | 'high'`
  - `interface CometResumeProbeInput`
  - `interface CometResumeProbeResult`
  - `async function resolveCometResumeProbe(projectRoot: string, input: unknown): Promise<CometResumeProbeResult>`
- Consumes:
  - `inspectClassicChange(changeDir, name)` from `domains/comet-classic/classic-diagnostics.ts`
  - `readClassicState(changeDir)` from `domains/comet-classic/classic-store.ts`

- [x] **Step 1: Write failing domain tests**

Create `test/domains/comet-classic/classic-resume-probe.test.ts` with these tests:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveCometResumeProbe } from '../../../domains/comet-classic/classic-resume-probe.js';

let tmpDir: string;

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function createChange(
  name: string,
  yaml: string,
  files: Record<string, string> = {},
): Promise<void> {
  const root = path.join(tmpDir, 'openspec', 'changes', name);
  await writeFile(path.join(root, '.comet.yaml'), yaml);
  await writeFile(path.join(root, 'proposal.md'), files['proposal.md'] ?? 'Improve cache ttl\n');
  await writeFile(path.join(root, 'design.md'), files['design.md'] ?? 'Cache ttl design\n');
  await writeFile(path.join(root, 'tasks.md'), files['tasks.md'] ?? '- [ ] Update cache ttl\n');
  await writeFile(path.join(tmpDir, 'docs', 'superpowers', 'specs', 'cache-ttl.md'), '# Cache TTL\n');
  await writeFile(path.join(tmpDir, 'docs', 'superpowers', 'plans', 'cache-ttl.md'), '- [ ] Update cache ttl\n');
}

const buildYaml = [
  'workflow: full',
  'phase: build',
  'archived: false',
  'build_pause: null',
  'isolation: branch',
  'build_mode: executing-plans',
  'tdd_mode: tdd',
  'review_mode: standard',
  'verify_result: pending',
  'auto_transition: true',
  'design_doc: docs/superpowers/specs/cache-ttl.md',
  'plan: docs/superpowers/plans/cache-ttl.md',
  '',
].join('\n');

describe('resolveCometResumeProbe', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-resume-probe-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns none when no active Comet changes exist', async () => {
    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: 'continue',
      agent_context: { non_trivial_work: true, already_in_comet_flow: false },
    });

    expect(result).toMatchObject({
      action: 'none',
      confidence: 'none',
      changeName: null,
      nextCommand: null,
    });
  });

  it('auto resumes a single active change for resume-like work', async () => {
    await createChange('cache-ttl', buildYaml);

    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: '继续刚才的任务',
      agent_context: { non_trivial_work: true, already_in_comet_flow: false },
    });

    expect(result).toMatchObject({
      action: 'auto_resume',
      confidence: 'high',
      changeName: 'cache-ttl',
      phase: 'build',
      nextCommand: '/comet-build',
    });
  });

  it('auto resumes when the request names the active change', async () => {
    await createChange('cache-ttl', buildYaml);

    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: '继续 cache-ttl',
      agent_context: { non_trivial_work: true, already_in_comet_flow: false },
    });

    expect(result.action).toBe('auto_resume');
    expect(result.evidence.some((item) => item.quote.includes('cache-ttl'))).toBe(true);
  });

  it('asks the user when a single active change exists but the request is a new topic', async () => {
    await createChange('cache-ttl', buildYaml);

    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: '给 README 加安装截图',
      agent_context: { non_trivial_work: true, already_in_comet_flow: false },
    });

    expect(result).toMatchObject({
      action: 'ask_user',
      confidence: 'low',
      changeName: 'cache-ttl',
      nextCommand: '/comet-build',
    });
    expect(result.reason).toContain('looks unrelated');
  });

  it('returns out_of_scope for pure questions', async () => {
    await createChange('cache-ttl', buildYaml);

    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: '这个探针靠谱吗',
      agent_context: { non_trivial_work: false, already_in_comet_flow: false },
    });

    expect(result).toMatchObject({
      action: 'out_of_scope',
      confidence: 'low',
      nextCommand: null,
    });
  });

  it('asks the user for multiple active changes without a named change', async () => {
    await createChange('cache-ttl', buildYaml);
    await createChange('eval-noise', buildYaml.replace('Cache ttl design', 'Eval noise design'));

    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: '继续',
      agent_context: { non_trivial_work: true, already_in_comet_flow: false },
    });

    expect(result.action).toBe('ask_user');
    expect(result.reason).toContain('multiple active changes');
  });

  it('asks the user when build is waiting at plan-ready', async () => {
    await createChange('cache-ttl', buildYaml.replace('build_pause: null', 'build_pause: plan-ready'));

    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: '继续',
      agent_context: { non_trivial_work: true, already_in_comet_flow: false },
    });

    expect(result.action).toBe('ask_user');
    expect(result.reason).toContain('decision point');
  });

  it('honors explicit opt-out wording', async () => {
    await createChange('cache-ttl', buildYaml);

    const result = await resolveCometResumeProbe(tmpDir, {
      schema_version: 'comet.resume_probe.v1',
      utterance: '不要恢复 workflow，直接解释这个文件',
      agent_context: { non_trivial_work: false, already_in_comet_flow: false },
    });

    expect(result.action).toBe('out_of_scope');
    expect(result.reason).toContain('opted out');
  });
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-resume-probe.test.ts
```

Expected: FAIL because `domains/comet-classic/classic-resume-probe.ts` does not exist.

- [x] **Step 3: Implement the domain module**

Create `domains/comet-classic/classic-resume-probe.ts`:

```ts
import path from 'path';
import { promises as fs } from 'fs';
import { fileExists, readDir } from '../../platform/fs/file-system.js';
import { inspectClassicChange, type ClassicDiagnostic } from './classic-diagnostics.js';
import { readClassicState } from './classic-store.js';

export const COMET_RESUME_PROBE_SCHEMA_VERSION = 'comet.resume_probe.v1' as const;

export type CometResumeProbeAction = 'none' | 'auto_resume' | 'ask_user' | 'out_of_scope';
export type CometResumeProbeConfidence = 'none' | 'low' | 'high';
export type CometResumeProbeEvidenceSource = 'user' | 'state' | 'repo';

export interface CometResumeProbeInput {
  schema_version: typeof COMET_RESUME_PROBE_SCHEMA_VERSION;
  utterance: string;
  locale: string;
  agent_context: {
    non_trivial_work: boolean;
    already_in_comet_flow: boolean;
  };
}

export interface CometResumeProbeEvidence {
  source: CometResumeProbeEvidenceSource;
  quote: string;
}

export interface CometResumeProbeResult {
  schema_version: typeof COMET_RESUME_PROBE_SCHEMA_VERSION;
  action: CometResumeProbeAction;
  changeName: string | null;
  phase: string | null;
  nextCommand: string | null;
  confidence: CometResumeProbeConfidence;
  reason: string;
  evidence: CometResumeProbeEvidence[];
}

interface ActiveProbeChange {
  name: string;
  directory: string;
  workflow: string;
  phase: string;
  nextCommand: string | null;
  diagnostic: ClassicDiagnostic;
  buildPause: string | null;
  isolation: string | null;
  buildMode: string | null;
  tddMode: string | null;
  reviewMode: string | null;
  verifyResult: string | null;
  archived: boolean;
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeInput(input: unknown): CometResumeProbeInput {
  if (!isRecord(input)) {
    throw new Error('Invalid CometResumeProbeInput: input must be an object');
  }
  if (input.schema_version !== COMET_RESUME_PROBE_SCHEMA_VERSION) {
    throw new Error(
      `Invalid CometResumeProbeInput: schema_version must be ${COMET_RESUME_PROBE_SCHEMA_VERSION}`,
    );
  }
  if (typeof input.utterance !== 'string') {
    throw new Error('Invalid CometResumeProbeInput: utterance must be a string');
  }
  const context = isRecord(input.agent_context) ? input.agent_context : {};
  return {
    schema_version: COMET_RESUME_PROBE_SCHEMA_VERSION,
    utterance: input.utterance,
    locale: typeof input.locale === 'string' ? input.locale : 'unknown',
    agent_context: {
      non_trivial_work: context.non_trivial_work === true,
      already_in_comet_flow: context.already_in_comet_flow === true,
    },
  };
}

function result(
  action: CometResumeProbeAction,
  change: ActiveProbeChange | null,
  confidence: CometResumeProbeConfidence,
  reason: string,
  evidence: CometResumeProbeEvidence[] = [],
): CometResumeProbeResult {
  return {
    schema_version: COMET_RESUME_PROBE_SCHEMA_VERSION,
    action,
    changeName: change?.name ?? null,
    phase: change?.phase ?? null,
    nextCommand: action === 'auto_resume' || action === 'ask_user' ? (change?.nextCommand ?? null) : null,
    confidence,
    reason,
    evidence,
  };
}

async function readIfExists(filePath: string): Promise<string> {
  if (!(await fileExists(filePath))) return '';
  return fs.readFile(filePath, 'utf8');
}

async function changeSearchText(changeDir: string, classic: ActiveProbeChange): Promise<string> {
  const files = ['proposal.md', 'design.md', 'tasks.md'];
  const parts = [classic.name, classic.workflow, classic.phase];
  for (const file of files) {
    parts.push(await readIfExists(path.join(changeDir, file)));
  }
  return parts.join('\n').toLowerCase();
}

async function discoverActiveChanges(projectRoot: string): Promise<ActiveProbeChange[]> {
  const changesDir = path.join(projectRoot, 'openspec', 'changes');
  if (!(await fileExists(changesDir))) return [];

  const entries = await readDir(changesDir);
  const changes: ActiveProbeChange[] = [];
  for (const entry of entries) {
    if (entry === 'archive') continue;
    const changeDir = path.join(changesDir, entry);
    const stat = await fs.stat(changeDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    if (!(await fileExists(path.join(changeDir, '.comet.yaml')))) continue;

    const projection = await readClassicState(changeDir);
    const classic = projection.classic;
    if (!classic || classic.archived) continue;
    const diagnostic = await inspectClassicChange(changeDir, entry);
    const change: ActiveProbeChange = {
      name: entry,
      directory: changeDir,
      workflow: diagnostic.workflow,
      phase: diagnostic.phase,
      nextCommand: diagnostic.nextCommand,
      diagnostic,
      buildPause: classic.buildPause,
      isolation: classic.isolation,
      buildMode: classic.buildMode,
      tddMode: classic.tddMode,
      reviewMode: classic.reviewMode,
      verifyResult: classic.verifyResult,
      archived: classic.archived,
      text: '',
    };
    change.text = await changeSearchText(changeDir, change);
    changes.push(change);
  }
  return changes;
}

const RESUME_WORDS = [
  'continue',
  'resume',
  'carry on',
  'finish',
  'run it',
  'commit',
  'verify',
  'archive',
  '继续',
  '接着',
  '恢复',
  '跑完',
  '提交',
  '验证',
  '归档',
  '修刚才',
];

const QUESTION_WORDS = [
  'what',
  'why',
  'how',
  'explain',
  'summarize',
  'reliable',
  '靠谱吗',
  '是什么',
  '为什么',
  '解释',
  '总结',
  '取名',
  '命名',
];

const OPT_OUT_WORDS = [
  'do not resume',
  "don't resume",
  'without comet',
  'skip comet',
  '不要恢复',
  '不走 comet',
  '不要走 comet',
  '直接解释',
  '只回答',
];

function includesAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => text.includes(word));
}

function hasDecisionPoint(change: ActiveProbeChange): boolean {
  if (!change.diagnostic.valid) return true;
  if (change.phase === 'archive') return true;
  if (change.verifyResult === 'fail') return true;
  if (change.diagnostic.runtimeEval && !change.diagnostic.runtimeEval.passed) return true;
  if (change.phase !== 'build') return false;
  if (change.buildPause === 'plan-ready') return true;
  if (!change.isolation || !change.buildMode) return true;
  if (change.workflow === 'full' && (!change.tddMode || !change.reviewMode)) return true;
  return false;
}

function relatedEvidence(utterance: string, change: ActiveProbeChange): CometResumeProbeEvidence[] {
  const text = utterance.toLowerCase();
  const evidence: CometResumeProbeEvidence[] = [];
  if (text.includes(change.name.toLowerCase())) {
    evidence.push({ source: 'user', quote: change.name });
  }
  const tokens = change.text
    .split(/[^a-zA-Z0-9_\-\u4e00-\u9fff/]+/u)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 4);
  const matched = [...new Set(tokens.filter((token) => text.includes(token)))].slice(0, 3);
  for (const token of matched) {
    evidence.push({ source: 'repo', quote: token });
  }
  return evidence;
}

export async function resolveCometResumeProbe(
  projectRoot: string,
  rawInput: unknown,
): Promise<CometResumeProbeResult> {
  const input = normalizeInput(rawInput);
  const utterance = input.utterance.trim();
  const lower = utterance.toLowerCase();

  if (input.agent_context.already_in_comet_flow) {
    return result('out_of_scope', null, 'low', 'already in Comet flow');
  }
  if (includesAny(lower, OPT_OUT_WORDS)) {
    return result('out_of_scope', null, 'low', 'user opted out of Comet resume', [
      { source: 'user', quote: utterance },
    ]);
  }

  const changes = await discoverActiveChanges(projectRoot);
  if (changes.length === 0) {
    return result('none', null, 'none', 'no active Comet changes');
  }
  if (changes.length > 1) {
    const named = changes.find((change) => lower.includes(change.name.toLowerCase()));
    if (!named) {
      return result('ask_user', null, 'low', 'multiple active changes require a change name');
    }
    return hasDecisionPoint(named)
      ? result('ask_user', named, 'low', 'active change is at a decision point')
      : result('auto_resume', named, 'high', 'request names an active change', [
          { source: 'user', quote: named.name },
        ]);
  }

  const [change] = changes;
  if (hasDecisionPoint(change)) {
    return result('ask_user', change, 'low', 'active change is at a decision point', [
      { source: 'state', quote: `phase: ${change.phase}` },
    ]);
  }

  const resumeLike = includesAny(lower, RESUME_WORDS);
  const questionLike = !input.agent_context.non_trivial_work && includesAny(lower, QUESTION_WORDS);
  if (questionLike && !resumeLike) {
    return result('out_of_scope', change, 'low', 'user asked a question without workflow work');
  }

  const evidence = relatedEvidence(utterance, change);
  if (resumeLike || evidence.length > 0) {
    return result('auto_resume', change, 'high', 'single active change and request is related', [
      { source: 'state', quote: `phase: ${change.phase}` },
      ...evidence,
    ]);
  }

  if (input.agent_context.non_trivial_work) {
    return result('ask_user', change, 'low', 'single active change exists but request looks unrelated');
  }

  return result('out_of_scope', change, 'low', 'request is not workflow work');
}
```

- [x] **Step 4: Run the domain test to verify it passes**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-resume-probe.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit Task 1**

```bash
git add domains/comet-classic/classic-resume-probe.ts test/domains/comet-classic/classic-resume-probe.test.ts
git commit -m "feat: add ambient resume probe logic"
```

---

### Task 2: Classic Runtime Command And Launcher

**Files:**
- Create: `domains/comet-classic/classic-resume-probe-command.ts`
- Create: `domains/comet-classic/classic-resume-probe-entry.ts`
- Modify: `domains/comet-classic/classic-cli.ts`
- Modify: `domains/comet-classic/index.ts`
- Modify: `config/repository-layout.json`
- Modify: `assets/manifest.json`
- Generate: `assets/skills/comet/scripts/comet-runtime.mjs`
- Generate: `assets/skills/comet/scripts/comet-resume-probe.mjs`
- Test: `test/domains/comet-classic/classic-resume-probe-command.test.ts`
- Test: `test/domains/comet-classic/comet-scripts.test.ts`

**Interfaces:**
- Consumes: `resolveCometResumeProbe(projectRoot, input)`
- Produces:
  - Classic command `resume-probe probe <json>`
  - Classic command `resume-probe probe --stdin`
  - Launcher `assets/skills/comet/scripts/comet-resume-probe.mjs`

- [x] **Step 1: Write failing command tests**

Create `test/domains/comet-classic/classic-resume-probe-command.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runClassicCli } from '../../../domains/comet-classic/classic-cli.js';
import { classicResumeProbeCommand } from '../../../domains/comet-classic/classic-resume-probe-command.js';

describe('classicResumeProbeCommand', () => {
  it('prints usage for missing probe subcommand input', async () => {
    const result = await classicResumeProbeCommand([], { json: false });

    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('Usage: comet-resume-probe.mjs probe <input-json>');
  });

  it('reports invalid JSON with exit code 1', async () => {
    const result = await classicResumeProbeCommand(['probe', '{'], { json: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid JSON');
  });

  it('is registered in the shared Classic CLI dispatcher', async () => {
    const result = await runClassicCli(['resume-probe'], {
      'resume-probe': async () => ({ exitCode: 0, stdout: 'ok\n' }),
    });

    expect(result).toMatchObject({ exitCode: 0, stdout: 'ok\n' });
  });
});
```

Then extend `test/domains/comet-classic/comet-scripts.test.ts` in the existing thin-launcher test:

```ts
const sources: Record<string, string> = {
  state: await fs.readFile(path.join(scriptsDir, 'comet-state.mjs'), 'utf-8'),
  validate: await fs.readFile(path.join(scriptsDir, 'comet-yaml-validate.mjs'), 'utf-8'),
  guard: await fs.readFile(path.join(scriptsDir, 'comet-guard.mjs'), 'utf-8'),
  handoff: await fs.readFile(path.join(scriptsDir, 'comet-handoff.mjs'), 'utf-8'),
  archive: await fs.readFile(path.join(scriptsDir, 'comet-archive.mjs'), 'utf-8'),
  hookGuard: await fs.readFile(path.join(scriptsDir, 'comet-hook-guard.mjs'), 'utf-8'),
  intent: await fs.readFile(path.join(scriptsDir, 'comet-intent.mjs'), 'utf-8'),
  resumeProbe: await fs.readFile(path.join(scriptsDir, 'comet-resume-probe.mjs'), 'utf-8'),
};
expect(sources.resumeProbe).toContain("await main(['resume-probe', ...process.argv.slice(2)])");
```

If the test currently uses a different object shape, add `resumeProbe` to that shape without changing unrelated assertions.

- [x] **Step 2: Run the failing tests**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-resume-probe-command.test.ts test/domains/comet-classic/comet-scripts.test.ts
```

Expected: FAIL because command, launcher, manifest, and generated asset are missing.

- [x] **Step 3: Implement Classic command files**

Create `domains/comet-classic/classic-resume-probe-command.ts`:

```ts
import type { ClassicCommandHandler, ClassicCommandResult } from './classic-cli.js';
import { resolveCometResumeProbe } from './classic-resume-probe.js';

function result(exitCode: number, stdout?: string, stderr?: string): ClassicCommandResult {
  return {
    exitCode,
    ...(stdout === undefined ? {} : { stdout }),
    ...(stderr === undefined ? {} : { stderr }),
  };
}

function usage(): ClassicCommandResult {
  return result(
    64,
    undefined,
    'Usage: comet-resume-probe.mjs probe <input-json>\nUsage: comet-resume-probe.mjs probe --stdin',
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const classicResumeProbeCommand: ClassicCommandHandler = async (args) => {
  const [subcommand, input] = args;
  if (subcommand !== 'probe') return usage();

  const source = input === '--stdin' ? await readStdin() : input;
  if (!source) return usage();

  try {
    const resolution = await resolveCometResumeProbe(process.cwd(), JSON.parse(source));
    return result(0, `${JSON.stringify(resolution, null, 2)}\n`);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return result(1, undefined, `Invalid JSON: ${error.message}`);
    }
    return result(1, undefined, error instanceof Error ? error.message : String(error));
  }
};
```

Create `domains/comet-classic/classic-resume-probe-entry.ts`:

```ts
import { classicResumeProbeCommand } from './classic-resume-probe-command.js';
import { runClassicScript } from './classic-script-entry.js';

process.exitCode = await runClassicScript(classicResumeProbeCommand);
```

- [x] **Step 4: Register the Classic command**

Modify `domains/comet-classic/classic-cli.ts`:

```ts
import { classicResumeProbeCommand } from './classic-resume-probe-command.js';

export const CLASSIC_COMMANDS = [
  'state',
  'validate',
  'guard',
  'handoff',
  'archive',
  'hook-guard',
  'intent',
  'resume-probe',
] as const;

const DEFAULT_HANDLERS: ClassicCommandHandlers = {
  state: classicStateCommand,
  validate: classicValidateCommand,
  guard: classicGuardCommand,
  handoff: classicHandoffCommand,
  archive: classicArchiveCommand,
  'hook-guard': classicHookGuardCommand,
  intent: classicIntentCommand,
  'resume-probe': classicResumeProbeCommand,
};
```

Modify `domains/comet-classic/index.ts`:

```ts
export * from './classic-resume-probe.js';
export * from './classic-resume-probe-command.js';
```

- [x] **Step 5: Register runtime output and manifest asset**

Modify `config/repository-layout.json`:

```json
"classicRuntime": {
  "entries": {
    "runtime": "domains/comet-classic/classic-cli.ts",
    "state": "domains/comet-classic/classic-state-entry.ts",
    "validate": "domains/comet-classic/classic-validate-entry.ts",
    "guard": "domains/comet-classic/classic-guard-entry.ts",
    "handoff": "domains/comet-classic/classic-handoff-entry.ts",
    "archive": "domains/comet-classic/classic-archive-entry.ts",
    "hookGuard": "domains/comet-classic/classic-hook-guard-entry.ts",
    "intent": "domains/comet-classic/classic-intent-entry.ts",
    "resumeProbe": "domains/comet-classic/classic-resume-probe-entry.ts"
  },
  "outputs": {
    "runtime": "assets/skills/comet/scripts/comet-runtime.mjs",
    "state": "assets/skills/comet/scripts/comet-state.mjs",
    "validate": "assets/skills/comet/scripts/comet-yaml-validate.mjs",
    "guard": "assets/skills/comet/scripts/comet-guard.mjs",
    "handoff": "assets/skills/comet/scripts/comet-handoff.mjs",
    "archive": "assets/skills/comet/scripts/comet-archive.mjs",
    "hookGuard": "assets/skills/comet/scripts/comet-hook-guard.mjs",
    "intent": "assets/skills/comet/scripts/comet-intent.mjs",
    "resumeProbe": "assets/skills/comet/scripts/comet-resume-probe.mjs"
  }
}
```

Modify `assets/manifest.json` and add this item after `comet/scripts/comet-intent.mjs`:

```json
"comet/scripts/comet-resume-probe.mjs"
```

- [x] **Step 6: Build generated Classic runtime assets**

Run:

```bash
node scripts/build/build-classic-runtime.mjs
```

Expected:

- `assets/skills/comet/scripts/comet-runtime.mjs` changes.
- `assets/skills/comet/scripts/comet-resume-probe.mjs` is created as a thin launcher.

- [x] **Step 7: Run focused command and script tests**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-resume-probe-command.test.ts test/domains/comet-classic/comet-scripts.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit Task 2**

```bash
git add domains/comet-classic/classic-resume-probe-command.ts domains/comet-classic/classic-resume-probe-entry.ts domains/comet-classic/classic-cli.ts domains/comet-classic/index.ts config/repository-layout.json assets/manifest.json assets/skills/comet/scripts/comet-runtime.mjs assets/skills/comet/scripts/comet-resume-probe.mjs test/domains/comet-classic/classic-resume-probe-command.test.ts test/domains/comet-classic/comet-scripts.test.ts
git commit -m "feat: expose ambient resume in classic runtime"
```

---

### Task 3: Top-Level `comet resume-probe` CLI

**Files:**
- Create: `app/commands/resume-probe.ts`
- Modify: `app/cli/index.ts`
- Test: `test/app/resume-probe.test.ts`
- Test: `test/app/cli-help.test.ts`

**Interfaces:**
- Consumes: `resolveCometResumeProbe(projectRoot, input)`
- Produces: `resumeProbeCommand(targetPath, options)`
- Produces CLI: `comet resume-probe [path] --utterance <text> --json`

- [x] **Step 1: Write failing app tests**

Create `test/app/resume-probe.test.ts`:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeProbeCommand } from '../../app/commands/resume-probe.js';

let tmpDir: string;
let output: string[];
let error: string[];

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

describe('resumeProbeCommand', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-resume-cli-'));
    output = [];
    error = [];
    vi.spyOn(console, 'log').mockImplementation((value = '') => output.push(String(value)));
    vi.spyOn(console, 'error').mockImplementation((value = '') => error.push(String(value)));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints JSON probe output', async () => {
    await resumeProbeCommand(tmpDir, {
      utterance: '继续',
      json: true,
      nonTrivialWork: true,
      alreadyInCometFlow: false,
    });

    expect(JSON.parse(output.join('\n'))).toMatchObject({
      schema_version: 'comet.resume_probe.v1',
      action: 'none',
    });
  });

  it('prints a compact text summary outside JSON mode', async () => {
    await resumeProbeCommand(tmpDir, {
      utterance: '继续',
      json: false,
      nonTrivialWork: true,
      alreadyInCometFlow: false,
    });

    expect(output.join('\n')).toContain('action: none');
  });
});
```

Extend `test/app/cli-help.test.ts`:

```ts
it('exposes ambient resume probe help', () => {
  const help = runCli('--help');
  const commandHelp = runCli('resume-probe', '--help');

  expect(help.status, help.stderr).toBe(0);
  expect(commandHelp.status, commandHelp.stderr).toBe(0);
  expect(help.stdout).toContain('resume-probe');
  expect(commandHelp.stdout).toContain('Probe whether an active Comet workflow should resume');
  expect(commandHelp.stdout).toContain('--utterance');
});
```

- [x] **Step 2: Run failing app tests**

Run:

```bash
npx vitest run test/app/resume-probe.test.ts test/app/cli-help.test.ts
```

Expected: FAIL because `app/commands/resume-probe.ts` and CLI registration are missing.

- [x] **Step 3: Implement the app command**

Create `app/commands/resume-probe.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import {
  COMET_RESUME_PROBE_SCHEMA_VERSION,
  resolveCometResumeProbe,
  type CometResumeProbeInput,
  type CometResumeProbeResult,
} from '../../domains/comet-classic/classic-resume-probe.js';

interface ResumeProbeOptions {
  utterance?: string;
  stdin?: boolean;
  json?: boolean;
  nonTrivialWork?: boolean;
  alreadyInCometFlow?: boolean;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function formatText(result: CometResumeProbeResult): string {
  const lines = [
    `action: ${result.action}`,
    `confidence: ${result.confidence}`,
    `reason: ${result.reason}`,
  ];
  if (result.changeName) lines.push(`change: ${result.changeName}`);
  if (result.phase) lines.push(`phase: ${result.phase}`);
  if (result.nextCommand) lines.push(`next: ${result.nextCommand}`);
  return `${lines.join('\n')}\n`;
}

async function resolveUtterance(options: ResumeProbeOptions): Promise<string> {
  if (options.stdin) return readStdin();
  return options.utterance ?? '';
}

async function resolveProjectLanguage(projectPath: string): Promise<string> {
  const config = path.join(projectPath, '.comet', 'config.yaml');
  try {
    const content = await fs.readFile(config, 'utf8');
    const match = content.match(/^language:\s*(.+)$/mu);
    return match?.[1]?.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function resumeProbeCommand(
  targetPath: string,
  options: ResumeProbeOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const utterance = await resolveUtterance(options);
  const input: CometResumeProbeInput = {
    schema_version: COMET_RESUME_PROBE_SCHEMA_VERSION,
    utterance,
    locale: await resolveProjectLanguage(projectPath),
    agent_context: {
      non_trivial_work: options.nonTrivialWork !== false,
      already_in_comet_flow: options.alreadyInCometFlow === true,
    },
  };
  const result = await resolveCometResumeProbe(projectPath, input);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatText(result));
}
```

- [x] **Step 4: Register CLI command**

Modify `app/cli/index.ts`:

```ts
import { resumeProbeCommand } from '../commands/resume-probe.js';
```

Add after `status`:

```ts
program
  .command('resume-probe [path]')
  .description('Probe whether an active Comet workflow should resume')
  .option('--utterance <text>', 'User request to classify', '')
  .option('--stdin', 'Read the user request from stdin')
  .option('--json', 'Output as JSON')
  .option('--no-workflow-work', 'Treat the request as informational instead of workflow work')
  .option('--already-in-comet-flow', 'Report out_of_scope when the current turn is already inside Comet')
  .action(async (targetPath = '.', options) => {
    await resumeProbeCommand(targetPath, options);
  });
```

- [x] **Step 5: Run focused app tests**

Run:

```bash
npx vitest run test/app/resume-probe.test.ts test/app/cli-help.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 3**

```bash
git add app/commands/resume-probe.ts app/cli/index.ts test/app/resume-probe.test.ts test/app/cli-help.test.ts
git commit -m "feat: add ambient resume CLI"
```

---

### Task 4: Managed Markdown Block Helpers

**Files:**
- Create: `domains/skill/managed-markdown.ts`
- Test: `test/domains/skill/managed-markdown.test.ts`

**Interfaces:**
- Produces:
  - `renderManagedMarkdownBlock(tagName: string, content: string): string`
  - `mergeManagedMarkdownBlock(filePath: string, options: ManagedMarkdownBlockOptions): Promise<ManagedMarkdownBlockResult>`
  - `removeManagedMarkdownBlock(filePath: string, tagName: string): Promise<ManagedMarkdownBlockResult>`

- [x] **Step 1: Write failing managed block tests**

Create `test/domains/skill/managed-markdown.test.ts`:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  mergeManagedMarkdownBlock,
  removeManagedMarkdownBlock,
} from '../../../domains/skill/managed-markdown.js';

let tmpDir: string;
let filePath: string;

describe('managed markdown blocks', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-managed-md-'));
    filePath = path.join(tmpDir, 'AGENTS.md');
  });

  it('creates a missing file with one managed block', async () => {
    const result = await mergeManagedMarkdownBlock(filePath, {
      tagName: 'comet-ambient-resume',
      content: 'body\n',
    });

    expect(result.action).toBe('created');
    expect(await fs.readFile(filePath, 'utf8')).toBe(
      '<comet-ambient-resume>\nbody\n</comet-ambient-resume>\n',
    );
  });

  it('appends a managed block without changing user content', async () => {
    await fs.writeFile(filePath, '# User Rules\n\nKeep this.\n', 'utf8');

    await mergeManagedMarkdownBlock(filePath, {
      tagName: 'comet-ambient-resume',
      content: 'body\n',
    });

    expect(await fs.readFile(filePath, 'utf8')).toBe(
      '# User Rules\n\nKeep this.\n\n<comet-ambient-resume>\nbody\n</comet-ambient-resume>\n',
    );
  });

  it('replaces only the managed block', async () => {
    await fs.writeFile(
      filePath,
      'before\n\n<comet-ambient-resume>\nold\n</comet-ambient-resume>\n\nafter\n',
      'utf8',
    );

    await mergeManagedMarkdownBlock(filePath, {
      tagName: 'comet-ambient-resume',
      content: 'new\n',
    });

    expect(await fs.readFile(filePath, 'utf8')).toBe(
      'before\n\n<comet-ambient-resume>\nnew\n</comet-ambient-resume>\n\nafter\n',
    );
  });

  it('rejects incomplete blocks', async () => {
    await fs.writeFile(filePath, '<comet-ambient-resume>\nbody\n', 'utf8');

    await expect(
      mergeManagedMarkdownBlock(filePath, {
        tagName: 'comet-ambient-resume',
        content: 'new\n',
      }),
    ).rejects.toThrow(/incomplete managed block/);
  });

  it('removes only the managed block', async () => {
    await fs.writeFile(
      filePath,
      'before\n\n<comet-ambient-resume>\nbody\n</comet-ambient-resume>\n\nafter\n',
      'utf8',
    );

    const result = await removeManagedMarkdownBlock(filePath, 'comet-ambient-resume');

    expect(result.action).toBe('removed');
    expect(await fs.readFile(filePath, 'utf8')).toBe('before\n\nafter\n');
  });
});
```

- [x] **Step 2: Run the failing helper tests**

Run:

```bash
npx vitest run test/domains/skill/managed-markdown.test.ts
```

Expected: FAIL because the helper module does not exist.

- [x] **Step 3: Implement managed markdown helper**

Create `domains/skill/managed-markdown.ts`:

```ts
import path from 'path';
import { promises as fs } from 'fs';
import { ensureDir, fileExists } from '../../platform/fs/file-system.js';

export interface ManagedMarkdownBlockOptions {
  tagName: string;
  content: string;
}

export interface ManagedMarkdownBlockResult {
  action: 'created' | 'appended' | 'updated' | 'unchanged' | 'removed' | 'missing';
  changed: boolean;
}

function tagPattern(tagName: string): RegExp {
  return new RegExp(`<\\/?${tagName}>`, 'g');
}

function blockPattern(tagName: string): RegExp {
  return new RegExp(`<${tagName}>\\n[\\s\\S]*?\\n</${tagName}>\\n?`, 'g');
}

function validateTagName(tagName: string): void {
  if (!/^[a-z][a-z0-9-]*$/u.test(tagName)) {
    throw new Error(`Invalid managed block tag name: ${tagName}`);
  }
}

export function renderManagedMarkdownBlock(tagName: string, content: string): string {
  validateTagName(tagName);
  return `<${tagName}>\n${content.trimEnd()}\n</${tagName}>\n`;
}

function assertSingleCompleteBlock(existing: string, tagName: string): RegExpMatchArray[] {
  const tags = [...existing.matchAll(tagPattern(tagName))];
  if (tags.length === 0) return [];
  if (tags.length !== 2) {
    throw new Error(`Cannot update ${tagName}: incomplete managed block`);
  }
  if (tags[0][0] !== `<${tagName}>` || tags[1][0] !== `</${tagName}>`) {
    throw new Error(`Cannot update ${tagName}: malformed managed block`);
  }
  const blocks = [...existing.matchAll(blockPattern(tagName))];
  if (blocks.length !== 1) {
    throw new Error(`Cannot update ${tagName}: duplicate or incomplete managed block`);
  }
  return blocks;
}

export async function mergeManagedMarkdownBlock(
  filePath: string,
  options: ManagedMarkdownBlockOptions,
): Promise<ManagedMarkdownBlockResult> {
  validateTagName(options.tagName);
  const block = renderManagedMarkdownBlock(options.tagName, options.content);

  if (!(await fileExists(filePath))) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, block, 'utf8');
    return { action: 'created', changed: true };
  }

  const existing = await fs.readFile(filePath, 'utf8');
  const blocks = assertSingleCompleteBlock(existing, options.tagName);
  if (blocks.length === 0) {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    await fs.writeFile(filePath, `${existing}${separator}${block}`, 'utf8');
    return { action: 'appended', changed: true };
  }

  if (blocks[0][0] === block) {
    return { action: 'unchanged', changed: false };
  }

  await fs.writeFile(filePath, existing.replace(blockPattern(options.tagName), block), 'utf8');
  return { action: 'updated', changed: true };
}

export async function removeManagedMarkdownBlock(
  filePath: string,
  tagName: string,
): Promise<ManagedMarkdownBlockResult> {
  validateTagName(tagName);
  if (!(await fileExists(filePath))) return { action: 'missing', changed: false };
  const existing = await fs.readFile(filePath, 'utf8');
  const blocks = assertSingleCompleteBlock(existing, tagName);
  if (blocks.length === 0) return { action: 'missing', changed: false };
  const next = existing.replace(blockPattern(tagName), '').replace(/\n{3,}/gu, '\n\n');
  await fs.writeFile(filePath, next, 'utf8');
  return { action: 'removed', changed: true };
}
```

- [x] **Step 4: Run helper tests**

Run:

```bash
npx vitest run test/domains/skill/managed-markdown.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit Task 4**

```bash
git add domains/skill/managed-markdown.ts test/domains/skill/managed-markdown.test.ts
git commit -m "feat: add managed project instruction blocks"
```

---

### Task 5: Project Instruction Injection In Init, Update, And Uninstall

**Files:**
- Create: `domains/skill/project-instructions.ts`
- Modify: `domains/skill/platform-install.ts`
- Modify: `domains/skill/uninstall.ts`
- Modify: `app/commands/update.ts`
- Modify: `app/commands/uninstall.ts`
- Test: `test/domains/skill/project-instructions.test.ts`
- Test: `test/domains/skill/skills.test.ts`
- Test: `test/app/update.test.ts`
- Test: `test/app/uninstall.test.ts`

**Interfaces:**
- Produces:
  - `installCometProjectInstructions(projectPath: string, languageId: SkillLanguageId): Promise<ProjectInstructionResult>`
  - `removeCometProjectInstructions(projectPath: string): Promise<ProjectInstructionRemovalResult>`
  - `renderCometAmbientResumeContent(languageId: SkillLanguageId): string`
- Consumes: `mergeManagedMarkdownBlock` and `removeManagedMarkdownBlock`

- [x] **Step 1: Write failing project instruction tests**

Create `test/domains/skill/project-instructions.test.ts`:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  installCometProjectInstructions,
  removeCometProjectInstructions,
} from '../../../domains/skill/project-instructions.js';

let tmpDir: string;

describe('Comet project instructions', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-project-instructions-'));
  });

  it('creates AGENTS.md and CLAUDE.md with managed XML blocks', async () => {
    const result = await installCometProjectInstructions(tmpDir, 'zh');

    expect(result.changed).toBe(2);
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
      const content = await fs.readFile(path.join(tmpDir, name), 'utf8');
      expect(content).toContain('<comet-ambient-resume>');
      expect(content).toContain('</comet-ambient-resume>');
      expect(content).toContain('开始处理需要改动或调查的任务前');
    }
  });

  it('preserves existing user rules and updates only the managed block', async () => {
    const agents = path.join(tmpDir, 'AGENTS.md');
    await fs.writeFile(agents, '# User Rules\n\n必须中文回答。\n', 'utf8');

    await installCometProjectInstructions(tmpDir, 'en');
    await installCometProjectInstructions(tmpDir, 'zh');

    const content = await fs.readFile(agents, 'utf8');
    expect(content.startsWith('# User Rules\n\n必须中文回答。')).toBe(true);
    expect(content.match(/<comet-ambient-resume>/gu)).toHaveLength(1);
    expect(content).toContain('开始处理需要改动或调查的任务前');
    expect(content).not.toContain('before starting work that may need code changes or investigation');
  });

  it('removes only the managed block', async () => {
    const agents = path.join(tmpDir, 'AGENTS.md');
    await fs.writeFile(agents, '# User Rules\n\nKeep me.\n', 'utf8');
    await installCometProjectInstructions(tmpDir, 'en');

    const result = await removeCometProjectInstructions(tmpDir);

    expect(result.removed).toBeGreaterThan(0);
    expect(await fs.readFile(agents, 'utf8')).toContain('Keep me.');
    expect(await fs.readFile(agents, 'utf8')).not.toContain('<comet-ambient-resume>');
  });
});
```

Extend `test/domains/skill/skills.test.ts` in `createWorkingDirs with config merge`:

```ts
it('installs Ambient Resume instructions without replacing user guide content', async () => {
  await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# User\n\nKeep this.\n', 'utf-8');

  await createWorkingDirs(tmpDir, 'zh');

  const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
  const claude = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
  expect(agents).toContain('# User\n\nKeep this.');
  expect(agents).toContain('<comet-ambient-resume>');
  expect(claude).toContain('<comet-ambient-resume>');
});
```

- [x] **Step 2: Run failing project instruction tests**

Run:

```bash
npx vitest run test/domains/skill/project-instructions.test.ts test/domains/skill/skills.test.ts
```

Expected: FAIL because `project-instructions.ts` does not exist and `createWorkingDirs` does not install the block.

- [x] **Step 3: Implement project instruction module**

Create `domains/skill/project-instructions.ts`:

```ts
import path from 'path';
import type { SkillLanguageId } from './languages.js';
import {
  mergeManagedMarkdownBlock,
  removeManagedMarkdownBlock,
  type ManagedMarkdownBlockResult,
} from './managed-markdown.js';

export const COMET_AMBIENT_RESUME_TAG = 'comet-ambient-resume';
export const PROJECT_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'] as const;

export interface ProjectInstructionResult {
  files: Array<{ file: string; result: ManagedMarkdownBlockResult }>;
  changed: number;
}

export interface ProjectInstructionRemovalResult {
  files: Array<{ file: string; result: ManagedMarkdownBlockResult }>;
  removed: number;
}

export function renderCometAmbientResumeContent(languageId: SkillLanguageId): string {
  if (languageId === 'zh') {
    return [
      '<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->',
      '',
      '## Comet Ambient Resume',
      '',
      '在这个仓库中，开始处理需要改动或调查的任务前，如果可能存在活跃 Comet workflow，先运行只读 resume probe。',
      '',
      '- 如果 probe 返回 `auto_resume`，简短说明选中的 active change，并按 `nextCommand` 恢复。',
      '- 如果 probe 返回 `ask_user`，只问一个简短问题并等待用户回复。',
      '- 如果 probe 返回 `out_of_scope` 或 `none`，不要进入 Comet workflow。',
      '- 不能只因为存在 `.comet.yaml` 就把无关任务挂到 active Comet change。',
      '',
    ].join('\n');
  }
  return [
    '<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->',
    '',
    '## Comet Ambient Resume',
    '',
    'In this repository, before starting work that may need code changes or investigation, run the Comet resume probe if a Comet workflow may already be active.',
    '',
    '- If the probe returns `auto_resume`, briefly state the selected active change and continue through its `nextCommand`.',
    '- If the probe returns `ask_user`, ask one short question and wait.',
    '- If the probe returns `out_of_scope` or `none`, do not enter the Comet workflow.',
    '- Never attach unrelated work to an active Comet change only because `.comet.yaml` exists.',
    '',
  ].join('\n');
}

export async function installCometProjectInstructions(
  projectPath: string,
  languageId: SkillLanguageId,
): Promise<ProjectInstructionResult> {
  const content = renderCometAmbientResumeContent(languageId);
  const files = [];
  for (const file of PROJECT_INSTRUCTION_FILES) {
    const result = await mergeManagedMarkdownBlock(path.join(projectPath, file), {
      tagName: COMET_AMBIENT_RESUME_TAG,
      content,
    });
    files.push({ file, result });
  }
  return { files, changed: files.filter((entry) => entry.result.changed).length };
}

export async function removeCometProjectInstructions(
  projectPath: string,
): Promise<ProjectInstructionRemovalResult> {
  const files = [];
  for (const file of PROJECT_INSTRUCTION_FILES) {
    const result = await removeManagedMarkdownBlock(
      path.join(projectPath, file),
      COMET_AMBIENT_RESUME_TAG,
    );
    files.push({ file, result });
  }
  return {
    files,
    removed: files.filter((entry) => entry.result.action === 'removed').length,
  };
}
```

- [x] **Step 4: Wire init/create working dirs**

Modify `domains/skill/platform-install.ts` imports:

```ts
import { installCometProjectInstructions } from './project-instructions.js';
```

Modify `createWorkingDirs`:

```ts
async function createWorkingDirs(projectPath: string, language: string = 'en'): Promise<void> {
  const dirs = [
    path.join(projectPath, 'docs', 'superpowers', 'specs'),
    path.join(projectPath, 'docs', 'superpowers', 'plans'),
    path.join(projectPath, '.comet'),
  ];

  for (const dir of dirs) {
    await ensureDir(dir);
  }

  await mergeProjectConfig(projectPath, language);
  await installCometProjectInstructions(projectPath, language === 'zh' ? 'zh' : 'en');
}
```

- [x] **Step 5: Wire update and uninstall**

Modify `app/commands/update.ts`:

```ts
import { installCometProjectInstructions } from '../../domains/skill/project-instructions.js';
```

After `await mergeProjectConfig(projectPath);` in the project-target branch:

```ts
const languageId = resolveTargetLanguage(options.language, targets.find((target) => target.scope === 'project')?.language);
const instructionResult = await installCometProjectInstructions(projectPath, languageId);
if (instructionResult.changed > 0) {
  log(`  Comet project instructions -> ${instructionResult.changed} file(s) updated`);
}
```

Modify `domains/skill/uninstall.ts`:

```ts
import { removeCometProjectInstructions } from './project-instructions.js';
```

Export it:

```ts
export {
  removeCometSkillsForPlatform,
  removeCometRulesForPlatform,
  removeCometHooksForPlatform,
  removeWorkingDirs,
  removeCometProjectInstructions,
};
```

Modify `app/commands/uninstall.ts` imports:

```ts
import {
  removeCometSkillsForPlatform,
  removeCometRulesForPlatform,
  removeCometHooksForPlatform,
  removeWorkingDirs,
  removeCometProjectInstructions,
} from '../../domains/skill/uninstall.js';
```

After selected targets are removed and before working directories removal:

```ts
let projectInstructionsRemoved = 0;
const removesProjectScope = selectedTargets.some((target) => target.scope === 'project');
if (removesProjectScope) {
  const instructionResult = await removeCometProjectInstructions(projectPath);
  projectInstructionsRemoved = instructionResult.removed;
  if (projectInstructionsRemoved > 0) {
    log(`  Project instructions: ${projectInstructionsRemoved} managed block(s) removed`);
  }
}
```

Add `projectInstructionsRemoved` to JSON summary:

```ts
projectInstructionsRemoved,
```

- [x] **Step 6: Run focused install/update/uninstall tests**

Run:

```bash
npx vitest run test/domains/skill/project-instructions.test.ts test/domains/skill/managed-markdown.test.ts test/domains/skill/skills.test.ts test/app/update.test.ts test/app/uninstall.test.ts
```

Expected: PASS after updating any existing app tests that assert JSON summary shapes.

- [x] **Step 7: Commit Task 5**

```bash
git add domains/skill/project-instructions.ts domains/skill/platform-install.ts domains/skill/uninstall.ts app/commands/update.ts app/commands/uninstall.ts test/domains/skill/project-instructions.test.ts test/domains/skill/skills.test.ts test/app/update.test.ts test/app/uninstall.test.ts
git commit -m "feat: inject ambient resume project instructions"
```

---

### Task 6: Skill Docs, README, Changelog, And Final Verification

**Files:**
- Modify: `assets/skills-zh/comet/SKILL.md`
- Modify: `assets/skills/comet/SKILL.md`
- Modify: `assets/skills-zh/comet/reference/context-recovery.md`
- Modify: `assets/skills/comet/reference/context-recovery.md`
- Modify: `assets/skills/comet/reference/scripts.md`
- Modify: `assets/skills-zh/comet/reference/scripts.md`
- Modify: `README-zh.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` only if version comparison requires a bump
- Test: `test/domains/skill/skills.test.ts`
- Test: `test/repository/readme.test.ts`
- Test: `test/repository/classic-runtime-assets.test.ts`

**Interfaces:**
- Consumes: runtime and install capabilities from Tasks 1-5.
- Produces: user-facing bilingual docs and release note for Ambient Resume.

- [x] **Step 1: Add failing documentation assertions**

Extend `test/domains/skill/skills.test.ts`:

```ts
it('documents Ambient Resume in both Comet entry Skills', async () => {
  const zh = await fs.readFile(path.resolve('assets', 'skills-zh', 'comet', 'SKILL.md'), 'utf-8');
  const en = await fs.readFile(path.resolve('assets', 'skills', 'comet', 'SKILL.md'), 'utf-8');

  expect(zh).toContain('Comet Ambient Resume');
  expect(zh).toContain('resume-probe');
  expect(zh).toContain('不把无关任务挂到 active Comet change');
  expect(en).toContain('Comet Ambient Resume');
  expect(en).toContain('resume-probe');
  expect(en).toContain('Never attach unrelated work');
});

it('documents the resume probe script in both script references', async () => {
  const zh = await fs.readFile(
    path.resolve('assets', 'skills-zh', 'comet', 'reference', 'scripts.md'),
    'utf-8',
  );
  const en = await fs.readFile(
    path.resolve('assets', 'skills', 'comet', 'reference', 'scripts.md'),
    'utf-8',
  );

  expect(zh).toContain('COMET_RESUME_PROBE');
  expect(zh).toContain('comet-resume-probe.mjs');
  expect(en).toContain('COMET_RESUME_PROBE');
  expect(en).toContain('comet-resume-probe.mjs');
});
```

Extend `test/repository/readme.test.ts` with assertions that README-zh and README mention `comet resume-probe` and managed project instructions.

- [x] **Step 2: Run failing documentation tests**

Run:

```bash
npx vitest run test/domains/skill/skills.test.ts test/repository/readme.test.ts
```

Expected: FAIL because docs do not mention Ambient Resume yet.

- [x] **Step 3: Update Chinese Skill docs first**

In `assets/skills-zh/comet/SKILL.md`, add this subsection near Step 0:

````md
### Comet Ambient Resume

当用户未显式输入 `/comet`，但当前仓库可能已有 active Comet change 时，开始处理需要改动或调查的任务前先运行只读探针：

```bash
node "$COMET_RESUME_PROBE" probe --stdin
```

探针只读仓库状态，不修改文件。按返回值处理：

- `auto_resume`：输出一行 `[COMET] 检测到 active change <name>，按 <nextCommand> 恢复。`，然后进入 `nextCommand`。
- `ask_user`：只问一个短问题并等待用户回复。
- `out_of_scope` 或 `none`：不要进入 Comet workflow。

不能只因为存在 `.comet.yaml` 就把无关任务挂到 active Comet change。
````

In `assets/skills-zh/comet/reference/scripts.md`, add:

```bash
COMET_RESUME_PROBE="$COMET_SCRIPTS_DIR/comet-resume-probe.mjs"
```

and include it in the script table:

```md
| `COMET_RESUME_PROBE` | 只读 Ambient Resume 探针，判断是否应恢复 active Comet workflow |
```

In `assets/skills-zh/comet/reference/context-recovery.md`, add:

```md
## 未显式 `/comet` 的恢复

如果用户没有提 `/comet`，但本仓库可能有 active change，开始处理需要改动或调查的任务前先运行 Ambient Resume 探针。只有返回 `auto_resume` 才自动恢复；`ask_user` 必须短问用户；`out_of_scope` 和 `none` 不进入 workflow。
```

- [x] **Step 4: Sync English Skill docs**

Mirror the same content in:

- `assets/skills/comet/SKILL.md`
- `assets/skills/comet/reference/scripts.md`
- `assets/skills/comet/reference/context-recovery.md`

Use this English copy:

````md
### Comet Ambient Resume

When the user did not explicitly invoke `/comet`, but this repository may already have an active Comet change, run the read-only probe before starting work that may need code changes or investigation:

```bash
node "$COMET_RESUME_PROBE" probe --stdin
```

The probe only reads repository state. Follow the returned action:

- `auto_resume`: print one line, `[COMET] Detected active change <name>; resuming via <nextCommand>.`, then enter `nextCommand`.
- `ask_user`: ask one short question and wait.
- `out_of_scope` or `none`: do not enter the Comet workflow.

Never attach unrelated work to an active Comet change only because `.comet.yaml` exists.
````

- [x] **Step 5: Update README docs**

In `README-zh.md`, add a restrained CLI section entry:

```md
<summary><code>comet resume-probe [path]</code> — 判断是否应恢复活跃 Comet workflow</summary>

只读检查 active change、`.comet.yaml`、当前 phase 和用户请求，输出 `auto_resume`、`ask_user`、`out_of_scope` 或 `none`。`comet init/update` 会把 `<comet-ambient-resume>` managed block 合并进 `AGENTS.md` 和 `CLAUDE.md`，保留用户已有规则。
```

In `README.md`, add the matching English entry:

```md
<summary><code>comet resume-probe [path]</code> — Decide whether an active Comet workflow should resume</summary>

Read-only probe for active changes, `.comet.yaml`, current phase, and the user request. It returns `auto_resume`, `ask_user`, `out_of_scope`, or `none`. `comet init/update` merges a `<comet-ambient-resume>` managed block into `AGENTS.md` and `CLAUDE.md` while preserving user-authored rules.
```

- [x] **Step 6: Update changelog and version if required**

Run these commands and record the result in the implementation notes:

```bash
Get-Content package.json
git show origin/master:package.json
git describe --tags --abbrev=0
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Apply this decision:

- If current `package.json` version is already greater than `origin/master` and `CHANGELOG.md` already has that version at the top, append to the same top version.
- If current `package.json` equals `origin/master`, bump to the next single allowed version and create a new top changelog section.
- Keep `assets/manifest.json.version` aligned with `package.json.version` if a version bump happens.

Add this changelog entry under `### Added`:

```md
- **Ambient resume**: Adds a low-noise Comet resume probe and managed project instruction block so agents can recover active workflows when the user resumes work without explicitly invoking `/comet`.
```

- [x] **Step 7: Run focused docs and asset tests**

Run:

```bash
npx vitest run test/domains/skill/skills.test.ts test/repository/readme.test.ts test/repository/classic-runtime-assets.test.ts
```

Expected: PASS.

- [x] **Step 8: Run required build/runtime verification**

Run:

```bash
node scripts/build/build-classic-runtime.mjs --check
npx vitest run test/domains/comet-classic/classic-resume-probe.test.ts test/domains/comet-classic/classic-resume-probe-command.test.ts test/domains/comet-classic/comet-scripts.test.ts test/app/resume-probe.test.ts test/domains/skill/managed-markdown.test.ts test/domains/skill/project-instructions.test.ts
node scripts/lint/architecture.mjs
node build.js
npx vitest run
```

Expected: every command exits 0.

- [x] **Step 9: Commit Task 6**

```bash
git add assets/skills-zh/comet assets/skills/comet README-zh.md README.md CHANGELOG.md package.json assets/manifest.json test/domains/skill/skills.test.ts test/repository/readme.test.ts test/repository/classic-runtime-assets.test.ts
git commit -m "docs: document ambient resume workflow"
```

If `package.json` did not change, omit it from `git add`.

---

## Final Verification Checklist

- [x] `npx vitest run test/domains/comet-classic/classic-resume-probe.test.ts`
- [x] `npx vitest run test/domains/comet-classic/classic-resume-probe-command.test.ts`
- [x] `npx vitest run test/app/resume-probe.test.ts`
- [x] `npx vitest run test/domains/skill/managed-markdown.test.ts test/domains/skill/project-instructions.test.ts`
- [x] `npx vitest run test/domains/comet-classic/comet-scripts.test.ts`
- [x] `npx vitest run test/repository/readme.test.ts test/repository/classic-runtime-assets.test.ts`
- [x] `node scripts/build/build-classic-runtime.mjs --check`
- [x] `node scripts/lint/architecture.mjs`
- [x] `node build.js`
- [x] `npx vitest run`
- [x] `git diff --check`

## Execution Notes

- Use TDD per task: failing test first, then minimal implementation, then focused pass.
- Do not broaden managed instruction injection to files outside `AGENTS.md` and `CLAUDE.md`.
- Do not put semantic workflow recovery inside hook guard.
- Keep runtime matching conservative. A false negative is acceptable; a false positive that attaches unrelated work to an active change violates the feature.
- Update generated assets only through `node scripts/build/build-classic-runtime.mjs`.
