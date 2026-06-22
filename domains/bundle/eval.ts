import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { compileBundleIr } from './compiler.js';
import { loadBundle } from './load.js';
import {
  readBundleAuthoringState,
  reconcileBundleAuthoringState,
  writeBundleAuthoringState,
} from './state.js';
import type { BundleAuthoringState, BundleCompilerIr } from './types.js';

export interface BundleEvalPlan {
  level: 'quick' | 'full';
  components: string[];
  estimatedRuns: number;
  tokenWorkload: 'low' | 'medium' | 'high';
  explanation: string;
}

export interface BundleEvalResult {
  schemaVersion: 1;
  provider: 'native-skill-creator' | 'comet-fallback';
  level: 'quick' | 'full';
  bundleHash: string;
  entries: Array<{ id: string; passed: boolean; passRate: number; evidence: string[] }>;
  bundle: { compilePassed: boolean; safetyPassed: boolean; evidence: string[] };
  benchmark: {
    cases: number;
    baselinePassRate: number;
    withSkillPassRate: number;
    variance?: number;
    tokenCount: number;
    durationMs: number;
  };
  passed: boolean;
  summary: string;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertStringArray(
  value: unknown,
  label: string,
  allowEmpty = false,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string') ||
    (!allowEmpty && value.length === 0)
  ) {
    throw new Error(`${label} must be a non-empty string array`);
  }
}

