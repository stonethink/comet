# Comet 优先改进项设计

**日期：** 2026-06-22
**状态：** 草稿
**范围：** 将当前 Comet 0.4.0-beta 后续改进收敛为可执行的优先级 spec

## 1. 背景

Comet 0.4.0-beta 已经完成了几件关键架构跃迁：

- Classic runtime 从分散 shell 脚本迁移为薄 `.mjs` launcher + 共享 TypeScript runtime。
- Skill Engine Foundation 已具备 Skill package、Run state、Trajectory、Artifacts、Guardrails 和 Runtime Eval。
- `/comet-any` 已从 Bundle CLI 使用说明重定位为 Skill Factory，并开始使用确定性 CLI 后端。
- `eval/` 已拆成 local/langsmith suite，并开始支持 skill-agnostic profile、manifest 和可配置报告输出。

这些能力已经能证明方向成立，但还没有形成一个用户可持续依赖的闭环。当前风险不是“缺一个大功能”，而是几个半成型系统之间还没有完全咬合：

- eval 能跑，但还需要更强的证据质量、可复现性和 `/comet-any` 产物门禁。
- `/comet-any` 能生成，但生成质量、候选恢复、dogfood 和发布前审查还要更确定。
- Comet Classic 已经 TypeScript runtime-native，但还不是完全 Engine-native。
- 新 workflow 机制已有 Run state 和 resolver 基础，但 Classic Skill 仍主要依赖平台 Skill 文案驱动。

本 spec 的目标是把这些后续工作排序，避免继续横向铺开；后续实现应优先补齐质量闭环，再推进 Engine-native 迁移。

## 2. 目标

- 定义当前项目最值得优先改进的 P0/P1/P2 工作集。
- 明确每个工作集的用户价值、系统边界、输入输出和验收标准。
- 复用已有 spec，而不是重写已有设计。
- 给后续 implementation plan 提供可直接拆任务的结构。
- 确保 eval、`/comet-any`、新 workflow 机制和 Comet Skill 本身朝同一个 Engine-native 方向收敛。

## 3. 非目标

- 不在本 spec 中实现代码。
- 不替代现有详细设计：
  - `2026-06-22-skill-agnostic-eval-design.md`
  - `2026-06-21-comet-any-skill-factory-design.md`
  - `2026-06-14-comet-classic-migration-design.md`
  - `2026-06-01-comet-orchestration-engine-design.md`
- 不一次性切换用户可见 `/comet` 行为。
- 不修改 Superpowers 或 OpenSpec 原始 Skill。
- 不把高成本 eval 或跨平台分发变成默认自动动作。

## 4. 优先级总览

| 优先级 | 方向 | 目标状态 |
|--------|------|----------|
| P0 | Eval 质量闭环 | 任何 Comet 或生成 Skill 的结论都能追溯到可复现实验、明确 profile、Skill hash、artifact evidence 和成本数据。 |
| P0 | `/comet-any` dogfood 与生成质量 | `/comet-any` 能稳定使用本地真实 Skill 生成可审查、可 eval、可分发的 Comet-native Skill。 |
| P1 | Classic Engine-native 迁移 | `/comet` 系列入口逐步由 Engine Run/Resolver 驱动，launcher 和 Skill 文案只负责入口和人机协议。 |
| P1 | 新 workflow 机制收敛 | Run state、checkpoint、handoff、review、subagent progress 和 archive recovery 使用统一事实源。 |
| P2 | 文档与发布体验 | README/architecture/docs 只暴露稳定用户概念，深层机制链接到 spec/plan，减少用户理解成本。 |

## 5. P0：Eval 质量闭环

### 5.1 问题

当前 eval 已经能比较 Comet workflow、0.3.9 baseline 和 generic Skill，但仍容易出现两类误判：

- runner/harness 问题被误读为 workflow 能力问题，例如 Skill 未触发、任务目录假设错误、completion heuristic 过宽。
- 报告只展示聚合结果，缺少足够的 source metadata，使后续无法判断结果对应哪个 Skill 版本、profile 和交互配置。

此外，`/comet-any` 产物要进入实际使用，就必须有一条低成本但可信的 eval path。否则 Skill Factory 会产生“看起来能用，但没人敢发布”的半成品。

### 5.2 设计

