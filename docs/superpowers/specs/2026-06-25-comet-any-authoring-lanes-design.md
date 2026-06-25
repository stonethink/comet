# Comet Any Authoring Lanes Design

日期：2026-06-25
状态：已批准，进入 implementation plan
范围：重构 `/comet-any` Skill 生成引擎，让它通过独立作者通道产出接近 Comet 原始使用体验的组合 Skill。

## 背景

`/comet-any` 已经有两条产品路径：

1. 定制 `/comet`：保留 Comet 的 open / design / build / verify / archive 主流程，在明确插槽中增加、替换或关闭 Skill。
2. 创建或升级任意 Skill：把用户选择的 Skill 编译成具备 Comet 使用体验的多阶段 workflow Skill。

当前问题不是缺少更多模板，而是生成过程没有清晰的作者分工。脚本、reference、核心 Skill 文案、审查、用户停顿点都混在一个生成器里，导致输出容易退化成拼接 prompt，难以证明生成物真的具备 Comet 的自动推进、脚本检查、断点恢复和阻塞式审查。

## 目标

- 将 `/comet-any` 从单体字符串渲染器重构为 authoring lanes compiler。
- 每个 lane 产出结构化 proposal，由 assembler 统一写最终文件。
- 生成物必须包含入口 Skill、阶段 Skill、reference、脚本、停顿点说明、审查报告和 eval 元数据。
- 定制 `/comet` 时，保留 Comet 的阶段语义、`.comet.yaml` 事实状态、脚本检查、自动推进、跨设备恢复和用户停顿点。
- 组合任意 Skill 时，生成 Comet-like workflow kernel，而不是复制源 Skill 正文。
- 生成的中文用户可见流程必须保持中文，不出现英文流程句子。
- 调用其他 Skill 时只写 Skill 名称，例如 `systematic-debugging`，不写不稳定的来源前缀。

## 非目标

- 不修改 `domains/comet-classic/` 的 TS runtime。
- 不修改 `assets/skills/comet/scripts/comet-runtime.mjs` 或 Comet Classic launcher 逻辑。
- 不直接修改 Superpowers、OpenSpec 或用户原始 Skill。
- 不兼容未上线的旧 `/comet-any` 生成结构。
- 不让 authoring lane 直接写最终发布文件。
- 不把 Bundle、Factory、composition、authoring lanes 等内部词暴露给普通用户。

## 核心设计

`WorkflowProtocol` 是唯一事实来源。所有 lane 必须带同一个 protocol hash 产出 `ArtifactProposal`。如果 proposal 的 hash 与当前 protocol 不一致，assembler 必须拒绝。

中心 Module 是 `FactoryAuthoringCompiler`。它的外部 Interface 仍然保持简单：

```ts
generateFactorySkillPackage(plan: FactorySkillPackagePlan): Promise<GeneratedFactorySkillPackage>
```

内部 seam 是 `FactoryArtifactAuthor`。确定性作者、未来的 LLM subagent 作者、测试 fake 作者都通过同一个 Interface 接入。

## Authoring Lanes

### Skill Core Lane

负责入口 `SKILL.md` 和所有阶段 `SKILL.md`。

必须产出：

- Comet overlay 的 Comet 风格入口。
- workflow kernel 的 Comet-like 入口。
- 每个阶段的目标、入口检查、执行步骤、证据记录、语义检查、退出脚本、未完成处理、恢复和下一阶段。

不得产出：

- `Generated Source Evidence`
- `Generated Variant Routing`
- 源 Skill 正文复制
- 不存在脚本路径
- 英文流程句子混入中文 Skill

### Script Contract Lane

负责生成脚本和脚本契约。

必须产出：

- `scripts/comet-plan.mjs`
- `scripts/comet-check.mjs`
- `scripts/comet-hook-guard.mjs`
- `scripts/workflow-state.mjs`
- `scripts/workflow-guard.mjs`
- `scripts/workflow-handoff.mjs`

脚本必须从 `reference/workflow-protocol.json` 读取路由，退出检查通过时直接输出下一步：

```text
ALL CHECKS PASSED
NEXT: auto
SKILL: <next-stage-skill>
```

### Reference Lane

负责审计材料，不参与主流程文案。

必须产出：

- `reference/workflow-protocol.json`
- `reference/resolved-skills.json`
- `reference/composition-report.md`

源 Skill 正文和摘要只能出现在 reference 或审计材料中，不能覆盖生成 workflow 的路线。

### Pause Point Lane

负责用户停顿点和恢复说明。

必须产出：

- `reference/decision-points.md`
- `reference/recovery.md`

每个停顿点必须说明选项、暂停后的恢复路径，以及未完成目标时继续留在当前阶段的规则。

### Eval Lane

负责生成 route conformance eval 元数据。

必须产出：

- `comet/eval.yaml`

当 `engineMode` 为 `none` 时可以不写 Engine 文件，但仍要让 review 说明原因。

### Skill Review Lane

负责阻塞式审查。

必须产出：

- `reference/skill-review.md`
- `reference/authoring-lanes.json`

必须阻塞：

- proposal hash 不匹配。
- 缺少任何必需 lane。
- 入口或阶段 Skill 中出现源正文复制、旧 generated audit section、英文流程句子。
- 调用 Skill 时出现 provider 前缀。
- Skill 文案引用不存在的脚本。
- Comet overlay 不包含 open / design / build / verify / archive。
- workflow kernel 缺少脚本守卫、暂停点、恢复说明或下一阶段输出规则。

## 数据流

1. `compileWorkflowSpec(plan)` 生成 `WorkflowProtocol`。
2. `workflowProtocolHash(protocol)` 生成 protocol hash。
3. `AuthoringOrchestrator` 调用各 lane 的 `draft(input)`。
4. 每个 lane 返回 `ArtifactProposal`。
5. reviewer 审查 proposals。
6. skill-review lane 生成审查报告和 lane 清单。
7. assembler 校验 review passed 后写最终 package。
8. `comet-check.mjs` 和 `comet skill validate` 验证生成物。

## 验收标准

- 定制 `/comet` + `grill-me` 时，生成物保留 Comet 五阶段，并把 `grill-me` 作为 design 阶段内的压力测试插槽。
- 任意非 Comet Skill 组合时，生成物具备阶段路线、脚本守卫、证据检查、停顿点、恢复和 route-conformance eval。
- `reference/authoring-lanes.json` 能显示每个 lane 的 proposal 和 artifact。
- `reference/skill-review.md` 能显示审查是否通过以及阻塞原因。
- reviewer 能阻塞坏 proposal，例如源 Skill 正文被复制到用户可见 Skill，或引用不存在的脚本。
- 生成脚本的退出检查会输出下一阶段，阶段未完成时不会强制推进。
- 完整验证至少包含 factory 测试、bundle 命令测试、build、lint、format check 和全量测试。
