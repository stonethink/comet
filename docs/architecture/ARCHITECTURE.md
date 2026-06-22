# Comet 0.4.0 架构概览

> 版本状态：0.4.0-beta（相对 0.3.x 的架构跃迁）

## 概述

0.4.0 不是小版本迭代，而是 Comet 定位的重构。0.3.x 时 Comet 本质是「把 OpenSpec 和 Superpowers 串起来的脚本编排层」；0.4.0 它变成了一个**自带确定性 Skill 引擎的 Agent Skill 运行时平台**。

本文从用户视角说明 0.4.0 架构带来的新体验，不展开实现细节。设计与计划文档见 `docs/superpowers/specs/` 和 `docs/superpowers/plans/`。

```text
0.3.x                              0.4.0
┌──────────────────────┐           ┌──────────────────────────────┐
│  Bash 脚本编排层      │           │  Node 单进程运行时            │
│  (.sh × 7)           │           │  (.mjs launcher × 7          │
│                      │           │   + comet-runtime.mjs)       │
│  依赖 Bash/Git Bash  │    ──►    │  只依赖 Node.js              │
│                      │           │                              │
│  文档 + 脚本          │           │  Skill 引擎（包/校验/快照/    │
│  agent 自由发挥       │           │   Run/Trajectory/恢复/Eval）  │
│                      │           │                              │
│  消费预置命令          │           │  Skill 创作 + Bundle 分发     │
└──────────────────────┘           └──────────────────────────────┘
```

## 一、运行时架构：从 Bash 脚本到 Node 单进程

### 变化

0.3.x 的 7 个 `.sh` bash 脚本（`comet-state.sh`、`comet-guard.sh` 等）全部替换为薄 `.mjs` Node 启动器，共用一个 TypeScript 编译出的 `comet-runtime.mjs`，单进程分发。

```text
0.3.x                                0.4.0
comet-state.sh  ─┐                   comet-state.mjs  ─┐
comet-guard.sh  ─┤                   comet-guard.mjs  ─┤
comet-handoff.sh─┤   各自含          comet-handoff.mjs─┤  薄封装
comet-archive.sh─┤   YAML 解析 +     comet-archive.mjs─┤  import
comet-yaml-*.sh ─┤   状态规则        comet-yaml-*.mjs ─┤  comet-runtime.mjs
comet-hook-*.sh ─┤                   comet-hook-*.mjs ─┤
comet-env.sh    ─┘                   comet-env.mjs    ─┘
                                       │
                                       ▼
                                 comet-runtime.mjs
                                 (统一 TS 运行时)
```

### 用户感知

- **Windows 原生可用**：不再需要 Bash、Git Bash 或 WSL。0.3.x 时 Windows 用户必须装 Git Bash/WSL，还要面对 BSD/GNU 版 `sed`/`sha256sum` 兼容问题、`COMET_BASH` 探测逻辑、WSL `bash.exe` 误判等坑
- **少一层运行时依赖**：只装 Node.js 即可
- **跨平台构建命令执行一致**：guard 用 `spawnSync(cmd, { shell: true })` + `process.platform` Maven 检测，不再探测可用 bash，同时保留 shell 元字符拒绝保护

## 二、Skill 引擎层：从「文档+脚本」到「可执行 Skill 包」

### 变化

0.3.x 的 Skill 是 Markdown 文档 + 配套脚本，agent 按文档自由发挥，没有确定性的执行/恢复/校验机制。0.4.0 新增完整 Skill Engine 基础层：

| 能力 | 作用 |
|------|------|
| Skill Package 加载 | 结构与语义校验、稳定内容哈希、不可变快照 |
| Run state | `.comet/run-state.json` 记录运行态（当前步骤、迭代、待处理动作） |
| Trajectory / Context / Artifacts / Checkpoints | 持久化执行轨迹、上下文、产物、检查点 |
| action Guardrails | 动作授权，限制 agent 可执行范围 |
| 确定性 Runtime Evals | 不依赖 LLM/网络的基准测试（七场景：迁移/重试路由/handoff 恢复/归档恢复/畸形状态拒绝/幂等/契约保持） |
| Runtime Adapter 契约 | 引擎与平台运行时的对接约定 |

### 用户感知

- **行为可验证、可恢复**：长上下文压缩后能从 snapshot/trajectory 精确恢复到中断点，而非靠 agent 猜测
- **诊断更安全**：`comet doctor` 能报告畸形状态，且不破坏性改写文件（0.3.x 可能半改）
- **内部确定性化**：`comet-classic` Skill Package 用确定性 Resolver 覆盖 full/hotfix/tweak，冻结 0.3.8 行为契约做差分测试，保证升级不漂移

## 三、新的用户能力：Skill 创作与 Bundle 分发

