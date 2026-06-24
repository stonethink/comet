---
name: comet-any
description: "Skill 创建向导：创建或优化用户可直接调用的 Comet-native Skill。用 /comet-any 调用，读取项目级偏好 `.comet/skill-preferences.yaml`、解析本地真实 Skill、展示组合方案并生成 Skill Factory 产物，在内部使用 CLI 后端完成校验、Eval、发布与可选分发。"
---

# Comet Any — Comet Skill Factory

`/comet-any` 是 Comet 的 Skill 创建向导。用户只需要调用本 Skill，描述想创建或优化的工作流；
本 Skill 会先恢复现有流程、提供首次使用帮助、读取项目级偏好 `.comet/skill-preferences.yaml`、
用 `find-skill` 查找本地真实 Skill 内容，先展示组合方案确认页并等待用户确认，再生成稳定组合 Skill Bundle，
再在内部调用 CLI 后端完成校验、Eval、发布和可选分发。CLI 是内部确定性后端，用户只需要调用本 Skill。
普通用户路径必须收束为 `/comet-any -> comet eval -> comet publish review/approve/run -> comet publish distribute --preview -> comet publish distribute`；其中 `comet skill`
是底层 Skill 工具（Low-level Skill utilities），`comet bundle` 是高级 Bundle 后端（Advanced Bundle backend）。

<IMPORTANT>
Engine 是运行语义底座。多步骤、需要恢复、需要 guardrails、需要 runtime evals
或包含脚本副作用的生成物，必须生成稳定组合 Skill Bundle，而不是只产出一个 `SKILL.md`。
稳定组合 Skill Bundle 的 required capability set（必需能力集合）是 `skills/scripts/rules/hooks/references`，
其中 `scripts/rules/hooks` 是 required control plane，不能当作可随意删除的附属文件；`hooks/*.yaml`
是 Comet portable hook descriptor，只有通过 `comet publish distribute` 编译到目标平台配置后才会生效。
Bundle 至少包含 `SKILL.md`、`comet/skill.yaml`、`comet/guardrails.yaml`、`comet/checks.yaml`、
`comet/eval.yaml`、`scripts`、`rules`、`hooks`、`reference` 和 `bundle.yaml`。
轻量单步 Skill 可以不启用 Engine，但必须向用户说明会失去 Run 恢复和 runtime eval。
</IMPORTANT>

## 参考资料

- `comet-any/reference/bundle-authoring.md`：Skill Factory 后端、Factory metadata、Bundle/CLI 生命周期。
- `comet-any/reference/eval-provider.md`：Eval 选择、证据格式、评审摘要与回退检查。

## 硬性检查

- 用户只需要调用本 Skill；不得把手动运行 `comet bundle` 或 `comet skill` 当作用户主流程。
- CLI 是内部确定性后端，用户只需要调用本 Skill；不要要求用户记忆 Bundle 子命令。
- 必须使用 `find-skill` 解析本地真实 Skill，不得只按名字猜测能力。
- `.comet/skill-preferences.yaml` 是项目级偏好文件，支持 `advisory` 和 `strict`；生成前必须展示组合方案，说明 prefer/require、缺失/歧义、偏离原因、scripts/hooks 披露，并在确认后记录 `preferenceHash`。
- 缺失或歧义候选必须暂停并询问用户，不得静默忽略或替用户选择。
- 必须使用 `comet bundle` CLI 维护确定性状态，不得手写 `.comet/bundle-*` 状态文件。
- 必须先展示 Eval 工作量和 token 消耗，再让用户选择 `skip / quick / full Eval`。
- skip 或失败 Eval 时不得进入 ready，不得发布，不得分发。
- 在非 JSON 输出下，也必须明确展示 `Readiness:`、`Blockers:`、`Warnings:` 和 `Evidence:`，
  让用户能直接看懂 readiness、阻塞点、警告、证据和恢复线索。
