import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

async function readCometAnyZh(): Promise<{
  skill: string;
  authoring: string;
  evalProvider: string;
}> {
  const root = path.resolve('assets', 'skills-zh', 'comet-any');
  const [skill, authoring, evalProvider] = await Promise.all([
    fs.readFile(path.join(root, 'SKILL.md'), 'utf8'),
    fs.readFile(path.join(root, 'reference', 'bundle-authoring.md'), 'utf8'),
    fs.readFile(path.join(root, 'reference', 'eval-provider.md'), 'utf8'),
  ]);
  return { skill, authoring, evalProvider };
}

async function readCometAnyEn(): Promise<{
  skill: string;
  authoring: string;
  evalProvider: string;
}> {
  const root = path.resolve('assets', 'skills', 'comet-any');
  const [skill, authoring, evalProvider] = await Promise.all([
    fs.readFile(path.join(root, 'SKILL.md'), 'utf8'),
    fs.readFile(path.join(root, 'reference', 'bundle-authoring.md'), 'utf8'),
    fs.readFile(path.join(root, 'reference', 'eval-provider.md'), 'utf8'),
  ]);
  return { skill, authoring, evalProvider };
}

describe('Chinese comet-any Skill', () => {
  it('defines the Bundle authoring workflow and hard gates', async () => {
    const { skill, authoring, evalProvider } = await readCometAnyZh();
    const combined = `${skill}\n${authoring}\n${evalProvider}`;

    for (const expected of [
      'create',
      'optimize',
      '.comet/skills.txt',
      '扫描平台 Skill',
      '读取候选 `SKILL.md`',
      '多个 entry',
      'internal Skill',
      'Engine 元数据',
      '原生 `skill-creator`',
      '回退前必须询问用户',
      'comet bundle',
      'skip / quick / full Eval',
      'token 消耗',
      'skip 或失败 Eval 时不得进入 ready',
      '人工批准',
      '分发前必须询问用户',
      '不得声称生成的 Skill 需要 Engine 执行',
    ]) {
      expect(combined).toContain(expected);
    }
  });

  it('preserves the required order of the Chinese workflow', async () => {
    const { skill } = await readCometAnyZh();
    const ordered = [
      '恢复现有创作状态',
      '选择 create/optimize 与语言',
      '读取偏好或扫描候选',
      '解决缺失/歧义候选',
      '读取候选的真实实现',
      '澄清 Bundle 目标',
      '通过 CLI 初始化草稿',
      '调用原生 creator 或请求回退授权',
      '将 creator 输出适配为 Bundle 源码',
      '编译并校验',
      '展示 Eval 工作量并询问 skip/quick/full',
      '记录 Eval 证据',
      '展示评审摘要并等待显式批准',
      '### 14. 发布',
      '### 15. 询问是否分发',
    ];

    let previous = -1;
    for (const phrase of ordered) {
      const index = skill.indexOf(phrase);
      expect(index, `${phrase} should exist`).toBeGreaterThanOrEqual(0);
      expect(index, `${phrase} should be in order`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it('documents deterministic Bundle CLI commands used by the Skill', async () => {
    const { skill, authoring, evalProvider } = await readCometAnyZh();
    const combined = `${skill}\n${authoring}\n${evalProvider}`;

    for (const command of [
      'comet bundle candidates',
      'comet bundle draft create',
      'comet bundle draft optimize',
      'comet bundle status',
      'comet bundle compile',
      'comet bundle eval-plan',
      'comet bundle eval-record',
      'comet bundle review',
      'comet bundle publish',
      'comet bundle distribute',
    ]) {
      expect(combined).toContain(command);
    }
  });
});

describe('Bilingual comet-any Skill parity', () => {
  it('keeps English behavior aligned with the approved Chinese workflow', async () => {
    const zh = await readCometAnyZh();
    const en = await readCometAnyEn();
    const zhCombined = `${zh.skill}\n${zh.authoring}\n${zh.evalProvider}`;
    const enCombined = `${en.skill}\n${en.authoring}\n${en.evalProvider}`;

    const parity: Array<{ zh: string; en: string }> = [
      { zh: '多个 entry', en: 'multiple entry' },
      { zh: 'internal Skill', en: 'internal Skill' },
      { zh: '目标平台原生执行', en: 'target platform executes' },
      { zh: 'Engine 元数据', en: 'Engine metadata' },
      {
        zh: '不得声称生成的 Skill 需要 Engine 执行',
        en: 'must not claim generated Skills require Engine',
      },
      { zh: '原生 `skill-creator`', en: 'native `skill-creator`' },
      { zh: '回退前必须询问用户', en: 'must ask the user before fallback' },
      { zh: 'skip / quick / full Eval', en: 'skip / quick / full Eval' },
      { zh: 'token 消耗', en: 'token workload' },
      { zh: '人工批准', en: 'human approval' },
      { zh: '分发前必须询问用户', en: 'ask the user before distribution' },
      { zh: '读取候选 `SKILL.md`', en: 'read candidate `SKILL.md`' },
      { zh: '能力缺口', en: 'capability gaps' },
      { zh: '可执行披露', en: 'executable disclosures' },
    ];

    for (const { zh: zhPhrase, en: enPhrase } of parity) {
      expect(zhCombined).toContain(zhPhrase);
      expect(enCombined).toContain(enPhrase);
    }

    for (const command of [
      'comet bundle candidates',
      'comet bundle draft create',
      'comet bundle draft optimize',
      'comet bundle status',
      'comet bundle compile',
      'comet bundle eval-plan',
      'comet bundle eval-record',
      'comet bundle review',
      'comet bundle publish',
      'comet bundle distribute',
    ]) {
      expect(zhCombined).toContain(command);
      expect(enCombined).toContain(command);
    }
  });
});