### Skill 创作 CLI

0.3.x 时用户只能消费 Comet 预置的 `/comet` 系列命令，无法自己造 Skill。0.4.0 新增手动 Skill 创作工具链：

```bash
comet skill install   # 安装 Skill 包
comet skill validate  # 校验结构
comet skill inspect   # 检查内容
comet skill run       # 驱动执行
comet skill resume    # 从检查点恢复
comet skill eval      # 运行 Eval 基准
```

配套 Project Skill pool（`.comet/skills/<name>`）：拒绝 symlink、发现优先级确定、无效覆盖 fail-closed（而非静默降级）。

### Bundle 生命周期

`comet bundle` 命令组 + `/comet-any` 提供平台无关的多 Skill Bundle 创作与分发：

```text
候选发现 → 草稿创建/优化 → 状态查询 → 平台编译 dry-run
       → Eval 规划与证据记录 → 审核批准/拒绝 → 发布 → 分发
```

- **跨项目/全局平台分发**，本地化编译、可选能力跳过、必需能力取消、hook 确认、非破坏性 hook 设置合并
- 支持文本与 JSON 输出，便于自动化集成

### 用户感知

- Comet 从「消费者工具」变成「Skill 生态平台」：能造自己的 Skill 并分发给团队
- Bundle 让 Skill 组合可以脱离 Comet 仓库独立交付，面向多平台（Claude Code / Codex / OpenCode / ZCode 等）

## 四、状态机架构：Classic 投影 + Run 状态分离

### 变化

0.3.x 的 `.comet.yaml` 是单一状态文件，混着用户字段和引擎字段。0.4.0 做了分离：

```text
0.3.x                          0.4.0
.comet.yaml                    .comet.yaml                  .comet/run-state.json
┌─────────────────┐            ┌─────────────────┐          ┌─────────────────────┐
│ 用户字段         │            │ 用户字段         │          │ Run 引擎字段         │
│ (workflow/phase │            │ (workflow/phase │          │ run_id / skill /     │
│  /build_mode...)│            │  /build_mode...)│          │ skill_hash /         │
│                 │            │ + run_id 链接    │ ────────►│ current_step /       │
│ 引擎字段         │            └─────────────────┘          │ iteration / pending │
│ (run_id/skill/  │                                         │ /*_ref / status...  │
│  skill_hash...) │                                         └─────────────────────┘
└─────────────────┘
```

- 旧 change（含 Run 字段嵌入 `.comet.yaml`）首次读取时自动迁移
- `comet-state set` 拒绝写 machine-owned Run 字段，防止误改

### 用户感知

- `.comet.yaml` 变干净，用户只关心自己能改的字段
- 引擎状态与用户状态分离，降低误改风险
- 升级路径平滑（自动迁移，无需手工转换）

## 五、平台支持扩展

0.4.0 新增 ZCode 平台支持（`comet init` 新增选项），将 skills 和 rules 安装到项目级 `.zcode/skills/` 或全局 `~/.zcode/skills/`。ZCode 基于 OpenCode，OpenSpec 通过 `opencode` tool id 安装后镜像到 `.zcode/`，Superpowers 通过 `claude-code` staging 模式安装，并抽出通用 staging 函数供 Lingma/ZCode 复用。

## 六、轻量路径可用性

hotfix/tweak 预设路径的范围判定从「文件数硬升级条件」改为「语义判定 + 用户决策」三层分工：

1. **质变信号**（agent 语义识别）：跨模块协调、新 capability、schema 变更、新 public API、深层架构问题——命中即暂停交用户决定
2. **文件数 tripwire**（用户拍板）：文件数超阈值时提示，不自动升级
3. **验证级别**（scale 脚本判定）：仅决定 `verify_mode`（验证轻重），不卡流程

tweak 重新定位为「串联 OpenSpec 的轻量预设路径」，delta spec 成为一等公民正常产物。升级通道新增 `preset-escalate` 事件，合法、可测试，修复了旧升级命令被状态机硬拦截的隐藏 bug。

详见 `comet-hotfix` / `comet-tweak` 的「升级判定」章节。

## 一句话定位

**0.3.x**：一个编排 OpenSpec + Superpowers 的脚本工具集。

**0.4.0**：一个**只依赖 Node、自带确定性 Skill 引擎、能创作和分发 Skill、状态可恢复可校验**的 Agent Skill 运行时平台，轻量路径也真正可用了。

## 相关文档

- [上下文压缩](CONTEXT-COMPRESSION.md) — Design → Build 阶段交接的 token 优化机制
- [自动衔接](AUTO-TRANSITION.md) — 阶段守卫推进后的下一 skill 路由协议
- 设计与计划文档：`docs/superpowers/specs/` 与 `docs/superpowers/plans/`
