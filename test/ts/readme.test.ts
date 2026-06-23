import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';

const readmes = ['README.md', 'README-zh.md'];

describe('README assets', () => {
  it.each(readmes)('uses npm-friendly absolute image URLs in %s', async (readmePath) => {
    const content = await fs.readFile(readmePath, 'utf-8');

    expect(content).not.toMatch(/\b(?:src|srcset)=["'](?:\.\/)?img\//);
    expect(content).toContain('https://github.com/rpamis/comet/blob/master/img/');
  });

  it('documents build_pause in README state examples and field descriptions', async () => {
    const en = await fs.readFile('README.md', 'utf-8');
    const zh = await fs.readFile('README-zh.md', 'utf-8');

    expect(en).toContain('build_pause: null');
    expect(en).toContain('`build_pause` records an internal build-phase pause point');
    expect(en).toContain('`plan-ready` means the plan has been generated');

    expect(zh).toContain('build_pause: null');
    expect(zh).toContain('`build_pause` 记录 build 阶段内部暂停点');
    expect(zh).toContain('`plan-ready` 表示 plan 已生成');
  });

  it('documents status and doctor as diagnostics-aware user commands', async () => {
    const readme = await fs.readFile('README.md', 'utf-8');

    expect(readme).toContain('runtime mode');
    expect(readme).toContain('current step');
    expect(readme).toContain('diagnostic');
  });

  it('keeps English and Chinese README feature summaries aligned', async () => {
    const readmeEn = await fs.readFile('README.md', 'utf-8');
    const readmeZh = await fs.readFile('README-zh.md', 'utf-8');

    expect(readmeZh).toContain('Skill 平台');
    expect(readmeEn).toContain('Skill platform');
  });

  it('documents task-first paths for comet-any and eval without making Bundle CLI the default user path', async () => {
    const readmeEn = await fs.readFile('README.md', 'utf-8');
    const readmeZh = await fs.readFile('README-zh.md', 'utf-8');

    expect(readmeEn).toContain('Create or optimize a reusable Skill');
    expect(readmeEn).toContain('`/comet-any` is the main user path');
    expect(readmeEn).toContain('`comet publish`');
    expect(readmeEn).toContain('advanced backend');
    expect(readmeZh).toContain('创建或优化可复用 Skill');
    expect(readmeZh).toContain('`/comet-any` 是普通用户主路径');
    expect(readmeZh).toContain('`comet publish`');
    expect(readmeZh).toContain('高级后端');
  });
});
