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
      'comet bundle factory-guide',
      'create',
      'optimize',
      '.comet/skill-preferences.yaml',
      'Skill 创建向导',
      '首次使用向导',
      '项目级偏好',
      '组合方案',
      'advisory',
      'strict',
      'preferenceHash',
      '用户只需要调用本 Skill',
      'CLI 是内部确定性后端',
      '/comet-any -> comet eval -> comet publish review/approve/run -> comet publish distribute --preview -> comet publish distribute',
      'Comet-native',
      'find-skill',
      '推荐调用顺序',
      '偏离偏好顺序',
      '必须说明原因',
      'preferredSkills',
      'callChain',
      'deviations',
      'sourceRoot',
      'unresolved factory Skill candidates',
      'comet bundle factory-resolve',
      '.comet/bundle-factory-plans',
      'planHash',
      'resolved-skills.json',
      '真实 Skill 证据',
      '组合后的工作方式',
      'sourceSummaries',
      'Engine 是运行语义底座',
      '生成 `comet/skill.yaml`',
      '.comet/runs/<run-id>',
      'comet skill run <skill> --run-id',
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
      'readiness',
      '恢复摘要',
      '非 JSON 输出',
      'Current step',
      'Suggested user command',
      'Readiness:',
      'Blockers:',
      'Warnings:',
      'Evidence:',
      '展示组合方案确认页',
      'confirm-generate',
      'revise-proposal',
      'cancel',
      '--confirmed-proposal',
      'Factory metadata 记录',
      'Publish readiness:',
      'User next steps:',
      'authoring-skill',
      'authoring-skill-smoke',
      'comet/eval.yaml',
      'Eval 证据缺失时不得发布 ready',
      '轻量单步 Skill 可以不启用 Engine',
      '人工批准',
      '分发前必须询问用户',
      '稳定组合 Skill Bundle',
      'required capability set',
      'skills/scripts/rules/hooks/references',
      'scripts/rules/hooks',
      'portable hook descriptor',
      'comet/checks.yaml',
      'comet publish distribute',
      '--preview',
      'Distribution preview',
      'No files were written',
    ]) {
      expect(combined).toContain(expected);
    }

    expect(combined).toContain('comet/eval.yaml');
    expect(combined).not.toContain('evals.yaml');
    expect(combined).not.toContain(['.comet/skills', 'txt'].join('.'));
  });

  it('preserves the required order of the Chinese workflow', async () => {
    const { skill } = await readCometAnyZh();
    const ordered = [
      '恢复现有创作状态',
      '首次使用向导',
      '选择 create/optimize 与语言',
      '读取偏好并解析真实 Skill',
      '展示组合方案并等待确认',
      '通过 CLI 初始化草稿与 Factory metadata',
      '生成 Comet-native Skill 源码',
      '展示 Eval 工作量并询问 skip/quick/full',
      '记录 Eval 证据',
      '展示用户可读 readiness 并等待显式批准',
      '### 15. 发布',
      '### 16. 分发预览',
      '### 17. 询问是否执行分发',
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
      'comet bundle factory-guide',
      'comet bundle factory-propose',
      'comet bundle factory-init',
      'comet bundle factory-resolve',
      'comet bundle draft create',
      'comet bundle draft optimize',
      'comet bundle compile',
      'comet bundle eval-plan',
      'comet bundle eval-record',
      'comet publish status',
      'comet publish review',
      'comet publish approve',
      'comet publish run',
      'comet publish distribute',
      '--confirmed-proposal',
      '--preview',
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
      { zh: '.comet/skill-preferences.yaml', en: '.comet/skill-preferences.yaml' },
      { zh: '项目级偏好', en: 'project-level preferences' },
      { zh: '组合方案', en: 'composition proposal' },
      { zh: 'advisory', en: 'advisory' },
      { zh: 'strict', en: 'strict' },
      { zh: 'preferenceHash', en: 'preferenceHash' },
      { zh: 'find-skill', en: 'find-skill' },
      { zh: '推荐调用顺序', en: 'recommended call order' },
      { zh: '偏离偏好顺序', en: 'deviates from the preferred order' },
      { zh: '必须说明原因', en: 'must explain why' },
      { zh: 'preferredSkills', en: 'preferredSkills' },
      { zh: 'callChain', en: 'callChain' },
      { zh: 'deviations', en: 'deviations' },
      { zh: 'sourceRoot', en: 'sourceRoot' },
      {
        zh: 'unresolved factory Skill candidates',
        en: 'unresolved factory Skill candidates',
      },
      { zh: 'comet bundle factory-resolve', en: 'comet bundle factory-resolve' },
      { zh: '.comet/bundle-factory-plans', en: '.comet/bundle-factory-plans' },
      { zh: 'planHash', en: 'planHash' },
      { zh: 'resolved-skills.json', en: 'resolved-skills.json' },
      { zh: '真实 Skill 证据', en: 'real Skill evidence' },
      { zh: '组合后的工作方式', en: 'composed workflow' },
      { zh: 'sourceSummaries', en: 'sourceSummaries' },
      { zh: 'Engine 是运行语义底座', en: 'Engine is the runtime semantic foundation' },
      { zh: '生成 `comet/skill.yaml`', en: 'generate `comet/skill.yaml`' },
      { zh: '.comet/runs/<run-id>', en: '.comet/runs/<run-id>' },
      { zh: 'comet skill run <skill> --run-id', en: 'comet skill run <skill> --run-id' },
      { zh: 'entry Skill', en: 'entry Skills' },
      { zh: 'internal Skill', en: 'internal Skill' },
      { zh: '原生 `skill-creator`', en: 'native `skill-creator`' },
      { zh: '回退前必须询问用户', en: 'must ask the user before fallback' },
      { zh: 'skip / quick / full Eval', en: 'skip / quick / full Eval' },
      { zh: 'readiness', en: 'readiness' },
      { zh: '首次使用向导', en: 'first-use guide' },
      { zh: '恢复摘要', en: 'resume summary' },
      { zh: '非 JSON 输出', en: 'non-JSON output' },
      { zh: 'Readiness:', en: 'Readiness:' },
      { zh: 'Blockers:', en: 'Blockers:' },
      { zh: 'Warnings:', en: 'Warnings:' },
      { zh: 'Evidence:', en: 'Evidence:' },
      { zh: '展示组合方案确认页', en: 'show the composition confirmation page' },
      { zh: '--confirmed-proposal', en: '--confirmed-proposal' },
      { zh: 'Publish readiness:', en: 'Publish readiness:' },
      { zh: 'User next steps:', en: 'User next steps:' },
      { zh: 'authoring-skill', en: 'authoring-skill' },
      { zh: 'authoring-skill-smoke', en: 'authoring-skill-smoke' },
      { zh: 'comet/eval.yaml', en: 'comet/eval.yaml' },
      { zh: '稳定组合 Skill Bundle', en: 'stable composed Skill Bundle' },
      { zh: 'required capability set', en: 'required capability set' },
      { zh: 'skills/scripts/rules/hooks/references', en: 'skills/scripts/rules/hooks/references' },
      { zh: 'scripts/rules/hooks', en: 'scripts/rules/hooks' },
      { zh: 'portable hook descriptor', en: 'portable hook descriptors' },
      { zh: 'comet/checks.yaml', en: 'comet/checks.yaml' },
      {
        zh: 'Eval 证据缺失时不得发布 ready',
        en: 'Missing Eval evidence blocks ready publish',
      },
      {
        zh: '轻量单步 Skill 可以不启用 Engine',
        en: 'lightweight single-step Skills can skip Engine',
      },
      { zh: 'token 消耗', en: 'token workload' },
      { zh: '人工批准', en: 'human approval' },
      { zh: '分发前必须询问用户', en: 'ask the user before distribution' },
      { zh: '读取候选 `SKILL.md`', en: 'read candidate `SKILL.md`' },
      { zh: '能力缺口', en: 'capability gaps' },
      { zh: '可执行披露', en: 'executable disclosures' },
      { zh: '--preview', en: '--preview' },
      { zh: 'Distribution preview', en: 'Distribution preview' },
      { zh: 'No files were written', en: 'No files were written' },
    ];

    for (const { zh: zhPhrase, en: enPhrase } of parity) {
      expect(zhCombined).toContain(zhPhrase);
      expect(enCombined).toContain(enPhrase);
    }

    for (const command of [
      'comet bundle candidates',
      'comet bundle factory-propose',
      'comet bundle factory-init',
      'comet bundle factory-resolve',
      'comet bundle draft create',
      'comet bundle draft optimize',
      'comet bundle compile',
      'comet bundle eval-plan',
      'comet bundle eval-record',
      'comet publish status',
      'comet publish review',
      'comet publish approve',
      'comet publish run',
      'comet publish distribute',
    ]) {
      expect(zhCombined).toContain(command);
      expect(enCombined).toContain(command);
    }

    expect(zhCombined).not.toContain('evals.yaml');
    expect(enCombined).not.toContain('evals.yaml');
    expect(zhCombined).not.toContain(['.comet/skills', 'txt'].join('.'));
    expect(enCombined).not.toContain(['.comet/skills', 'txt'].join('.'));
  });
});
