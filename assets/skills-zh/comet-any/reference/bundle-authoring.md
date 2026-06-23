# Bundle Authoring 参考

## Skill Factory 后端

`comet bundle` 是 `/comet-any` 的内部确定性后端。用户不需要直接执行 Bundle CLI。
本 Skill 必须把 creator 输出适配为 Comet-native Skill Package，再交给 Bundle 后端编译、
Eval、发布和分发。

`.comet/skills.txt` 的顺序必须作为推荐调用顺序传递到 Factory metadata。若生成调用链偏离该顺序，
评审摘要必须包含偏离原因。

## 创作模式

`/comet-any` 支持两种模式：

- `create`：从用户目标创建新的多 Skill Bundle。
- `optimize`：读取既有候选 Skill，把它们整理为可发布 Bundle。

两种模式都必须使用 `comet bundle` 命令维护状态，不得直接写入内部 JSON 状态。

## 候选读取

1. 优先读取项目 `.comet/skills.txt`。
2. 用 `find-skill` 解析真实本地 Skill 来源与内容。
3. 偏好不存在时，扫描平台 Skill。
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
- references/rules/hooks/scripts/assets：共享资源图。
- required/optional 能力：用于平台编译和能力缺口展示。
- Engine Package：多步骤、可恢复或高风险生成物必须生成 `comet/skill.yaml`、`guardrails.yaml` 和 `evals.yaml`。
- Engine Eval manifest：Engine-enabled 生成物必须写入 `comet/eval.yaml`，默认走 `authoring-skill` profile 与 `authoring-skill-smoke` quick eval。
- 真实 Skill 证据：生成物必须包含 `reference/resolved-skills.json`，记录 resolved Skill 的来源、描述、hash、reference、脚本摘要和从 `SKILL.md` 正文提炼的 `sourceSummaries`。

Engine 是运行语义底座，但 CLI 仍是内部确定性后端，用户主流程不需要直接操作 CLI。

## CLI 生命周期

`factory-init` 使用的 `plan.json` 应采用稳定结构。推荐最小形状：

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
- `preferredSkills`：显式偏好顺序；未提供时由 `.comet/skills.txt` 与 `callChain` 合并推导。
- `callChain`：最终建议调用链。字符串写法适合常规步骤；对象写法用于显式指定 `preferenceIndex`。
- `deviations`：当 `callChain` 偏离偏好顺序时必须填写，供评审摘要直接复用。
- `mode=optimize` 时必须提供 `sourceRoot`。
- `engineMode=none` 时默认 `engineEnabled=false`；否则默认开启。

`factory-init` 读取 plan 后，会把规范化结果写入 `.comet/bundle-factory-plans/<name>/plan.json`，
并在 Factory metadata 中记录 `planPath` 和 `planHash`。`/comet-any` 的后续评审摘要应使用这两个
字段说明当前生成物对应的计划证据；如果 plan 改动，必须重新运行 `factory-init`。

常用命令：

```bash
comet bundle candidates --json
comet bundle list --json
comet bundle factory-init <name> --file <plan.json> --json
comet bundle factory-resolve <name> --candidate <query> --source <root-or-hash> --json
comet bundle factory-resolve <name> --candidate <query> --ignore-missing --reason <reason> --json
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
comet bundle compile <name> --platform <id> --json
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
comet bundle eval-record <name> --result <file> --json
comet bundle review-summary <name> --platform <reference-platform> --json
comet bundle review <name> --approve --reviewer <reviewer> --json
comet bundle review <name> --reject --reviewer <reviewer> --json
comet bundle publish <name> --platform <reference-platform> --json
comet bundle distribute <name> --platform <id> --scope project --json
```

发布前必须读取 review summary 的 readiness：存在 unresolved candidate、缺失当前 hash 的 Eval 证据、
缺失当前 hash 的人工 approval、capability gap 或 executable disclosure 未确认时，不得发布 ready。
Eval 证据缺失时不得发布 ready。非 JSON 输出也必须明确展示 `Readiness:`、`Blockers:`、`Warnings:`、
`Evidence:`；如果 `Readiness: blocked`，应先按 blockers 处理候选恢复、Eval 或 review，再继续 publish。

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

## 分发门禁

- required 能力缺口：取消该平台。
- optional 能力缺口：必须由用户显式选择 skip。
- Hook/脚本披露：必须由用户确认后才可分发。
- 分发前必须询问用户，不能自动执行。
