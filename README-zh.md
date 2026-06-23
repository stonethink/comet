<p align="center">
  <a href="https://github.com/rpamis/comet/blob/master/img/title-log.png">
    <picture>
      <source srcset="https://github.com/rpamis/comet/blob/master/img/title-log.png">
      <img src="https://github.com/rpamis/comet/blob/master/img/title-log.png" alt="Comet logo">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://github.com/rpamis/comet/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/rpamis/comet/ci.yml?branch=master&style=flat-square&label=CI" /></a>
  <a href="https://deepwiki.com/rpamis/comet"><img alt="DeepWiki" src="https://img.shields.io/badge/DeepWiki-rpamis%2Fcomet-blue?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/comet"><img alt="npm version" src="https://img.shields.io/npm/v/@rpamis/comet?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/comet"><img alt="npm download count" src="https://img.shields.io/npm/dm/@rpamis/comet?style=flat-square&label=Downloads/mo" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/comet"><img alt="npm weekly download count" src="https://img.shields.io/npm/dw/@rpamis/comet?style=flat-square&label=Downloads/wk" /></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" /></a>
</p>

# @rpamis/comet

```
 ██████╗ ██████╗ ███╗   ███╗███████╗████████╗
██╔════╝██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝
██║     ██║   ██║██╔████╔██║█████╗     ██║
██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║
╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝
```

