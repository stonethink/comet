# 使用 `/comet-any` 创建、验证与分发 Skill

本文只讲新版本推荐开放给用户的路径：通过 `/comet-any` 创建、优化、组合、验证并分发可复用 Skill。

暂不把“手工编写 `comet/skill.yaml` 编排多个 Skill”作为用户路径开放。那是底层能力，当前文档只把它作为 `/comet-any` 的内部产物解释。

## `/comet-any` 是什么

`/comet-any` 是 Comet 的 Skill Factory。用户描述想要的工作流，它负责把目标、已有 Skill、平台约束、Eval 证据和发布门禁组织成一个可验证、可分发的 Skill / Bundle。

用户不需要先理解 Bundle 生命周期，也不需要记一串 `comet skill` 或 `comet bundle` 命令。正常使用时，你只需要：

1. 准备可选的 `.comet/skills.txt`
2. 在 Agent 平台里调用 `/comet-any`
3. 描述你想创建或优化的 Skill
4. 按 `/comet-any` 给出的 next action 处理候选、Eval、review 或分发；普通发布路径优先用 `comet publish`

如果你做到一半中断了，回来后可以直接说“继续上次的 Skill 创建”。`/comet-any` 会扫描可恢复的 Bundle Factory 状态，列出候选流程，再让你选择继续哪一个。

CLI 是 `/comet-any` 的确定性后端，不是用户主流程。

## 它能做什么

`/comet-any` 当前面向四类任务：

- **从目标创建 Skill**：你描述想要的工作流，它生成新的 Comet-native Skill / Bundle
- **优化已有 Skill**：读取已有 Skill 或 Bundle，把它整理成更可发布、可评估、可恢复的版本
- **组合多个现有 Skill**：读取 `.comet/skills.txt` 中的偏好顺序，解析真实 Skill 内容，再生成组合后的调用链
- **准备分发**：生成发布前证据，检查 readiness，通过 Comet 的平台分发机制安装到 Claude Code、Codex 等目标平台

它不是简单把 Skill 名字拼起来。它必须读取真实本地内容，并在生成物里留下证据。

## 用户输入：`.comet/skills.txt`

`.comet/skills.txt` 是可选但推荐的偏好文件。一行一个 Skill 名，顺序表示你希望 `/comet-any` 优先考虑的调用顺序。

例子：

```text
brainstorming
writing-plans
requesting-code-review
verification-before-completion
```

这个文件不是严格白名单。它表达的是偏好和顺序信号：

- `/comet-any` 会优先查找这些 Skill
- 行顺序会进入推荐调用链
- 如果最终调用链偏离这个顺序，必须解释原因
- 如果某个 Skill 缺失或有多个来源，必须暂停让用户确认

## 示例：创建一个 PR 评审助手

假设你想生成一个“PR 评审助手 Skill”，希望它能：

1. 先澄清评审范围
2. 制定检查计划
3. 执行代码审查
4. 完成前要求验证证据

先写 `.comet/skills.txt`：

```text
brainstorming
writing-plans
requesting-code-review
verification-before-completion
```

然后在 Agent 平台里调用：

```text
/comet-any
```

可以这样描述目标：

```text
请基于 .comet/skills.txt 里的 Skill，生成一个 PR 评审助手。
它应该先澄清评审范围，再制定检查计划，再执行代码审查，最后在完成前要求验证证据。
目标是给团队复用，不只是当前一次任务。
```

`/comet-any` 接下来应该做这些事：

1. 读取 `.comet/skills.txt`
2. 查找每个候选 Skill 的真实来源
3. 读取候选 `SKILL.md`、reference、rules、scripts 或 hooks 摘要
4. 标出缺失、歧义和风险
5. 提出组合后的工作方式
6. 生成 Skill / Bundle 草稿
7. 写入 Eval manifest 和发布前证据

用户在这个过程中主要做选择和确认，不需要手写底层编排文件。

## 示例：优化一个已有 Skill

如果你已经有一个本地 Skill，例如：

```text
./skills/review-flow/
```

可以调用 `/comet-any` 后这样描述：

```text
请优化 ./skills/review-flow，让它成为可以分发的 Comet Skill。
重点检查：说明是否清楚、是否能被 eval、是否有发布前证据、是否能分发到 Claude Code 和 Codex。
```

