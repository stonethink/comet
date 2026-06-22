import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  readRepositoryLayout,
  resolveRepositoryPath,
} from '../../platform/paths/repository-layout.js';

describe('repository layout registry', () => {
  it('resolves the manifest and classic runtime output paths', () => {
    const layout = readRepositoryLayout();

    expect(layout.assetsRoot).toBe('assets');
    expect(layout.manifestPath).toBe('assets/manifest.json');
    expect(layout.classicRuntime.output).toBe('assets/skills/comet/scripts/comet-runtime.mjs');
    expect(resolveRepositoryPath(layout.classicRuntime.output)).toBe(
      path.resolve('assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs'),
    );
  });

  it('tracks all transitional source roots', () => {
    const layout = readRepositoryLayout();

    expect(layout.sourceRoots).toEqual(['src', 'app', 'domains', 'platform']);
  });
});
