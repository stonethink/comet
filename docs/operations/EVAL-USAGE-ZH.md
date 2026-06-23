# 使用 `comet eval` 评估 Skill

本文从用户视角说明新版本怎么评估一个 Skill。正常情况下，你不需要理解 pytest、task registry、profile、treatment 或 Docker 细节；用户主入口是 `comet eval`。

## 先理解 eval 在 Comet 里的位置

`/comet-any` 负责创建或优化 Skill，`comet eval` 负责验证这个 Skill 是否能被 eval harness 发现、运行并产出报告。

两者的关系可以这样理解：

```text
/comet-any 生成 Skill
  -> 产出 comet/eval.yaml
  -> comet eval collect 做发现预检查
  -> comet eval run --html 执行真实评估
  -> /comet-any 或 comet publish 读取评估结果并进入 readiness / review / publish
```

`comet eval` 不负责发布。发布仍然由 `/comet-any` 背后的 Bundle 后端处理，对普通用户暴露为 `comet publish`。eval 的职责是提供发布前证据。

## 推荐路径：评估 `/comet-any` 生成的 Skill

当 `/comet-any` 生成了 Skill 后，优先找这个文件：

```text
generated-skill/
  comet/
    eval.yaml
```

然后按两步跑：

```bash
comet eval collect --manifest ./generated-skill/comet/eval.yaml
comet eval run --manifest ./generated-skill/comet/eval.yaml --html
```

第一步 `collect` 只确认“能不能发现任务”。它适合刚生成完 Skill 后做低成本预检查。

第二步 `run --html` 才执行真实评估，并生成可浏览报告。评估通过后，`/comet-any` 可以把这份结果作为发布前证据的一部分。

## 为什么先 `collect`

`collect` 是用户最便宜的排错入口。它主要回答：

- `comet/eval.yaml` 路径是否正确
- eval harness 是否能读到这个 manifest
- manifest 里的推荐任务是否能被发现
- 当前仓库的 eval 依赖路径是否可用

它不应该先跑完整模型评估，也不应该先消耗长时间任务。失败时，通常先修 manifest、路径或任务发现问题。

## `run --html` 会输出什么

运行时 CLI 会先打印一组执行信息：

- `Eval root`：实际从哪个 `eval/` 根目录启动
- `Mode`：`collect` 或 `run`
- `Target`：当前评估的是 manifest 还是本地 Skill 目录
- `Experiment`：本次实验 id
- `Profile`：本次评估使用的 profile
- `Task`：本次评估任务
- `Report path`：报告位置
- `Report config`：启用 `--html` 时使用的临时报告配置

`--html` 会要求报告同时产出 markdown 和 HTML。报告通常位于：

```text
eval/local/logs/experiments/<experiment-id>/summary.html
```

如果 CLI 输出里显示的是 `<experiment-id>` 占位符，用同一段输出里的 `Experiment` 值对应查找即可。

## 报告应该怎么看

用户不需要逐行读底层日志。优先看这几类信息：

- 评估是否通过
- 失败归因是 harness、workflow、task 还是 model
- 失败用例是否和 Skill 目标相关
- 是否缺少预期 artifact
- 是否是路径、manifest 或环境问题
- token / cost / duration 是否异常

`comet eval run` 的输出会提示 failure attribution：报告会把失败归到 harness、workflow、task、model 等桶里。这个归因用于判断下一步应该修 Skill、修 eval 配置，还是重跑环境。

## `/comet-any` 如何使用 eval 结果

从用户视角，eval 结束后把结果交回 `/comet-any` 继续推进即可。`/comet-any` 会把 eval 证据纳入 readiness：

- 没有 eval 证据：不能 publish
- eval 失败：不能 publish
- eval 证据对应旧 hash：不能 publish
- eval 通过且 hash 匹配：可以进入 review / publish 判断

用户不需要手工编辑 Bundle 状态，也不应该手工把报告路径写进内部 JSON。`/comet-any` 会通过 Bundle 后端记录结构化证据。

## 只有本地 Skill 目录时怎么评估

如果你还没有 `comet/eval.yaml`，只有一个本地 Skill 目录，可以先做 quick smoke：

```bash
comet eval run --skill-path ./my-skill --skill-name my-skill --quick
```

这个路径适合早期验证：

- Skill 目录是否可读取
- eval harness 是否能把它当作动态 Skill 注入
- 通用 smoke task 是否能跑起来

当前 quick smoke 默认使用：

```text
generic-skill-smoke
```

这只是早期冒烟，不等于发布前完整证据。准备发布时，仍推荐通过 `/comet-any` 生成 `comet/eval.yaml`，再走 manifest 路径。

## manifest 路径和 skill-path 路径怎么选

优先级很简单：

- 有 `comet/eval.yaml`：用 `--manifest`
- 只有本地目录、还在早期调试：用 `--skill-path --quick`
- 是 `/comet-any` 生成物：用 `--manifest`
- 要进入发布 readiness：用 `--manifest`

不要把 `--skill-path --quick` 当成最终发布评估。

## 失败时怎么判断下一步

### collect 失败

优先检查：

- manifest 路径是否正确
- `comet/eval.yaml` 是否存在
- manifest 里推荐的 task 是否存在
- 当前是否在 Comet 仓库根目录或传了正确 `--project`

### run 失败

优先看报告里的 failure attribution：

- `harness`：多半是 eval harness、依赖、Docker、路径或环境问题
- `workflow`：多半是 Skill 执行流程没有达到预期
- `task`：多半是任务定义、验证条件或 fixture 问题
- `model`：多半是模型行为、工具使用或不稳定输出问题

### HTML 报告没找到

先看 CLI 输出的 `Experiment` 和 `Report path`。如果路径里有 `<experiment-id>`，用实际 experiment id 到下面目录查：

```text
eval/local/logs/experiments/
```

## `comet eval` 和 `comet skill eval` 不一样

这两个命令名字接近，但用途不同。

`comet eval` 是共享 eval harness 的用户入口，用来评估一个 Skill 包或 `comet/eval.yaml`。

`comet skill eval` 是本地 Engine Run 的完成度检查，用来判断某个 run / change 是否满足 `comet/evals.yaml` 里的 runtime eval。

如果你的问题是“这个 Skill 作为产品能力能不能通过评估”，用：

```bash
comet eval run --manifest ./generated-skill/comet/eval.yaml --html
```

如果你的问题是“这个正在运行的 deterministic Skill Run 是否缺 artifact 或状态”，才用：

```bash
comet skill eval --change ./changes/demo --scope completion
```

## 用户最少需要记什么

实际使用时只需要记三件事：

1. `/comet-any` 生成物优先用 `comet/eval.yaml`
2. 先 `collect`，再 `run --html`
3. eval 结果是 `/comet-any` 发布 readiness 的证据，不是发布动作本身

推荐命令：

```bash
comet eval collect --manifest ./generated-skill/comet/eval.yaml
comet eval run --manifest ./generated-skill/comet/eval.yaml --html
```
