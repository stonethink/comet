# Comet Derived Skill Design

日期：2026-06-24

状态：草案，待用户确认后进入 implementation plan

范围：为 `/comet-any` 增加一个基于原始 `/comet` 模板增删 Skill 的派生模式

## 背景

`/comet-any` 已经可以组合任意 Skill，并通过 Bundle Factory 生成稳定的 Comet-native Skill Bundle。
但用户反馈原始 `/comet` Skill 很好用，他们并不总是想从零组合任意 Skill，而是希望：

- 继续使用 `/comet` 的五阶段工作流、断点恢复、阶段守卫和归档闭环。
- 在这个基础上添加团队专用 Skill。
- 替换某些可选执行策略。
- 关闭不需要的可选能力。

因此需要一个新模式：不是覆盖原始 `/comet`，也不是开放用户手写复杂编排，而是从受保护的 Comet 模板派生出一个新的 Skill。

## 目标

1. 让用户可以用 `/comet-any` 创建“像 `/comet`，但带有自定义 Skill 增删”的新工作流。
2. 保留 `/comet` 的核心可靠性：OpenSpec change 生命周期、`.comet.yaml`、phase guard、handoff、verify、archive。
3. 允许用户在明确槽位上插入、替换或关闭 Skill。
4. 在生成前展示模板差异确认页，让用户知道哪些部分来自原始 `/comet`，哪些是自定义变化。
5. 复用现有 Bundle Factory、composition、proposal confirmation、eval、publish/distribute 流程。
6. 不直接修改 Superpowers、OpenSpec 或原始 Comet Skill。

## 非目标

- 不允许普通用户直接编辑原始 `/comet` Skill。
- 不新增第二套 Comet 状态机。
- 不开放手写复杂 workflow DSL 作为普通用户路径。
- 不允许删除 `/comet` 的核心阶段。
- 不让用户绕过 proposal confirmation、Eval evidence、review readiness 或 executable disclosure。

## 产品模型

`/comet-any` 增加第三种创作模式：

```text
create      从目标描述创建全新 Comet-native Skill
optimize    优化已有 Skill 或候选 Bundle
derive      基于受保护模板派生新 Skill
```

`derive` 的默认模板是原始 `/comet`：

```text
/comet
  open -> design -> build -> verify -> archive
```

生成物不是覆盖 `/comet`，而是新的 entry Skill，例如 `/my-comet`、`/team-comet` 或用户指定名称。

## 用户扩展体验

用户不需要理解 `templateDelta`、`callChain` 或 Bundle 内部状态。`derive` 模式应把扩展动作收敛成三类用户语言：

```text
加一步：在某个阶段前后插入 Skill
换一步：替换某个可替换槽位的默认 Skill
关一步：关闭某个可选槽位
```

典型对话：

```text
用户：
我想保留 comet 原来的流程，但在 verify 前加一个 security-review，
并且 build 阶段不用默认 subagent，改用我们团队的 team-builder。

/comet-any：
我会基于 /comet full workflow 派生一个新的 Skill。

保留：
open -> design -> build -> verify -> archive

新增：
pre-verify: security-review

替换：
build-execution: default -> team-builder

关闭：
无

将生成：
/team-comet

请选择：确认生成 / 修改方案 / 取消
```

另一个关闭可选能力的例子：

```text
用户：
我想要一个轻量版 comet，不要最终代码审查，但其他阶段都保留。

/comet-any：
可以关闭 build-review 这个可选槽位。
不能删除 verify 阶段；verify 是 Comet 的核心闭环。

关闭：
build-review -> review_mode: off
```

如果用户要求删除核心阶段，系统应阻塞并给出替代方案：

```text
用户：
把 verify 去掉。

/comet-any：
不能删除 verify。verify 是 /comet 的核心阶段，负责确认实现、测试和归档前状态。
可选替代：
1. 降低 verify 强度。
2. 关闭 build-review。
3. 新增 post-verify 自动摘要 Skill。
```

因此，普通用户扩展的是“槽位”，不是 `/comet` 本体。Agent 可以把用户自然语言翻译成 `templateDelta`，但必须在生成前用确认页让用户看到实际差异。

## 受保护模板

Comet 模板应分成两层：

### Protected Anchors

