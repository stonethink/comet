# Authored 区质量标尺（样例）

这是你编写的 **Authored 区**（entry 的 `## Decision Core`、node 的 `## Guidance`）的具体质量标尺。生成器把你的 Authored 区组装到确定性 **Auto 区**（frontmatter、路由表、Entry/Exit Check、证据格式、Recovery）之上。**你只写 Authored 区**。请按本样例校准，而不是写一行套话。

## "Auto" 与 "Authored" 的含义

- **Auto 区（模板，不要重写）**：不变的控制面。node 的 Auto 区包括 `## Node Goal`、`## Entry Check`、`## Skill Implementation`、`## Required Skill Calls`、`## Output Schemas`、`## Evidence Record`、`## Guardrails`、`## Exit Check`、`## Recovery`。entry 的 Auto 区包括 `## Workflow Nodes`、`## Skill Bindings`、`## Guardrails And Evidence`、`## Runtime And Recovery`。
- **Authored 区（你写）**：Auto 区无法得知的领域决策。这是让 Skill "好用"而非"只是能跑"的关键。

## 样例：`substance` 节点的 Guidance 区（workflow-kernel）

下面是 research-writer workflow 中"Research"生产者节点的 `## Guidance` 正文。注意它是**决策内容**：前提、有序的领域步骤、超出机械 Exit Check 的完成判断、Red flags。它按名引用绑定的 Skill，但不复制其正文。

```markdown
## Prerequisites

- entry 的 Decision Core 已确认研究主题与范围。
- `research-skill` 在项目 Skill 池中可解析；若缺失，先停下询问用户，不要临时替代。

## Steps

1. 加载 `research-skill` 并按其发现方法处理已确认主题。当项目 Skill 定义了特定来源顺序时，不要用通用网络搜索替代。
2. 按优先级收集来源；为每个来源记录来源、日期和你要复用的论点。不通过项目可信度门槛的来源应直接剔除，而不是标注为"偏弱"。
3. 把发现提炼到 `notes/*.md` 笔记文件——每条独立论点一份，含逐字引用与来源指针。综合写在 writer 节点，不在这里。
4. 记录 `research.notes.v1` 的 `summary` evidence：一段提炼 + 产出的笔记数量。

## Completion reasoning

本节点完成当且仅当两条同时成立：(a) 已记录 `summary` evidence；(b) 至少一个 artifact 匹配 `notes/*.md`。不要仅仅因为步骤清单走完就退出——如果相对主题范围笔记仍偏稀疏，应继续研究而非宣布完成。Exit Check 脚本会机械地强制 artifact + evidence 要求；你的职责是判断研究是否真正充分。

## Red flags

- 记录了 `summary` 却没有产出任何 `notes/*.md` 就退出（guardrail 会阻塞——不要试图绕过）。
- 把来源原文复制进笔记却不加引用标记或来源指针。
- 某来源仍"待核实"就推进到 Write 节点——核实属于本节点。
- 对需要多视角的主题，仅凭单一来源就认为充分。
```

用 `###` 子标题，使其嵌套在 `## Guidance` 之下。上述四段（Prerequisites / Steps / Completion reasoning / Red flags）是 `substance` 节点的预期形态。

## substance 与 delegates

- **substance** 节点（workflow-kernel）：上面的样例就是标尺。必须有富 Guidance；缺失时该节点渲染为 `AUTHORING PENDING`，Bundle 不得 ready。
- **delegates** 节点（comet-five-phase-overlay，委托给已安装的富 Skill）：富执行内容由被委托 Skill 承载，**不要复制**。但如果该节点声明了 **Required Skill Calls**（如 execute 节点要求 `elementui`），请写一段聚焦的整合说明——在被委托流程的什么时机必须加载该 Skill、它补充什么 evidence——而不是泛泛一句"加载 X"。例如要求 `elementui` 的 delegates execute 节点：

```markdown
本节点用 `comet-build` 执行。在其流程之外，每当改动涉及组件库时加载 `elementui`，并在记录 `required-skill:execute.elementui` 检查前确认改动使用了项目认可的组件。不要重复实现 `comet-build` 已做的事。
```

## 反模式（不要写）

- 一行式 Guidance，如"运行本节点并记录 evidence。"——Auto 区已隐含此意，毫无增量。
- 整段复制被绑定 Skill 的正文。
- 重述路由表或 Output Schema 列表（Auto 区已有）。
- substance 节点没有 `### Red flags`——Red flags 是大部分真实价值所在。