- 发布前必须读取 review summary 的 readiness；存在 unresolved candidate、缺失当前 hash 的 Eval 证据、
  缺失当前 hash 的人工 approval、capability gap 或 executable disclosure 未确认时，不得发布 ready。
- 发布前必须人工批准；分发前必须询问用户。
- 原生 `skill-creator` 优先；回退前必须询问用户是否允许 Comet fallback。

## 步骤

### 1. 恢复现有创作状态

除非用户明确说“重新开始”或“放弃旧状态”，否则必须先尝试恢复现有流程。第一个确定性后端调用应为：

```bash
comet bundle factory-guide --project . --json
```

如果 guide 或后续状态返回可恢复条目，必须先展示“恢复摘要”，把 `resumeSummary`、当前阻塞原因和用户下一步放在一起，不要直接开始新建流程。

如果用户没有提供 `<name>`，再运行：

```bash
comet publish list --json
```

若存在可恢复的 Factory / Bundle 创作状态，展示每个条目的名称、状态、next action 和原因，让用户选择要继续哪一个；不要要求用户自己去 `.comet/bundle-authoring/` 查文件。

用户提供 `<name>` 或选择已有条目后，运行：

```bash
comet publish status <name> --json
```

若已有状态，按状态恢复；否则进入下一步并询问是否从目标工作流推导 Skill/Bundle 名称。
若需要面向用户解释当前阻塞点，可补充查看文本输出；它必须直接展示 `Current step`、`Suggested user command`、原因和建议命令。只有排障时才直接回退到 `comet bundle status`。

### 2. 首次使用向导

首次使用时，必须把 `comet bundle factory-guide --project . --json` 视为“首次使用向导”的数据源，并解释：

- `.comet/skill-preferences.yaml` 是项目级偏好文件。
- `preference` / `inventory` / `resumable` / `nextQuestions` / `userMessage` 是 guide 返回的关键信息。
- 只有在用户明确同意后，才可以把推荐偏好写入 `.comet/skill-preferences.yaml`。

如果用户是第一次使用 `/comet-any`，应明确告诉用户：CLI 是内部确定性后端，用户只需要调用本 Skill。

### 3. 选择 create/optimize 与语言

询问用户选择：

- `create`：从目标描述创建新 Skill Factory 产物。
- `optimize`：读取现有 Skill 或候选 Skill，优化成新的 Comet-native Skill。

同时确认默认语言和 locales。至少记录默认 locale；多语言 Skill 需要说明哪些文件由 locale overlay 覆盖。

### 4. 读取偏好并解析真实 Skill

优先读取项目级偏好 `.comet/skill-preferences.yaml`。如果文件不存在，先扫描平台 Skill inventory，按能力分组推荐默认偏好，并询问用户是否保存为项目级偏好。如果文件存在，按 `prefer` 与 `require` 运行：

```bash
comet bundle candidates --json
```

随后把候选交给 `find-skill` 解析真实来源。`advisory` 可在说明原因后补充目标需要的 Skill；`strict` 遇到 required 缺失、歧义或禁止的 scripts/hooks 必须阻塞。不得只按名字推测能力；必须读取最终候选的真实
`SKILL.md`、直接 reference、rules、scripts 和 hooks。

### 5. 解决缺失/歧义候选

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

### 6. 读取候选的真实实现

读取候选 `SKILL.md`，并按需读取候选引用的 reference、rules、scripts、hooks。这里只读真实实现，绝不执行候选脚本。

### 7. 展示组合方案并等待确认

先按 `.comet/skill-preferences.yaml` 的 `prefer`/`require` 提出组合方案，并标注每个 Skill 的 `preferenceIndex`、来源、hash、用途和调用顺序。
组合方案必须说明哪些 Skill 来自项目级偏好，哪些由目标语义自动补充，哪些缺失或歧义，是否偏离偏好顺序，以及 scripts/hooks 会产生什么可执行披露。
用户确认前不得生成 Bundle draft；用户可以调整偏好、选择歧义来源、移除缺失 Skill、切换 `advisory`/`strict` 或取消。
必须明确告诉用户现在展示的是“组合方案确认页”。

