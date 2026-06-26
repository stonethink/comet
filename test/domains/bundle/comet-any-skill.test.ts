import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

async function readCometAnyZh(): Promise<{
  skill: string;
  authoring: string;
  authoringSubagents: string;
  authoringSubagentBriefs: Record<string, string>;
  evalProvider: string;
}> {
  const root = path.resolve('assets', 'skills-zh', 'comet-any');
  const [skill, authoring, authoringSubagents, evalProvider] = await Promise.all([
    fs.readFile(path.join(root, 'SKILL.md'), 'utf8'),
    fs.readFile(path.join(root, 'reference', 'bundle-authoring.md'), 'utf8'),
    fs.readFile(path.join(root, 'reference', 'authoring-subagents.md'), 'utf8'),
    fs.readFile(path.join(root, 'reference', 'eval-provider.md'), 'utf8'),
  ]);
  const authoringSubagentBriefs = Object.fromEntries(
    await Promise.all(
      [
        'script-author',
        'reference-author',
        'skill-core-author',
        'pause-points-author',
        'skill-reviewer',
      ].map(async (name) => [
        name,
        await fs.readFile(path.join(root, 'reference', 'subagents', `${name}.md`), 'utf8'),
      ]),
    ),
  );
  return { skill, authoring, authoringSubagents, authoringSubagentBriefs, evalProvider };
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
  it('keeps the Chinese description focused on user triggers instead of backend workflow', async () => {
    const { skill } = await readCometAnyZh();
    const description = skill.match(/^description:\s*"([^"]+)"/m)?.[1] ?? '';

    expect(description).toContain('当用户想');
    expect(description).toContain('改一版 /comet');
    expect(description).toContain('做一个新 Skill');
    expect(description).toContain('整理已有 Skill');
    expect(description).toContain('增加 Skill');
    expect(description).toContain('替换 Skill');
    expect(description).toContain('关闭 Skill');
    expect(description).toContain('隐藏后端复杂度');
    expect(description).not.toMatch(/CLI|Bundle|Factory|composition|生成可安装候选|内部使用/u);
  });

  it('defines the Skill Maker workflow and hard gates', async () => {
    const { skill, authoring, authoringSubagents, evalProvider } = await readCometAnyZh();
    const combined = `${skill}\n${authoring}\n${authoringSubagents}\n${evalProvider}`;

    for (const expected of [
      'comet bundle factory-guide',
      '改一版 /comet',
      '做一个新 Skill',
      '整理已有 Skill',
      '增加 Skill',
      '替换 Skill',
      '关闭 Skill',
      '.comet/skill-preferences.yaml',
      'Skill 创建向导',
      '首次使用向导',
      'Skill Maker',
      '项目级偏好',
      '方案确认页',
      'advisory',
      'strict',
      'preferenceHash',
      '用户只需要调用本 Skill',
      'CLI 是内部确定性后端',
      '普通用户不需要理解 Bundle、Factory、composition',
      'Comet-native',
      'find-skill',
      '/comet',
      'open / design / build / verify / archive',
      '.comet.yaml',
      '受保护边界',
      '允许修改的只有增加 Skill、替换 Skill、关闭 Skill',
      'unresolved factory Skill candidates',
      'comet bundle factory-resolve',
      '.comet/bundle-factory-plans',
      'planHash',
      'resolved-skills.json',
      '真实 Skill 证据',
      '整理后的工作方式',
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
      'skip 或失败验证时不得进入 ready',
      '验证',
      '安装/启用',
      '恢复摘要',
      '非 JSON 输出',
      'Current step',
      'Suggested user command',
      'Readiness:',
      'Blockers:',
      'Warnings:',
      'Evidence:',
      '展示 Skill Maker 方案确认页',
      '推荐阶段名',
      '可输入名字项',
      'stageNames',
      'confirm-generate',
      'revise-proposal',
      'cancel',
      '--confirmed-proposal',
      '内部 metadata 记录',
      'Validate this Skill',
      'Install preview',
      'authoring-skill',
      'authoring-skill-smoke',
      'comet/eval.yaml',
      'Eval 证据缺失时不得进入 ready',
      '轻量单步 Skill 可以不启用 Engine',
      '人工批准',
      '安装前必须询问用户',
      '稳定组合 Skill Bundle',
      'required capability set',
      'skills/scripts/rules/hooks/references',
      'scripts/rules/hooks',
      'portable hook descriptor',
      'comet/checks.yaml',
      'comet publish distribute',
      '--preview',
      'Install preview',
      'No files were written',
    ]) {
      expect(combined).toContain(expected);
    }

    expect(combined).toContain('comet/eval.yaml');
    expect(combined).not.toContain('evals.yaml');
    expect(combined).not.toContain(['.comet/skills', 'txt'].join('.'));
    expect(combined).not.toContain('加 / 换 / 关');
    expect(combined).not.toContain('允许修改的只有加、换、关');
  });

  it('requires platform subagents to draft authoring artifacts before assembly', async () => {
    const { skill, authoring, authoringSubagents, authoringSubagentBriefs } =
      await readCometAnyZh();
    const subagentBriefs = Object.values(authoringSubagentBriefs).join('\n');
    const combined = `${skill}\n${authoring}\n${authoringSubagents}\n${subagentBriefs}`;

    for (const expected of [
      'comet-any/reference/authoring-subagents.md',
      'comet-any/reference/subagents/script-author.md',
      'comet-any/reference/subagents/reference-author.md',
      'comet-any/reference/subagents/skill-core-author.md',
      'comet-any/reference/subagents/pause-points-author.md',
      'comet-any/reference/subagents/skill-reviewer.md',
      '先读取本总览，再只把对应角色 brief 交给对应 subagent',
      '平台原生 subagent',
      'Claude Code',
      'Codex',
      '脚本作者 subagent',
      'reference 作者 subagent',
      'Skill 核心作者 subagent',
      '停顿点作者 subagent',
      'Skill 审查 subagent',
      '平台支持 subagent 时必须调度',
      '只返回 Markdown 成果和结构化审查结论',
      '不得直接写入 Bundle state',
      '不得执行候选 Skill 的脚本',
      '没有平台 subagent 能力时',
      'reference/authoring-lanes.json',
      'reference/skill-review.md',
      'workflow-state.mjs',
      'workflow-guard.mjs',
      'workflow-handoff.mjs',
      'script:workflow-state',
      'script:workflow-guard',
      'script:workflow-handoff',
      'workflow-protocol.json',
      'resolved-skills.json',
      'composition-report.md',
      'reference:workflow-protocol',
      'reference:resolved-skills',
      'reference:composition-report',
      'reference:authoring-lanes',
      'entry Skill',
      'internal stage Skill',
      'workflow-entry',
      'stage-skill:<skill-name>',
      '不复制粘贴原 Skill 全文',
      '不写 provider 前缀',
      'decision-points.md',
      'recovery.md',
      'pause:decision-points',
      'pause:recovery',
      'skill-review.md',
      'Review passed',
      'blocking findings',
      'provider 前缀',
      '中文 Skill 混入英文流程句',
    ]) {
      expect(combined).toContain(expected);
    }

    expect(authoringSubagents).toContain('reference/subagents/script-author.md');
    expect(authoringSubagents).toContain('reference/subagents/reference-author.md');
    expect(authoringSubagents).toContain('reference/subagents/skill-core-author.md');
    expect(authoringSubagents).toContain('reference/subagents/pause-points-author.md');
    expect(authoringSubagents).toContain('reference/subagents/skill-reviewer.md');

    expect(skill.indexOf('comet-any/reference/authoring-subagents.md')).toBeLessThan(
      skill.indexOf('生成 Comet-native Skill 源码'),
    );
  });

  it('uses Superpowers-style dispatch contracts for each authoring subagent brief', async () => {
    const { authoringSubagents, authoringSubagentBriefs } = await readCometAnyZh();
    const authorBriefs = [
      authoringSubagentBriefs['script-author'],
      authoringSubagentBriefs['reference-author'],
      authoringSubagentBriefs['skill-core-author'],
      authoringSubagentBriefs['pause-points-author'],
    ];
    const reviewerBrief = authoringSubagentBriefs['skill-reviewer'];
    const combinedAuthorBriefs = authorBriefs.join('\n');

    for (const expected of [
      '每次派发必须创建新的 subagent',
      '不得继承主会话历史',
      '必须显式指定 model',
      '文件交接',
      '主会话提供路径，不粘贴大段全文',
      '开始前先提出问题',
      '不要猜测或自行补全',
      '状态必须是 `DONE`、`DONE_WITH_CONCERNS`、`NEEDS_CONTEXT`、`BLOCKED`',
      '报告文件路径',
      '只返回 15 行以内状态摘要',
      '如果状态是 `BLOCKED` 或 `NEEDS_CONTEXT`',
      '主会话必须补上下文、拆小任务、换更强模型或询问用户',
      '不得继续组装',
    ]) {
      expect(`${authoringSubagents}\n${combinedAuthorBriefs}`).toContain(expected);
    }

    for (const brief of authorBriefs) {
      expect(brief).toContain('## 派发模板');
      expect(brief).toContain('## 状态返回');
      expect(brief).toContain('## 自检');
    }

    for (const expected of [
      '审查不信任作者报告',
      '两个 verdict',
      'Skill 契约符合度',
      '可用性质量',
      'Critical',
      'Important',
      'Minor',
      '不要告诉审查者不要标记某问题',
      '不得修改工作树、索引、HEAD 或分支状态',
      '证据必须引用 artifact 路径和 claim',
      'Review passed',
      'blocking findings',
    ]) {
      expect(reviewerBrief).toContain(expected);
    }
  });

  it('preserves the required order of the Chinese workflow', async () => {
    const { skill } = await readCometAnyZh();
    const ordered = [
      '恢复现有创作状态',
      '首次使用向导',
      '选择起点与语言',
      '读取偏好并解析真实 Skill',
      '生成 Skill Maker 方案并等待确认',
      '通过 CLI 初始化草稿与内部 metadata',
      '生成 Comet-native Skill 源码',
      '展示验证工作量并询问 skip/quick/full',
      '记录验证证据',
      '展示用户可读验证摘要并等待显式批准',
      '### 15. 生成可安装候选',
      '### 16. 安装预览',
      '### 17. 询问是否执行安装',
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
    const { skill, authoring, authoringSubagents, evalProvider } = await readCometAnyZh();
    const combined = `${skill}\n${authoring}\n${authoringSubagents}\n${evalProvider}`;

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
      {
        zh: '普通用户不需要理解 Bundle、Factory、composition',
        en: 'ordinary users do not need to understand Bundle, Factory, or composition',
      },
      { zh: '改一版 /comet', en: 'Customize /comet' },
      { zh: '做一个新 Skill', en: 'Create a new Skill' },
      { zh: '整理已有 Skill', en: 'Upgrade an existing Skill' },
      { zh: '增加 Skill', en: 'add Skill' },
      { zh: '替换 Skill', en: 'replace Skill' },
      { zh: '关闭 Skill', en: 'turn off Skill' },
      { zh: '受保护边界', en: 'protected boundary' },
      {
        zh: '允许修改的只有增加 Skill、替换 Skill、关闭 Skill',
        en: 'allowed changes are add Skill, replace Skill, and turn off Skill',
      },
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
      { zh: '整理后的工作方式', en: 'composed workflow' },
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
      { zh: '展示 Skill Maker 方案确认页', en: 'show the Skill Maker confirmation page' },
      { zh: '推荐阶段名', en: 'recommended stage names' },
      { zh: '可输入名字项', en: 'editable name fields' },
      { zh: 'stageNames', en: 'stageNames' },
      { zh: '--confirmed-proposal', en: '--confirmed-proposal' },
      { zh: 'Validate this Skill', en: 'Validate this Skill' },
      { zh: 'Install preview', en: 'Install preview' },
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
        en: 'Missing Eval evidence cannot become ready',
      },
      {
        zh: '轻量单步 Skill 可以不启用 Engine',
        en: 'lightweight single-step Skills can skip Engine',
      },
      { zh: 'token 消耗', en: 'token workload' },
      { zh: '人工批准', en: 'human approval' },
      { zh: '安装前必须询问用户', en: 'ask the user before installation' },
      { zh: '读取候选 `SKILL.md`', en: 'read candidate `SKILL.md`' },
      { zh: '能力缺口', en: 'capability gaps' },
      { zh: '可执行披露', en: 'executable disclosures' },
      { zh: '--preview', en: '--preview' },
      { zh: 'Install preview', en: 'Install preview' },
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
    expect(zhCombined).not.toContain('加 / 换 / 关');
    expect(enCombined).not.toContain('add / replace / turn off');
    expect(en.skill).not.toContain('Comet Skill Factory');
  });
});
