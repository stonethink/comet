import type { BundleCandidateSource } from './candidates.js';

export type BundleSkillVisibility = 'entry' | 'internal';
export type BundleCapability = 'skills' | 'rules' | 'hooks' | 'scripts' | 'references' | 'assets';
export type BundleSideEffect = 'none' | 'read' | 'write' | 'external';

export interface BundleSkillDefinition {
  id: string;
  path: string;
  visibility: BundleSkillVisibility;
}

export interface BundleRuleDefinition {
  id: string;
  path: string;
  mode: 'always' | 'matched';
  match?: string[];
  priority?: number;
  required: boolean;
}

export interface BundleHookDefinition {
  id: string;
  path: string;
}

export interface BundleScriptDefinition {
  id: string;
  path: string;
  sideEffect: BundleSideEffect;
  runtime: 'node' | 'bash' | 'python';
  requiresConfirmation?: boolean;
}

export interface BundlePlatformOverride {
  platform: string;
  replaces: string;
  path: string;
}

export interface NormalizedHook {
  event: 'session_start' | 'before_tool' | 'after_tool' | 'before_write' | 'after_write';
  matcher?: string;
  script: string;
  failure: 'block' | 'warn';
  requiresConfirmation: boolean;
}

export interface BundleManifest {
  apiVersion: 'comet/v1alpha1';
  kind: 'SkillBundle';
  metadata: {
    name: string;
    version: string;
    description: string;
    defaultLocale: string;
    locales: string[];
  };
  skills: BundleSkillDefinition[];
  resources: {
    rules: BundleRuleDefinition[];
    hooks: BundleHookDefinition[];
    references: string[];
    scripts: BundleScriptDefinition[];
    assets: string[];
  };
  platforms: {
    requires: BundleCapability[];
    optional: BundleCapability[];
    overrides: BundlePlatformOverride[];
  };
  engine: { enabled: boolean; path?: string };
}

export interface SkillBundle {
  root: string;
  manifest: BundleManifest;
}

export interface ResolvedBundleLocale {
  bundle: SkillBundle;
  locale: string;
  files: Map<string, string>;
}

export interface BundleCompilerIr {
  bundle: { name: string; version: string; locale: string; hash: string };
  capabilities: {
    requires: BundleCapability[];
    optional: BundleCapability[];
  };
  skills: Array<{
    id: string;
    logicalRoot: string;
    visibility: BundleSkillVisibility;
    sourceRoot: string;
    files: Array<{ relativePath: string; source: string }>;
  }>;
  rules: Array<BundleRuleDefinition & { source: string }>;
  hooks: Array<NormalizedHook & { id: string; source: string }>;
  scripts: Array<BundleScriptDefinition & { source: string }>;
  references: Array<{ logicalPath: string; source: string }>;
  assets: Array<{ logicalPath: string; source: string }>;
  overrides: Array<BundlePlatformOverride & { source: string }>;
  engine: { sourceRoot: string } | null;
}

export interface ExecutableDisclosure {
  id: string;
  command: string;
  sideEffect: BundleSideEffect;
  destination: string;
}

export interface BundleFactoryCallChainItem {
  skill: string;
  preferenceIndex: number | null;
}

export interface BundleFactoryOrderDeviation {
  skill: string;
  expectedIndex: number;
  actualIndex: number;
  reason: string;
}

export interface BundleFactoryResolvedSkill {
  query: string;
  preferenceIndex: number | null;
  status: 'available' | 'missing' | 'ambiguous';
  sources: BundleCandidateSource[];
}

export interface BundleGeneratedSkillPackage {
  entrySkill: string;
  internalSkills: string[];
  packageRoot: string;
  enginePath: string | null;
  evalManifestPath: string | null;
}

export interface BundleFactoryMetadata {
  goal: string;
  preferredSkills: string[];
  resolvedSkills: BundleFactoryResolvedSkill[];
  callChain: BundleFactoryCallChainItem[];
  deviations: BundleFactoryOrderDeviation[];
  engineMode: 'none' | 'deterministic' | 'adaptive';
  runnerMode: 'change' | 'standalone';
  planPath?: string;
  planHash?: string;
  generatedSkillPackage?: BundleGeneratedSkillPackage;
}

export interface PlatformInstallFile {
  source: string;
  destination: string;
  kind: 'skill' | 'rule' | 'hook' | 'script' | 'reference' | 'asset' | 'engine';
  operation?:
    | {
        type: 'rule';
        format: 'md' | 'mdc' | 'copilot';
        mode: 'always' | 'matched';
        match?: string[];
      }
    | {
        type: 'hook';
        format: 'claude-code' | 'gemini' | 'windsurf' | 'copilot' | 'qwen' | 'kiro' | 'qoder';
        event: NormalizedHook['event'];
        matcher?: string;
        command: string;
        failure: NormalizedHook['failure'];
        requiresConfirmation: boolean;
      };
}

export type BundleAuthoringStatus =
  | 'draft'
  | 'eval-passed'
  | 'review-approved'
  | 'ready'
  | 'drift-conflict';

export interface BundleAuthoringState {
  schemaVersion: 1;
  name: string;
  mode: 'create' | 'optimize';
  status: BundleAuthoringStatus;
  draftPath: string;
  currentHash: string | null;
  base?: { root: string; version: string; hash: string };
  candidates: BundleCandidateSource[];
  creator: 'native' | 'comet-fallback' | null;
  defaultLocale: string;
  locales: string[];
  engineEnabled: boolean;
  factory?: BundleFactoryMetadata;
  eval?: { level: 'quick' | 'full'; hash: string; resultPath: string; passed: boolean };
  review?: {
    hash: string;
    decision: 'approved' | 'rejected';
    reviewer: string;
    at: string;
  };
  ready?: { hash: string; path: string; publishedAt: string };
  conflict?: { draftHash: string; readyHash: string };
}
