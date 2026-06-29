import { describe, expect, it } from 'vitest';
import { readGitignoredTopLevelEntries } from '../../scripts/lint/gitignore-top-level.mjs';

describe('gitignore top-level entry parsing', () => {
  it('collects plain top-level ignored names and skips nested or wildcard patterns', () => {
    const ignored = readGitignoredTopLevelEntries(process.cwd());

    expect(ignored.has('.pnpm-store')).toBe(true);
    expect(ignored.has('node_modules')).toBe(true);
    expect(ignored.has('dist')).toBe(true);
    expect(ignored.has('coverage')).toBe(true);
    expect(ignored.has('*.log')).toBe(false);
    expect(ignored.has('eval')).toBe(false);
    expect(ignored.has('**/nul')).toBe(false);
  });
});
