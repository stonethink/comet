# Bundle Authoring 参考

## Skill Factory 后端

`comet bundle` 是 `/comet-any` 的内部确定性后端。用户不需要直接执行 Bundle CLI。
本 Skill 必须把 creator 输出适配为 Comet-native Skill Package，再交给 Bundle 后端编译、
Eval、生成可安装候选与安装。
对普通用户，第一层概念必须收束为 Skill Maker：`改一版 /comet`、`做一个新 Skill`、`整理已有 Skill`，以及“加 / 换 / 关”；
`comet bundle` 只作为高级 Bundle 后端（Advanced Bundle backend）暴露给需要审计后端状态的人。

`.comet/skill-preferences.yaml` 是项目级偏好文件，支持 `advisory` / `strict`、`prefer`、`require`
和 missing/ambiguous/deviation/scripts/hooks 策略。`/comet-any` 必须先展示组合方案，
说明偏好来源、自动补充、缺失/歧义、偏离原因和可执行披露；用户确认后，Factory metadata
必须记录 `preferenceHash`、模式、策略和 required Skill。若生成调用链偏离偏好顺序，评审摘要必须包含偏离原因。

## 首次使用和恢复后端

`/comet-any` 在开始新建流程前，必须优先检查 guide 与可恢复状态。推荐顺序：

```bash
comet bundle factory-guide --project . --json
comet publish list --json
comet publish status <name> --json
```

`factory-guide` 返回首次使用向导和恢复入口需要的统一 JSON。重点字段：

- `preference`：当前项目级偏好，或建议写入 `.comet/skill-preferences.yaml` 的默认值。
- `inventory`：平台 Skill inventory 摘要，用于首次使用向导说明当前项目可复用能力。
- `resumable`：可恢复的 Factory / Bundle 状态列表。
- `nextQuestions`：首次使用或恢复时仍需向用户确认的问题。
- `userMessage`：直接面向用户的 guide 文案。

恢复相关输出应转写为“恢复摘要”，优先给用户看 `resumeSummary`、`Current step`、`Suggested user command` 和阻塞原因，而不是暴露内部状态文件路径。

## 创作模式

`/comet-any` 对普通用户暴露三种起点：

- `改一版 /comet`：在 `/comet` 受保护边界内调整步骤，只允许加、换、关。
- `做一个新 Skill`：从用户目标创建新的多 Skill Bundle。
- `整理已有 Skill`：读取既有候选 Skill，把它们整理为可发布 Bundle。

两种模式都必须使用 `comet bundle` 命令维护状态，不得直接写入内部 JSON 状态。

## 候选读取

1. 优先读取项目 `.comet/skill-preferences.yaml`。
2. 偏好不存在时，扫描平台 Skill inventory，按能力分组推荐默认偏好，并询问是否保存。
3. 用 `find-skill` 解析真实本地 Skill 来源与内容。
4. 通过 `comet bundle candidates --json` 获取 `available`、`missing`、`ambiguous`。
5. 对每个可用候选读取候选 `SKILL.md`。
6. 对缺失或歧义候选暂停询问用户。

候选脚本只能读取，不能执行。
`factory-generate` 会在存在 `missing` 或 `ambiguous` 候选时以 `unresolved factory Skill candidates`
失败关闭；`/comet-any` 必须先让用户选择明确来源、移除缺失项或更新偏好，再使用
`comet bundle factory-resolve` 更新 Factory metadata。

## Bundle 建模

Bundle 必须明确：

- 多个 entry Skill：用户可直接调用的入口。
- internal Skill：仅供 entry 引用或共享流程使用。
- references/rules/hooks/scripts/assets：共享资源图，其中 `scripts/rules/hooks` 是 required control plane。
- 稳定组合 Skill Bundle 的 required capability set（必需能力集合）是 `skills/scripts/rules/hooks/references`。
- required/optional 能力：用于平台编译和能力缺口展示。
- Engine Package：多步骤、可恢复或高风险生成物必须生成 `comet/skill.yaml`、`comet/guardrails.yaml`、`comet/checks.yaml` 和 `comet/eval.yaml`。
- Engine Eval manifest：Engine-enabled 生成物必须写入 `comet/eval.yaml`，默认走 `authoring-skill` profile 与 `authoring-skill-smoke` quick eval。
- Portable hooks：`hooks/*.yaml` 是 Comet portable hook descriptor，只在 `comet publish distribute` 编译到目标平台配置后生效。
- 真实 Skill 证据：生成物必须包含 `reference/resolved-skills.json`，记录 resolved Skill 的来源、描述、hash、reference、脚本摘要和从 `SKILL.md` 正文提炼的 `sourceSummaries`。
- 项目级偏好证据：生成物必须记录 `preferenceHash`、模式、策略、required Skill 和偏好文件来源。

Engine 是运行语义底座，但 CLI 仍是内部确定性后端，用户主流程不需要直接操作 CLI。

## CLI 生命周期

`factory-propose` 和 `factory-init` 使用的 `plan.json` 应采用稳定结构。推荐最小形状：

```json
{
  "goal": "Create a review-oriented Comet-native Skill.",
  "preferredSkills": ["brainstorming", "writing-plans"],
  "callChain": [
    "brainstorming",
    { "skill": "writing-plans", "preferenceIndex": 1 }
  ],
  "deviations": [
    {
      "skill": "writing-plans",
      "expectedIndex": 1,
      "actualIndex": 0,
      "reason": "The user already provided a concrete workflow."
    }
  ],
  "engineMode": "deterministic",
  "runnerMode": "standalone",
  "mode": "create",
  "creator": "native",
  "defaultLocale": "zh",
  "locales": ["zh", "en"]
}
```

