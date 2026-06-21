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
  it('defines the Skill Factory workflow and hard gates', async () => {
    const { skill, authoring, evalProvider } = await readCometAnyZh();
    const combined = `${skill}\n${authoring}\n${evalProvider}`;

    for (const expected of [
      'create',
      'optimize',
      '.comet/skills.txt',
      '用户只需要调用本 Skill',
      'CLI 是内部确定性后端',
      'Comet-native',
      'find-skill',
      '推荐调用顺序',
      '偏离偏好顺序',
      '必须说明原因',
      'Engine 是运行语义底座',
      '生成 `comet/skill.yaml`',
      '扫描平台 Skill',
      '读取候选 `SKILL.md`',
      'entry Skill',
      'internal Skill',
      'Engine Package',
      '原生 `skill-creator`',
      '回退前必须询问用户',
      'comet bundle',
      'skip / quick / full Eval',
      'token 消耗',
      'skip 或失败 Eval 时不得进入 ready',
      '人工批准',
      '分发前必须询问用户',
    ]) {
      expect(combined).toContain(expected);
    }
  });

  it('preserves the required order of the Chinese workflow', async () => {
    const { skill } = await readCometAnyZh();
    const ordered = [
      '恢复现有创作状态',
      '选择 create/optimize 与语言',
      '读取偏好并解析真实 Skill',
      '解决缺失/歧义候选',
      '读取候选的真实实现',
      '提出默认调用链',
      '澄清 Skill Factory 目标',
      '通过 CLI 初始化草稿与 Factory metadata',
      '生成 Comet-native Skill 源码',
      '生成 Engine Package',
      '编译并校验',
      '展示 Eval 工作量并询问 skip/quick/full',
      '记录 Eval 证据',
      '展示评审摘要并等待显式批准',
      '### 15. 发布',
      '### 16. 询问是否分发',
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
      { zh: '用户只需要调用本 Skill', en: 'The user only invokes this Skill' },
      { zh: 'CLI 是内部确定性后端', en: 'internal deterministic backend' },
      { zh: 'Comet-native Skill', en: 'Comet-native Skill' },
      { zh: 'find-skill', en: 'find-skill' },
      { zh: '推荐调用顺序', en: 'recommended call order' },
      { zh: '偏离偏好顺序', en: 'deviates from the preferred order' },
      { zh: '必须说明原因', en: 'must explain why' },
      { zh: 'Engine 是运行语义底座', en: 'Engine is the runtime semantic foundation' },
      { zh: '生成 `comet/skill.yaml`', en: 'generate `comet/skill.yaml`' },
      { zh: 'entry Skill', en: 'entry Skills' },
      { zh: 'internal Skill', en: 'internal Skill' },
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
