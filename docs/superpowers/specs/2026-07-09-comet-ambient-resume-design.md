# Comet Ambient Resume 设计

日期：2026-07-09

状态：草案，待用户确认后进入 implementation plan

范围：让 Agent 在 Comet 项目中更可靠地发现并恢复已有 workflow，同时避免把无关任务误接入 active change

## 背景

当前 Comet 的状态机、phase guard、`.comet.yaml` 恢复、`CometIntentFrame` 路由和 `comet status` 诊断已经形成了较稳定的闭环。问题主要不在进入 `/comet` 之后，而在用户断点恢复、上下文过长或新会话开始时，Agent 偶尔忘记这次工作应该回到 Comet workflow。

现有 hook guard 是晚期防线：它能在写文件时阻止明显越过 phase 的行为，但它通常在 Agent 已经准备修改文件后才触发。现有 rule 也要求阶段感知，但长上下文和恢复摘要仍可能让 Agent 漏掉 `/comet` 入口。继续堆更长的自然语言规则会增加打扰，也不容易测试。

因此需要一个低打扰的入口恢复能力：在 Agent 开始处理需要改动或调查的任务前，基于仓库中的 active Comet state 做一次只读探针。如果证据足够强，自动恢复到正确的下一步；如果有歧义，短问用户；如果明显无关，保持静默。

这个 feature 命名为 **Comet Ambient Resume**，任务 slug 为 `comet-ambient-resume`。用户感知到的是 Comet 能在合适的时候回到 workflow；`resume-probe` 只是实现机制。

## 当前判断

Comet 应借鉴 Superpowers 的强入口理念，但不照搬“1% 可能就必须进入 Skill”的自动接管阈值。

更适合 Comet 的规则是：

```text
可能相关时：运行只读 resume-probe
只有高置信时：自动恢复
低置信或有歧义：短问用户
明显无关：不进入 Comet workflow
```

原因是 Comet 会接管 OpenSpec change、phase、guard、handoff 和 archive。若只因存在 active change 就自动恢复，容易把用户的新任务误塞进旧 change，反而增加打扰。

## 目标

1. 在 Comet 项目中，Agent 开始处理需要改动或调查的任务前能发现 active Comet workflow。
2. 只有单个 active change 且请求与该 change 高置信相关时，才自动恢复。
3. 当用户请求明显是新事项、纯问答或与 active change 无关时，不自动接管。
4. 当多个 active change、状态异常、处于用户决策点或相关性不明确时，只短问一次。
5. 将入口恢复规则注入 `AGENTS.md` 和 `CLAUDE.md`，且必须保留用户已有内容。
6. 注入内容使用 XML 风格 managed block，便于 Agent、人类和更新/卸载逻辑识别。
7. 复用 `.comet.yaml`、`inspectClassicChange`、`comet status` 和现有 Classic runtime 状态，不新增第二套 workflow state。
8. 让探针输出结构化 JSON，便于单测、eval 和不同 Agent 平台遵循。

## 非目标

- 不把 runtime 变成 LLM 调用器。runtime 只读取文件、做确定性诊断和安全归类。
- 不新增后台常驻进程、文件 watcher 或自动轮询。
- 不用 hook 作为主入口恢复机制。hook 仍是写入前兜底，不负责语义恢复。
- 不替用户选择 Comet 决策点，例如 plan-ready、verify fail、archive 确认。
- 不覆盖用户已有 `AGENTS.md`、`CLAUDE.md` 或其他项目规则。
- 不改变 full、hotfix、tweak 的状态机和 phase 流转。
- 不修改 Superpowers 或 OpenSpec 原始 Skill。

## 触发时机

Ambient Resume 不是后台探测，也不是每条消息都强制恢复。它只在 Agent 准备处理需要改动或调查的任务时触发一次。

触发场景：

