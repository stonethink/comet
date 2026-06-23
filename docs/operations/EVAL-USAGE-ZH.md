# Comet Eval 用法

本文只讲新版本面向用户的主路径：如何评估一个本地 Skill，或评估 `/comet-any` 生成出来的 Skill 包。

## 先分清两条命令

- `comet eval`：共享 eval harness 的用户入口，用来评估一个 Skill 包或 `comet/eval.yaml`
- `comet skill eval`：检查某个 deterministic Skill Run / change 的完成度，不是通用 Skill benchmark 入口

如果你的目标是“这个 Skill 能不能跑通、有没有基础评估结果”，优先使用 `comet eval`。

## 推荐主路径：评估带 `comet/eval.yaml` 的 Skill

当你的 Skill 是 `/comet-any` 生成出来的，或者包里已经带有 `comet/eval.yaml`，按下面顺序执行：

```bash
comet eval collect --manifest ./comet/eval.yaml
comet eval run --manifest ./comet/eval.yaml --html
```

建议顺序：

1. 先跑 `collect`
2. 再跑 `run --html`

这样做的原因：

- `collect` 只做发现和预检查，确认 eval harness 能识别这个 Skill，不先跑完整评估
- `run --html` 才执行真实 eval，并生成可浏览的摘要输出

运行时，CLI 会直接打印这些关键信息：

- `Eval root`
- `Mode`
- `Target`
- `Experiment`
- `Profile`
- `Task`
- `Report path`

如果你传了 `--html`，还会看到 `Report config`，最终报告会落到 `eval/local/logs/experiments/<experiment-id>/` 下。

## 早期本地 Skill：还没有 manifest 时怎么做

如果你现在只有一个本地 Skill 目录，还没有 `comet/eval.yaml`，可以直接走本地路径：

```bash
comet eval run --skill-path ./my-skill --skill-name my-skill --quick
```

这个场景下：

- `--skill-path` 指向你的 Skill 根目录
- `--skill-name` 建议显式传，方便日志和结果识别
- `--quick` 会优先走低成本冒烟路径

当前实现里，`--skill-path` 配合 quick 模式时，默认任务会落到 `generic-skill-smoke`。

## 什么时候只跑发现，不跑真实评估

下面这些情况，先用 `collect`：

- 你刚生成完 Skill，想先确认任务发现链路正常
- 你怀疑是 harness 配置问题，而不是 Skill 本身问题
- 你只想验证 `comet/eval.yaml` 是否可被当前仓库识别

命令：

```bash
comet eval collect --manifest ./comet/eval.yaml
```

## 什么时候需要 `comet skill eval`

只有当你已经在跑一个 deterministic Skill Run，且想检查这个 run / change 的状态、artifact 或完成度时，才用：

```bash
comet skill eval --change ./changes/demo --scope completion
```

它解决的问题是：

- 当前 run 是否满足预期状态
- 缺了哪些 artifact 或状态记录
- 下一步应该补什么

它不是替代 `comet eval run` 的 benchmark 入口。

## 建议的用户操作顺序

### 场景 A：`/comet-any` 生成出的 Skill

```bash
comet eval collect --manifest ./comet/eval.yaml
comet eval run --manifest ./comet/eval.yaml --html
```

### 场景 B：手工写的本地 Skill，先做一次冒烟

```bash
comet eval run --skill-path ./my-skill --skill-name my-skill --quick
```

### 场景 C：Skill Run 卡住，想知道该补什么

```bash
comet skill eval --change ./changes/demo --scope completion
```

## 常见误区

- 不要把 `comet skill eval` 当成通用 eval 平台入口
- 不要先手工切到 `eval/` 目录再拼 pytest 参数，用户主路径已经收敛到 `comet eval`
- 对带 manifest 的 Skill，优先走 `collect -> run --html`
- 对还没 manifest 的本地 Skill，优先走 `--skill-path --quick`