`/comet-any` 应该读取现有内容，判断它适合直接优化，还是需要补齐：

- `SKILL.md` 的用户入口说明
- references / rules / scripts / hooks
- 组合后的工作方式
- runtime eval
- `comet/eval.yaml`
- 平台分发能力声明
- review summary 所需证据

## `/comet-any` 的产出

一次完整生成或优化后，你应该能看到这些关键产物。

### 1. 用户可读 Skill

```text
SKILL.md
```

它应该回答：

- 这个 Skill 什么时候用
- 它会做什么
- 它会调用或复用哪些能力
- 用户需要提供什么输入
- 什么情况下应该停止并询问用户

### 2. 真实 Skill 证据

```text
reference/resolved-skills.json
```

它证明 `/comet-any` 不是只按名字猜测，而是读取了真实本地 Skill 内容。里面应该记录：

- resolved Skill 名称
- 来源路径或来源标识
- 描述
- hash
- reference / scripts / hooks 摘要
- 从 `SKILL.md` 正文提炼出的 `sourceSummaries`

### 3. 组合后的运行定义

```text
comet/skill.yaml
comet/guardrails.yaml
comet/evals.yaml
```

这些是内部运行语义。用户不需要手写，但它们很重要：

- `skill.yaml` 描述组合后的调用链
- `guardrails.yaml` 描述允许调用的 Skill、工具和安全边界
- `evals.yaml` 描述运行时完成度检查

多步骤、需要恢复、需要 guardrails、需要 runtime eval 或包含脚本副作用的生成物，都应该有这些文件。

### 4. Eval 入口

```text
comet/eval.yaml
```

这是用户后续评估生成 Skill 的主入口。它让用户不用记 pytest 参数，只需要走：

```bash
comet eval collect --manifest ./generated-skill/comet/eval.yaml
comet eval run --manifest ./generated-skill/comet/eval.yaml --html
```

### 5. Bundle 草稿与发布状态

`/comet-any` 会通过 Bundle 后端维护确定性状态。用户通常只需要看它输出的 next action 和 readiness。

这里的 Bundle 可以理解为“发布和分发状态机”，不是用户要直接编写的第二种 Skill。它把一个或多个生成出的 Skill、references、rules、hooks、scripts、Eval 证据、review 结论和目标平台能力约束绑定在一起，确保后续发布和分发不是凭 Agent 记忆推进。

关键状态包括：

- draft 是否已生成
- 是否还有 unresolved candidates
- Eval 证据是否存在且匹配当前 hash
- review 是否批准
- readiness 是 blocked、reviewable、publishable 还是 published
- 是否存在 capability gap 或 executable disclosure

## `/comet-any` 会验证什么

它至少应该验证这些层面。

### 候选验证

- `.comet/skills.txt` 是否能解析
- 候选 Skill 是否真实存在
- 候选是否有歧义来源
- 缺失候选是否需要用户移除、替换或忽略

缺失或歧义不能静默跳过。`/comet-any` 必须暂停并让用户决定。

### 内容验证

- 是否读取了真实 `SKILL.md`
- 是否读取了必要 reference / rules / scripts / hooks 摘要
- 生成的 `SKILL.md` 是否解释组合后的工作方式
- `resolved-skills.json` 是否包含真实证据

### 运行语义验证

- 多步骤生成物是否启用了 Engine metadata
- `comet/skill.yaml`、`guardrails.yaml`、`evals.yaml` 是否与组合链一致
- 需要恢复的 Skill 是否能保存 run state、trajectory、artifacts 和 eval 证据

### Eval 验证

- 是否生成 `comet/eval.yaml`
- `comet eval collect --manifest ...` 是否能发现任务
- `comet eval run --manifest ... --html` 是否能生成摘要
- Eval 结果是否绑定当前 draft hash

### 发布前验证

发布前必须看 readiness。阻塞项包括：

- unresolved candidate
- 缺少当前 hash 的 Eval 证据
- 缺少当前 hash 的人工 approval
- required capability gap
- executable disclosure 未确认
- review summary 显示 readiness 不是 publishable

只要 readiness 不是 publishable，就不能进入 publish。

## `/comet-any` 的工作原理