1. 新会话或上下文压缩恢复后，Agent 准备继续执行代码、文档、测试、提交、验证等任务。
2. 用户说“继续”“接着做”“跑完”“提交”“修刚才的问题”等恢复类或执行类请求。
3. 用户没有显式说 `/comet`，但请求提到 active change 的 task、文件、proposal、plan 或相关关键词。
4. Agent 即将进行会改变仓库状态的操作，且本轮尚未确认是否属于 Comet workflow。

不触发或触发后保持 `out_of_scope` 的场景：

1. 用户只是问概念、让解释、要求总结状态，且没有要求继续工作。
2. 用户明确说“不走 Comet”“直接回答”“不要恢复 workflow”。
3. 当前会话已经明确处在某个 Comet 子 Skill 的恢复链路中，本轮不重复触发。
4. 仓库没有 active `.comet.yaml`。

## 自动恢复条件

探针只在以下条件同时满足时返回 `auto_resume`：

```text
single active change
+ request is action-oriented
+ request is resume-like OR clearly related to the active change
+ active change has a valid nextCommand
+ not at a user decision point
+ user did not opt out
=> auto_resume
```

自动恢复时，Agent 只输出一行低打扰提示：

```text
[COMET] 检测到 active change fix-cache-ttl，按 /comet-build 恢复。
```

然后按 `nextCommand` 进入对应 Comet Skill。

## 误触发边界

如果存在 active change，但用户要做的事情看起来无关，探针不得自动恢复。

示例：

```text
active change: eval-noise-filtering
user request: 给 README 加安装截图
```

应返回 `ask_user`，建议提示：

```text
检测到 active change eval-noise-filtering，但这次请求看起来是新事项。要新建 Comet change，还是只处理这个独立请求？
```

如果用户请求是纯问答，例如“这个探针靠谱吗”，则返回 `out_of_scope`，不进入 workflow。

## 架构

### `resume-probe` runtime 命令

新增 Classic runtime 只读命令：

```bash
comet resume-probe --json --utterance "<用户请求>"
```

或 bundled runtime 形式：

```bash
node "$COMET_RUNTIME" resume-probe --stdin
```

命令只读取仓库状态，不修改文件。

输入 JSON：

```json
{
  "schema_version": "comet.resume_probe.v1",
  "utterance": "<用户请求>",
  "locale": "zh-CN",
  "agent_context": {
    "non_trivial_work": true,
    "already_in_comet_flow": false
  }
}
```

输出 JSON：

```json
{
  "schema_version": "comet.resume_probe.v1",
  "action": "auto_resume",
  "changeName": "fix-cache-ttl",
  "phase": "build",
  "nextCommand": "/comet-build",
  "confidence": "high",
  "reason": "single active change and request is resume-like",
  "evidence": [
    {
      "source": "state",
      "quote": "phase: build"
    },
    {
      "source": "user",
      "quote": "继续"
    }
  ]
}
```

`action` 取值：

| action | 含义 | Agent 行为 |
| --- | --- | --- |
| `none` | 没有 active Comet change | 静默继续普通处理 |
| `auto_resume` | 高置信恢复 | 输出一行提示并进入 `nextCommand` |
| `ask_user` | 有 active change 但不应猜测 | 短问用户 |
| `out_of_scope` | 用户请求明显不是 Comet workflow 工作 | 不进入 Comet |

### 状态读取

探针复用现有诊断能力：

- 扫描 `openspec/changes/*/.comet.yaml`。
- 排除 `archived: true` 的 change。
- 对每个 active change 调用 `inspectClassicChange`。
- 读取 `proposal.md`、`design.md`、`tasks.md`、`.comet/run-state.json` 中的短文本信号。
- 使用 `nextCommand`、`currentStep`、`runtimeEval` 判断是否可恢复。

探针不得直接调用 OpenSpec 或 Superpowers Skill，也不得执行 build/test/git 命令。

### 相关性判断

runtime 采用保守的确定性规则，不调用 LLM。

高置信相关信号：

