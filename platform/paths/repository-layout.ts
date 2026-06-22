import path from 'path';
import layout from '../../config/repository-layout.json' with { type: 'json' };

export interface RepositoryLayout {
  assetsRoot: string;
  manifestPath: string;
  skillsRoots: {
    en: string;
    zh: string;
  };
  classicRuntime: {
    entry: string;
    output: string;
  };
  sourceRoots: string[];
  testRoots: string[];
}

const repositoryLayout = layout as RepositoryLayout;

export function readRepositoryLayout(): RepositoryLayout {
  return repositoryLayout;
}

export function resolveRepositoryPath(relativePath: string): string {
  const segments = relativePath === '.' ? ['.'] : relativePath.split('/');
  return path.resolve(...segments);
}