这些锚点不能被删除，只能被包装或在前后插入扩展：

- `open`
- `design`
- `build`
- `verify`
- `archive`
- `.comet.yaml` 状态事实源
- phase guard
- handoff generation and hash validation
- decision-point confirmation protocol
- verify result handling
- archive delta sync semantics

### Extension Slots

用户可以在这些槽位上添加、替换或关闭能力：

- `before-open`
- `after-open`
- `before-design`
- `after-design`
- `build-planning`
- `build-execution`
- `build-review`
- `pre-verify`
- `post-verify`
- `pre-archive`
- `post-archive`

关闭能力只适用于可选槽位。例如关闭最终代码审查应映射为 `review_mode: off` 或移除 `build-review` 扩展，而不是删除 `verify` 阶段。

## 派生计划结构

Factory plan 扩展 `mode: "derive"`，并新增 `baseTemplate` 与 `templateDelta`。

```json
{
  "mode": "derive",
  "goal": "Create a team Comet workflow with security review before verification.",
  "baseTemplate": {
    "skill": "comet",
    "profile": "full",
    "versionHash": "<resolved-comet-hash>"
  },
  "templateDelta": {
    "insertAfter": {
      "design": ["security-review"]
    },
    "replace": {
      "build-execution": "team-builder"
    },
    "disable": ["build-review"]
  },
  "preferredSkills": ["comet", "security-review", "team-builder"],
  "engineMode": "deterministic",
  "runnerMode": "change",
  "defaultLocale": "zh",
  "locales": ["zh", "en"]
}
```

`callChain` 不应由用户手写为主要输入。`factory-propose` 应在读取模板和 delta 后展开最终 call chain 与 composition。

## Delta 语义

### Insert

`insertBefore` / `insertAfter` 在指定 protected anchor 或 extension slot 前后插入 Skill。

要求：

- 插入目标必须是已知 anchor 或 slot。
- 插入 Skill 必须通过真实候选解析。
- 插入位置必须出现在确认页和 composition report 中。

### Replace

`replace` 只允许替换 extension slot 的默认实现，不允许替换 protected anchor。

示例：

```json
{
  "replace": {
    "build-execution": "team-builder"
  }
}
```

如果用户尝试替换 `verify` 或 `archive`，proposal 必须阻塞并解释这些是核心阶段。

### Disable

`disable` 只允许关闭可选 slot。

示例：

```json
{
  "disable": ["build-review"]
}
```

禁用的结果必须映射到现有 Comet 配置或生成 Skill 文案中。例如 `build-review` 可映射到 `review_mode: off` 的决策提示，但不能绕过 verify。

## Proposal 确认页

`derive` 模式的组合确认页必须展示：

- 基础模板：`comet`、profile、hash、来源。
- 保留的核心阶段。
- 用户新增的 Skill。
- 用户替换的 slot。
- 用户关闭的可选 slot。
- 被拒绝的修改及原因。
- 最终展开后的 call chain / composition。
- 会生成的 control plane。
- Eval 与 publish readiness 计划。

用户必须能选择：

```text
确认生成
修改模板差异
取消
```

确认后，Factory metadata 必须记录：

- `baseTemplate`
- `baseTemplateHash`
- `templateDelta`
- `expandedCallChain`
- protected anchor validation result
- proposal confirmation metadata

## Backend Design

### Plan Parser

扩展 `domains/bundle/factory-plan.ts`：

- `mode` 增加 `derive`。
- `sourceRoot` 仍只用于 `optimize`。
- 新增 `baseTemplate` 与 `templateDelta` 结构校验。
- `derive` 模式允许缺省 `callChain`，由模板展开阶段生成。

### Template Registry

新增 Comet 模板定义，优先放在 Bundle Factory 域内：

```text
domains/bundle/templates/comet-classic-template.ts
```

模板定义应包含：

- template id
- supported profiles: `full`, `hotfix`, `tweak`
- protected anchors
- extension slots
- default slot implementations
- slot-to-state-field hints，例如 `build-review -> review_mode`

模板定义是代码中的受保护 contract，不从用户可写文件读取。

### Expansion

在 `factory-propose` 前增加模板展开：

```text
baseTemplate + templateDelta -> expanded callChain + composition metadata
```

