# Comet Any Concept Budget Design

日期：2026-06-24

状态：草案，待用户确认后进入 implementation plan

范围：收敛 `/comet-any` 的整体用户心智，明确哪些概念允许出现在普通用户路径，哪些只能留在高级详情、JSON 或实现层

## 背景

`/comet-any` 已经承担了越来越多职责：

- 创建新 Skill。
- 优化已有 Skill。
- 基于 `/comet` 派生团队工作流。
- 管理项目级 Skill 偏好。
- 解析本地真实 Skill。
- 生成组合方案。
- 维护 Bundle Factory 状态。
- 运行 Eval。
- 审核、发布和分发生成物。
- 从中断状态恢复。

这些能力在实现上合理，但作为产品入口已经有概念过载风险。用户想要的是“做出一个可用 Skill”，而不是学习 `Bundle`、`Factory`、`composition`、`templateDelta`、`Phase Recipe`、`readiness`、`capability gap` 和 `publish/distribute` 的内部区别。

本设计的目标不是删掉后端能力，而是建立 `/comet-any` 的概念预算：普通用户路径只暴露少量稳定概念，复杂模型隐藏在确认页、高级详情和机器输出之后。

## 核心判断

`/comet-any` 的产品定位应是：

```text
一个 Skill 创建向导
```

不是：

```text
一个 Bundle 编排语言
一个 Factory CLI 教程
一个 Eval/Publish/Distribute 概念入口
一个让用户理解所有内部状态的调试器
```

实现层可以复杂，用户层必须极简。

## 用户层概念预算

普通用户路径最多只允许稳定暴露以下概念：

```text
做什么
基于什么
改什么
确认方案
验证
安装/启用
恢复
```

面向用户的一屏入口应收敛为：

```text
/comet-any

你想做什么？
1. 改一版 /comet
2. 做一个新 Skill
3. 整理已有 Skill
```

这些文案背后的内部模式可以分别对应：

```text
改一版 /comet     -> derive
做一个新 Skill    -> create
整理已有 Skill    -> optimize
```

但 `derive`、`create`、`optimize` 不应成为普通用户第一屏必须学习的术语。

## 用户动作模型

用户只需要理解三类编辑动作：

```text
加：增加一个能力
换：把某个可替换能力换成另一个
关：关闭某个可选能力
```

对于“改一版 `/comet`”，可以在需要时补充一个用户可读位置：

```text
在 design 后加
在 build 里换
在 verify 前加
关闭最终代码审查
```

用户不需要知道这些位置在实现里叫 phase recipe、extension point、step type 或 templateDelta。

## 概念分层

### 普通用户层

可以直接出现：

- `Skill`
- `/comet`
- `改一版`
- `新建`
- `整理已有`
- `加 / 换 / 关`
- `方案`
- `验证`
- `安装到当前 Agent`
- `继续上次未完成的创建`

这些词应该出现在 `/comet-any` 主流程、README 主路径和普通文档中。

### 高级详情层

只在用户展开详情、排障、审计或 JSON 输出旁边的解释中出现：

- `Bundle`
- `Factory`
- `composition`
- `readiness`
- `publish`
- `distribute`
- `capability`
- `hash`
- `control plane`
- `scripts/rules/hooks`
- `Eval manifest`

这些概念可以存在，但不能是普通用户完成主路径的前置知识。

### 实现层

默认不向普通用户暴露，只能出现在内部文件、JSON、测试、开发文档或高级调试中：

- `templateDelta`
- `Phase Recipe`
- `step type`
- `BundleAuthoringState`
- `.comet/bundle-factory-plans/*`
- `.comet/bundle-authoring/*`
- `proposalHash`
- `preferenceHash`
- `expandedCallChain`
- `guardrails.yaml`
- `checks.yaml`
- portable hook descriptor

如果这些词出现在普通路径输出中，必须有用户语言摘要在前，内部术语只能作为“详情”。

## 普通路径

### 入口

```text
/comet-any

你想做什么？

1. 改一版 /comet
   保留 Comet 的流程，只加、换、关一些能力。

2. 做一个新 Skill
   从你的目标出发，组合已有能力并生成一个可调用 Skill。

3. 整理已有 Skill
   把已有 Skill 调整成更稳定、可验证、可安装的版本。
```

### 创建方案

普通用户看到的方案应是：

```text
你要做的是：
改一版 /comet

保留：
open / design / build / verify / archive

新增：
verify 前加 security-review

替换：
build 计划步骤：writing-plans -> team-planning

关闭：
最终代码审查

不能做：
删除 verify，因为它是核心闭环

将生成：
/team-comet

下一步：
验证这个 Skill，然后安装到当前 Agent。

请选择：
确认生成 / 修改 / 取消
```

普通用户不应被要求读：

```text
factory-propose
templateDelta
composition issues
proposalHash
BundleAuthoringState
```

