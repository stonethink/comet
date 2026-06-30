# Task 2 实施报告（Classic intent runtime command）

## 目标
按任务要求为 Classic Runtime 增加 `intent route` CLI 适配器命令，覆盖 `resolveCometIntentRoute`，并补齐运行时 CLI 测试。

## 执行内容
1. 先在 `test/domains/comet-classic/classic-runtime.test.ts` 的 `Classic runtime CLI adapter` describe 下新增失败测试：
   - `routes intent frames through the Classic CLI`
   - `returns readable intent validation errors`
2. 新增 `domains/comet-classic/classic-intent-command.ts`，实现运行时命令：
   - `intent route <frame-json>`
   - `intent route --stdin`
   - JSON 解析失败返回 `Invalid JSON: ...`
   - `CometIntentValidationError` 返回其可读错误文本
3. 在 `domains/comet-classic/classic-cli.ts` 注册新命令：
   - `CLASSIC_COMMANDS` 增加 `intent`
   - `DEFAULT_HANDLERS.intent = classicIntentCommand`
   - 导入新 handler
4. 在 `domains/comet-classic/index.ts` 导出 `classic-intent-command`
5. 运行 `node scripts/build/build-classic-runtime.mjs` 重建 `assets/skills/comet/scripts/comet-runtime.mjs`，使运行时文件与源码同步。

## 测试
- 先运行 `npx vitest run test/domains/comet-classic/classic-runtime.test.ts`
  - 预期失败（`intent` 未实现前）：`routes intent frames...` 与 `returns readable intent validation errors` 失败
- 实现与注册后，运行 `npx vitest run test/domains/comet-classic/classic-runtime.test.ts test/domains/comet-classic/classic-intent.test.ts`
  - 通过（23 passing）

## 变更文件
- `domains/comet-classic/classic-intent-command.ts`
- `domains/comet-classic/classic-cli.ts`
- `domains/comet-classic/index.ts`
- `test/domains/comet-classic/classic-runtime.test.ts`
- `assets/skills/comet/scripts/comet-runtime.mjs`
