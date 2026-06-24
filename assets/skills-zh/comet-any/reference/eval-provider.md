# Eval Provider 参考

## Provider 优先级

优先使用原生 `skill-creator` 的 Eval/生成能力。原生能力不可用时，必须先询问用户是否允许 Comet fallback；回退前必须询问用户，不得默认启用。

## Eval 选择

在任何 provider 动作前，必须展示：

- `quick` 的预计运行次数、覆盖组件和 token 消耗。
- `full` 的预计运行次数、覆盖组件和 token 消耗。
- `skip / quick / full Eval` 三个选择。

skip 或失败 Eval 时不得进入 ready；也不得 publish 或 distribute。

## 结果记录

Eval provider 需要输出结构化 JSON，随后使用：

```bash
comet bundle eval-record <name> --result <file> --json
```

结果必须绑定当前 Bundle 哈希，覆盖每个 entry Skill，并包含 Bundle 编译与安全证据。旧哈希证据可以保留在磁盘，但不能推进状态。

## 人工评审

Eval 通过后仍必须人工批准。评审摘要至少包含：

先运行 `comet bundle review-summary <name> --platform <reference-platform> --json`，再基于其输出展示：

- Bundle 名称、版本、hash。
- 多个 entry 与 internal Skill 列表。
- `planHash`、`preferenceHash` 与 `reference/resolved-skills.json` 真实 Skill 证据，包括项目级偏好模式、required Skill、`sourceSummaries` 与“组合后的工作方式”摘要。
- 推荐调用顺序与 `preferenceIndex`。
- 偏离偏好顺序的项和原因。
- `.comet/skill-preferences.yaml` 是否在 Factory 初始化后发生漂移；`advisory` 模式给出 warning，`strict` 模式阻塞。
- 稳定组合 Skill Bundle 的 required capability set（必需能力集合）`skills/scripts/rules/hooks/references` 是否声明完整，且 `scripts/rules/hooks` 是否继续作为 required control plane。
- 是否生成 `comet/skill.yaml`、`comet/guardrails.yaml`、`comet/checks.yaml` 与 `comet/eval.yaml`。
- `hooks/*.yaml` 是否仅被当作 portable hook descriptor，等待 `comet publish distribute` 编译到目标平台。
- 能力缺口和可执行披露。
- Eval 选择、token 消耗和结果摘要。

只有用户显式批准后，才能运行 `comet bundle review --approve` 并发布。
