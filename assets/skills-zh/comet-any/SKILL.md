---
name: comet-any
description: "创建或优化用户可直接调用的 Comet-native Skill。用 /comet-any 调用，读取 `.comet/skills.txt`、解析本地真实 Skill、生成 Skill Factory 产物，并在内部使用 CLI 后端完成校验、Eval、发布与可选分发。"
---

# Comet Any — Comet Skill Factory

`/comet-any` 是 Comet Skill Factory。用户只需要调用本 Skill，描述想创建或优化的工作流；
本 Skill 会读取用户偏好、用 `find-skill` 查找本地真实 Skill 内容，组合出 Comet-native
Skill，并在内部调用 CLI 后端完成校验、Eval、发布和可选分发。CLI 是内部确定性后端，
不是用户主流程。

<IMPORTANT>
Engine 是运行语义底座。多步骤、需要恢复、需要 guardrails、需要 runtime evals
或包含脚本副作用的生成物，必须生成 `comet/skill.yaml`、`guardrails.yaml` 和 `evals.yaml`。
轻量单步 Skill 可以不启用 Engine，但必须向用户说明会失去 Run 恢复和 runtime eval。
</IMPORTANT>

## 参考资料

- `comet-any/reference/bundle-authoring.md`：Skill Factory 后端、Factory metadata、Bundle/CLI 生命周期。
- `comet-any/reference/eval-provider.md`：Eval 选择、证据格式、评审摘要与回退门禁。

## 硬性门禁

- 用户只需要调用本 Skill；不得把手动运行 `comet bundle` 或 `comet skill` 当作用户主流程。
- 必须使用 `find-skill` 解析本地真实 Skill，不得只按名字猜测能力。
- `.comet/skills.txt` 的行顺序是推荐调用顺序；生成调用链时应尽量遵守，偏离偏好顺序时必须说明原因。
- 缺失或歧义候选必须暂停并询问用户，不得静默忽略或替用户选择。
- 必须使用 `comet bundle` CLI 维护确定性状态，不得手写 `.comet/bundle-*` 状态文件。
- 必须先展示 Eval 工作量和 token 消耗，再让用户选择 `skip / quick / full Eval`。
- skip 或失败 Eval 时不得进入 ready，不得发布，不得分发。
- 发布前必须人工批准；分发前必须询问用户。
- 原生 `skill-creator` 优先；回退前必须询问用户是否允许 Comet fallback。

## 步骤

### 1. 恢复现有创作状态

先运行：

```bash
comet bundle status <name> --json
```

如果用户尚未提供 `<name>`，先询问 Skill/Bundle 名称或询问是否从目标工作流推导。若已有状态，按状态恢复；否则进入下一步。

### 2. 选择 create/optimize 与语言

询问用户选择：

- `create`：从目标描述创建新 Skill Factory 产物。
- `optimize`：读取现有 Skill 或候选 Skill，优化成新的 Comet-native Skill。

同时确认默认语言和 locales。至少记录默认 locale；多语言 Skill 需要说明哪些文件由 locale overlay 覆盖。

### 3. 读取偏好并解析真实 Skill

优先读取 `.comet/skills.txt`。如果文件存在，按其中顺序运行：

```bash
comet bundle candidates --json
```

随后把候选交给 `find-skill` 解析真实来源。不得只按名字推测能力；必须读取最终候选的真实
`SKILL.md`、直接 reference、rules、scripts 和 hooks。

### 4. 解决缺失/歧义候选

列出 `missing` 和 `ambiguous` 项，暂停询问用户如何处理。不得静默忽略缺失候选，也不得在多个来源中替用户选择。
若后端返回 `unresolved factory Skill candidates`，必须回到本步骤处理缺失或歧义项，不得继续生成。

用户选择明确来源后，使用内部后端更新状态：

```bash
comet bundle factory-resolve <name> --candidate <query> --source <root-or-hash> --json
```

用户明确同意忽略缺失偏好时，必须记录原因：

```bash
comet bundle factory-resolve <name> --candidate <query> --ignore-missing --reason <reason> --json
```

### 5. 读取候选的真实实现

读取候选 `SKILL.md`，并按需读取候选引用的 reference、rules、scripts、hooks。这里只读真实实现，绝不执行候选脚本。

### 6. 提出默认调用链

先按 `.comet/skills.txt` 的推荐调用顺序提出默认调用链，并标注每个 Skill 的 `preferenceIndex`。
若目标、依赖、风险、上下文恢复、安全确认或平台限制要求调整顺序，必须记录“偏离偏好顺序”的项，并说明原因。

### 7. 澄清 Skill Factory 目标

