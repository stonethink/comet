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

export interface FactorySkillPackagePlan {
  root: string;
  name: string;
  version: string;
  description: string;
  goal: string;
  defaultLocale: string;
  callChain: FactoryCallChainItem[];
  deviations: FactoryOrderDeviation[];
  engineMode: 'none' | 'deterministic' | 'adaptive';
}

export interface GeneratedFactorySkillPackage {
  packageRoot: string;
  skillPath: string;
  enginePath: string | null;
}