- 用户明确说继续、恢复、接着、跑完、提交、归档、验证。
- 用户提到 active change 名称。
- 用户提到 active change 的 proposal/design/tasks 中的关键短语。
- 用户提到 active change 记录的 plan、design doc 或相关文件路径。

低置信或无关信号：

- 用户提出新功能、新文档、新文件，且没有命中 active change 关键词。
- 用户请求纯解释、对比、命名、计划讨论。
- 用户明确要求不要走 Comet。
- 多个 active change 且用户未指定 change。

保守原则：

```text
宁可少自动恢复，也不要错误接管无关任务。
```

### 决策点检测

即使只有一个 active change，如果当前状态处于必须等待用户选择的节点，也不能自动继续。

探针应尽量识别以下阻塞点：

- `build_pause: plan-ready`
- build 四项选择缺失：`isolation`、`build_mode`、`tdd_mode`、`review_mode`
- `verify_result: fail`
- `phase: archive`
- runtimeEval 缺 evidence 且下一步需要用户修复状态

这些场景返回 `ask_user`，并在 `reason` 中说明需要用户选择。

## Agent 注入规则

Ambient Resume 需要安装到项目根指令文件中，而不只依赖平台 rules 目录。

目标文件：

- `AGENTS.md`
- `CLAUDE.md`

规则：

1. 文件不存在时创建。
2. 文件存在时保留用户原有内容。
3. 注入内容放入 XML 风格 managed block。
4. 已存在同名 block 时只替换 block 内部，不改 block 外文本。
5. 用户规则在前，Comet block 在后。
6. uninstall 时只删除 Comet block，不删除用户文件。

推荐 block：

```md
<comet-ambient-resume>
<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->

## Comet Ambient Resume

In this repository, before starting work that may need code changes or investigation, run the Comet resume probe if a Comet workflow may already be active.

- If the probe returns `auto_resume`, briefly state the selected active change and continue through its `nextCommand`.
- If the probe returns `ask_user`, ask one short question and wait.
- If the probe returns `out_of_scope` or `none`, do not enter the Comet workflow.
- Never attach unrelated work to an active Comet change only because `.comet.yaml` exists.

</comet-ambient-resume>
```

中文版注入内容应与英文保持语义一致。项目语言为 `zh-CN` 时优先注入中文；项目语言为 `en` 时注入英文。无论语言如何，XML 标签名保持英文稳定。

## Managed block 合并器

新增一个通用 markdown managed-block helper：

```ts
mergeManagedMarkdownBlock(filePath, {
  tagName: 'comet-ambient-resume',
  content,
});
```

行为：

- `filePath` 不存在：创建文件，内容为 block。
- 无 block：在文件末尾追加一个空行和 block。
- 有完整 block：替换从 `<tag>` 到 `</tag>` 的内容。
- 有开始标签但无结束标签：返回错误，不猜测修复。
- 多个同名 block：返回错误，避免删除用户内容。

该 helper 后续可复用给其他 Comet-managed 指令块，但首版只服务 Ambient Resume。

## Hook 的职责

hook guard 不作为 Ambient Resume 的主入口。它保留现有职责：

- 在错误 phase 下阻止源码写入。
- 允许流程和平台工作区写入。
- 作为 Agent 漏跑 probe 后的兜底。

如果后续要加强 hook，可以只增加提示文案，例如在 blocked 输出中建议运行 `comet resume-probe` 或 `/comet`，但不让 hook 做语义恢复。

## Skill 和文档同步

需要同步：

- `assets/skills-zh/comet/SKILL.md`
- `assets/skills/comet/SKILL.md`
- `assets/skills-zh/comet/reference/context-recovery.md`
- `assets/skills/comet/reference/context-recovery.md`
- README-zh / README 中关于 `comet status`、rules/hooks 或恢复能力的简短说明

中文版本先写，英文版本保持语义同步。不得修改 Superpowers 或 OpenSpec 原始 Skill。

