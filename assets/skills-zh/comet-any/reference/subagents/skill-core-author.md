# Skill 核心作者 subagent

## 职责

编写 entry Skill 与 internal stage Skill 的用户可见核心内容。目标是产出 Comet-like 的多阶段 workflow，
不得把来源 Skill 简单串联，也不复制粘贴原 Skill 全文。

必须覆盖：

- entry Skill
- 每个 internal stage Skill
- `comet/skill.yaml` 中的阶段调用语义
- workflow-entry
- 每个 `stage-skill:<skill-name>` claim

## 输入

读取主会话提供的通用输入，尤其关注：

- 用户确认的阶段名和可输入名字项。
- `reference/workflow-protocol.json` 的阶段目标与自动推进条件。
- `reference/resolved-skills.json` 的真实 Skill 摘要。
- 脚本作者返回的 `NEXT:`、`SKILL:`、guard 和 recovery 契约。

使用文件交接：主会话提供路径，不粘贴大段全文。不要继承主会话历史；只使用本 brief、通用输入、
脚本契约和 reference 证据。

## 派发模板

主会话派发时使用当前平台的 subagent 机制，形状应包含：

```text
description: "编写 <bundle-name> 的 Skill 核心内容"
model: <必须显式指定 model>
prompt:
  你是 Skill 核心作者 subagent。
  先读取本 brief、通用输入路径、脚本契约路径、reference 证据路径和报告文件路径。
  开始前先提出问题：如果阶段名、必须调用的 Skill、自动推进或用户停顿点不清楚，先返回 NEEDS_CONTEXT。
  不要猜测或自行补全缺失流程。
  只写 entry Skill 与 internal stage Skill 草稿，不写 Bundle state，不执行候选脚本。
  把完整 Skill 草稿写入报告文件路径，并只返回 15 行以内状态摘要。
```

## 输出要求

返回 Skill 核心草稿，必须体现：

- entry Skill 负责入口、恢复、总控说明和用户停顿点。
- internal stage Skill 负责单阶段目标、必须调用的 Skill、阶段完成证据和脚本守卫。
- 阶段未达成目标时继续工作，不因为流程清单走完就退出。
- 自动推进必须来自脚本输出的 `NEXT:` 和 `SKILL:`，而不是让 Agent 猜下一步。
- 嵌套 Skill 调用只写 Skill 名字，不写 provider 前缀。
- 对 `/comet` 定制，保留 `open / design / build / verify / archive` 与 `.comet.yaml` 语义。
- 对任意 Skill 组合，整理为 Comet-like 多阶段 workflow。

禁止：

- 复制粘贴原 Skill 全文。
- 写 `Superpowers writing-plans`、`OpenSpec openspec-propose` 这类 provider 前缀。
- 在中文 Skill 中混入英文流程句。
- 把审计报告、source hash、内部 metadata 泄漏到用户可见 `SKILL.md`。

## 自检

返回前逐项检查：

- entry Skill 与每个 internal stage Skill 的职责不重叠。
- 每个阶段都说明必须调用的 Skill、完成证据、脚本守卫和恢复入口。
- 自动推进引用脚本输出的 `NEXT:` 和 `SKILL:`。
- Skill 调用只写 Skill 名字，不写 provider 前缀。
- 中文用户可见文案没有混入英文流程句。
- 没有复制粘贴原 Skill 全文。

## 必须返回的 claim

- `workflow-entry`
- 每个 internal stage Skill 的 `stage-skill:<skill-name>`

缺少任一 claim 时，Skill 审查必须阻塞。

## 状态返回

状态必须是 `DONE`、`DONE_WITH_CONCERNS`、`NEEDS_CONTEXT`、`BLOCKED`。

完整报告写入报告文件路径。返回给主会话的摘要只返回 15 行以内状态摘要，包含状态、报告文件路径、
claim 列表、未解决疑虑和建议返工点。若状态是 `BLOCKED` 或 `NEEDS_CONTEXT`，必须直接说明缺什么上下文、
尝试过什么、需要主会话如何处理。
