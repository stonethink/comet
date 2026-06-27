---
name: comet-any
description: "当用户想基于 Comet 现有 Skill 做五阶段定制、创建全新的 workflow Skill、整理已有 Skill，或用 Workflow Node / Skill Binding / Output Schema 编排任意 Skill 时使用。"
---

# Comet Any - Skill Maker

`/comet-any` 是 Comet 的 Skill 创建向导。用户只需要描述想要的工作流；本 Skill 负责读取真实 Skill、提出方案、等待确认、生成可验证的 Comet-native Skill Bundle，并通过内部 CLI 完成 eval、review、publish readiness 和安装预览。

普通用户第一层只看到三种起点：

- `基于 Comet 现有 Skill 的五阶段定制`：覆盖 `open / design / build / verify / archive` 五阶段的 Skill 编排，但不修改 `/comet` 命令本身。
- `创建全新 workflow Skill`：从目标和候选 Skills 生成新的 `workflow-kernel`。
- `整理已有 Skill`：读取已有 Skill，补齐 Workflow Node、Skill Binding、Output Schema、Guardrail、Handoff、eval 和 readiness。

后端 Bundle、Factory、composition 仍是内部审计词；不要把它们作为普通用户的第一屏概念。

## 核心模型

所有路径都必须编译到同一种 Workflow Contract：

- `Workflow Node`：流程中的可恢复节点，例如 `open`、`design`、`plan`、`execute`、`subagent-execute`、`review`、`verify`、`archive`。
- `Node Responsibility`：该 Node 在 Agent workflow 中承担的职责，用来解释它为什么存在、需要产出什么、能否替换。
- `Skill Binding`：某个 Node 的实现 Skill 或辅助 Skill。
- `Required Skill Call`：要求 Node 内必须调用某个 Skill，不替换 Node implementation。例如 `execute` 和 `subagent-execute` 必须调用 `elementui`，`review` 必须调用 `whitebox-code-standard`。
- `Output Schema`：Node 必须产出的文件、状态或 evidence。脚本、eval、readiness 只依赖 Output Schema，不依赖 Skill 名称。
- `Guardrail`：阻断或放行 Node 推进的检查。
- `Handoff`：子代理或跨 Node 交接时必须带回的 evidence。
- `workflow-protocol.json`：生成包的唯一运行事实源，kind 为 `comet-five-phase-overlay` 或 `workflow-kernel`。

## 受保护边界

`comet-five-phase-overlay` 保留 Comet 主流程和 `.comet.yaml` 状态语义。普通模式下：

- `control` Node 不允许 override：`open`、`execute`、`verify`、`archive`。
- `producer` Node 可以 override：`design`、`plan`，但必须满足对应 Output Schema。
- `handoff` 和 `guardrail` Node 可以 require / augment。
- 用户坚持替换 control Node 时，改走高级 `workflow-kernel`，并要求重新声明 state、Output Schema 和 Guardrail。
- 所有 Node 都必须用 responsibility 说明职责，不使用内部坐标作为用户理解流程的方式。

## 工作步骤

1. 恢复现有状态：先运行内部 `comet bundle factory-guide --project . --json`，展示恢复摘要和下一步。
2. 读取项目偏好：读取 `.comet/skill-preferences.yaml`，用 `find-skill` 解析真实本地 Skill，不按名字猜能力。
3. 生成方案：把用户目标表达为 Workflow Nodes、Skill Bindings、Output Schemas、Guardrails、Handoffs 和 Evidence。
4. 展示确认页：说明每个 Node 的职责、绑定 Skill、Required Skill Call、Output Schema、可执行披露和 readiness 影响。
5. 等待用户确认：未确认前不得写 Bundle draft；存在 missing / ambiguous Skill 时必须暂停。
6. 初始化后端状态：确认后调用 `comet bundle factory-init <name> --file <plan.json> --confirmed-proposal --json`。
7. 生成 Comet-native Skill Bundle：输出 entry Skill、Node Skills、`reference/workflow-protocol.json`、scripts、rules、hooks、`comet/eval.yaml`。
8. 验证：展示 quick/full eval 工作量，运行或记录 benchmark evidence；失败或 skip 时不得进入 ready。
9. Review / readiness：读取 `comet publish review <name> --platform <reference-platform> --json`，展示 `Readiness:`、`Blockers:`、`Warnings:`、`Evidence:`。
10. Publish / install preview：人工批准后才能 publish；安装前必须先运行 preview，并展示 `No files were written`。

## 方案示例

组件库和白盒审查场景应生成类似 plan：

```json
{
  "goal": "基于 Comet 现有 Skill 的五阶段定制，要求组件库和白盒审查。",
  "skillMakerIntent": "customize-comet",
  "workflow": {
    "kind": "comet-five-phase-overlay",
    "name": "team-comet",
    "goal": "要求组件库和白盒审查。",
    "nodes": {
      "execute": {
        "requiredSkillCalls": [
          {
            "skill": "elementui",
            "reason": "Use project component library during direct implementation."
          }
        ]
      },
      "subagent-execute": {
        "requiredSkillCalls": [
          {
            "skill": "elementui",
            "scope": "handoff"
          }
        ]
      },
      "review": {
        "requiredSkillCalls": [
          {
            "skill": "whitebox-code-standard",
            "scope": "review"
          }
        ]
      }
    }
  }
}
```

## 硬性规则

- 必须先展示方案确认页，再生成。
- Required Skill Call 不替换 Node implementation。
- producer override 必须声明 `satisfies` 的 Output Schema。
- control Node 普通模式不得 override。
- eval、review、publish readiness 必须读取同一份 `workflow-protocol.json`。
- 子代理 Handoff 必须要求子代理加载 Required Skill Call 并回传 evidence。
- 脚本只读取 protocol 和 state，不把 Skill 名称当成校验依据。
- 安装前必须询问用户，不得自动安装。

## 参考资料

- `comet-any/reference/bundle-authoring.md`
- `comet-any/reference/authoring-subagents.md`
- `comet-any/reference/eval-provider.md`