这些可以作为隐藏证据或高级详情保存。

### 验证和安装

`/comet-any` 对普通用户应说：

```text
验证这个 Skill
安装到当前 Agent
```

而不是要求用户理解：

```text
comet eval run
publish review
publish approve
publish run
publish distribute --preview
```

CLI 命令可以继续存在，但向导里应把它们包装成用户动作：

- `验证`：内部调用或提示 `comet eval`。
- `安装/启用`：内部走 publish/distribute preview 和确认。
- `查看详情`：展示 publish/distribute 的真实命令和证据。

## Progressive Disclosure

普通路径默认只显示摘要。用户需要时再展开：

```text
显示详情
显示生成文件
显示验证证据
显示安装计划
显示高级命令
```

详情层仍应先用用户语言解释，再显示内部术语。

示例：

```text
安装计划：
会写入 4 个 Skill 文件、2 个规则文件和 1 个 hook 描述。

高级详情：
Bundle capabilities: skills, rules, hooks, references
Distribution preview: no files written
```

## Recovery 语言

恢复摘要不应说：

```text
Factory state is draft and readiness is blocked by missing eval hash.
```

应说：

```text
找到一个未完成的 Skill 创建：

你上次做到：
方案已确认，文件已生成。

还差：
验证这个 Skill。

下一步：
继续验证 / 查看详情 / 放弃这个创建
```

内部状态名可以出现在详情层：

```text
详情：
state=draft, nextAction=run-eval, currentHash=...
```

## 错误语言

错误输出必须先回答用户关心的问题：

```text
现在不能继续。
原因：
security-review 这个 Skill 找到了两个来源，需要你选一个。

你可以：
1. 使用项目内版本。
2. 使用全局版本。
3. 移除这个新增能力。
```

然后才展示高级详情：

```text
详情：
candidate status=ambiguous
sources=...
```

## 文档和 Skill 约束

### README

README 只能呈现普通路径：

```text
/comet-any 可以帮你：
- 改一版 /comet
- 做一个新 Skill
- 整理已有 Skill
```

不要在 README 主路径解释 Bundle Factory、templateDelta、Phase Recipe 或 publish/distribute 内部流程。

### `/comet-any` Skill

`assets/skills-zh/comet-any/SKILL.md` 和英文版应按两层写：

1. 用户向导层：用普通语言执行流程。
2. 后端执行层：把用户选择翻译成 Factory/Bundle 命令。

后端命令可以写在 Skill 中，但对用户转述时必须用“方案、验证、安装/启用、恢复”这些词。

### CLI Help

普通入口 help 应收敛：

```text
comet any
  Create, customize, verify, and install Comet-native Skills.
```

高级命令 help 可以继续保留：

```text
comet bundle
  Advanced Bundle backend.
```

## 与现有设计的关系

本设计不取代已有后端设计：

- `/comet-any` preference guide 仍是项目偏好事实源。
- Bundle Factory 仍是确定性后端。
- Stable composed Skill control plane 仍要求 `skills/scripts/rules/hooks/references`。
- Derived Skill 的 Phase Recipe 仍是实现层模型。
- Eval 和 publish/distribute 仍是验证与安装的底层流程。

本设计增加的是产品层约束：这些后端概念不得成为普通用户路径的前置心智。

## 实施建议

第一步先不改后端，先改输出和文档：

- `/comet-any` 第一屏只问三种意图。
- composition proposal 输出增加普通用户摘要。
- readiness 输出先给“能不能继续、下一步做什么”。
- publish/distribute 指引改说“安装/启用到当前 Agent”。
- README 主路径删除 Bundle/Factory 过多解释。

第二步再补后端字段：

- 用户摘要字段 `userIntent`
- 普通方案摘要 `userPlanSummary`
- 恢复摘要 `userResumeSummary`
- 安装摘要 `installPlanSummary`

第三步再统一中英文 Skill/docs。

## Acceptance Criteria

- 新用户可以不理解 Bundle/Factory/composition 完成一个 `/comet-any` 创建流程。
- `/comet-any` 第一屏只暴露三种用户意图：改一版 `/comet`、做新 Skill、整理已有 Skill。
- 用户编辑动作收敛为加、换、关。
- 所有 proposal 输出先显示用户摘要，再显示高级详情。
- 恢复输出先显示“上次做到哪里、还差什么、下一步做什么”。
- 验证和安装路径不要求普通用户理解 publish/distribute 的内部区别。
- README 主路径不把 Bundle Factory 当作用户必须学习的概念。
- 高级详情和 JSON 仍保留完整后端证据。

## 自检

- 本设计没有删除 Bundle Factory、Eval、publish/distribute 等后端能力。
- 本设计没有新增状态事实源。
- 本设计没有削弱 proposal confirmation、Eval evidence、review readiness 或 executable disclosure。
- 本设计只约束概念暴露方式，让普通用户路径更短。