Eval 后续改进以 `eval/scaffold/python/` 为共享边界，不新增第二套 runner。

必须补齐四类能力：

1. **证据完整性**
   - 每个 report 记录 `profile`、`skill_sources`、Skill hash、task、interaction config、run id、report output config。
   - compare report 必须引用 source report 文件和关键 artifact 位置。
   - 任何 pass/fail 结论都能回到原始 stdout/stderr、events、reports 和 artifacts。

2. **误判隔离**
   - Skill invocation、expected artifacts、workflow phases、validator checks 分开计分和展示。
   - harness-trigger failure 使用独立 attribution，不直接算作 workflow regression。
   - 对比报告中明确区分 `workflow`、`task`、`model`、`harness` 四类归因。

3. **Skill-agnostic profile 完整落地**
   - Comet 评分只属于 `comet-workflow` profile。
   - 任意本地 Skill 默认走 `generic` profile。
   - `/comet-any` 产物走 `authoring-skill` profile，第一版可以复用 generic，但必须增加生成物结构和 review evidence 检查。

4. **报告输出可配置**
   - Markdown 是默认输出。
   - HTML、JSON summary、对比报告输出通过 `report_outputs` 配置启用。
   - CI 或回归门禁只依赖机器可读数据，不依赖 HTML。

### 5.3 验收标准

- `uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --skill-path=<path> --profile=generic -v` 可评估任意本地 Skill。
- `/comet-any` 生成物可通过 eval manifest 直接进入 quick eval。
- report JSON 中包含 profile、Skill source/hash、interaction config 和 artifact references。
- compare report 能展示质量、成本、pass@k/pass^k、failure attribution 和 source evidence。
- 至少一条测试证明 harness-trigger failure 不会被误标为 workflow regression。

## 6. P0：`/comet-any` Dogfood 与生成质量

### 6.1 问题

`/comet-any` 的产品方向已经清晰：用户只调用 Skill，CLI 作为内部确定性后端。但当前仍有几个薄弱点：

- `.comet/skills.txt` 偏好解析、歧义恢复和缺失处理需要更稳定的 CLI-backed recovery。
- 生成的 `SKILL.md` 需要体现真实候选 Skill 的行为，而不是只罗列 hash。
- Engine package、guardrails、runtime evals 需要与生成 workflow 的实际调用链一致。
- 发布前 review summary 需要足够说明风险、能力缺口、eval 证据和偏离偏好顺序的原因。

### 6.2 设计

`/comet-any` 后续工作以 `docs/superpowers/specs/2026-06-21-comet-any-skill-factory-design.md` 为主设计，本 spec 只定义优先级和收敛边界。

必须优先完成四个闭环：

1. **Dogfood E2E**
   - 使用真实 `.comet/skills.txt` 输入。
   - 覆盖 ambiguous、missing、resolved 三类候选状态。
   - 从 factory-init 到 draft generation、compile、eval-plan、review-summary 跑通。

2. **候选恢复**
   - 通过 `factory-resolve` 更新 Factory metadata。
   - Agent 不手写 state JSON。
   - resolved/ignored candidate 必须记录原因、来源和 hash。

3. **生成质量**
   - `resolved-skills.json` 保存真实 Skill 摘要、直接引用、hash 和偏好顺序。
   - 生成 `SKILL.md` 包含 composed workflow、停止点、风险和内部 Skill 使用方式。
   - 偏离 `.comet/skills.txt` 顺序时，review summary 必须说明原因。

4. **发布门禁**
   - ready publish 必须绑定当前 draft hash、eval evidence 和 review approval。
   - skip eval 可以保留 draft，但不能发布 ready。
   - capability gap 和 executable disclosure 继续阻塞分发。

### 6.3 验收标准

- CLI E2E 测试能从 `.comet/skills.txt` 到 review summary 完整跑通。
- `/comet-any` Skill 文案中不要求用户手动运行 Bundle CLI 主流程。
- 生成物可以通过 `comet skill validate` 和 Bundle compile。
- review summary 展示 resolved Skill evidence、eval 状态、风险、能力缺口和发布条件。
- 中英文 `/comet-any` 行为一致。

## 7. P1：Classic Engine-native 迁移

### 7.1 问题

当前 Classic runtime 已经完成重要迁移：业务逻辑从 launcher 收敛到 TypeScript runtime，shell 依赖已移除。但从产品语义看，它仍不是完全 Engine-native：