function assertRate(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number between 0 and 1`);
  }
}

function assertNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
}

function parseEvalResult(value: unknown): BundleEvalResult {
  assertObject(value, 'Eval result');
  if (value.schemaVersion !== 1) throw new Error('Eval result schemaVersion must be 1');
  if (!['native-skill-creator', 'comet-fallback'].includes(String(value.provider))) {
    throw new Error('Eval result provider is unsupported');
  }
  if (!['quick', 'full'].includes(String(value.level))) {
    throw new Error('Eval result level must be quick or full');
  }
  if (typeof value.bundleHash !== 'string' || !/^[a-f0-9]{64}$/u.test(value.bundleHash)) {
    throw new Error('Eval result bundleHash must be a SHA-256 hash');
  }
  if (!Array.isArray(value.entries)) throw new Error('Eval result entries must be an array');
  for (const [index, entry] of value.entries.entries()) {
    assertObject(entry, `Eval result entries[${index}]`);
    if (typeof entry.id !== 'string' || !entry.id) {
      throw new Error(`Eval result entries[${index}].id must be a string`);
    }
    if (typeof entry.passed !== 'boolean') {
      throw new Error(`Eval result entries[${index}].passed must be a boolean`);
    }
    assertRate(entry.passRate, `Eval result entries[${index}].passRate`);
    assertStringArray(entry.evidence, `Eval result entries[${index}].evidence`);
  }
  assertObject(value.bundle, 'Eval result bundle');
  if (
    typeof value.bundle.compilePassed !== 'boolean' ||
    typeof value.bundle.safetyPassed !== 'boolean'
  ) {
    throw new Error('Eval result bundle compilePassed and safetyPassed must be booleans');
  }
  assertStringArray(value.bundle.evidence, 'Eval result bundle evidence');
  assertObject(value.benchmark, 'Eval result benchmark');
  assertNonNegative(value.benchmark.cases, 'Eval result benchmark cases');
  if (!Number.isInteger(value.benchmark.cases) || value.benchmark.cases === 0) {
    throw new Error('Eval result benchmark cases must be a positive integer');
  }
  assertRate(value.benchmark.baselinePassRate, 'Eval result benchmark baselinePassRate');
  assertRate(value.benchmark.withSkillPassRate, 'Eval result benchmark withSkillPassRate');
  assertNonNegative(value.benchmark.tokenCount, 'Eval result benchmark tokenCount');
  assertNonNegative(value.benchmark.durationMs, 'Eval result benchmark durationMs');
  if (value.level === 'full') {
    assertNonNegative(value.benchmark.variance, 'Eval result benchmark variance');
  } else if (value.benchmark.variance !== undefined) {
    assertNonNegative(value.benchmark.variance, 'Eval result benchmark variance');
  }
  if (typeof value.passed !== 'boolean') throw new Error('Eval result passed must be a boolean');
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    throw new Error('Eval result summary must be a non-empty string');
  }
  return value as unknown as BundleEvalResult;
}

function assertEntryCoverage(ir: BundleCompilerIr, result: BundleEvalResult): void {
  const expected = ir.skills
    .filter((skill) => skill.visibility === 'entry')
    .map((skill) => skill.id)
    .sort();
  const actual = result.entries.map((entry) => entry.id).sort();
  if (new Set(actual).size !== actual.length) {
    throw new Error('Eval result entry ids must be unique');
  }
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new Error(`Eval result must contain every entry Skill: ${expected.join(', ')}`);
  }
}

async function writeEvidence(
  projectRoot: string,
  name: string,
  result: BundleEvalResult,
): Promise<string> {
  const directory = path.resolve(projectRoot, '.comet', 'bundle-evals', name, result.bundleHash);
  const destination = path.join(directory, 'result.json');
  const temporary = path.join(directory, `.result.${randomUUID()}.tmp`);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporary, JSON.stringify(result, null, 2) + '\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return destination;
}

function stateWithEval(
  state: BundleAuthoringState,
  result: BundleEvalResult,
  resultPath: string,
): BundleAuthoringState {
  const gatesPassed =
    result.passed &&
    result.entries.every((entry) => entry.passed) &&
    result.bundle.compilePassed &&
    result.bundle.safetyPassed;
  const updated: BundleAuthoringState = {
    ...state,
    status: gatesPassed ? 'eval-passed' : 'draft',
    eval: {
      level: result.level,
      hash: result.bundleHash,
      resultPath,
      passed: gatesPassed,
    },
  };
  delete updated.review;
  delete updated.ready;
  delete updated.conflict;
  return updated;
}

export function planBundleEval(ir: BundleCompilerIr, level: 'quick' | 'full'): BundleEvalPlan {
  const entries = ir.skills.filter((skill) => skill.visibility === 'entry').length;
  const quickComponents = [
    'static',
    'entry-smoke',
    'baseline',
    'assertion-grading',
    'platform-compile',
  ];
  const quickRuns = 4 + entries * 2;
  if (level === 'quick') {
    return {
      level,
      components: quickComponents,
      estimatedRuns: quickRuns,
      tokenWorkload: entries > 2 ? 'medium' : 'low',
      explanation: `Descriptive estimate for ${entries} entry Skill(s); actual token use depends on the provider and prompts.`,
    };
  }
  return {
    level,
    components: [
      ...quickComponents,
      'trigger-accuracy',
      'routing-overlap',
      'behavior-effects',
      'multi-platform',
      'failure-analysis',
      'blind-comparison',
      'optimization',
    ],
    estimatedRuns: quickRuns + 6 + entries * 3,
    tokenWorkload: 'high',
    explanation: `Descriptive estimate for a multi-run full evaluation of ${entries} entry Skill(s); it is not a token commitment.`,
  };
}

export async function recordBundleEval(
  projectRoot: string,
  name: string,
  resultFile: string,
): Promise<BundleAuthoringState> {
  const result = parseEvalResult(JSON.parse(await fs.readFile(resultFile, 'utf8')) as unknown);
  let state = await reconcileBundleAuthoringState(projectRoot, name);
  if (result.bundleHash !== state.currentHash) {
    await writeEvidence(projectRoot, name, result);
    return state;
  }

  const bundle = await loadBundle(state.draftPath);
  const ir = await compileBundleIr(bundle, { locale: state.defaultLocale });
  if (ir.bundle.hash !== state.currentHash) {
    state = await reconcileBundleAuthoringState(projectRoot, name);
    await writeEvidence(projectRoot, name, result);
    return state;
  }
  assertEntryCoverage(ir, result);
  const resultPath = await writeEvidence(projectRoot, name, result);
  const updated = stateWithEval(state, result, resultPath);
  await writeBundleAuthoringState(projectRoot, updated);
  return updated;
}

export async function readRecordedBundleEval(
  projectRoot: string,
  name: string,
): Promise<BundleEvalResult | null> {
  const state = await readBundleAuthoringState(projectRoot, name);
  if (!state.eval) return null;
  return parseEvalResult(JSON.parse(await fs.readFile(state.eval.resultPath, 'utf8')) as unknown);
}
