# Classic 0.3.8 参考实现

本目录冻结 Comet Classic shell 状态机在 commit `367887e` 时的实现，用于
Plan 2 迁移期间的差分兼容测试。

规则：

- `scripts/` 中的文件必须保持 byte-for-byte 不变。
- 不对冻结脚本执行格式化、重构或跨平台修复。
- `checksums.json` 是 fixture 完整性的本地基准，不依赖测试环境存在 Git。
- 新实现允许增加 Run 字段、Skill snapshot 和 Trajectory，但旧行为投影、
  稳定输出和退出码必须继续匹配本参考实现。
