import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, promises as fs, readFileSync } from 'fs';
import path from 'path';
import { parseDocument } from 'yaml';
import type { ClassicCommandHandler, ClassicCommandResult } from './classic-cli.js';
import { ensureClassicRuntimeRun, transitionClassicRuntimeRun } from './classic-runtime-run.js';
import type { ClassicRunContext } from './classic-migrate.js';
import type { ClassicState } from './classic-state.js';
import { classicValidateCommand } from './classic-validate-command.js';

const GREEN = '[32m';
const RED = '[31m';
const YELLOW = '[33m';
const RESET = '[0m';
const PHASES = ['open', 'design', 'build', 'verify', 'archive'] as const;
const PHASE_HEADER: Record<string, string> = {
  open: '=== Guard: open → next ===',
  design: '=== Guard: design → build ===',
  build: '=== Guard: build → verify ===',
  verify: '=== Guard: verify → archive ===',
  archive: '=== Guard: archive completeness ===',
};
const TRANSITION_EVENT: Record<string, string> = {
  open: 'open-complete',
  design: 'design-complete',
  build: 'build-complete',
  verify: 'verify-pass',
};
const APPLY_MESSAGE: Record<string, string> = {
  open: '  [APPLY] .comet.yaml updated: phase=PLACEHOLDER',
  design: '  [APPLY] .comet.yaml updated: phase=build',
  build: '  [APPLY] .comet.yaml updated: phase=verify, verify_result=pending',
  verify: '  [APPLY] .comet.yaml updated: phase=archive, verify_result=pass',
};

function green(message: string): string {
  return `${GREEN}${message}${RESET}`;
}

function red(message: string): string {
  return `${RED}${message}${RESET}`;
}

function yellow(message: string): string {
  return `${YELLOW}${message}${RESET}`;
}

class GuardFailure extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

class GuardOutput {
  readonly stderr: string[] = [];

