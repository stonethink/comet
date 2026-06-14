import type { RunState } from '../engine/types.js';
import { runStateFromDocument, type StateDocument } from '../engine/state.js';

export const CLASSIC_PROFILES = ['full', 'hotfix', 'tweak'] as const;
export const CLASSIC_MIGRATION_VERSION = 1;

const PHASES = ['open', 'design', 'build', 'verify', 'archive'] as const;
const CONTEXT_COMPRESSION = ['off', 'beta'] as const;
const BUILD_MODES = ['subagent-driven-development', 'executing-plans', 'direct'] as const;
const BUILD_PAUSES = ['plan-ready'] as const;
const SUBAGENT_DISPATCH = ['confirmed'] as const;
const TDD_MODES = ['tdd', 'direct'] as const;
const ISOLATIONS = ['branch', 'worktree'] as const;
const VERIFY_MODES = ['light', 'full'] as const;
const VERIFY_RESULTS = ['pending', 'pass', 'fail'] as const;
const BRANCH_STATUSES = ['pending', 'handled'] as const;

export type ClassicProfile = (typeof CLASSIC_PROFILES)[number];
export type ClassicPhase = (typeof PHASES)[number];

export interface ClassicState {
  workflow: ClassicProfile;
  phase: ClassicPhase;
  contextCompression: (typeof CONTEXT_COMPRESSION)[number] | null;
  buildMode: (typeof BUILD_MODES)[number] | null;
  buildPause: (typeof BUILD_PAUSES)[number] | null;
  subagentDispatch: (typeof SUBAGENT_DISPATCH)[number] | null;
  tddMode: (typeof TDD_MODES)[number] | null;
  isolation: (typeof ISOLATIONS)[number] | null;
  verifyMode: (typeof VERIFY_MODES)[number] | null;
  autoTransition: boolean | null;
  baseRef: string | null;
  designDoc: string | null;
  plan: string | null;
  verifyResult: (typeof VERIFY_RESULTS)[number];
  verificationReport: string | null;
  branchStatus: (typeof BRANCH_STATUSES)[number] | null;
  createdAt: string | null;
  verifiedAt: string | null;
  archived: boolean;
  directOverride: boolean | null;
  buildCommand: string | null;
  verifyCommand: string | null;
  handoffContext: string | null;
  handoffHash: string | null;
  classicProfile: ClassicProfile | null;
  classicMigration: number | null;
}

export interface ClassicStateProjection {
  classic: ClassicState | null;
  run: RunState | null;
  unknownKeys: string[];
}

export const CLASSIC_WIRE_KEYS = [
  'workflow',
  'phase',
  'context_compression',
  'build_mode',
  'build_pause',
  'subagent_dispatch',
  'tdd_mode',
  'isolation',
  'verify_mode',
  'auto_transition',
  'base_ref',
  'design_doc',
  'plan',
  'verify_result',
  'verification_report',
  'branch_status',
  'created_at',
  'verified_at',
  'archived',
  'direct_override',
  'build_command',
  'verify_command',
  'handoff_context',
  'handoff_hash',
  'classic_profile',
  'classic_migration',
] as const;

export const RUN_WIRE_KEYS = [
  'run_id',
  'skill',
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
] as const;

const KNOWN_KEYS = new Set<string>([...CLASSIC_WIRE_KEYS, ...RUN_WIRE_KEYS]);
const REQUIRED_CLASSIC_KEYS = [
  'workflow',
  'phase',
  'design_doc',
  'plan',
  'build_mode',
  'isolation',
  'verify_mode',
  'verify_result',
  'verified_at',
  'archived',
] as const;

function has(doc: StateDocument, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(doc, key);
}

function nullableString(doc: StateDocument, key: string): string | null {
  const value = doc[key];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(`Invalid Classic state: ${key} must be a string or null`);
  }
  return value;
}

function enumValue<const T extends readonly string[]>(
  doc: StateDocument,
  key: string,
  values: T,
  nullable = true,
): T[number] | null {
  const value = doc[key];
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    throw new Error(`Invalid Classic state: ${key} is required`);
  }
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(
      `Invalid Classic state: ${key} must be one of ${values.join(', ')}${nullable ? ' or null' : ''}`,
    );
  }
  return value as T[number];
}