用户必须在组合方案确认页做三选一：

1. `confirm-generate` - 确认生成，随后调用 `comet bundle factory-init <name> --file <plan> --confirmed-proposal`
2. `revise-proposal` - 修改目标、偏好、候选或控制面策略后重新 proposal
3. `cancel` - 不写入 Bundle state

如果 proposal 仍有缺失、歧义或组合 blocker，不得调用 `confirm-generate`。只有在需要用后端状态承载 `factory-resolve` 时，才可先不带 `--confirmed-proposal` 初始化 unresolved Factory state；候选和组合解决后，必须重新展示可生成的组合方案，并再次调用 `comet bundle factory-init <name> --file <plan> --confirmed-proposal` 写入确认 metadata，然后才能 `factory-generate`。

### 8. 澄清 Skill Factory 目标

与用户确认：

- 新 Skill 的目标、使用场景与成功标准。
- 哪些是 entry Skill，哪些是 internal Skill。
- 共享资源、安全边界、Hook/脚本副作用。
- 目标平台、required/optional 能力与能力缺口策略。
- 是否需要 Engine、runner 恢复和 runtime eval。

### 9. 通过 CLI 初始化草稿与 Factory metadata

优先生成结构化 plan 文件。写入任何 Bundle draft 前，先运行 dry-run proposal：

```bash
comet bundle factory-propose <name> --file <plan.json> --json
```

把 proposal 中的组合方案、`preferenceHash`、blockers、warnings、resolved Skill 证据、`userSummary`、`actions`、`proposalHash` 和将生成文件清单展示给用户。用户确认后再运行：

```bash
comet bundle factory-init <name> --file <plan.json> --confirmed-proposal --json
```

`proposalHash` 必须由本次 proposal 的 Factory metadata 记录并在后端校验，不由用户作为 CLI 参数传入。

若前一次为了 `factory-resolve` 已创建 unresolved Factory state，解决候选/组合 blocker 后仍然要重新运行同一条 `factory-init --confirmed-proposal`；后端会基于当前已解决 state 写入确认 metadata，缺少该 metadata 时 `factory-generate`、review 和 publish 都会拒绝继续。

这个命令必须负责两件事：

- 若 draft 尚不存在，则按 create/optimize 模式创建 draft。
- 把偏好顺序、required Skill、`advisory`/`strict` 模式、策略、`preferenceHash`、解析后的真实 Skill、默认调用链、偏离原因和 Engine 模式写入 Factory metadata，由 CLI 维护确定性状态。
- 将规范化后的计划固化到 `.comet/bundle-factory-plans/<name>/plan.json`，并在 metadata 中记录 `planHash`，供恢复、评审和审计使用。

只有在需要恢复旧状态、排查后端问题或显式优化既有 Bundle 时，才单独使用：

```bash
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
```

### 10. 生成 Comet-native Skill 源码

优先使用原生 `skill-creator` 生成或优化 Comet-native Skill；原生 creator 不可用时，必须先说明差异与风险，再询问用户是否允许 Comet fallback。

生成 entry Skill、internal Skill、references、scripts、rules 和 hooks。用户不需要手动运行
`comet bundle` 或 `comet skill`；所有这些都是内部后端步骤。

生成物必须包含真实 Skill 证据摘要和“组合后的工作方式”，并把结构化证据写入
`reference/resolved-skills.json`。摘要应引用 resolved Skill 的名称、来源、描述、hash 和从真实
`SKILL.md` 正文提炼出的内容；`resolved-skills.json` 必须包含 `sourceSummaries`，证明组合基于本地真实内容而不是只按名称猜测。

### 11. 生成 Engine Package

