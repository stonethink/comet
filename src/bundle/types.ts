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