function booleanValue(doc: StateDocument, key: string, nullable = true): boolean | null {
  const value = doc[key];
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    throw new Error(`Invalid Classic state: ${key} is required`);
  }
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid Classic state: ${key} must be true or false`);
  }
  return value;
}

function relativePath(doc: StateDocument, key: string): string | null {
  const value = nullableString(doc, key);
  if (value === null) return null;
  if (/^(?:[A-Za-z]:|[\\/]|~)/u.test(value) || value.split(/[\\/]/u).includes('..')) {
    throw new Error(`Invalid Classic state: ${key} must be a relative repository path`);
  }
  return value;
}

function sha256(doc: StateDocument, key: string): string | null {
  const value = nullableString(doc, key);
  if (value !== null && !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`Invalid Classic state: ${key} must be a sha256 hex digest`);
  }
  return value;
}

function migrationVersion(doc: StateDocument): number | null {
  const value = doc.classic_migration;
  if (value === null || value === undefined || value === '') return null;
  if (value !== CLASSIC_MIGRATION_VERSION) {
    throw new Error(
      `Invalid Classic state: classic_migration must be ${CLASSIC_MIGRATION_VERSION}`,
    );
  }
  return value;
}

function classicStateFromDocument(doc: StateDocument): ClassicState | null {
  const hasClassicProjection = CLASSIC_WIRE_KEYS.some((key) => has(doc, key));
  if (!hasClassicProjection) return null;

  for (const key of REQUIRED_CLASSIC_KEYS) {
    if (!has(doc, key)) {
      throw new Error(`Invalid Classic state: missing required field ${key}`);
    }
  }

  return {
    workflow: enumValue(doc, 'workflow', CLASSIC_PROFILES, false)!,
    phase: enumValue(doc, 'phase', PHASES, false)!,
    contextCompression: enumValue(doc, 'context_compression', CONTEXT_COMPRESSION),
    buildMode: enumValue(doc, 'build_mode', BUILD_MODES),
    buildPause: enumValue(doc, 'build_pause', BUILD_PAUSES),
    subagentDispatch: enumValue(doc, 'subagent_dispatch', SUBAGENT_DISPATCH),
    tddMode: enumValue(doc, 'tdd_mode', TDD_MODES),
    isolation: enumValue(doc, 'isolation', ISOLATIONS),
    verifyMode: enumValue(doc, 'verify_mode', VERIFY_MODES),
    autoTransition: booleanValue(doc, 'auto_transition'),
    baseRef: nullableString(doc, 'base_ref'),
    designDoc: relativePath(doc, 'design_doc'),
    plan: relativePath(doc, 'plan'),
    verifyResult: enumValue(doc, 'verify_result', VERIFY_RESULTS, false)!,
    verificationReport: relativePath(doc, 'verification_report'),
    branchStatus: enumValue(doc, 'branch_status', BRANCH_STATUSES),
    createdAt: nullableString(doc, 'created_at'),
    verifiedAt: nullableString(doc, 'verified_at'),
    archived: booleanValue(doc, 'archived', false)!,
    directOverride: booleanValue(doc, 'direct_override'),
    buildCommand: nullableString(doc, 'build_command'),
    verifyCommand: nullableString(doc, 'verify_command'),
    handoffContext: relativePath(doc, 'handoff_context'),
    handoffHash: sha256(doc, 'handoff_hash'),
    classicProfile: enumValue(doc, 'classic_profile', CLASSIC_PROFILES),
    classicMigration: migrationVersion(doc),
  };
}

export function parseClassicStateDocument(doc: StateDocument): ClassicStateProjection {
  let run: RunState | null;
  try {
    run = runStateFromDocument(doc);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^Invalid Run state:/u, 'Invalid Classic state:'), {
      cause: error,
    });
  }

  return {
    classic: classicStateFromDocument(doc),
    run,
    unknownKeys: Object.keys(doc).filter((key) => !KNOWN_KEYS.has(key)),
  };
}

export function classicStateToDocument(state: ClassicState): StateDocument {
  return {
    workflow: state.workflow,
    phase: state.phase,
    context_compression: state.contextCompression,
    build_mode: state.buildMode,
    build_pause: state.buildPause,
    subagent_dispatch: state.subagentDispatch,
    tdd_mode: state.tddMode,
    isolation: state.isolation,
    verify_mode: state.verifyMode,
    auto_transition: state.autoTransition,
    base_ref: state.baseRef,
    design_doc: state.designDoc,
    plan: state.plan,
    verify_result: state.verifyResult,
    verification_report: state.verificationReport,
    branch_status: state.branchStatus,
    created_at: state.createdAt,
    verified_at: state.verifiedAt,
    archived: state.archived,
    direct_override: state.directOverride,
    build_command: state.buildCommand,
    verify_command: state.verifyCommand,
    handoff_context: state.handoffContext,
    handoff_hash: state.handoffHash,
    classic_profile: state.classicProfile,
    classic_migration: state.classicMigration,
  };
}