从用户视角看，流程是对话式的；从实现视角看，它背后是一条确定性管线：

```text
用户目标
  -> .comet/skills.txt 偏好
  -> find-skill 解析真实本地 Skill
  -> 候选缺失/歧义恢复
  -> 生成组合调用链
  -> Factory metadata 固化计划和 hash
  -> 生成 Skill / Bundle 草稿
  -> 生成 resolved-skills.json 和 comet/eval.yaml
  -> compile / eval / review-summary
  -> publish
  -> distribute
```

这里最重要的设计点是：Agent 可以负责理解目标和组织输出，但确定性状态、hash、Eval 证据、publish readiness 和平台分发必须交给 Comet CLI 后端维护。

这能避免三个问题：

- Agent 只凭名字猜测 Skill 能力
- 用户手工改内部状态 JSON
- 发布时不知道当前 Eval / review 是否对应当前 draft

## Bundle 在 `/comet-any` 里怎么工作

用户不需要主动切换到 Bundle CLI。正常情况下，`/comet-any` 会在内部调用 Bundle 后端，并把结果翻译成用户能理解的状态、阻塞点和下一步动作；需要手工继续发布时，优先走 `comet publish`。

你可以这样理解三者关系：

```text
Skill = 用户最终调用的能力
Bundle = 发布、验证、分发这个能力的状态容器
/comet-any = 用户入口，负责驱动 Bundle 后端
```

典型内部动作是：

- 扫描可恢复流程：当用户不知道 `<name>` 时，内部列出已有 Bundle authoring state，让用户选择继续哪一个
- 查看或恢复状态：内部读取 Bundle status，判断下一步是处理候选、生成、Eval、review、publish 还是 distribute
- 处理候选：当 `.comet/skills.txt` 中有缺失或歧义 Skill 时，`/comet-any` 询问用户选择，然后内部更新 Factory metadata
- 生成草稿：内部生成 Skill / Bundle draft，并绑定 plan hash 与真实 Skill 证据
- 发布前检查：内部读取 review summary readiness，并向用户展示 blockers、warnings 和 evidence
- 发布与分发：用户确认后，内部执行 publish 和 distribute

只有在排障、审计或用户明确想看底层动作时，`/comet-any` 才应该展示对应的后端命令。用户默认不需要背这些命令。

普通用户可记成这条主线：

```text
/comet-any -> comet eval -> comet publish
```

发布前最重要的用户可见证据是 readiness。它应该告诉你：

- Readiness
- Blockers
- Warnings
- Evidence
- 下一步应该做什么

## 分发用户产生的 Skill

用户产生的 Skill 要安装到 Claude Code、Codex 等平台时，仍然从 `/comet-any` 这条主路径推进；分发动作由 `/comet-any` 在内部调用 Bundle 后端完成。

不要把 `comet skill install` 当成平台分发。它只是把 Skill 安装到当前项目的 Comet Skill 查找路径，适合本地调试和 Engine Run。

推荐用户理解这条状态链：

```text
readiness 检查 -> 人工批准 -> 发布 -> 分发
```

对应的内部后端动作是：

- `review-summary`：确认当前草稿能不能发布，列出 blockers、warnings 和 evidence
- `review --approve`：记录用户或 reviewer 对当前 hash 的人工批准
- `publish`：把已批准且通过 Eval 的当前 draft 固化为 ready Bundle
- `distribute`：把 ready Bundle 编译并安装到目标平台目录

如果目标平台包含 hook 或脚本等可执行能力，`/comet-any` 必须先展示披露信息，并等用户确认后才能继续分发。

如果要分发到多个平台，用户只需要告诉 `/comet-any` 目标平台，例如 Claude Code 和 Codex；`/comet-any` 再内部选择对应平台并执行分发。

## 用户最少需要记什么

实际使用时，用户只需要记三件事：

1. `.comet/skills.txt` 是偏好和顺序，不是严格白名单
2. `/comet-any` 是创建、优化、组合 Skill 的主入口
3. Bundle 是 `/comet-any` 背后的发布和分发状态机，不是用户主入口

做到一半中断时，回来直接让 `/comet-any` 继续上次创建流程；它会先扫描可恢复状态，再用 next action 引导候选恢复、Eval、readiness 和平台能力细节。