  toResult(exitCode = 0): ClassicCommandResult {
    return {
      exitCode,
      ...(this.stderr.length > 0 ? { stderr: this.stderr.join('\n') + '\n' } : {}),
    };
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function nonempty(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function validateChangeName(name: string): void {
  if (!name) {
    throw new GuardFailure(red('ERROR: Change name cannot be empty'));
  }
  if (!/^[a-zA-Z0-9_-]+$/u.test(name)) {
    throw new GuardFailure(
      [
        red(`ERROR: Invalid change name: '${name}'`),
        red('Valid characters: a-z, A-Z, 0-9, -, _'),
      ].join('\n'),
    );
  }
  if (name.includes('..')) {
    throw new GuardFailure(
      red("ERROR: Change name cannot contain '..' (path traversal not allowed)"),
    );
  }
}

// Resolve the change directory the way the frozen guard does: prefer the active
// `openspec/changes/<name>` path, fall back to the archive copy. Returns the
// RELATIVE path (cwd is the project root) so handoff-hash inputs and check
// output match the frozen `openspec/changes/...` form byte-for-byte.
async function resolveChangeDir(name: string): Promise<string> {
  const active = `openspec/changes/${name}`;
  const archived = `openspec/changes/archive/${name}`;
  if (await exists(active)) return active;
  if (await exists(archived)) return archived;
  return active;
}

function stripInlineComment(value: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (quote === '') {
      if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '#' && (i === 0 || /\s/u.test(value[i - 1]))) {
        return out.replace(/\s+$/u, '');
      }
    } else if (c === quote) {
      quote = '';
    }
    out += c;
  }
  return out;
}

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

async function readField(changeDir: string, field: string): Promise<string> {
  const file = path.join(changeDir, '.comet.yaml');
  const document = parseDocument(await fs.readFile(file, 'utf8'), { uniqueKeys: false });
  if (document.errors.length > 0) {
    throw new GuardFailure(`ERROR: Invalid .comet.yaml: ${document.errors[0].message}`);
  }
  const record = document.toJS() as Record<string, unknown>;
  const value = record[field];
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function projectConfigValue(field: string, changeDir: string): Promise<string> {
  const changeValue = await readField(changeDir, field);
  if (changeValue && changeValue !== 'null') return changeValue;
  for (const config of ['.comet.yaml', 'comet.yaml', '.comet.yml', 'comet.yml']) {
    if (!(await exists(config))) continue;
    for (const line of (await fs.readFile(config, 'utf8')).split(/\r?\n/u)) {
      if (new RegExp(`^${field}:`, 'u').test(line)) {
        const value = stripWrappingQuotes(
          stripInlineComment(line.replace(new RegExp(`^${field}:\\s*`, 'u'), '')),
        );
        if (value && value !== 'null') return value;
      }
    }
  }
  return '';
}

// Build/verify commands run through the platform's default shell (cmd.exe on
// Windows, /bin/sh elsewhere) via `shell: true`, so Comet no longer requires a
// usable bash. Configured commands are pre-validated to reject shell
// metacharacters before they ever reach the shell.
function runCommandString(command: string): { status: number; output: string } {
  if (!command) return { status: 1, output: red('ERROR: build/verify command is empty') };
  if (/[;|&$`]/u.test(command)) {
    return {
      status: 1,
      output: `${red(`ERROR: build/verify command contains shell metacharacters: ${command}`)}\n${red(
        'Allowed: alphanumeric, spaces, hyphens, underscores, dots, colons, forward slashes, quotes',
      )}`,
    };
  }
  const result = spawnSync(command, { shell: true, encoding: 'utf8' });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\n+$/u, '');
  return { status: result.status ?? 1, output: `${red(`+ ${command}`)}\n${combined}` };
}

function hashFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function handoffSourceFiles(changeDir: string): Promise<string[]> {
  // Use forward-slash concatenation (not path.join, which uses the OS separator)
  // so the handoff-hash input and markdown `Source:` references match the frozen
  // shell + comet-handoff provenance byte-for-byte. changeDir is a relative forward-slash
  // path (openspec/changes/<name>); forward slashes are readable on Windows too.
  const files = [`${changeDir}/proposal.md`, `${changeDir}/design.md`, `${changeDir}/tasks.md`];
  const specs = `${changeDir}/specs`;
  if (await exists(specs)) {
    for (const entry of (await fs.readdir(specs)).sort()) {
      const spec = `${specs}/${entry}/spec.md`;
      if (await exists(spec)) files.push(spec);
    }
  }
  return files;
}

async function computeHandoffHash(changeDir: string): Promise<string> {
  const lines: string[] = [];
  for (const file of await handoffSourceFiles(changeDir)) {
    if (await exists(file)) {
      lines.push(`path:${file}`, `sha256:${hashFile(file)}`);
    }
  }
  // Match the frozen shell: command substitution $(...) strips the trailing
  // newline, so the hashed payload ends with the last sha256 line (no trailing \n).
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

async function preflight(changeDir: string, name: string): Promise<void> {
  if (!(await exists(changeDir))) {
    throw new GuardFailure(red(`FATAL: change directory not found: ${changeDir}`));
  }
  if (!(await exists(path.join(changeDir, '.comet.yaml')))) {
    throw new GuardFailure(red(`FATAL: .comet.yaml not found in ${changeDir}`));
  }
  const result = await classicValidateCommand([name], { json: false });
  if (result.exitCode !== 0) {
    if (result.stderr)
      process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
    throw new GuardFailure(red('FATAL: .comet.yaml schema validation failed'));
  }
}

interface CheckOutcome {
  description: string;
  passed: boolean;
  detail: string;
}

type CheckResult = { passed: true; detail?: string } | { passed: false; detail: string };

function pushCheck(output: GuardOutput, outcome: CheckOutcome): void {
  if (outcome.passed) {
    output.stderr.push(green(`  [PASS] ${outcome.description}`));
  } else {
    output.stderr.push(red(`  [FAIL] ${outcome.description}`));
    if (outcome.detail) {
      for (const line of outcome.detail.split('\n')) output.stderr.push(red(`    ${line}`));
    }
  }
}

function check(description: string, run: () => Promise<CheckResult>): () => Promise<CheckOutcome> {
  return async () => {
    try {
      const result = await run();
      return {
        description,
        passed: result.passed,
        detail: ('detail' in result ? result.detail : '') ?? '',
      };
    } catch (error) {
      return {
        description,
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

function pass(): CheckResult {
  return { passed: true };
}

function fail(detail: string): CheckResult {
  return { passed: false, detail };
}

async function runChecks(
  output: GuardOutput,
  builders: Array<() => Promise<CheckOutcome>>,
): Promise<boolean> {
  let blocked = false;
  for (const build of builders) {
    const outcome = await build();
    pushCheck(output, outcome);
    if (!outcome.passed) blocked = true;
  }
  return blocked;
}

interface CommandRun {
  status: number;
  output: string;
}

function runInferred(command: string): CommandRun {
  // Inferred build/verify commands (npm run build, mvn, cargo, …) run through
  // the platform's default shell so .cmd shims resolve on Windows without
  // requiring bash. Output is returned raw (no `+ ` prefix).
  const result = spawnSync(command, { shell: true, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\n+$/u, ''),
  };
}

async function buildPasses(changeDir: string): Promise<CommandRun> {
  if (process.env.COMET_SKIP_BUILD === '1') return { status: 0, output: '' };
  const configured = await projectConfigValue('build_command', changeDir);
  if (configured) return runCommandString(configured);
  if (
    (await exists('package.json')) &&
    /"build"/u.test(await fs.readFile('package.json', 'utf8'))
  ) {
    return runInferred('npm run build');
  }
  if (await exists('pom.xml')) {
    if (process.platform === 'win32') {
      if (existsSync('mvnw.cmd')) return runInferred('mvnw.cmd compile -q');
      return runInferred('mvn.cmd compile -q');
    }
    if (existsSync('mvnw')) return runInferred('./mvnw compile -q');
    return runInferred('mvn compile -q');
  }
  if (await exists('Cargo.toml')) return runInferred('cargo build');
  return { status: 1, output: '' };
}

async function verificationCommandPasses(changeDir: string): Promise<CommandRun> {
  if (process.env.COMET_SKIP_BUILD === '1') return { status: 0, output: '' };
  const configured = await projectConfigValue('verify_command', changeDir);
  if (configured) return runCommandString(configured);
  return buildPasses(changeDir);
}

async function tasksAllDone(changeDir: string): Promise<CheckResult> {
  const tasks = path.join(changeDir, 'tasks.md');
  if (!(await exists(tasks))) {
    return fail(
      `tasks.md is missing at ${tasks}\nNext: restore or create tasks.md for this change before leaving build.`,
    );
  }
  const source = await fs.readFile(tasks, 'utf8');
  if (!/- \[x\]/u.test(source)) {
    return fail(
      "tasks.md has no completed tasks.\nNext: complete implementation tasks and mark them with '- [x]'.",
    );
  }
  const unfinished = source
    .split(/\r?\n/u)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => /^- \[ \]/u.test(entry.line));
  if (unfinished.length > 0) {
    return fail(
      `Unfinished tasks:\n${unfinished.map((entry) => `${entry.number}:${entry.line}`).join('\n')}\nNext: complete or explicitly remove unfinished tasks, then mark tasks.md with '- [x]'.`,
    );
  }
  return pass();
}

async function tasksHasAny(changeDir: string): Promise<boolean> {
  const tasks = path.join(changeDir, 'tasks.md');
  if (!(await exists(tasks))) return false;
  return /- \[/u.test(await fs.readFile(tasks, 'utf8'));
}

async function planTasksAllDone(changeDir: string): Promise<CheckResult> {
  const plan = await readField(changeDir, 'plan');
  if (!plan || plan === 'null') return pass();
  if (!(await exists(plan))) {
    return fail(
      `plan file is missing at ${plan}\nNext: restore the Superpowers plan file or update .comet.yaml plan before leaving build.`,
    );
  }
  const source = await fs.readFile(plan, 'utf8');
  const unfinished = source
    .split(/\r?\n/u)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => /^\s*- \[ \]/u.test(entry.line));
  if (unfinished.length > 0) {
    return fail(
      `Unfinished Superpowers plan tasks:\n${unfinished.map((entry) => `${entry.number}:${entry.line}`).join('\n')}\nNext: check off corresponding completed plan tasks, then commit the plan update.`,
    );
  }
  return pass();
}

async function isolationSelected(changeDir: string, change: string): Promise<CheckResult> {
  const isolation = await readField(changeDir, 'isolation');
  if (isolation === 'branch' || isolation === 'worktree') return pass();
  return fail(
    `isolation must be branch or worktree, got '${isolation || 'null'}'\nNext: ask the user to choose branch or worktree, create the chosen isolation, then run:\n  node "$COMET_STATE" set ${change} isolation <branch|worktree>`,
  );
}

async function buildModeSelected(changeDir: string, change: string): Promise<CheckResult> {
  const buildMode = await readField(changeDir, 'build_mode');
  if (['subagent-driven-development', 'executing-plans', 'direct'].includes(buildMode))
    return pass();
  return fail(
    `build_mode must be selected before leaving build, got '${buildMode || 'null'}'\nNext: ask the user to choose an execution mode, then run:\n  node "$COMET_STATE" set ${change} build_mode <subagent-driven-development|executing-plans>`,
  );
}

async function buildModeAllowedForWorkflow(changeDir: string): Promise<CheckResult> {
  const workflow = await readField(changeDir, 'workflow');
  const buildMode = await readField(changeDir, 'build_mode');
  const directOverride = await readField(changeDir, 'direct_override');
  if (buildMode !== 'direct') return pass();
  if (workflow === 'hotfix' || workflow === 'tweak') return pass();
  if (directOverride === 'true') return pass();
  return fail(
    'build_mode=direct is only allowed for hotfix/tweak unless direct_override: true is recorded\nNext: choose executing-plans or subagent-driven-development, or stop and ask the user for an explicit direct override.',
  );
}

async function subagentDispatchConfirmed(changeDir: string, change: string): Promise<CheckResult> {
  const buildMode = await readField(changeDir, 'build_mode');
  const subagentDispatch = await readField(changeDir, 'subagent_dispatch');
  if (buildMode !== 'subagent-driven-development') return pass();
  if (subagentDispatch === 'confirmed') return pass();
  return fail(
    `subagent_dispatch must be confirmed before using build_mode=subagent-driven-development\nNext: confirm the current platform has a real background subagent/Task/multi-agent dispatcher, then run:\n  node "$COMET_STATE" set ${change} subagent_dispatch confirmed\nOr ask the user to switch to executing-plans and run:\n  node "$COMET_STATE" set ${change} build_mode executing-plans`,
  );
}

async function tddModeSelected(changeDir: string, change: string): Promise<CheckResult> {
  const workflow = await readField(changeDir, 'workflow');
  if (workflow === 'hotfix' || workflow === 'tweak') return pass();
  const tddMode = await readField(changeDir, 'tdd_mode');
  if (tddMode === 'tdd' || tddMode === 'direct') return pass();
  return fail(
    `tdd_mode must be tdd or direct for full workflow, got '${tddMode || 'null'}'\nNext: ask the user to choose TDD enforcement level, then run:\n  node "$COMET_STATE" set ${change} tdd_mode <tdd|direct>`,
  );
}

async function reviewModeSelected(changeDir: string, change: string): Promise<CheckResult> {
  const workflow = await readField(changeDir, 'workflow');
  if (workflow === 'hotfix' || workflow === 'tweak') return pass();
  const reviewMode = await readField(changeDir, 'review_mode');
  if (reviewMode === 'off' || reviewMode === 'standard' || reviewMode === 'thorough') {
    return pass();
  }
  return fail(
    `review_mode must be off, standard, or thorough before leaving build, got '${reviewMode || 'null'}'\nNext: ask the user to choose review strength, then run:\n  node "$COMET_STATE" set ${change} review_mode <off|standard|thorough>`,
  );
}

async function verificationReportExists(changeDir: string): Promise<boolean> {
  const report = await readField(changeDir, 'verification_report');
  return Boolean(report) && report !== 'null' && existsSync(report);
}

async function branchStatusHandled(changeDir: string): Promise<boolean> {
  return (await readField(changeDir, 'branch_status')) === 'handled';
}

async function archivedIsTrue(changeDir: string): Promise<boolean> {
  return (await readField(changeDir, 'archived')) === 'true';
}

async function designDocFrontmatterHas(
  designDoc: string,
  field: string,
  expected: string,
): Promise<boolean> {
  const source = (await fs.readFile(designDoc, 'utf8')).replace(/^\uFEFF/u, '');
  let inFrontmatter = false;
  for (const line of source.split(/\r?\n/u)) {
    if (!inFrontmatter) {
      if (line === '---') inFrontmatter = true;
      continue;
    }
    if (line === '---') break;
    if (new RegExp(`^${field}: ['"]?${expected}['"]?\\s*$`, 'u').test(line)) return true;
  }
  return false;
}

async function designDocRecorded(changeDir: string, change: string): Promise<CheckResult> {
  const designDoc = await readField(changeDir, 'design_doc');
  if (designDoc && designDoc !== 'null' && existsSync(designDoc)) return pass();
  return fail(
    `design_doc must point to an existing Superpowers Design Doc for full workflow before leaving design.\nNext: create the Design Doc and run: node "$COMET_STATE" set ${change} design_doc <path>`,
  );
}

async function designHandoffContextValid(changeDir: string, change: string): Promise<CheckResult> {
  const context = await readField(changeDir, 'handoff_context');
  const recordedHash = await readField(changeDir, 'handoff_hash');
  if (!context || context === 'null') {
    return fail(
      `handoff_context is missing from .comet.yaml\nNext: run node "$COMET_HANDOFF" ${change} design --write before invoking Superpowers.`,
    );
  }
  if (!(await nonempty(context))) {
    return fail(
      `handoff_context does not point to a non-empty file: ${context}\nNext: regenerate the design handoff with comet-handoff.mjs.`,
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(recordedHash)) {
    return fail(
      `handoff_hash is missing or invalid: ${recordedHash || 'null'}\nNext: regenerate the design handoff with comet-handoff.mjs.`,
    );
  }
  const actualHash = await computeHandoffHash(changeDir);
  if (actualHash !== recordedHash) {
    return fail(
      `OpenSpec artifacts changed after handoff was generated.\nExpected handoff_hash: ${recordedHash}\nActual handoff_hash:   ${actualHash}\nNext: rerun comet-handoff.mjs so Superpowers receives the current OpenSpec context.`,
    );
  }
  const markdown = `${context.replace(/\.json$/u, '')}.md`;
  if (!(await nonempty(markdown))) {
    return fail(
      `design handoff markdown is missing or empty: ${markdown}\nNext: regenerate the design handoff with comet-handoff.mjs.`,
    );
  }
  return pass();
}

async function designHandoffMarkdownTraceable(changeDir: string): Promise<CheckResult> {
  const context = await readField(changeDir, 'handoff_context');
  if (!context || context === 'null') return fail('handoff_context is missing from .comet.yaml');
  const markdown = `${context.replace(/\.json$/u, '')}.md`;
  if (!(await nonempty(markdown)))
    return fail(`design handoff markdown is missing or empty: ${markdown}`);
  const source = await fs.readFile(markdown, 'utf8');
  const problems: string[] = [];
  if (!/^Generated-by: comet-handoff\.sh$/mu.test(source)) {
    problems.push('handoff markdown is missing Generated-by marker');
  }
  if (!/^- Mode: (compact|full|beta)$/mu.test(source)) {
    problems.push('handoff markdown is missing Mode marker');
  }
  for (const file of await handoffSourceFiles(changeDir)) {
    if (!(await exists(file))) continue;
    if (!new RegExp(`^- Source: ${file}$`, 'mu').test(source)) {
      problems.push(`handoff markdown is missing source reference: ${file}`);
    }
    if (!new RegExp(`^- SHA256: ${hashFile(file)}$`, 'mu').test(source)) {
      problems.push(`handoff markdown is missing current sha256 for: ${file}`);
    }
  }
  return problems.length === 0 ? pass() : fail(problems.join('\n'));
}

async function contextCompressionMode(changeDir: string): Promise<string> {
  return (await readField(changeDir, 'context_compression')) || 'off';
}

async function betaSpecJsonStructurallyValid(changeDir: string): Promise<CheckResult> {
  if ((await contextCompressionMode(changeDir)) !== 'beta') return pass();
  const context = await readField(changeDir, 'handoff_context');
  if (!context || context === 'null') return fail('handoff_context is missing from .comet.yaml');
  if (!(await nonempty(context))) return fail(`spec-context.json is missing or empty: ${context}`);
  const source = await fs.readFile(context, 'utf8');
  const problems: string[] = [];
  if (!source.includes('"change"')) problems.push("spec-context.json missing 'change' field");
  if (!source.includes('"phase"')) problems.push("spec-context.json missing 'phase' field");
  if (!source.includes('"mode": "beta"')) problems.push('spec-context.json mode is not beta');
  if (!source.includes('"files"')) problems.push("spec-context.json missing 'files' field");
  if (!source.includes('"context_hash"'))
    problems.push("spec-context.json missing 'context_hash' field");
  for (const file of await handoffSourceFiles(changeDir)) {
    if (!(await exists(file))) continue;
    if (!source.includes(file))
      problems.push(`spec-context.json missing source file reference: ${file}`);
  }
  return problems.length === 0 ? pass() : fail(problems.join('\n'));
}

async function guardOpenChecks(output: GuardOutput, changeDir: string): Promise<boolean> {
  const workflow = await readField(changeDir, 'workflow');
  const checks: Array<() => Promise<CheckOutcome>> = [
    check('proposal.md exists and non-empty', async () =>
      (await nonempty(path.join(changeDir, 'proposal.md'))) ? pass() : fail(''),
    ),
    check('tasks.md exists and non-empty', async () =>
      (await nonempty(path.join(changeDir, 'tasks.md'))) ? pass() : fail(''),
    ),
    check('tasks.md has at least one task', async () =>
      (await tasksHasAny(changeDir)) ? pass() : fail(''),
    ),
  ];
  if (workflow === 'full') {
    checks.splice(
      1,
      0,
      check('design.md exists and non-empty', async () =>
        (await nonempty(path.join(changeDir, 'design.md'))) ? pass() : fail(''),
      ),
    );
  }
  return runChecks(output, checks);
}

async function guardDesignChecks(
  output: GuardOutput,
  changeDir: string,
  change: string,
): Promise<boolean> {
  const designDoc = await readField(changeDir, 'design_doc');
  const workflow = await readField(changeDir, 'workflow');
  const builders: Array<() => Promise<CheckOutcome>> = [
    check('proposal.md exists', async () =>
      (await nonempty(path.join(changeDir, 'proposal.md'))) ? pass() : fail(''),
    ),
    check('design.md exists', async () =>
      (await nonempty(path.join(changeDir, 'design.md'))) ? pass() : fail(''),
    ),
    check('tasks.md exists', async () =>
      (await nonempty(path.join(changeDir, 'tasks.md'))) ? pass() : fail(''),
    ),
    check('design handoff context exists', () => designHandoffContextValid(changeDir, change)),
    check('design handoff markdown is traceable', () => designHandoffMarkdownTraceable(changeDir)),
  ];
  if ((await contextCompressionMode(changeDir)) === 'beta') {
    builders.push(
      check('beta spec-context.json is structurally valid', () =>
        betaSpecJsonStructurallyValid(changeDir),
      ),
    );
  }
  if (workflow === 'full') {
    builders.push(
      check('design_doc is recorded for full workflow', () => designDocRecorded(changeDir, change)),
    );
  }
  let blocked = await runChecks(output, builders);
  if (designDoc && designDoc !== 'null') {
    blocked =
      (await runChecks(output, [
        check(`Design Doc (${designDoc}) exists`, async () =>
          (await nonempty(designDoc)) ? pass() : fail(''),
        ),
        check('Design Doc frontmatter links current change', async () => {
          if (!(await nonempty(designDoc))) return fail('');
          return (await designDocFrontmatterHas(designDoc, 'comet_change', change))
            ? pass()
            : fail('');
        }),
        check('Design Doc declares technical design role', async () => {
          if (!(await nonempty(designDoc))) return fail('');
          return (await designDocFrontmatterHas(designDoc, 'role', 'technical-design'))
            ? pass()
            : fail('');
        }),
        check('Design Doc declares OpenSpec as canonical spec', async () => {
          if (!(await nonempty(designDoc))) return fail('');
          return (await designDocFrontmatterHas(designDoc, 'canonical_spec', 'openspec'))
            ? pass()
            : fail('');
        }),
      ])) || blocked;
  } else if (workflow !== 'full') {
    output.stderr.push(
      yellow('  [WARN] No design_doc recorded in .comet.yaml (optional for hotfix/tweak)'),
    );
  }
  return blocked;
}

async function guardBuildChecks(
  output: GuardOutput,
  changeDir: string,
  change: string,
): Promise<boolean> {
  const buildResult = await buildPasses(changeDir);
  return runChecks(output, [
    check('isolation selected', () => isolationSelected(changeDir, change)),
    check('build_mode selected', () => buildModeSelected(changeDir, change)),
    check('build_mode allowed for workflow', () => buildModeAllowedForWorkflow(changeDir)),
    check('subagent dispatch confirmed', () => subagentDispatchConfirmed(changeDir, change)),
    check('tdd_mode selected', () => tddModeSelected(changeDir, change)),
    check('review_mode selected', () => reviewModeSelected(changeDir, change)),
    check('tasks.md all tasks checked', () => tasksAllDone(changeDir)),
    check('Superpowers plan all tasks checked', () => planTasksAllDone(changeDir)),
    check('proposal.md exists', async () =>
      (await nonempty(path.join(changeDir, 'proposal.md'))) ? pass() : fail(''),
    ),
    check('Build passes', async () =>
      buildResult.status === 0 ? pass() : fail(buildResult.output),
    ),
  ]);
}

async function guardVerifyChecks(output: GuardOutput, changeDir: string): Promise<boolean> {
  const verifyResult = await verificationCommandPasses(changeDir);
  return runChecks(output, [
    check('tasks.md all tasks checked', () => tasksAllDone(changeDir)),
    check('Build passes', async () =>
      verifyResult.status === 0 ? pass() : fail(verifyResult.output),
    ),
    check('verification_report exists', async () =>
      (await verificationReportExists(changeDir)) ? pass() : fail(''),
    ),
    check('branch_status=handled', async () =>
      (await branchStatusHandled(changeDir)) ? pass() : fail(''),
    ),
  ]);
}

async function guardArchiveChecks(output: GuardOutput, changeDir: string): Promise<boolean> {
  return runChecks(output, [
    check('archived is true', async () => ((await archivedIsTrue(changeDir)) ? pass() : fail(''))),
    check('proposal.md exists', async () =>
      (await nonempty(path.join(changeDir, 'proposal.md'))) ? pass() : fail(''),
    ),
    check('design.md exists', async () =>
      (await nonempty(path.join(changeDir, 'design.md'))) ? pass() : fail(''),
    ),
    check('tasks.md all tasks checked', () => tasksAllDone(changeDir)),
  ]);
}

async function applyStateUpdate(
  output: GuardOutput,
  changeDir: string,
  phase: string,
  context: ClassicRunContext,
): Promise<void> {
  const event = TRANSITION_EVENT[phase];
  if (!event) return;

  const changed: Array<[keyof ClassicState, unknown]> = [];
  const classic: ClassicState = { ...context.classic };
  const set = <K extends keyof ClassicState>(field: K, value: ClassicState[K]) => {
    classic[field] = value;
    changed.push([field, value]);
  };
  if (phase === 'open') {
    set('phase', classic.workflow === 'full' ? 'design' : 'build');
  } else if (phase === 'design') {
    set('phase', 'build');
  } else if (phase === 'build') {
    const preserveEvidence = classic.verifyResult === 'fail';
    set('phase', 'verify');
    set('verifyResult', 'pending');
    if (!preserveEvidence) {
      set('verificationReport', null);
      set('branchStatus', 'pending');
    }
  } else if (phase === 'verify') {
    set('verifyResult', 'pass');
    set('phase', 'archive');
    set('verifiedAt', new Date().toISOString().slice(0, 10));
  }

  await transitionClassicRuntimeRun(changeDir, classic, context.run, {
    event,
    phase,
  });

  const wireNames: Partial<Record<keyof ClassicState, string>> = {
    phase: 'phase',
    verifyResult: 'verify_result',
    verificationReport: 'verification_report',
    branchStatus: 'branch_status',
    verifiedAt: 'verified_at',
  };
  for (const [field, value] of changed) {
    output.stderr.push(
      green(`[SET] ${wireNames[field]}=${value === null ? 'null' : String(value)}`),
    );
  }
  output.stderr.push(green(`[TRANSITION] ${event}`));
  const template = APPLY_MESSAGE[phase];
  const message = phase === 'open' ? template.replace('PLACEHOLDER', classic.phase) : template;
  output.stderr.push(green(message));
}

export const classicGuardCommand: ClassicCommandHandler = async (args) => {
  const output = new GuardOutput();
  const [change, phase, flag] = args;
  try {
    validateChangeName(change);
    if (!phase || !PHASES.includes(phase as (typeof PHASES)[number])) {
      throw new GuardFailure(
        `${red(`Unknown phase: ${phase ?? ''}`)}\nValid phases: open, design, build, verify, archive`,
      );
    }
    const changeDir = await resolveChangeDir(change);
    await preflight(changeDir, change);
    const runContext = await ensureClassicRuntimeRun(changeDir);
    output.stderr.push(PHASE_HEADER[phase]);

    let blocked: boolean;
    if (phase === 'open') blocked = await guardOpenChecks(output, changeDir);
    else if (phase === 'design') blocked = await guardDesignChecks(output, changeDir, change);
    else if (phase === 'build') blocked = await guardBuildChecks(output, changeDir, change);
    else if (phase === 'verify') blocked = await guardVerifyChecks(output, changeDir);
    else blocked = await guardArchiveChecks(output, changeDir);

    if (blocked) {
      output.stderr.push('');
      output.stderr.push(red('BLOCKED — fix failing checks before proceeding to next phase'));
      return output.toResult(1);
    }
    output.stderr.push('');
    output.stderr.push(green('ALL CHECKS PASSED — ready for next phase'));
    if (flag === '--apply') {
      await applyStateUpdate(output, changeDir, phase, runContext);
    }
    return output.toResult(0);
  } catch (error) {
    if (error instanceof GuardFailure) {
      for (const line of error.message.split('\n')) output.stderr.push(line);
      return output.toResult(error.exitCode);
    }
    throw error;
  }
};
