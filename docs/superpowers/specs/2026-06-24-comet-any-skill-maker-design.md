# Comet Any Skill Maker Design

日期：2026-06-24

状态：草案，待用户确认后进入 implementation plan

范围：重新收敛 `/comet-any` 的整体产品思路，把它定位为普通用户可理解的 Skill 创建向导，同时保留 Bundle Factory、Eval、Publish/Distribute 等后端能力

## 背景

`/comet-any` 已经具备较强的后端能力：

- 扫描本地真实 Skill。
- 读取项目级偏好 `.comet/skill-preferences.yaml`。
- 生成组合方案和控制面。
- 维护 Bundle Factory 状态。
- 支持 Eval、review、publish、distribute。
- 支持中断恢复。

这些能力有价值，但如果全部成为用户概念，`/comet-any` 会变成一个复杂编排平台。普通用户真正想做的是：

```text
我想做出一个可用的 Skill。
```

因此，本设计把 `/comet-any` 的产品心智收敛为：

```text
Skill Maker
```

而不是：

```text
Bundle Factory UI
Workflow IR 编辑器
Eval/Publish/Distribute 教程
```

## 核心结论

`/comet-any` 的方向是对的：它应该帮助用户把已有能力组合成可复用 Skill，并提供验证、安装和恢复闭环。

但当前概念表面过大，需要缩减：

- 用户不应学习 `Bundle`、`Factory`、`composition`、`templateDelta`、`Phase Recipe`。
- 用户不应在普通路径区分 `publish` 和 `distribute`。
- 用户不应手写 workflow DSL。
- 用户不应直接编辑原始 `/comet`。

内部实现可以复杂，普通用户路径必须简单。

## 用户入口

普通用户第一屏只允许三种意图：

```text
/comet-any

你想做什么？

1. 改一版 /comet
   保留 Comet 的流程，只增加 Skill、替换 Skill、关闭 Skill。

2. 做一个新 Skill
   从你的目标出发，生成一个可调用、可验证、可安装的 Skill。

3. 整理已有 Skill
   把已有 Skill 调整成更稳定、可验证、可安装的版本。
```

这三种意图可以内部映射为：

```text
改一版 /comet  -> derive
做一个新 Skill -> create
整理已有 Skill -> optimize
```

但 `derive`、`create`、`optimize` 是实现层术语，不应作为普通用户第一屏概念。

## 用户动作

用户编辑 Skill 时只理解三类动作：

```text
增加 Skill：增加一个能力
替换 Skill：替换一个可替换能力
关闭 Skill：关闭一个可选能力
```

对“改一版 `/comet`”的例子：

```text
用户：
我想保留 comet 原来的流程，但在 verify 前加 security-review，
并且把 build 阶段的 planning 换成 team-planning。

/comet-any：
你要做的是：改一版 /comet

保留：
open / design / build / verify / archive

新增：
verify 前加 security-review

替换：
build 计划能力：writing-plans -> team-planning

关闭：
无

将生成：
/team-comet

请选择：
确认生成 / 修改 / 取消
```

如果用户要求删除核心阶段：

```text
用户：
把 verify 去掉。

/comet-any：
不能删除 verify。verify 是 Comet 的核心闭环。

可以改为：
1. 降低 verify 强度。
2. 关闭最终代码审查。
3. 在 verify 后新增摘要或通知能力。
```

## 概念分层

### 普通用户层

可以出现在主路径：

- `Skill`
- `/comet`
- `改一版`
- `做一个新 Skill`
- `整理已有 Skill`
- `增加 Skill / 替换 Skill / 关闭 Skill`
- `方案`
- `验证`
- `安装/启用到当前 Agent`
- `继续上次未完成的创建`

### 高级详情层

只在“显示详情”、排障、审计或 JSON 输出中出现：

- `Bundle`
- `Factory`
- `composition`
- `readiness`
- `publish`
- `distribute`
- `capability`
- `hash`
- `scripts/rules/hooks`
- `control plane`

### 实现层

默认不向普通用户暴露：

- `templateDelta`
- `Phase Recipe`
- `step type`
- `expandedCallChain`
- `proposalHash`
- `preferenceHash`
- `BundleAuthoringState`
- `.comet/bundle-factory-plans/*`
- `.comet/bundle-authoring/*`
- `comet/guardrails.yaml`
- `comet/checks.yaml`
- portable hook descriptor

如果实现层概念必须出现，必须先给用户语言摘要，再放到高级详情。

## 基于 /comet 改一版

这个模式是 `/comet-any` 的重点入口之一，因为用户已经觉得原始 `/comet` 好用。

产品层说法：

```text
改一版 /comet
```

内部可以用派生模型实现，但用户不需要知道 `derive` 或 `Phase Recipe`。

### 保护边界

不能删除或替换：

- `open`
- `design`
- `build`
- `verify`
- `archive`
- `.comet.yaml` 状态事实源
- phase guard
- handoff hash validation
- decision-point confirmation protocol
- verify result transition
- archive delta sync

可以允许：

- 在某阶段前后加能力。
- 在阶段内某个可扩展步骤前后加能力。
- 替换可替换步骤。
- 关闭可选步骤。

### 内部模型

实现层可以使用 Phase Recipe：

```text
phase: build
  protected: entry-check
  mutable: writing-plans
  mutable: build-execution
  optional: build-review
  protected: guard-transition
```

规则：

- `protected`：不能替换或关闭，只能前后插入。
- `mutable`：可以替换，但必须保留输入输出语义。
- `optional`：可以关闭，并映射到现有配置或生成物行为。
- `extension`：可插入能力。

