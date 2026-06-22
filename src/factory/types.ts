export interface FactoryCallChainItem {
  skill: string;
  preferenceIndex: number | null;
}

export interface FactoryOrderDeviation {
  skill: string;
  expectedIndex: number;
  actualIndex: number;
  reason: string;
}

export interface FactoryResolvedSkill {
  query: string;
  preferenceIndex: number | null;
  status: 'available' | 'missing' | 'ambiguous';
  sources: Array<{
    name: string;
    preferenceIndex: number | null;
    platform: string;
    scope: 'project' | 'global' | 'builtin' | 'plugin' | 'explicit';
    origin: 'project' | 'global' | 'builtin' | 'plugin' | 'explicit';
    factory?: { query: string };
    root: string;
    description: string;
    skillMd: string;
    references?: Array<{ path: string; contentHash: string }>;
    scripts?: Array<{
      path: string;
      sideEffect: 'unknown' | 'none' | 'read' | 'write' | 'external';
    }>;
    hash: string;
  }>;
}

export interface FactorySkillPackagePlan {
  root: string;
  name: string;
  version: string;
  description: string;
  goal: string;
  defaultLocale: string;
  callChain: FactoryCallChainItem[];
  resolvedSkills?: FactoryResolvedSkill[];
  deviations: FactoryOrderDeviation[];
  engineMode: 'none' | 'deterministic' | 'adaptive';
}

export interface GeneratedFactorySkillPackage {
  packageRoot: string;
  skillPath: string;
  enginePath: string | null;
}
