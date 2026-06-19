## 回复语言
必须采用中文回答用户

## 测试

```bash
npx vitest run test/ts/comet-scripts.test.ts   # shell 脚本测试
npx vitest run                                   # 全量测试
```

## 提交前检查

仓库已配置 Git pre-commit 钩子（husky + lint-staged），每次 `git commit` 会自动对 `src/` 下的暂存源文件运行 `prettier --write`（与 CI `format:check` 范围一致），编辑器无关，所有贡献者生效。

提交前建议手动确认（CI 会强制检查）：

```bash
pnpm format:check   # Prettier 格式检查
pnpm lint           # ESLint
pnpm build          # TypeScript 构建
pnpm test           # 单元测试
```

注：本地 Windows 若 `core.autocrlf=true`，未改动的旧文件可能因 CRLF 被 `prettier --check` 误报；钩子只处理暂存文件，不受影响，旧文件下次编辑时会自动转为 LF。

## Classic runtime 脚本规范

脚本位于 `assets/skills/comet/scripts/`，当前发布形态是薄 `.mjs` launcher + 生成的 `comet-runtime.mjs`：

- 运行时源码位于 `src/compat/`，修改后必须运行 `pnpm build:classic-runtime` 同步 `assets/skills/comet/scripts/comet-runtime.mjs`
- launcher 必须保持薄封装，只 import `./comet-runtime.mjs` 并调用对应命令；不要把业务逻辑写回 launcher
- 不再新增 `.sh` runtime；测试 fixture `test/fixtures/classic-0.3.9/` 是冻结参考实现，只用于差分兼容
- 新增 launcher 或 runtime 文件必须加入 `test/ts/comet-scripts.test.ts` 的 `beforeEach` 拷贝列表和 `assets/manifest.json`

## 脚本依赖关系

```
comet-runtime.mjs ← src/compat/*
comet-state.mjs ← comet-runtime.mjs
comet-guard.mjs ← comet-runtime.mjs
comet-handoff.mjs ← comet-runtime.mjs (写入 handoff_context/handoff_hash)
comet-archive.mjs ← comet-runtime.mjs
comet-yaml-validate.mjs ← comet-runtime.mjs
comet-hook-guard.mjs ← comet-runtime.mjs
```

新增共享工具函数时（如 archive 目录解析、change name 校验、hash、yaml 解析），优先放在 `src/compat/` 的共享模块中，再重新生成 runtime，避免多个命令漂移。

## .comet.yaml 状态机

每个 change 的状态文件，字段变更需要同步三处：
1. `src/compat/classic-state-command.ts` — `set` 白名单 + enum 验证
2. `src/compat/classic-validate-command.ts` — schema 校验 + KNOWN_KEYS
3. `test/ts/comet-scripts.test.ts` — 测试中的 yaml 字符串

## 双语言 Skill

skill 优化时先写中文版本（`assets/skills-zh/`），用户确认后再修改英文版本（`assets/skills/`）。

## 中文术语翻译规范

中文文档不得把英文 “gate” 直译为“门”（如“压缩门”“调试门”“确认门”），这种译法在中文语境下不自然。应按实际含义翻译：

- `gate`（阶段性检查/阻塞点）→ 根据语境用“协议”“阶段”“检查”“阻塞点”等，如 `debug gate` → “异常调试协议”
- 修饰词性质的 `proactive/active` → “主动式”，如 `proactive context compression` → “主动式上下文压缩”，不写作“主动压缩门”
- 英文版保持原术语（如 Debug Gate），仅中文版需要遵循本规范

## Changelog 规范

每次代码产生变更你都应该在完成后写Changelog，并确定是否需要升级版本号，版本号只会比master分支的版本号大一个版本，你需要确定一下当前master的版本号后做决定

如果当前已经有了一个比master大的版本Changelog，则应该追加到同一个版本的Changelog条目下

如果修改的是Skill内容，则需要等中英文完全同步之后再写Changelog

文件：`CHANGELOG.md`，新版本条目置顶。

```
## What's Changed [x.y.z] - YYYY-MM-DD

### Added / Changed / Fixed / Tests / Removed / Security

- **功能名**: 描述做了什么以及为什么
```

要点：
- 版本号与 `package.json` 的 `version` 字段一致
- 每条以 `- **粗体关键词**: ` 开头，后接具体变更内容
- 按类型分组：Added → Changed → Fixed → Tests → Removed → Security
- 描述侧重 **行为变更**（what + why），不是实现细节
- `### Tests` 条目汇总新增测试覆盖的场景，不逐条列出测试用例

写的Changelog应该是用户可视的版本，如果在一个分支上多次解决问题，但又不是master中的问题，而是开发中的问题，那这种内容不需要写入

## 修改Skill规范

不能够直接修改Superpowers和OpenSpec的原始Skill

## github规范

不能未经过同意直接在github上评论或者提交PR