- 用户入口仍以多个平台 Skill 文案和命令阶段为主。
- Engine Run state 已存在，但 Classic phase 推进仍大量依赖 Classic runtime 的兼容投影。
- `comet-classic` 内部 Skill Package 尚未成为实际驱动用户 workflow 的唯一语义源。
- Runtime eval 与真实工作流执行之间仍有一层兼容模式。

完全 Engine-native 不意味着改掉用户命令，而是把“当前该做什么、下一步是什么、恢复点在哪里、哪些 eval 已满足”统一交给 Engine/Resolver。

### 7.2 设计

迁移应分层推进，而不是一次性切换。

1. **Resolver-first**
   - Classic Resolver 成为 `comet status`、guard、next-step hint、doctor 的共同事实源。
   - `.comet.yaml` 仍保留用户字段，但 `run-state.json` 持有 machine-owned run 字段。
   - 旧字段只作为 Classic projection，不再新增工作流事实。

2. **Engine package as contract**
   - 内部 `comet-classic` Skill 声明 full/hotfix/tweak 稳定步骤。
   - Step id 成为持久化协议，不随 Skill 文案措辞漂移。
   - Runtime evals 绑定 step completion，而不是只跑外部 deterministic benchmark。

3. **Launcher as adapter**
   - `.mjs` launcher 只负责定位 runtime 和分发命令。
   - 业务决策不得回流到 launcher。
   - 新共享工具只能放在 `domains/comet-classic/` 或 Engine 共享模块。

4. **User-visible compatibility**
   - `/comet`、`/comet-open`、`/comet-build` 等入口保留。
   - 用户不需要理解 `comet-classic` 内部 Skill。
   - Engine-native 迁移不能让现有 change 无法恢复或归档。

### 7.3 验收标准

- `comet status`、guard、doctor 和 next-step hint 对同一 malformed state 给出一致结论。
- Classic Resolver 覆盖 full/hotfix/tweak 正常路径、失败回退、handoff resume、archive recovery。
- 每个 Classic phase completion 都有对应 Runtime Eval 或结构化 evidence。
- 旧 `.comet.yaml` change 首次读取可迁移，重复读取幂等。
- 冻结 0.3.9 fixture 差分兼容测试继续通过。

## 8. P1：新 Workflow 机制收敛

### 8.1 问题

Comet 的新 workflow 机制现在有多个事实源：

- `.comet.yaml` 用户字段。
- `.comet/run-state.json` Engine 字段。
- docs/superpowers plans 和 reports。
- OpenSpec change artifacts。
- subagent progress/checkpoint 文件。
- review/eval evidence。

这些都合理存在，但如果没有统一的读写边界，长程任务会出现恢复后重复执行、阶段判断漂移、archive 判断不一致、review evidence 丢失等问题。

### 8.2 设计

Workflow 收敛的原则是：**不同文件可以存在，但每类事实只能有一个 owner。**

事实源划分：

| 事实 | Owner |
|------|-------|
| 用户可配置 workflow 字段 | `.comet.yaml` |
| machine-owned run 字段 | `.comet/run-state.json` |
| 阶段与下一步决策 | Classic Resolver / Engine Resolver |
| OpenSpec 需求与 delta | `openspec/changes/*` 或 archived specs |
| implementation plan 和 task checkoff | `docs/superpowers/plans/*` |
| verification report | `docs/superpowers/reports/*` |
| eval evidence | `eval/local/logs/*` 或 Bundle eval records |
| generated Skill authoring state | Bundle Factory metadata |

后续改进要集中解决：

- subagent task checkpoint 必须可恢复，不依赖最近聊天总结。
- review mode 的 off/standard/thorough 必须在 full workflow 中一致生效。
- handoff context 和 hash 必须可追踪，过期时失败关闭。
- archive recovery 必须按 OpenSpec archive 语义恢复，不创建第二套归档模型。
- auto-transition 只在 guard 证据满足时推进，不能绕过用户确认点。

### 8.3 验收标准

- 中断后恢复不会重复已经完成并持久化的 subagent task。
- review evidence 与 `review_mode` 选择一致。
- handoff markdown/json/hash 任一缺失或过期时给出明确诊断。
- archive pending 状态可安全重试或补账。
- `.comet.yaml` schema、state command、validate command 和测试 fixture 对字段一致。