展开阶段负责：

- 解析基础 `/comet` Skill 的真实来源和 hash。
- 校验 delta 是否触碰 protected anchor。
- 把 insert/replace/disable 转成 composition steps。
- 生成 blockers/warnings。
- 输出用户可读 diff summary。

### Composition

现有 `composeBundleFactoryPlan` 可继续处理展开后的 entry/call chain。

需要补充的不是替换现有 composition，而是让 composition metadata 能表达：

- step 来源于 base template。
- step 来源于 user delta insert。
- step 来源于 slot replacement。
- optional slot disabled。

如果不扩展现有 step source enum，也可以先在 `factory` metadata 中单独保存 `templateExpansion`，再在 composition report 里渲染。

### Generated Skill

派生 Skill 的 `SKILL.md` 应说明：

- 本 Skill 派生自 `/comet`。
- 哪些核心阶段保持不变。
- 哪些 slot 被插入、替换或关闭。
- 运行时仍遵循 Comet decision points、guard、handoff、verify 和 archive 协议。

如果生成物包含脚本、rules、hooks，继续按稳定组合 Skill Bundle 的 required control plane 处理。

## UX Flow

1. 用户调用 `/comet-any` 并选择 `derive`。
2. `/comet-any` 解析真实 `/comet` Skill 和项目 Skill inventory。
3. 用户说明想添加、替换或关闭什么能力。
4. `/comet-any` 将自然语言转成 `templateDelta` 草案。
5. `factory-propose` 展示模板差异确认页。
6. 用户确认、修改或取消。
7. 确认后 `factory-init --confirmed-proposal` 写入 metadata。
8. `factory-generate` 生成派生 Bundle。
9. 继续走 eval、publish review、approve、run、distribute preview、distribute。

## Error Handling

- 基础 `/comet` Skill 缺失：阻塞，提示先安装或启用 Comet。
- 基础 `/comet` hash 变化：恢复时提示模板 drift，要求重新确认 proposal。
- 用户删除 protected anchor：阻塞，解释可替代方案。
- 用户替换 unknown slot：阻塞，展示可用 slot。
- 插入 Skill 缺失或歧义：复用现有 candidate resolve 流程。
- 禁用 required control plane：阻塞，解释 scripts/rules/hooks 是稳定组合 Skill 的 required capability set。

## Testing

至少覆盖：

- `derive` plan parser 接受 baseTemplate/templateDelta。
- 缺失 baseTemplate 阻塞。
- 替换 protected anchor 阻塞。
- 插入 known slot 成功展开。
- 替换 extension slot 成功展开。
- 禁用 optional slot 成功记录。
- 禁用 required anchor 失败。
- proposal summary 展示 base template、delta、expanded call chain。
- metadata 记录 base hash 与 delta。
- template drift 后 readiness/recovery 阻塞。
- generated package 的 composition report 包含模板差异。
- `/comet-any` 中英文 Skill 文案结构一致。

## Documentation

需要同步：

- `assets/skills-zh/comet-any/SKILL.md`
- `assets/skills/comet-any/SKILL.md`
- `/comet-any` 文档
- Skill Factory / Bundle authoring 参考
- README 仅保留一句入口说明和文档链接

更新顺序：

1. 中文 Skill 和中文文档。
2. 用户确认中文表达。
3. 同步英文 Skill 和英文文档。
4. 更新 Changelog。

## Acceptance Criteria

- 用户可以通过 `/comet-any` 选择 `derive` 并基于 `/comet` 创建新 Skill。
- 用户不能删除 open/design/build/verify/archive 核心阶段。
- 用户可以在明确 slot 上插入 Skill。
- 用户可以替换 extension slot。
- 用户可以关闭 optional slot。
- 生成前必须展示模板差异确认页。
- 生成物保留 Comet 的状态机、guard、handoff、verify、archive 语义。
- Eval/publish/distribute 继续复用现有路径。
- 中英文 Skill/docs 最终保持结构一致。

## 自检

- 本设计没有修改原始 `/comet`。
- 本设计没有开放手写复杂 DSL 为普通用户路径。
- 本设计没有新增第二套状态事实源。
- 本设计没有允许删除核心阶段。
- 本设计复用了已有 Bundle Factory 和 publish 流程。