为多步骤或高风险生成物生成 `comet/skill.yaml`、`comet/guardrails.yaml`、`comet/checks.yaml`
和 `comet/eval.yaml`。Engine Package 必须与调用链、guardrails、runtime checks、runtime evals、
scripts/rules/hooks control plane 和脚本副作用声明一致。
Engine-enabled 生成物还必须写入 `comet/eval.yaml`，默认使用 `authoring-skill`
profile 和 `authoring-skill-smoke` quick eval。

内部运行本地 eval 时，优先使用统一入口而不是手工拼 pytest：

```bash
comet eval collect --manifest <path-to-comet/eval.yaml>
comet eval run --manifest <path-to-comet/eval.yaml> --html
```

如果 `runnerMode` 是 `standalone`，生成的 Skill 应指示 Agent 使用 `.comet/runs/<run-id>` 保存运行状态。
需要持久化执行时，内部 runner 入口是：

```bash
comet skill run <skill> --run-id <run-id> --json
comet skill resume --run-id <run-id> --status succeeded --summary <summary> --json
comet skill eval --run-id <run-id> --scope completion --json
```

### 12. 编译并校验

至少对一个参考平台运行：

```bash
comet bundle compile <name> --platform <id> --json
```

如存在能力缺口或可执行披露，必须展示给用户。required 能力缺口会阻塞对应平台；optional 能力缺口必须由用户显式选择 skip。

### 13. 展示 Eval 工作量并询问 skip/quick/full

运行：

```bash
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
```

向用户解释 quick/full 的 token 消耗、预计运行次数和覆盖范围，然后询问 `skip / quick / full Eval`。选择 skip 时，状态保持 draft，不得继续 ready。

### 14. 记录 Eval 证据

用户选择 quick/full 后，调用 Eval provider，生成结构化结果文件，再运行：

```bash
comet bundle eval-record <name> --result <file> --json
```

Eval 失败或哈希不匹配时停止，回到草稿修复。

### 展示用户可读 readiness 并等待显式批准

先运行：

```bash
comet publish review <name> --platform <reference-platform> --json
```

基于该摘要展示 entry Skill、internal Skill、planHash、preferenceHash、项目级偏好模式、真实 Skill 证据、推荐调用顺序、偏离偏好顺序、能力缺口、可执行披露、quick/full Eval 工作量、Eval 结果和目标平台。偏离偏好顺序时必须说明原因。
必须把用户可读 readiness 摘要直接展示出来，至少包括 `Publish readiness:`、`User next steps:`、`Readiness:`、`Blockers:`、`Warnings:` 和 `Evidence:`。若使用非 JSON 输出，也必须逐项读取这些字段。
当 `Readiness: blocked` 时，先根据 blockers 处理候选恢复、Eval 或 review，再继续 publish。若 readiness 不是 `publishable`，或其中显示 Eval 证据缺失时不得发布 ready。

批准：

```bash
comet publish approve <name> --reviewer <reviewer> --json
```

拒绝：

```bash
comet bundle review <name> --reject --reviewer <reviewer> --json
```

### 15. 发布

只有当前哈希已通过 Eval 且人工批准后，才能运行：

```bash
comet publish run <name> --platform <reference-platform> --json
```

### 16. 分发预览

分发前必须先运行：

```bash
comet publish distribute <name> --platform <id> --scope project --preview --json
```

必须把 `Distribution preview`、planned files、unsupported capability、可执行披露和 `No files were written` 明确展示给用户。
只有用户确认 preview 中的 planned files、unsupported capability 和 executable disclosures 后，才可以移除 `--preview` 执行真实分发。

### 17. 询问是否执行分发

发布后询问用户是否执行分发。不得自动分发。

如果用户同意，先展示平台能力缺口和可执行披露；存在 Hook/脚本时必须取得确认，然后运行：

```bash
comet publish distribute <name> --platform <id> --scope project --json
```

如用户明确同意可执行披露，加入：

```bash
--confirm-executables
```

如用户明确选择跳过 optional 能力，加入：

```bash
--skip-capability <capability>
```