## 9. P2：文档与发布体验

### 9.1 问题

0.4.0-beta 的能力密度已经很高，如果 README 继续承载所有细节，会让用户难以分辨哪些是稳定能力、哪些是内部机制、哪些是后续路线。

### 9.2 设计

- README 只保留稳定用户路径和关键入口。
- 架构细节进入 `docs/architecture/ARCHITECTURE.md`。
- 行为细节进入对应 feature docs。
- 设计过程进入 `docs/superpowers/specs/`。
- 可执行计划进入 `docs/superpowers/plans/`。
- Changelog 只写用户可见行为变化，不写开发中临时修正。

### 9.3 验收标准

- README 能在 5 分钟内让新用户理解安装、使用、更新、卸载和主要 workflow。
- `/comet-any`、eval、Engine-native Classic 的详细行为都有 docs 链接。
- 中英文 README 对用户可见能力保持结构一致。
- Changelog 版本与 `package.json` 一致，条目按 Added/Changed/Fixed/Tests 分组。

## 10. 实施顺序

推荐顺序：

1. **Eval P0 收尾**
   - 完成 source metadata、failure attribution、manifest-driven `/comet-any` quick eval。
   - 让后续所有改进都能被同一套 eval 证明。

2. **`/comet-any` P0 Dogfood**
   - 完成 factory-resolve、rich generated Skill synthesis、review summary、standalone run support。
   - 产出至少一个真实 dogfood fixture。

3. **Classic P1 Engine-native 收敛**
   - 从 status/doctor/guard 共享 Resolver evidence 开始。
   - 再把 Runtime Eval 与真实 phase completion 对齐。

4. **Workflow P1 恢复与证据统一**
   - 聚焦 subagent checkpoint、review evidence、handoff/archive recovery。
   - 避免新增状态源。

5. **P2 文档发布**
   - 每个 P0/P1 行为稳定后再更新 README/architecture/changelog。

## 11. 测试策略

必须保留三层测试：

- **Unit/contract**
  - Engine resolver、run store、factory metadata、report output config、profile selection。

- **CLI/E2E**
  - `comet bundle factory-*`
  - `comet skill run/resume/eval`
  - `comet status/doctor/guard`
  - eval pytest runner。

- **Compatibility**
  - Frozen 0.3.9 Classic fixtures。
  - Existing Comet workflow eval corpus。
  - Generated `/comet-any` dogfood fixture。

每个行为改动至少有一个 focused test；跨边界改动必须跑 full `npx vitest run` 或对应 eval scaffold suite。

## 12. 风险与约束

- Engine-native 迁移必须兼容现有 change，不允许要求用户手动迁移。
- `/comet-any` 不得执行候选 Skill 的脚本，只能读取和总结。
- Eval 结论必须保留成本数据，避免质量提升掩盖不可接受的 token 消耗。
- LangSmith 只能作为增强 tracing，不应成为 local eval 的硬依赖。
- 中文 Skill 改动先行，用户确认后再同步英文。
- Classic runtime 共享逻辑必须来自 `domains/comet-classic/`，修改后运行 `pnpm build:classic-runtime`。

## 13. 成功状态

完成本 spec 对应优先改进后，Comet 应达到以下状态：

- 修改 Comet 或生成 Skill 后，有可信 eval 说明质量、成本和风险。
- `/comet-any` 可以实际 dogfood：读取本地真实 Skill，生成 Comet-native Skill，并通过 eval/review 后发布。
- `/comet` Classic workflow 对用户保持熟悉，但内部由 Engine Run/Resolver/evidence 驱动。
- 长程 workflow 中断、恢复、handoff、review 和 archive 都能通过持久化事实恢复，而不是依赖聊天记忆。
- 文档对用户友好，内部复杂度留在 spec/plan 中，不压到 README 主路径。

## 14. 后续计划入口

本 spec 写清方向后，下一步应拆成 implementation plan。建议优先创建：

- `docs/superpowers/plans/2026-06-22-eval-quality-closure.md`
- `docs/superpowers/plans/2026-06-22-comet-any-dogfood-quality.md`
- `docs/superpowers/plans/2026-06-22-classic-engine-native-convergence.md`
