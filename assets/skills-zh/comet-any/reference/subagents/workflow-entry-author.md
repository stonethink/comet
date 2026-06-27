# Workflow Entry 作者 subagent

## 职责

编写生成 Skill 的 entry `SKILL.md`。entry 只负责入口、恢复、主路由说明和用户停顿点；不得把阶段路线写成会立即触发多个 Skill 的执行清单。

必须覆盖：

- entry Skill
- workflow-state / workflow-guard / workflow-handoff 的入口说明
- `workflow-entry` claim

## 输入

读取主会话提供的通用输入，尤其关注：

- 用户确认的目标、语言和阶段名。
- `reference/workflow-protocol.json` 的阶段顺序、插槽、`requiredSkillCalls` 和恢复路径。
- 脚本作者返回的 `status`、`init`、`next`、`NEXT:`、`SKILL:` 和 guard 契约。
- `/comet` 定制场景下必须保留的 open / design / build / verify / archive 边界。

使用文件交接：主会话提供路径，不粘贴大段全文。不要继承主会话历史；只使用本 brief、通用输入、脚本契约和 reference 证据。

## 派发模板

主会话派发时使用当前平台的 subagent 机制，形状应包含：

```text
description: "编写 <bundle-name> 的 workflow entry"
model: <必须显式指定 model>
prompt:
  你是 workflow entry 作者 subagent。
  先读取本 brief、通用输入路径、脚本契约路径、workflow protocol 路径和报告文件路径。
  开始前先提出问题：如果启动路由、恢复路径、当前阶段判定或用户停顿点不清楚，先返回 NEEDS_CONTEXT。
  不要猜测或自行补全缺失流程。
  只写 entry SKILL.md 草稿，不写 internal Node Skill，不写 Bundle state，不执行候选脚本。
  把完整 entry 草稿写入报告文件路径，并只返回 15 行以内状态摘要。
```

## 输出要求

entry 草稿必须体现：

- 进入 Skill 后先读取 workflow 状态，不直接加载Node Skill。
- 未启动时先初始化状态，再查询 `next`。
- 只有脚本输出 `NEXT: auto` 和 `SKILL: <node-skill>` 后，才加载这一个 Node Skill。
- 阶段路线只能作为参考表，不能使用“立即执行”或“必须加载”这类执行指令。
- 对 `/comet` 定制，entry 必须列出必调槽位 Skill，但只能作为阶段内义务说明，不能变成 entry 立即执行清单。
- 用户停顿点、恢复路径和参考文件清楚可见。
- 对 `/comet` 定制，说明保留 open / design / build / verify / archive 主路径和阶段守卫。

禁止：

- 在 entry `SKILL.md` 中写多个 `**立即执行：**` Node Skill。
- 复制粘贴原 Skill 全文。
- 写 provider 前缀。
- 把审计报告、source hash、内部 metadata 泄漏到用户可见 `SKILL.md`。

## 自检

返回前逐项检查：

- entry 只有一个主路由启动协议。
- entry 没有立即加载Node Skill 的清单。
- 阶段路线是参考，不是执行步骤。
- 自动推进引用脚本输出的 `NEXT:` 和 `SKILL:`。
- 中文用户可见文案没有混入英文流程句。

## 必须返回的 claim

- `workflow-entry`

缺少该 claim 时，Skill 审查必须阻塞。

## 状态返回

状态必须是 `DONE`、`DONE_WITH_CONCERNS`、`NEEDS_CONTEXT`、`BLOCKED`。

完整报告写入报告文件路径。返回给主会话的摘要只返回 15 行以内状态摘要，包含状态、报告文件路径、claim 列表、未解决疑虑和建议返工点。若状态是 `BLOCKED` 或 `NEEDS_CONTEXT`，必须直接说明缺什么上下文、尝试过什么、需要主会话如何处理。