与用户确认：

- 新 Skill 的目标、使用场景与成功标准。
- 哪些是 entry Skill，哪些是 internal Skill。
- 共享资源、安全边界、Hook/脚本副作用。
- 目标平台、required/optional 能力与能力缺口策略。
- 是否需要 Engine、runner 恢复和 runtime eval。

### 8. 通过 CLI 初始化草稿与 Factory metadata

优先生成结构化 plan 文件，并运行：

```bash
comet bundle factory-init <name> --file <plan.json> --json
```

这个命令必须负责两件事：

- 若 draft 尚不存在，则按 create/optimize 模式创建 draft。
- 把偏好顺序、解析后的真实 Skill、默认调用链、偏离原因和 Engine 模式写入 Factory metadata，由 CLI 维护确定性状态。
- 将规范化后的计划固化到 `.comet/bundle-factory-plans/<name>/plan.json`，并在 metadata 中记录 `planHash`，供恢复、评审和审计使用。

只有在需要恢复旧状态、排查后端问题或显式优化既有 Bundle 时，才单独使用：

```bash
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
```

### 9. 生成 Comet-native Skill 源码

优先使用原生 `skill-creator` 生成或优化 Comet-native Skill；原生 creator 不可用时，必须先说明差异与风险，再询问用户是否允许 Comet fallback。

生成 entry Skill、internal Skill、references 和 scripts。用户不需要手动运行 `comet bundle`
或 `comet skill`；所有这些都是内部后端步骤。

生成物必须包含真实 Skill 证据摘要和“组合后的工作方式”，并把结构化证据写入
`reference/resolved-skills.json`。摘要应引用 resolved Skill 的名称、来源、描述、hash 和从真实
`SKILL.md` 正文提炼出的内容；`resolved-skills.json` 必须包含 `sourceSummaries`，证明组合基于本地真实内容而不是只按名称猜测。

### 10. 生成 Engine Package

为多步骤或高风险生成物生成 `comet/skill.yaml`、`guardrails.yaml` 和 `evals.yaml`。
Engine Package 必须与调用链、guardrails、runtime evals 和脚本副作用声明一致。

如果 `runnerMode` 是 `standalone`，生成的 Skill 应指示 Agent 使用 `.comet/runs/<run-id>` 保存运行状态。
需要持久化执行时，内部 runner 入口是：

```bash
comet skill run <skill> --run-id <run-id> --json
comet skill resume --run-id <run-id> --status succeeded --summary <summary> --json
comet skill eval --run-id <run-id> --scope completion --json
```

### 11. 编译并校验

至少对一个参考平台运行：

```bash
comet bundle compile <name> --platform <id> --json
```

如存在能力缺口或可执行披露，必须展示给用户。required 能力缺口会阻塞对应平台；optional 能力缺口必须由用户显式选择 skip。

### 12. 展示 Eval 工作量并询问 skip/quick/full

运行：

```bash
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
```

向用户解释 quick/full 的 token 消耗、预计运行次数和覆盖范围，然后询问 `skip / quick / full Eval`。选择 skip 时，状态保持 draft，不得继续 ready。

### 13. 记录 Eval 证据

用户选择 quick/full 后，调用 Eval provider，生成结构化结果文件，再运行：

```bash
comet bundle eval-record <name> --result <file> --json
```

Eval 失败或哈希不匹配时停止，回到草稿修复。

### 14. 展示评审摘要并等待显式批准

先运行：

```bash
comet bundle review-summary <name> --platform <reference-platform> --json
```

基于该摘要展示 entry Skill、internal Skill、planHash、真实 Skill 证据、推荐调用顺序、偏离偏好顺序、能力缺口、可执行披露、quick/full Eval 工作量、Eval 结果和目标平台。偏离偏好顺序时必须说明原因。

批准：

```bash
comet bundle review <name> --approve --reviewer <reviewer> --json
```

拒绝：

```bash
comet bundle review <name> --reject --reviewer <reviewer> --json
```

### 15. 发布

只有当前哈希已通过 Eval 且人工批准后，才能运行：

```bash
comet bundle publish <name> --platform <reference-platform> --json
```

### 16. 询问是否分发

发布后询问用户是否分发。不得自动分发。

如果用户同意，先展示平台能力缺口和可执行披露；存在 Hook/脚本时必须取得确认，然后运行：

```bash
comet bundle distribute <name> --platform <id> --scope project --json
```

如用户明确同意可执行披露，加入：

```bash
--confirm-executables
```

如用户明确选择跳过 optional 能力，加入：

```bash
--skip-capability <capability>
```
