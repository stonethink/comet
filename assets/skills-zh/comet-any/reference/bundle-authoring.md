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

## Bundle 建模

Bundle 必须明确：

- 多个 entry Skill：用户可直接调用的入口。
- internal Skill：仅供 entry 引用或共享流程使用。
- references/rules/hooks/scripts/assets：共享资源图。
- required/optional 能力：用于平台编译和能力缺口展示。
- Engine Package：多步骤、可恢复或高风险生成物必须生成 `comet/skill.yaml`、`guardrails.yaml` 和 `evals.yaml`。

Engine 是运行语义底座，但 CLI 仍是内部确定性后端，用户主流程不需要直接操作 CLI。

## CLI 生命周期

常用命令：

```bash
comet bundle candidates --json
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
comet bundle compile <name> --platform <id> --json
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
comet bundle eval-record <name> --result <file> --json
comet bundle review <name> --approve --reviewer <reviewer> --json
comet bundle review <name> --reject --reviewer <reviewer> --json
comet bundle publish <name> --platform <reference-platform> --json
comet bundle distribute <name> --platform <id> --scope project --json
```

## 分发门禁

- required 能力缺口：取消该平台。
- optional 能力缺口：必须由用户显式选择 skip。
- Hook/脚本披露：必须由用户确认后才可分发。
- 分发前必须询问用户，不能自动执行。