> English version: [README.md](README.md)
> [Bilibili video](https://www.bilibili.com/video/BV1y4Gi6CEo1/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d22726fe6b108647dbebf1c5d8817377)
> [抖音](https://www.douyin.com/search/comet?aid=cd8fcc82-498b-4d59-8860-617deb719412&modal_id=7646429015808936293&type=general)

**Comet 是一个面向可恢复 AI 编码工作流的纯 Node runtime 和 Skill 平台。**

它把 OpenSpec 制品、Superpowers 方法论和 Comet 状态维持在同一条工作链上，让你可以用一个工具链开启变更、
中断后恢复、诊断漂移，并把可复用 Skill 发布出去。

> [!IMPORTANT]
> **0.4.0-beta.1** — Classic 工作流命令迁移为纯 Node runtime，新增内部 Skill Engine 与 Bundle 生命周期基础，并加固归档恢复、change name 校验、hook 多 change 治理、配置命令链和 beta context JSON 校验。
>
> **0.3.9** — `review_mode: off|standard|thorough` 控制 Build/Verify 自动代码审查并支持项目级默认；init/update 改为可选依赖安装，补齐 CLI 国际化、阶段守护加固和 macOS 可执行权限。
>
> **0.3.8** — 新增 Kimi Code 支持、安全的多平台 `comet uninstall`、子代理调度扩展、按需加载共享参考、版本更新检查和 pre-commit 格式化。
>
> **0.3.7** — 新增 CodeGraph 语义索引、Beta 上下文压缩、主动式上下文压缩、Token 优化、`auto_transition`、阶段守护、可选 TDD 和更稳的归档/验证流程。
>
> 详见 [NEWS.md](NEWS.md)。

## 为什么需要 Comet

Comet 把对外工作流保持得很简单，把真正脆弱的部分收进一条共享运行时事实链：

- **纯 Node runtime** — 所有内置脚本都通过 Node.js 运行，在 macOS、Linux、Windows 上保持一致，不再依赖 Bash、Git Bash 或 WSL。
- **可恢复工作流** — `/comet` 和 Classic 状态投影会记住一个 change 停在什么阶段，长任务恢复时不需要让 Agent 重新猜上下文。
- **Skill 平台** — Comet 会安装工作流 Skill，也能编写可复用 Skill 包，并通过 `/comet-any` 把它们整理成可分发 Bundle。
- **诊断感知的守护** — `status`、`doctor` 与 guard/verify 共享同一条运行时证据路径，畸形状态和缺失证据会变成用户可见的 diagnostic，而不是静默漂移。

## 安装

前置要求：

- Node.js 20+
- npm/npx
- Git

```bash
npm install -g @rpamis/comet
```

## 快速开始

```bash
cd your-project
comet init
```

`comet init` 会：

1. 提示你选择 AI 平台（自动检测已有配置）
2. 选择安装范围：项目级（当前目录）或全局（用户主目录）
3. 选择 Comet 技能语言：English 或 中文
4. 选择要安装/升级的 npm 依赖 —— [OpenSpec](https://github.com/Fission-AI/OpenSpec) CLI、[Superpowers](https://github.com/obra/superpowers)（通过 `npx skills add`）、[CodeGraph](https://github.com/colbymchenry/codegraph) CLI。未检测到的依赖默认勾选；已存在的默认不勾，可自主选择是否升级。
5. 安装选中的依赖并部署对应技能
6. 将 Comet 技能（你选择的语言）部署到所选平台
7. 在项目级安装时创建 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 工作目录

> [!TIP]
> 推荐安装 Superpowers v6.0.0+ —— 相比旧版速度快约 2 倍，节省约 50% token。
> 后续升级 Comet 本身：执行 `comet update` 或 `npm install -g @rpamis/comet@latest`。

## 对OpenClaw和Hermes、或其他AI平台的支持

对于直接使用通用 `skills` CLI 的平台，可以用下面的方式安装 Comet skill 包：

```bash
npx skills add rpamis/comet
```

## 运行截图

<p align="center">
  <img src="https://github.com/rpamis/comet/blob/master/img/runner.png" alt="runner">
</p>
<p align="center">自动安装 OpenSpec、Superpowers，一键配置开发环境</p>
<p align="center">多阶段 Skill 入口，自动识别当前 Spec 阶段，核心流程自动触发，关键节点人工审核</p>

## CLI命令

<details>
<summary><code>comet init [path]</code> — 初始化 Comet 工作流</summary>

为选定的 AI 编码平台初始化 OpenSpec、Superpowers 和 Comet 技能。

| 选项                | 描述                         |
|-------------------|----------------------------|
| `--yes`           | 非交互模式，自动选择已检测平台（未检测到则选择全部） |
| `--scope <scope>` | 安装范围：`project` 或 `global`  |
| `--language <lang>` | 技能语言：`en` 或 `zh`（跳过交互式语言选择） |
| `--skip-existing` | 跳过已安装的组件                   |
| `--overwrite`     | 覆盖已安装的组件                   |
| `--json`          | 输出结构化 JSON                 |

当同一平台检测到多个已安装组件时，交互式 init 会先提供一次批量选择：全部覆盖、全部跳过，或逐项选择。

</details>

<details>
<summary><code>comet status [path]</code> — 显示活跃更改和下一步命令</summary>

显示活跃更改、任务进度、推荐的下一步 Comet 工作流命令，以及当前 step、runtime mode 和针对畸形状态或缺失证据的 diagnostic 恢复提示。

| 选项       | 描述                                            |
|----------|-----------------------------------------------|
| `--json` | 输出活跃更改，并包含 `nextCommand`、`currentStep` 和运行时数据 |

</details>

<details>
<summary><code>comet doctor [path]</code> — 诊断 Comet 安装健康状态</summary>

检查项目级/全局安装、工作目录、已安装技能、脚本，以及活跃 change 的诊断信息。`comet doctor` 会对畸形
`.comet.yaml` 报告 diagnostic 状态，对有效 change 报告 current step / runtime mode，并指出哪些运行时证据缺失导致无法安全恢复。

| 选项                | 描述                                           |
|-------------------|----------------------------------------------|
| `--json`          | 输出结构化诊断结果                                    |
| `--scope <scope>` | 诊断 `auto`、`project` 或 `global` 范围（默认：`auto`） |

</details>

<details>
<summary><code>comet update [path]</code> — 更新 Comet 包和技能</summary>

更新 npm 包，并刷新已检测到的项目级/全局 Comet 技能。

| 选项                  | 描述                             |
|---------------------|--------------------------------|
| `--json`            | 以 JSON 输出 npm 和 skill 更新结果     |
| `--language <lang>` | 覆盖自动检测到的 skill 语言 (`en`, `zh`) |
| `--scope <scope>`   | 仅更新 `global` 或 `project` 范围    |

</details>

<details>
<summary><code>comet uninstall [path]</code> — 卸载 Comet 技能、规则和钩子</summary>

安全移除 Comet 分发的技能、规则和钩子，保留用户自定义的钩子和非 Comet 配置。

| 选项                | 描述                              |
|-------------------|---------------------------------|
| `--force`         | 跳过确认提示                          |
| `--scope <scope>` | 仅卸载 `global` 或 `project` 范围    |
| `--json`          | 以 JSON 输出卸载结果                  |

```bash
comet uninstall              # 交互式 — 显示已安装目标，确认后卸载
comet uninstall --force      # 非交互式 — 直接移除所有内容
comet uninstall --scope project  # 仅移除项目级安装
```

</details>

<details>
<summary><code>comet skill &lt;command&gt;</code> — 编写和运行 Comet Skill 包</summary>

按显式 Skill 目录、项目 `.comet/skills/` 覆盖项、内置 Skill 的顺序发现包。手工 Run 会持久化不可变 Skill
快照和 pending action；当前 Agent 或平台执行该 action，再通过 `resume` 提交 outcome。

```bash
comet skill install ./my-skill --project .
comet skill validate my-skill --project .
comet skill inspect my-skill --json
comet skill run my-skill --change ./changes/demo
comet skill run my-skill --run-id demo-run --project .
comet skill resume --change ./changes/demo
comet skill resume --run-id demo-run --project .
comet skill resume --change ./changes/demo --status succeeded --summary "完成" --artifact report=report.md
comet skill eval --change ./changes/demo --scope completion
comet skill resume --change ./changes/demo --upgrade my-skill --project .
```

六个子命令都支持 `--json`。Run 可以绑定 `--change` 目录，也可以用 `--run-id` 存到
`.comet/runs/<run-id>`。Plan 3 的 `run` 支持 deterministic Skill；adaptive 执行需要 Agent
候选动作。项目 Skill 按名称覆盖内置 Skill，无效覆盖会失败关闭，不会静默回退。

</details>

<details>
<summary><code>comet bundle &lt;command&gt;</code> — 编写和分发多 Skill Bundle</summary>

从新目标或现有候选 Skill 创建平台无关的 Skill Bundle。Bundle 草稿具备确定性生命周期：可以编译为原生平台
Skill/rule/hook 安装计划，可以携带可选 Engine 元数据，必须记录结构化 Eval 证据，并且发布和分发前都需要人工批准。

```bash
comet bundle candidates --project . --json
comet bundle factory-init my-bundle --file ./plan.json --json
comet bundle factory-resolve my-bundle --candidate review-flow --source ./skills/review-flow --json
comet bundle factory-generate my-bundle --json
comet bundle draft create my-bundle --project .
comet bundle draft optimize ./bundle-source --project .
comet bundle status my-bundle --json
comet bundle compile my-bundle --platform claude --json
comet bundle eval-plan my-bundle --level quick --json
comet bundle eval-record my-bundle --result ./eval.json --json
comet bundle review-summary my-bundle --platform claude --json
comet bundle review my-bundle --approve --reviewer alice --json
comet bundle publish my-bundle --platform claude --json
comet bundle distribute my-bundle --platform claude --scope project --confirm-executables --json
```

`/comet-any` 是 Comet Skill Factory：用户描述想创建或优化的工作流，Comet 会把请求整理成一个可评审的
Bundle 草稿，并绑定真实本地 Skill 证据。它会读取 `.comet/skills.txt` 偏好、定位真实 Skill 内容、尽量遵守推荐调用顺序，
再通过 CLI 后端完成校验、Eval、发布和可选分发。缺失或歧义候选会先暂停到 `factory-resolve`，review 和 publish
必须依赖结构化证据，分发同时支持 `project` 和 `global` scope。

</details>

| 命令                | 描述   |
|-------------------|------|
| `comet --help`    | 显示帮助 |
| `comet --version` | 显示版本 |

## 支持平台

`comet init` 支持 30 个 AI 编码平台：

<details>
<summary>查看完整平台列表</summary>

| 平台                 | 技能目录         | 平台         | 技能目录          |
|--------------------|--------------|------------|---------------|
| Claude Code        | `.claude/`   | Cursor     | `.cursor/`    |
| Codex              | `.codex/`    | OpenCode   | `.opencode/`  |
| Windsurf           | `.windsurf/` | Cline      | `.cline/`     |
| RooCode            | `.roo/`      | Continue   | `.continue/`  |
| GitHub Copilot     | `.github/`   | Gemini CLI | `.gemini/`    |
| Amazon Q Developer | `.amazonq/`  | Qwen Code  | `.qwen/`      |
| Kilo Code          | `.kilocode/` | Auggie     | `.augment/`   |
| Kimi Code          | `.kimi-code/`| Kiro       | `.kiro/`      |
| Lingma             | `.lingma/`   | Junie      | `.junie/`     |
| CodeBuddy          | `.codebuddy/`| CoStrict   | `.cospec/`    |
| Crush              | `.crush/`    | Factory Droid | `.factory/` |
| iFlow              | `.iflow/`    | Pi         | `.pi/`        |
| Qoder              | `.qoder/`    | Antigravity | `.agents/`   |
| Bob Shell          | `.bob/`      | ForgeCode  | `.forge/`     |
| Trae               | `.trae/`     | ZCode      | `.zcode/`     |

</details>

部分平台的项目级目录和全局目录不同。例如 OpenCode 全局安装使用 `.config/opencode`，Lingma 全局安装使用 `.lingma`
，Antigravity 全局安装使用 `.gemini/antigravity`。ZCode 基于 OpenCode，从 `.zcode/` 读取 skills；安装时会将
OpenSpec 的输出从 `.opencode/` 镜像到 `.zcode/`。

## 技能

`comet init` 完成后，三组技能将被安装到所选平台的 `skills/` 目录：

### Comet 技能

<details>
<summary>查看 Comet 技能列表</summary>

| 技能               | 描述                                |
|------------------|-----------------------------------|
| `/comet`         | 主入口 — 自动检测阶段并分派到子命令               |
| `/comet-open`    | 阶段 1：打开变更（提案、设计、任务分解）             |
| `/comet-design`  | 阶段 2：深度设计（头脑风暴、设计文档）              |
| `/comet-build`   | 阶段 3：规划与构建（实现计划、代码提交）             |
| `/comet-verify`  | 阶段 4：验证与完成（测试、验证报告）               |
| `/comet-archive` | 阶段 5：归档（delta spec 同步、状态标注）       |
| `/comet-hotfix`  | 快捷路径：快速 bug 修复（跳过头脑风暴，不需要能力设计）    |
| `/comet-tweak`   | 轻量预设路径：串联 OpenSpec 的中等改动（delta spec 为一等公民，跳过头脑风暴和完整计划） |
| `/comet-any`     | Comet Skill Factory：创建/优化可分发的 Comet-native Skill |

</details>

### 守护与自动化脚本

<details>
<summary>查看脚本列表</summary>

| 脚本                       | 用途                                                                              |
|--------------------------|---------------------------------------------------------------------------------|
| `comet-env.mjs`          | 脚本发现助手 — 打印内置脚本所在目录，供 skill 解析同级启动器路径 |
| `comet-guard.mjs`        | 阶段转换守护 — 验证退出条件，`--apply` 自动更新 `.comet.yaml`                                    |
| `comet-handoff.mjs`      | 设计交接 — 从 OpenSpec 制品生成带 SHA256 追踪的确定性上下文包                                       |
| `comet-archive.mjs`      | 一键归档 — 验证状态、同步 specs、移至归档、更新状态                                                  |
| `comet-yaml-validate.mjs`| 模式校验器 — 校验 `.comet.yaml` 结构和字段值                                                 |
| `comet-state.mjs`        | 统一状态管理 — init/set/get/check/scale，agent 的专属 YAML 接口                             |
| `comet-hook-guard.mjs`   | 阶段写入守护 — PreToolUse hook，在 open/design/archive 阶段拦截文件写入                         |

所有脚本都是基于内置 `comet-runtime.mjs`（由 TypeScript 生成）的 Node.js 薄封装，通过 `node` 在所有平台运行，
因此 Comet 只依赖 Node.js，无需 Bash、Git Bash 或 WSL。

</details>

### OpenSpec 技能

Spec 生命周期管理：propose、explore、sync、verify、archive 等。

### Superpowers 技能

开发方法论：brainstorming、TDD、subagent-driven development、code review、plan writing 等。

0.4.0 运行时模型、状态拆分、诊断路径，以及 Bundle / Skill 架构细节见
[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)。

## 工作流

```
/comet
  ↓ auto-detect
/comet-open  -->  /comet-design  -->  /comet-build  -->  /comet-verify  -->  /comet-archive
(OpenSpec)         (Superpowers)       (Superpowers)       (Both)           (OpenSpec)

/comet-hotfix（快捷路径，跳过头脑风暴）
  open  -->  build  -->  verify  -->  archive

/comet-tweak（轻量预设路径，串联 OpenSpec，delta spec 为一等公民）
  open  -->  build  -->  verify  -->  archive
```

### 五个阶段

| 阶段                 | 命令               | 归属          | 产出物                            |
|--------------------|------------------|-------------|--------------------------------|
| 1. Open            | `/comet-open`    | OpenSpec    | proposal.md、design.md、tasks.md |
| 2. Deep Design     | `/comet-design`  | Superpowers | Design Doc、delta spec          |
| 3. Plan & Build    | `/comet-build`   | Superpowers | 实现计划、代码提交                      |
| 4. Verify & Finish | `/comet-verify`  | Both        | 验证报告、分支处理                      |
| 5. Archive         | `/comet-archive` | OpenSpec    | delta→main spec 同步、归档          |

### 核心原则

- **头脑风暴不可跳过** — 每个变更必须经过深度设计（hotfix/tweak 除外）
- **Delta spec 是活文档** — 在阶段 3 中可自由编辑，归档时同步
- **保持 tasks.md 同步** — 每完成一个任务就勾选
- **频繁提交** — 每个任务一个 commit，message 体现设计意图
- **先验证再归档** — `/comet-verify` 必须通过才能执行 `/comet-archive`

### 状态管理

Comet 使用解耦状态架构，文件独立管理：

| 文件                       | 归属       | 用途                         |
|--------------------------|----------|----------------------------|
| `.openspec.yaml`         | OpenSpec | Spec 生命周期、变更元数据          |
| `.comet.yaml`            | Comet    | 工作流阶段、执行模式、验证状态         |
| `.comet/run-state.json`  | Engine   | Run 身份和执行状态（机器所有）        |

`.comet.yaml` 保存所有用户可见的 Classic 工作流字段及 `run_id` 关联。Engine 将 Run 字段（`current_step`、`skill`、
`iteration`、`run_status` 等）单独存储在 `.comet/run-state.json`（camelCase JSON）中。旧变更如果 Run 字段仍在
`.comet.yaml` 中，首次读取时自动迁移。

所有状态和运行阶段都通过脚本更新，并且会在每个阶段退出前校验任务是否真实完成。相比于将复杂状态管理写在 Skill
文本中，脚本化状态机能更稳定地保障阶段流转、YAML 正确性和断点恢复；Agent 只需要通过 Comet 内置命令读取状态，就能知道当前
Spec 处于哪个阶段。

<details>
<summary>查看 .comet.yaml 关键字段</summary>

**`.comet.yaml` 关键字段：**

```yaml
workflow: full
auto_transition: true
phase: build
skill: comet-classic           # 解析后的 Skill 包名
run_id: <uuid>                 # 链接到 .comet/run-state.json
review_mode: standard          # off | standard | thorough
build_mode: subagent-driven-development
build_pause: null
isolation: branch
verify_mode: null
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
verify_result: pending
verification_report: null
branch_status: pending
verified_at: null
archived: false
direct_override: false
build_command: null
verify_command: null
handoff_context: openspec/changes/<name>/.comet/handoff/design-context.json
handoff_hash: <sha256>
tdd_mode: null
subagent_dispatch: null
```

full workflow 初始化时 `build_mode`、`build_pause`、`isolation`、`verify_mode`、`tdd_mode` 和 `subagent_dispatch` 可以暂时为
`null`；进入 `build → verify` 前必须完成 `build_mode` 与 `isolation` 决策并写入合法值。`auto_transition` 控制阶段完成后是否自动触发下一个 Skill — 详见 [AUTO-TRANSITION.md](docs/AUTO-TRANSITION.md)。`build_pause` 记录 build 阶段内部暂停点：
`null` 表示无暂停，`plan-ready` 表示 plan 已生成，用户在选择隔离方式和执行方式前暂停。它不是执行方式，不得写入 `build_mode`。
`verification_report` 在验证报告生成前保持 `null`，`verify-pass` 要求该报告文件存在且 `branch_status: handled`。示例中
`archived` 之后的字段是可选字段或脚本派生字段：`direct_override` 只在 full workflow 直接构建时需要，项目命令未配置时可以不存在，
`handoff_context` 和 `handoff_hash` 由 `comet-handoff.mjs` 在离开 design 阶段前写入。项目可在 change 或仓库根配置中设置
`build_command` / `verify_command`，guard 会优先运行并打印失败输出。配置命令使用受限 shell 语法：允许命令词、引号、路径和用
`&&` 串联的顺序步骤；拒绝 `;`、管道、裸 `&`、`$` 和反引号。`review_mode` 控制 Build/Verify 阶段的自动代码审查（`off`
跳过、`standard` 审查关键变更、`thorough` 全量审查）；可在 `.comet/config.yaml` 中设置项目级默认值。

</details>

### 可靠性特性

Comet 通过自动化状态转换确保 agent 执行可靠性：

<details>
<summary>查看可靠性特性</summary>

1. **入口验证** — 每个阶段在执行前验证前置条件
    - 检查文件存在、状态一致性、阶段转换
    - 验证失败时输出 `[HARD STOP]` 及可操作建议

2. **自动化状态转换** — `comet-guard.mjs --apply` 自动更新 `.comet.yaml`
    - 所有阶段转换（open → design/build → verify → archive）使用 `guard --apply`
    - 无需手动状态编辑 — 消除写入验证错误
    - `comet-state.mjs` 是 agent 对状态操作的专属接口
    - Guard 和 archive 脚本内部使用 `comet-state.mjs` 进行状态管理

3. **模式校验** — `comet-yaml-validate.mjs` 确保数据完整性
    - 校验必填字段和可选字段
    - 校验枚举值（包括 `direct_override`）
    - 校验 `design_doc`、`plan`、`handoff_context` 路径存在，并校验 `handoff_hash` 格式
    - 检测未知/拼写错误字段

4. **Build 决策强制** — Guard 和状态转换同时拦截跳过关键选择
    - `isolation` 必须是 `branch` 或 `worktree`
    - `build_mode` 必须已选择
    - `build_pause: plan-ready` 是 plan 生成后的可恢复暂停点，不是 `build_mode`
    - full workflow 的 `build_mode: direct` 必须有 `direct_override: true`

5. **验证证据强制** — Guard 在阶段流转前强制要求验证凭证
    - `verify-pass` 转换要求 `verification_report` 指向已存在的验证报告文件
    - `branch_status` 必须为 `handled` 才能通过验证
    - Guard 检查 `verification_report exists` 和 `branch_status=handled` 作为硬性前提
    - 防止验证或分支处理被跳过时产生虚假的阶段推进

6. **归档自动化** — `comet-archive.mjs` 一键处理完整归档流程
    - 验证入口状态、通过 OpenSpec 将 delta specs 合并到 main specs
    - 标注设计文档和计划文档的 frontmatter
    - 将变更移至归档目录并更新 `archived: true`
    - 支持 `--dry-run` 预览

7. **防漂移阶段守护** — 长上下文会话中的阶段意识保障
    - Rule 层：`comet-phase-guard.md` 每轮注入阶段感知、Skill 调用规范和上下文恢复指令（所有平台通用）
    - Hook 层：`comet-hook-guard.mjs` 在 open/design/archive 阶段硬拦截文件写入（Claude Code 等支持 hook 的平台）
    - 白名单路径：`openspec/*`、`docs/superpowers/*`、`.claude/*`、`.comet/*`

</details>

## 项目结构

```
your-project/
├── .comet/
│   └── config.yaml              # 项目级全局配置（context_compression、review_mode、auto_transition）
├── .claude/skills/              # 平台技能目录（Comet + OpenSpec + Superpowers）
│   ├── comet/SKILL.md
│   │   └── scripts/
│   │       ├── comet-guard.mjs       # 阶段转换守护（--apply 自动更新状态）
│   │       ├── comet-env.mjs         # 脚本发现助手
│   │       ├── comet-handoff.mjs     # 设计交接（OpenSpec → Superpowers 上下文追踪）
│   │       ├── comet-archive.mjs     # 一键归档自动化
│   │       ├── comet-yaml-validate.mjs # 模式校验器
│   │       ├── comet-hook-guard.mjs    # 阶段写入守护（PreToolUse hook）
│   │       └── comet-state.mjs       # 统一状态管理（init/set/get/check/scale）
│   ├── comet-*/SKILL.md
│   ├── openspec-*/SKILL.md
│   └── brainstorming/SKILL.md
├── openspec/                    # OpenSpec — WHAT
│   ├── config.yaml
│   └── changes/
│       └── <name>/
│           ├── .openspec.yaml       # OpenSpec 状态
│           ├── .comet.yaml          # Comet 工作流状态（Classic 字段 + run_id 关联）
│           ├── .comet/
│           │   └── run-state.json   # Engine Run 状态（机器所有，自动迁移）
│           ├── proposal.md
│           ├── design.md
│           ├── specs/<capability>/spec.md
│           └── tasks.md
└── docs/superpowers/            # Superpowers — HOW
    ├── specs/                   # 设计文档
    └── plans/                   # 实现计划
```

<details>
<summary>上下文压缩（Beta）</summary>

Comet 支持在 Design → Build 阶段交接时进行上下文压缩。启用后，`comet-handoff.mjs` 会生成精简的上下文包，在不影响实现正确性的前提下，将
Build 阶段的输入 token 降低 **25–30%**。

| 模式     | 行为                              | Token 节省 |
|--------|---------------------------------|----------|
| `off`  | handoff context 包含完整 Spec 摘录    | 基线       |
| `beta` | 仅保留 Design Doc + SHA256 hash 引用 | ~25–30%  |

Benchmark 核心结论：

- **测试通过率**：所有档位均为 100%（压缩不影响实现正确性）
- **Spec 覆盖率**：off 100% vs beta 95%（压缩可能丢失少量边缘需求细节）
- **规模效应**：任务越大，绝对节省量越高（large 档位节省可达 15,000 tokens）

启用方式：在 `.comet/config.yaml` 中设置 `context_compression: beta`

详见 [CONTEXT-COMPRESSION.md](docs/CONTEXT-COMPRESSION.md) 获取完整 Benchmark 报告、压缩原理和复现步骤。

</details>

<details>
<summary>自动流转（Auto Transition）</summary>

`auto_transition` 控制阶段完成后是否自动调用下一个 Skill，还是暂停等待用户手动触发。阶段推进本身始终执行，该配置仅影响 Skill 调用。

| 值 | 行为 |
|------|------|
| `true` | 阶段完成后自动调用下一个 Skill（默认） |
| `false` | 阶段完成后暂停，用户手动触发下一个 Skill |

三层配置与优先级：`COMET_AUTO_TRANSITION` 环境变量 > `.comet/config.yaml`（项目级）> `.comet.yaml`（change 级）。

详见 [AUTO-TRANSITION.md](docs/AUTO-TRANSITION.md) 获取配置详情、工作流映射和常见问题。

</details>

## 开发

贡献流程、提交规范、PR 流程、分支工作流，以及新增平台、Skill、脚本或 changelog
的说明见 [CONTRIBUTING-zh.md](CONTRIBUTING-zh.md) | [English](CONTRIBUTING.md)。

详见 [CHANGELOG.md](CHANGELOG.md) 了解版本历史与更新。

## 路线图

在 [Comet Roadmap](https://github.com/orgs/rpamis/projects/1) 查看开发进展与即将推出的功能。

## Star历史

[![Star History Chart](https://api.star-history.com/svg?repos=rpamis/comet&type=Date)](https://star-history.com/#rpamis/comet&Date)

## Contributors

<a href="https://github.com/rpamis/comet/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=rpamis/comet&max=999&columns=12&anon=1" />
</a>

## License

[MIT](LICENSE)

## 社区交流

<table align="center">
  <tr>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/comet/blob/master/img/douyin.png" width="120" height="120"><br>
      <b>抖音群（推荐）</b>
    </td>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/comet/blob/master/img/wechat.jpg" width="120" height="120"><br>
      <b>微信群</b>
    </td>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/comet/blob/master/img/qq.jpg" width="120" height="120"><br>
      <b>QQ群</b>
    </td>
  </tr>
</table>

## 友情链接

[LINUX DO - 新的理想型社区](https://linux.do/)