这些规则服务于安全性和恢复性，不作为普通用户主路径概念。

## 做一个新 Skill

产品层说法：

```text
做一个新 Skill
```

用户只需要说明：

- 这个 Skill 要解决什么问题。
- 希望复用哪些已有能力。
- 需要验证到什么程度。
- 要安装到哪些 Agent 环境。

`/comet-any` 负责：

- 查找真实 Skill。
- 处理缺失和歧义。
- 生成方案。
- 生成控制面。
- 验证。
- 安装/启用。

用户不应手写 `callChain`、`flow.yaml`、`bundle.yaml` 或 `comet/*.yaml`。

## 整理已有 Skill

产品层说法：

```text
整理已有 Skill
```

适用于：

- 现有 Skill 太散。
- 缺少验证。
- 缺少恢复。
- 缺少安装计划。
- 想把普通说明升级为 Comet-native Skill。

用户只需要选择已有 Skill 或路径，然后确认整理方案。

内部可继续使用 optimize mode，但普通用户不需要学习这个词。

## 方案确认页

无论是哪种入口，写入生成物前都必须展示同一种确认页结构：

```text
你要做的是：
<改一版 /comet | 做一个新 Skill | 整理已有 Skill>

目标：
<用户可读目标>

将保留：
<已有流程或能力>

将新增：
<新增能力>

将替换：
<替换项>

将关闭：
<关闭项>

不能做：
<被拒绝的请求和原因>

将生成：
<新 Skill 名称和主要文件摘要>

验证方式：
<quick / full / 跳过后果>

安装方式：
<安装/启用到当前 Agent，先预览再确认>

请选择：
确认生成 / 修改 / 取消
```

高级详情可以折叠显示：

```text
显示详情：
- resolved Skills
- Bundle files
- scripts/rules/hooks
- Eval manifest
- readiness evidence
- publish/distribute commands
```

## 验证和安装

普通用户层只说：

```text
验证这个 Skill
安装/启用到当前 Agent
```

实现层仍可使用：

```text
comet eval
comet publish review
comet publish approve
comet publish run
comet publish distribute --preview
comet publish distribute
```

但 `/comet-any` 对用户转述时必须包装为：

- 验证：确认这个 Skill 能按预期工作。
- 安装预览：展示会写入哪些文件和能力。
- 安装确认：用户批准后写入目标 Agent。

`publish/distribute` 可以保留在高级命令和 JSON 中。

## 恢复语言

恢复时不说：

```text
Factory state is draft and readiness is blocked.
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

## 错误语言

错误输出先用用户语言：

```text
现在不能继续。

原因：
security-review 找到两个来源，需要你选一个。

你可以：
1. 使用项目内版本。
2. 使用全局版本。
3. 移除这个新增能力。
```

高级详情再显示：

```text
candidate status=ambiguous
sources=...
```

## 与现有后端的关系

本设计不删除现有后端：

- `.comet/skill-preferences.yaml` 仍是项目偏好事实源。
- Bundle Factory 仍是确定性后端。
- Stable composed Skill Bundle 仍要求 `skills/scripts/rules/hooks/references`。
- Eval 仍是验证底座。
- publish/distribute 仍是安装底座。
- Phase Recipe 可以继续作为 `/comet` 派生的实现模型。

本设计只改变普通用户看到的产品表面。

## 实施建议

第一阶段：先改文案和输出，不动后端状态机。

- `/comet-any` 第一屏改为三种用户意图。
- proposal 输出先显示统一确认页。
- readiness 输出先说能不能继续和下一步。
- publish/distribute 指引统一包装为安装/启用。
- README 主路径只写 Skill Maker，不展开 Bundle Factory。

第二阶段：补用户摘要字段。

- `userIntent`
- `userPlanSummary`
- `userResumeSummary`
- `installPlanSummary`

第三阶段：实现 `/comet` 派生。

- 用 Phase Recipe 做内部保护边界。
- 用户层仍只说“改一版 /comet”。
- 支持增加 Skill、替换 Skill、关闭 Skill。

第四阶段：同步中英文 Skill/docs，并补测试。

## 测试要求

- `/comet-any` 第一屏不暴露 Bundle/Factory/derive/optimize/create 作为必须理解的术语。
- 三种用户意图能映射到正确内部模式。
- proposal 输出包含统一用户确认页。
- 高级详情保留 resolved Skills、Bundle、Eval、publish/distribute 证据。
- 恢复输出先展示用户摘要。
- 错误输出先展示用户可执行选项。
- `/comet` 派生不能删除核心阶段。
- `/comet` 派生可以增加 Skill、替换 Skill、关闭 Skill。
- README 主路径不把 Bundle Factory 当作用户必须学习的概念。

## Acceptance Criteria

- 新用户可以不理解 Bundle/Factory/composition 完成一个 `/comet-any` 创建流程。
- 普通用户入口只暴露三种意图：改一版 `/comet`、做一个新 Skill、整理已有 Skill。
- 用户编辑动作收敛为增加 Skill、替换 Skill、关闭 Skill。
- 所有生成前确认都使用统一确认页。
- 验证和安装路径不要求普通用户理解 publish/distribute 的内部区别。
- 高级详情和 JSON 仍保留完整后端证据。
- `/comet` 派生能力被纳入同一产品心智，而不是新增第四套入口。

## 自检

- 本设计替代刚才拆开的 derived spec 和 concept budget spec。
- 本设计没有删除后端能力。
- 本设计没有新增状态事实源。
- 本设计没有削弱确认、验证、安装预览和可执行披露。
- 本设计把 `/comet-any` 收敛为 Skill Maker，而不是暴露完整编排平台。