字段约定：

- `goal`：最终要生成什么 Skill，必须是用户可读目标。
- `preferredSkills`：显式偏好顺序；未提供时由 `.comet/skill-preferences.yaml` 与 `callChain` 合并推导。
- `callChain`：最终建议调用链。字符串写法适合常规步骤；对象写法用于显式指定 `preferenceIndex`。
- `deviations`：当 `callChain` 偏离偏好顺序时必须填写，供评审摘要直接复用。
- `mode=derive` 时，plan 文件应改为描述 `/comet` base template 与 template delta，普通用户界面表达为“改一版 /comet”。
- `mode=optimize` 时必须提供 `sourceRoot`。
- `engineMode=none` 时默认 `engineEnabled=false`；否则默认开启。

先运行 `factory-propose` 作为 dry-run，不写 Bundle authoring state：

```bash
comet bundle factory-propose <name> --file <plan.json> --json
```

它用于展示组合方案、resolved Skill、blockers、warnings、偏好模式和 `preferenceHash`。
proposal 输出还应直接给前端/Skill 使用这些字段：

- `userSummary`：给用户看的组合方案摘要。
- `actions`：至少包含 `confirm-generate`、`revise-proposal`、`cancel`。
- `proposalHash`：确认 proposal 的哈希；真实初始化必须显式确认它。

用户确认后再运行 `factory-init`。`factory-init` 读取 plan 后，会把规范化结果写入
`.comet/bundle-factory-plans/<name>/plan.json`，并在 Factory metadata 中记录 `planPath`、`planHash`
和 `preferenceHash`。`/comet-any` 的后续评审摘要应使用这些字段说明当前生成物对应的计划与偏好证据；
如果 plan 或项目级偏好改动，必须重新生成组合方案或重新运行 `factory-init`。

真实初始化必须带 proposal 确认：

```bash
comet bundle factory-init <name> --file <plan.json> --confirmed-proposal --json
```

`proposalHash` 会由 Factory metadata 记录，用于确认当前 proposal；用户不需要把它作为 CLI 参数传入。

如果 proposal 还有缺失、歧义或组合 blocker，只能先创建 unresolved Factory state 供 `factory-resolve` 使用；解决后必须再次运行 `factory-init --confirmed-proposal` 写入确认 metadata，之后才允许 `factory-generate`、review 和 publish。

`status` / `list` 输出应包含 `resumeSummary`，以便 `/comet-any` 和中文文档向用户展示恢复入口，而不是让用户自行阅读内部状态。

常用命令：

```bash
comet bundle candidates --json
comet publish list --json
comet bundle factory-propose <name> --file <plan.json> --json
comet bundle factory-init <name> --file <plan.json> --json
comet bundle factory-resolve <name> --candidate <query> --source <root-or-hash> --json
comet bundle factory-resolve <name> --candidate <query> --ignore-missing --reason <reason> --json
comet bundle factory-init <name> --file <plan.json> --confirmed-proposal --json
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet publish status <name> --json
comet bundle compile <name> --platform <id> --json
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
comet bundle eval-record <name> --result <file> --json
comet publish review <name> --platform <reference-platform> --json
comet publish approve <name> --reviewer <reviewer> --json
comet bundle review <name> --reject --reviewer <reviewer> --json
comet publish run <name> --platform <reference-platform> --json
comet publish distribute <name> --platform <id> --scope project --preview --json
comet publish distribute <name> --platform <id> --scope project --json
```

发布前必须读取 review summary 的 readiness：存在 unresolved candidate、缺失当前 hash 的 Eval 证据、
缺失当前 hash 的人工 approval、capability gap 或 executable disclosure 未确认时，不得发布 ready。
Eval 证据缺失时不得发布 ready。非 JSON 输出也必须明确展示 `Readiness:`、`Blockers:`、`Warnings:`、
`Evidence:`。面向用户的摘要还应直接包含 `Validate this Skill` 与下一步提示；如果 `Readiness: blocked`，应先按 blockers 处理候选恢复、Eval 或 review，再继续 publish。

## Runner 模式

`runnerMode=change` 时，生成 Skill 的运行状态绑定 OpenSpec change 目录。`runnerMode=standalone`
时，生成 Skill 不假设存在 change，内部 runner 使用 `.comet/runs/<run-id>` 存放同一套 Run state、
trajectory、artifacts、snapshot 和 Eval 证据。

常用内部命令：

```bash
comet skill run <skill> --run-id <run-id> --json
comet skill resume --run-id <run-id> --json
comet skill resume --run-id <run-id> --status succeeded --summary <summary> --json
comet skill eval --run-id <run-id> --scope completion --json
```

## 分发前检查

- required 能力缺口：取消该平台。
- optional 能力缺口：必须由用户显式选择 skip。
- Hook/脚本披露：必须由用户确认后才可分发。
- 正式分发前必须先跑 `comet publish distribute <name> --platform <id> --scope project --preview --json`。
- preview 应明确显示 `Install preview`、planned files、unsupported capability、可执行披露和 `No files were written`。
- 分发前必须询问用户，不能自动执行；对用户解释时应表达为安装/启用预览。