## 测试计划

### Runtime 单测

覆盖 `resume-probe`：

- 无 active change -> `none`
- 单 active change + “继续” -> `auto_resume`
- 单 active change + 提到 change 名 -> `auto_resume`
- 单 active change + 无关新任务 -> `ask_user`
- 单 active change + 纯问答 -> `out_of_scope`
- 多 active change + 未指定 -> `ask_user`
- 指定不存在的 change -> `ask_user`
- 状态损坏或 `.comet.yaml` invalid -> `ask_user`
- 决策点状态，例如 `build_pause: plan-ready` -> `ask_user`
- 用户明确 opt out -> `out_of_scope`

### 注入合并单测

覆盖 `AGENTS.md` 和 `CLAUDE.md`：

- 文件不存在时创建。
- 文件已有用户规则时保留并追加 block。
- 第二次运行只替换 block，不重复追加。
- block 外用户内容逐字保留。
- 不完整 block 报错。
- 多个同名 block 报错。
- uninstall 只删除 block，不删除用户内容。

### 安装/更新测试

- `comet init` 对项目范围注入 `AGENTS.md` 与 `CLAUDE.md`。
- `comet update` 更新 managed block。
- 未选择支持 rules 的平台时，根指令文件仍可注入 Ambient Resume block。
- hook/rules 复制逻辑不被 managed block 注入替代。

### 脚本测试

更新 `test/domains/comet-classic/comet-scripts.test.ts` 的脚本拷贝列表和 launcher 覆盖，确保发布形态中包含 `resume-probe`。

## Changelog 判断

实现完成后需要写入 `CHANGELOG.md`，因为 Ambient Resume 是用户可感知的新能力。

建议条目：

```md
### Added

- **Ambient resume**: Adds a low-noise Comet resume probe and managed project instruction block so agents can recover active workflows when the user resumes work without explicitly invoking `/comet`.
```

版本号应按实现时的 `package.json`、`origin/master` 和当前 branch changelog 状态重新确认。

## 验收标准

1. 单 active change 的明确恢复请求能自动进入正确 `nextCommand`。
2. 无关请求不会被静默绑定到 active change。
3. 多 active change 和用户决策点不会自动选择。
4. `AGENTS.md` 与 `CLAUDE.md` 注入是可识别、幂等、可更新、可卸载的。
5. 用户已有规则不会被覆盖或重排。
6. 中文和英文 Skill/规则文档保持一致。
7. Classic runtime asset 重新生成，launcher 和 manifest 同步。
8. Focused tests、architecture lint、build 和 full test 在实现完成后通过。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 自动恢复误接管无关任务 | 高置信才 `auto_resume`，其余 `ask_user` 或 `out_of_scope` |
| Agent 忽略探针规则 | 同时注入 `AGENTS.md`、`CLAUDE.md` 和平台 rules，hook 作为最后防线 |
| 用户规则被覆盖 | XML managed block 只替换自身，不改 block 外内容 |
| runtime 相关性判断不够智能 | 只做保守确定性匹配，不尝试猜测所有语义 |
| block 被用户手动改坏 | 不完整或重复 block 报错，提示人工修复 |
| 多平台规则分散 | 根指令文件负责入口触发，平台 rules/hook 负责软硬防线 |

## 设计决定

1. 首版同时提供顶层 CLI `comet resume-probe` 和 Classic runtime 子命令。Agent-facing 规则优先调用顶层 CLI；bundled Skill 内部可调用 runtime 子命令，保证安装后的 skill 包仍能自洽运行。
2. 注入 block 默认跟随 `.comet/config.yaml language`。`zh-CN` 项目注入中文，`en` 项目注入英文；不默认双语，避免根指令文件变长。XML 标签名始终保持英文。
3. 纯问答场景返回 `out_of_scope`，只包含最小 reason，不额外返回 active change 摘要，避免诱导 Agent 把问答误恢复为 workflow 执行。
