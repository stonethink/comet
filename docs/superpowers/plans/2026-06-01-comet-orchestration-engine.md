# Comet 通用 Skill 编排引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 comet 的稳定性特性（状态机/退出门/意图识别/HITL/断点恢复）做成原子引擎，用户只编排 `*.flow.yaml` + 用 `comet flow` CLI 即可组合任意 skill。

**Architecture:** 四层——① `*.flow.yaml`（用户编排）② TS 纯函数引擎（`src/flow/`，只做决策）③ `.comet.flow.yaml` 运行时状态 ④ 瘦 SKILL.md 驱动循环。引擎只算"下一步动作"，Agent 忠实触发 skill。本计划交付 v1 垂直切片：引擎 + 状态持久化 + `comet flow` CLI + 校验 + 图导出 + classic 预设 + driver SKILL.md。

**Tech Stack:** TypeScript (ESM, Node ≥20)、commander、`yaml` 解析库、vitest（tmpdir + console spy 集成测试，沿用 `test/ts/` 既有风格）。

---

## 设计来源

实现严格对齐 `docs/superpowers/specs/2026-06-01-comet-orchestration-engine-design.md`。阅读该 spec 后再开工。下面先固化运行时契约（spec §5/§8 的精确化），所有任务以此为准。

### 运行时契约（必须先读）

**状态形状 `FlowState`**：`{ flow, currentNode, artifacts, vars, history, pending, done }`。
- `currentNode: string | null`（null = 尚未路由，仅 router 入口时短暂出现）。
- `artifacts: Record<string,string>`（命名产物 → 路径）。
- `vars: Record<string,string>`（计数器/标志/HITL 选择，统一存字符串）。
- `history: string[]`（进入过的 node id 序列）。
- `pending`: 等待用户解决的暂停点，`null` 或 `{ kind:'confirm'|'hitl', at:'node'|'edge', edgeTo?, question?, options? }`。
- `done: boolean`。

**`policy` 三值**（spec §5）：`auto` / `gate` / `hitl`，作用在两个推进点：
- **node 级**：`policy` 控制"到达节点是否暂停后再触发 skill"。`gate` → 进入时设 `pending=confirm@node`；`auto` → 不暂停。
- **edge 级**：`policy` 控制"退出门通过后是否暂停再移动"。`gate` → `pending=confirm@edge`；`hitl` → `pending=hitl@edge`；`auto` → 直接移动。
- 缺省取 `defaults.policy`。

**条件 `Condition`**（spec §6「条件表达」，v1 不自研 DSL）：
- 字符串谓词：`artifact <name> exists` / `var <name> == <value>` / `var <name> != <value>`。
- 字符串数组：隐式 AND。
- `{ run: "<shell>" }`：退出码 0 为真（逃生口）。

**HITL 选项可选路由**：`options` 既可是纯字符串（记录选择进 `vars`，沿默认 transition 走），也可是 `{ label, to }`（`answer` 时直接跳到 `to`）。

**引擎动作 `FlowAction`**（驱动循环消费，spec §8）：
`{type:'invoke_skill', skill, handoff}` / `{type:'classify_intent', candidates}` / `{type:'ask_user', hitl}` / `{type:'await_confirm'}` / `{type:'guard_failed', reason}` / `{type:'done'}`。

**纯函数 `decide(flow, state): FlowAction`**（只读）：
1. `state.done` → `done`。
2. `currentNode===null` 且有 router → `classify_intent`（候选 = router.intents）。
3. `pending.kind==='confirm'` → `await_confirm`；`pending.kind==='hitl'` → `ask_user`。
4. 否则 → `invoke_skill`（当前 node）。

**变更函数**（返回 `{state, action}`，`action = decide(newState)`）：
- `startFlow(flow)`：建初始 state；有 router → `currentNode=null`；否则 `enterNode(第一个 node)`。
- `enterNode(flow, state, nodeId)`：设 `currentNode`、push history、清理；node 级 `gate` → 设 `pending=confirm@node`，否则 `pending=null`。
- `classify(flow, state, intentId)`：校验 id ∈ 候选 → `enterNode(intent.to)`。
- `answer(flow, state, choice)`：仅当 `pending.kind==='hitl'`；记录 `vars["choice_"+at_id]=choice`；若选项带 `to` → `enterNode(to)`；否则清 pending 后 `proceedTransition`。
- `advance(flow, state)`：
  - `pending=confirm@node` → 清 pending（确认进入，后续 decide 返回 invoke_skill）。
  - `pending=confirm@edge` → `enterNode(pending.edgeTo)`。
  - 无 pending（= 上一个 invoke_skill 完成）→ 校验 `node.exit`；失败返回 `guard_failed`；通过 → `proceedTransition`。
- `proceedTransition(flow, state)`：`selectTransition` 选第一条 `on` 满足（或无 `on`）的出边；无出边或 `node.terminal` → `done=true`；否则按 edge `policy`：`gate`→`pending=confirm@edge`、`hitl`→`pending=hitl@edge`、`auto`→`enterNode(t.to)`。

**为何不自循环**：`decide` 只读，移动只发生在 `advance/answer/classify`。driver 每轮调一次 `comet flow next`（= `decide`），完成后调对应命令（spec §8.2）。

### 文件结构（先锁定）

```
src/flow/
  types.ts        # 所有类型：FlowDefinition/FlowNode/FlowTransition/FlowAdapter/
                  # RouterIntent/FlowState/PendingPrompt/FlowAction/Policy/Condition
  load.ts         # loadFlow(path)->FlowDefinition；derivePhase(nodeId)
  predicates.ts   # evalCondition(cond, state)->boolean（含 run: shell）
  engine.ts       # decide/startFlow/enterNode/advance/answer/classify/proceedTransition/selectTransition
  state-io.ts     # readFlowState(dir)/writeFlowState(dir,state)（yaml 持久化）
  validate.ts     # validateFlow(flow)->string[]
  graph.ts        # toMermaid(flow,state?)/toAscii(flow,state?)
src/commands/
  flow.ts         # `comet flow <sub>` 全部子命令
src/cli/index.ts  # 注册 flow 命令（修改）
assets/flows/
  classic.flow.yaml   # 经典模式预设
assets/skills/comet/SKILL.md      # 重写为 driver（英文）
assets/skills-zh/comet/SKILL.md   # 重写为 driver（中文，先写）
test/ts/
  flow-load.test.ts  flow-predicates.test.ts  flow-engine.test.ts
  flow-state-io.test.ts  flow-validate.test.ts  flow-graph.test.ts  flow-cli.test.ts
```

每个 `src/flow/*.ts` 单一职责、可独立单测；引擎纯函数无需 Agent 即可全覆盖。

---

## Milestone 0：依赖与骨架

### Task 0: 添加 yaml 依赖

**Files:**
- Modify: `package.json`（dependencies）

- [ ] **Step 1: 安装 yaml**

Run: `pnpm add yaml`
Expected: `package.json` 的 `dependencies` 出现 `"yaml": "^2.x"`，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add yaml dependency for flow engine"
```

---

## Milestone 1：类型 + 加载

### Task 1: 定义 flow 类型

**Files:**
- Create: `src/flow/types.ts`

- [ ] **Step 1: 写类型（无逻辑，直接落地）**

```typescript
export type Policy = 'auto' | 'gate' | 'hitl';

/** 条件：字符串谓词、数组(AND)、或 shell 逃生口 */
export type Condition = string | string[] | { run: string };

export interface HitlOption {
  label: string;
  to?: string; // 选中后直接跳转的目标 node（可选）
}

export interface HitlPrompt {
  question: string;
  options: HitlOption[];
}

export interface RouterIntent {
  id: string;
  when?: string; // 自然语言判据（交给 Agent 分类）
  to: string;
  default?: boolean;
}

export interface FlowRouter {
  classifyBy: 'agent';
  intents: RouterIntent[];
}

export interface FlowNode {
  id: string;
  phase: string; // 由 key 前缀推导或显式覆盖
  skill?: string;
  entry?: Condition;
  exit?: Condition;
  policy?: Policy;
  hitl?: HitlPrompt;
  prompt?: string;
  produces?: string[];
  terminal?: boolean;
}

export interface FlowTransition {
  from: string;
  to: string;
  on?: string; // 字符串条件
  policy?: Policy;
  hitl?: HitlPrompt;
}

export interface FlowAdapter {
  invoke: string;
  doneCheck?: Condition;
  produces?: Record<string, string>;
}

export interface FlowDefaults {
  policy: Policy;
}

export interface FlowDefinition {
  name: string;
  defaults: FlowDefaults;
  entry?: { router: FlowRouter };
  nodes: Record<string, FlowNode>;
  transitions: FlowTransition[];
  adapters: Record<string, FlowAdapter>;
}

export interface PendingPrompt {
  kind: 'confirm' | 'hitl';
  at: 'node' | 'edge';
  atId: string; // 触发暂停的 node id（用于记录 choice）
  edgeTo?: string;
  question?: string;
  options?: HitlOption[];
}

export interface FlowState {
  flow: string;
  currentNode: string | null;
  artifacts: Record<string, string>;
  vars: Record<string, string>;
  history: string[];
  pending: PendingPrompt | null;
  done: boolean;
}

export type FlowAction =
  | { type: 'invoke_skill'; skill: string; handoff: { prompt?: string; artifacts: Record<string, string> } }
  | { type: 'classify_intent'; candidates: RouterIntent[] }
  | { type: 'ask_user'; hitl: HitlPrompt }
  | { type: 'await_confirm' }
  | { type: 'guard_failed'; reason: string }
  | { type: 'done' };
```

- [ ] **Step 2: 编译校验**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/flow/types.ts
git commit -m "feat(flow): add core flow type definitions"
```

### Task 2: 加载器 + phase 推导

**Files:**
- Create: `src/flow/load.ts`
- Test: `test/ts/flow-load.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadFlow, derivePhase } from '../../src/flow/load.js';

describe('derivePhase', () => {
  it('uses prefix before first dot', () => {
    expect(derivePhase('build.plan')).toBe('build');
    expect(derivePhase('open')).toBe('open');
  });
});

describe('loadFlow', () => {
  let dir: string;
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `flow-load-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('parses nodes, derives phase, defaults policy', async () => {
    const file = path.join(dir, 'x.flow.yaml');
    await fs.writeFile(
      file,
      [
        'name: x',
        'defaults: { policy: auto }',
        'nodes:',
        '  open: { skill: a/b, exit: artifact proposal exists }',
        '  build.plan: { skill: c/d }',
        'transitions:',
        '  - { from: open, to: build.plan, policy: auto }',
        'adapters: {}',
        '',
      ].join('\n'),
    );
    const flow = await loadFlow(file);
    expect(flow.name).toBe('x');
    expect(flow.nodes['open'].phase).toBe('open');
    expect(flow.nodes['build.plan'].phase).toBe('build');
    expect(flow.nodes['open'].id).toBe('open');
    expect(flow.transitions[0].from).toBe('open');
  });

  it('respects explicit phase override', async () => {
    const file = path.join(dir, 'y.flow.yaml');
    await fs.writeFile(
      file,
      ['name: y', 'defaults: { policy: auto }', 'nodes:', '  a.b: { skill: s, phase: custom }', 'transitions: []', 'adapters: {}', ''].join('\n'),
    );
    const flow = await loadFlow(file);
    expect(flow.nodes['a.b'].phase).toBe('custom');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-load.test.ts`
Expected: FAIL（`loadFlow` 未定义）。

- [ ] **Step 3: 实现 load.ts**

```typescript
import { promises as fs } from 'fs';
import { parse } from 'yaml';
import type { FlowDefinition, FlowNode } from './types.js';

/** 阶段 = key 第一个点之前的前缀；无点则整个 key */
export function derivePhase(nodeId: string): string {
  const dot = nodeId.indexOf('.');
  return dot === -1 ? nodeId : nodeId.slice(0, dot);
}

export async function loadFlow(filePath: string): Promise<FlowDefinition> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const doc = parse(raw) as Partial<FlowDefinition>;

  if (!doc || typeof doc.name !== 'string') {
    throw new Error(`Invalid flow file (missing name): ${filePath}`);
  }

  const nodesIn = (doc.nodes ?? {}) as Record<string, Partial<FlowNode>>;
  const nodes: Record<string, FlowNode> = {};
  for (const [id, node] of Object.entries(nodesIn)) {
    nodes[id] = {
      ...node,
      id,
      phase: node.phase ?? derivePhase(id),
    } as FlowNode;
  }

  return {
    name: doc.name,
    defaults: { policy: doc.defaults?.policy ?? 'auto' },
    entry: doc.entry,
    nodes,
    transitions: doc.transitions ?? [],
    adapters: doc.adapters ?? {},
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-load.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/flow/load.ts test/ts/flow-load.test.ts
git commit -m "feat(flow): add yaml loader with phase derivation"
```

---

## Milestone 2：条件求值

### Task 3: 内建谓词 + shell 逃生口

**Files:**
- Create: `src/flow/predicates.ts`
- Test: `test/ts/flow-predicates.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, expect, it } from 'vitest';
import { evalCondition } from '../../src/flow/predicates.js';
import type { FlowState } from '../../src/flow/types.js';

function baseState(over: Partial<FlowState> = {}): FlowState {
  return {
    flow: 't',
    currentNode: 'n',
    artifacts: {},
    vars: {},
    history: [],
    pending: null,
    done: false,
    ...over,
  };
}

describe('evalCondition', () => {
  it('artifact exists', () => {
    const s = baseState({ artifacts: { proposal: 'p.md' } });
    expect(evalCondition('artifact proposal exists', s)).toBe(true);
    expect(evalCondition('artifact missing exists', s)).toBe(false);
  });

  it('var equality', () => {
    const s = baseState({ vars: { verify_result: 'pass' } });
    expect(evalCondition('var verify_result == pass', s)).toBe(true);
    expect(evalCondition('var verify_result != pass', s)).toBe(false);
    expect(evalCondition('var verify_result != fail', s)).toBe(true);
  });

  it('list is implicit AND', () => {
    const s = baseState({ artifacts: { a: '1', b: '2' } });
    expect(evalCondition(['artifact a exists', 'artifact b exists'], s)).toBe(true);
    expect(evalCondition(['artifact a exists', 'artifact c exists'], s)).toBe(false);
  });

  it('run uses exit code', () => {
    const s = baseState();
    expect(evalCondition({ run: 'exit 0' }, s)).toBe(true);
    expect(evalCondition({ run: 'exit 1' }, s)).toBe(false);
  });

  it('throws on unknown predicate', () => {
    const s = baseState();
    expect(() => evalCondition('frobnicate now', s)).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-predicates.test.ts`
Expected: FAIL（`evalCondition` 未定义）。

- [ ] **Step 3: 实现 predicates.ts**

```typescript
import { spawnSync } from 'child_process';
import type { Condition, FlowState } from './types.js';

function evalPredicate(text: string, state: FlowState): boolean {
  const tokens = text.trim().split(/\s+/);

  // artifact <name> exists
  if (tokens[0] === 'artifact' && tokens[2] === 'exists' && tokens.length === 3) {
    return state.artifacts[tokens[1]] != null;
  }

  // var <name> == <value> | var <name> != <value>
  if (tokens[0] === 'var' && (tokens[2] === '==' || tokens[2] === '!=')) {
    const actual = state.vars[tokens[1]];
    const expected = tokens.slice(3).join(' ');
    return tokens[2] === '==' ? actual === expected : actual !== expected;
  }

  throw new Error(`Unknown predicate: "${text}"`);
}

export function evalCondition(cond: Condition, state: FlowState): boolean {
  if (typeof cond === 'string') return evalPredicate(cond, state);
  if (Array.isArray(cond)) return cond.every((c) => evalPredicate(c, state));
  if (cond && typeof cond === 'object' && 'run' in cond) {
    const res = spawnSync(cond.run, { shell: true, stdio: 'ignore' });
    return res.status === 0;
  }
  throw new Error(`Invalid condition: ${JSON.stringify(cond)}`);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-predicates.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/flow/predicates.ts test/ts/flow-predicates.test.ts
git commit -m "feat(flow): add condition evaluator with built-in predicates and shell escape"
```

---

## Milestone 3：状态持久化

### Task 4: 读写 `.comet.flow.yaml`

**说明**：v1 使用独立状态文件 `.comet.flow.yaml`，与遗留 `.comet.yaml` 共存，避免破坏现有 `status` 命令（spec §10 的迁移留待后续计划）。

**Files:**
- Create: `src/flow/state-io.ts`
- Test: `test/ts/flow-state-io.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readFlowState, writeFlowState } from '../../src/flow/state-io.js';
import type { FlowState } from '../../src/flow/types.js';

describe('flow state io', () => {
  let dir: string;
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `flow-state-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns null when no state file', async () => {
    expect(await readFlowState(dir)).toBeNull();
  });

  it('round-trips state', async () => {
    const state: FlowState = {
      flow: 'classic',
      currentNode: 'build.plan',
      artifacts: { plan: 'p.md' },
      vars: { verify_result: 'pending' },
      history: ['open', 'design', 'build.plan'],
      pending: null,
      done: false,
    };
    await writeFlowState(dir, state);
    const loaded = await readFlowState(dir);
    expect(loaded).toEqual(state);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-state-io.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 state-io.ts**

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { parse, stringify } from 'yaml';
import type { FlowState } from './types.js';

const STATE_FILE = '.comet.flow.yaml';

export async function readFlowState(dir: string): Promise<FlowState | null> {
  const file = path.join(dir, STATE_FILE);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return parse(raw) as FlowState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeFlowState(dir: string, state: FlowState): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, STATE_FILE), stringify(state), 'utf-8');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-state-io.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/flow/state-io.ts test/ts/flow-state-io.test.ts
git commit -m "feat(flow): persist runtime state to .comet.flow.yaml"
```

---

## Milestone 4：引擎纯函数（核心）

### Task 5: decide + startFlow + enterNode

**Files:**
- Create: `src/flow/engine.ts`
- Test: `test/ts/flow-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, expect, it } from 'vitest';
import { startFlow, decide } from '../../src/flow/engine.js';
import type { FlowDefinition } from '../../src/flow/types.js';

function flow(over: Partial<FlowDefinition> = {}): FlowDefinition {
  return {
    name: 'classic',
    defaults: { policy: 'auto' },
    nodes: {
      open: { id: 'open', phase: 'open', skill: 'os/new', exit: 'artifact proposal exists' },
      design: { id: 'design', phase: 'design', skill: 'sp/brainstorm', policy: 'gate' },
    },
    transitions: [{ from: 'open', to: 'design', policy: 'auto' }],
    adapters: {},
    ...over,
  };
}

describe('startFlow + decide', () => {
  it('auto first node -> invoke_skill', () => {
    const { state, action } = startFlow(flow());
    expect(state.currentNode).toBe('open');
    expect(action).toEqual({
      type: 'invoke_skill',
      skill: 'os/new',
      handoff: { prompt: undefined, artifacts: {} },
    });
  });

  it('router entry -> classify_intent', () => {
    const f = flow({
      entry: { router: { classifyBy: 'agent', intents: [{ id: 'full', to: 'open', default: true }] } },
    });
    const { state, action } = startFlow(f);
    expect(state.currentNode).toBeNull();
    expect(action.type).toBe('classify_intent');
  });

  it('gate node entry -> await_confirm', () => {
    const f = flow();
    f.nodes.open.policy = 'gate';
    const { action } = startFlow(f);
    expect(action.type).toBe('await_confirm');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-engine.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 engine.ts 的 decide/startFlow/enterNode**

```typescript
import type { FlowAction, FlowDefinition, FlowNode, FlowState, FlowTransition } from './types.js';
import { evalCondition } from './predicates.js';

function nodePolicy(flow: FlowDefinition, node: FlowNode) {
  return node.policy ?? flow.defaults.policy;
}

function firstNodeId(flow: FlowDefinition): string {
  const ids = Object.keys(flow.nodes);
  if (ids.length === 0) throw new Error('flow has no nodes');
  return ids[0];
}

export function enterNode(flow: FlowDefinition, state: FlowState, nodeId: string): FlowState {
  const node = flow.nodes[nodeId];
  if (!node) throw new Error(`unknown node: ${nodeId}`);
  const pending =
    nodePolicy(flow, node) === 'gate'
      ? ({ kind: 'confirm', at: 'node', atId: nodeId } as const)
      : null;
  return {
    ...state,
    currentNode: nodeId,
    history: [...state.history, nodeId],
    pending,
  };
}

export function startFlow(flow: FlowDefinition): { state: FlowState; action: FlowAction } {
  const base: FlowState = {
    flow: flow.name,
    currentNode: null,
    artifacts: {},
    vars: {},
    history: [],
    pending: null,
    done: false,
  };
  const state = flow.entry?.router ? base : enterNode(flow, base, firstNodeId(flow));
  return { state, action: decide(flow, state) };
}

export function decide(flow: FlowDefinition, state: FlowState): FlowAction {
  if (state.done) return { type: 'done' };

  if (state.currentNode === null) {
    if (flow.entry?.router) {
      return { type: 'classify_intent', candidates: flow.entry.router.intents };
    }
    throw new Error('currentNode is null without router entry');
  }

  if (state.pending?.kind === 'confirm') return { type: 'await_confirm' };
  if (state.pending?.kind === 'hitl') {
    return { type: 'ask_user', hitl: { question: state.pending.question ?? '', options: state.pending.options ?? [] } };
  }

  const node = flow.nodes[state.currentNode];
  return {
    type: 'invoke_skill',
    skill: node.skill ?? '',
    handoff: { prompt: node.prompt, artifacts: state.artifacts },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-engine.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/flow/engine.ts test/ts/flow-engine.test.ts
git commit -m "feat(flow): add decide/startFlow/enterNode engine core"
```

### Task 6: selectTransition + proceedTransition + advance

**Files:**
- Modify: `src/flow/engine.ts`
- Test: `test/ts/flow-engine.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

```typescript
import { advance } from '../../src/flow/engine.js';

describe('advance', () => {
  it('guard_failed when exit not met', () => {
    const { state } = startFlow(flow()); // at open (auto), exit needs artifact proposal
    const { action } = advance(flow(), state);
    expect(action).toEqual({ type: 'guard_failed', reason: expect.stringContaining('exit') });
  });

  it('auto edge moves to next node after exit passes', () => {
    const f = flow();
    const started = startFlow(f);
    const withArtifact = { ...started.state, artifacts: { proposal: 'p.md' } };
    const { state, action } = advance(f, withArtifact);
    // design is gate -> await_confirm
    expect(state.currentNode).toBe('design');
    expect(action.type).toBe('await_confirm');
  });

  it('confirm@node advance clears pending then invokes', () => {
    const f = flow();
    f.nodes.open.policy = 'gate';
    const started = startFlow(f); // await_confirm at open
    const { state, action } = advance(f, started.state);
    expect(state.pending).toBeNull();
    expect(action.type).toBe('invoke_skill');
  });

  it('terminal node -> done', () => {
    const f = flow({
      nodes: {
        open: { id: 'open', phase: 'open', skill: 's', terminal: true },
      },
      transitions: [],
    });
    const started = startFlow(f);
    const { state, action } = advance(f, started.state);
    expect(state.done).toBe(true);
    expect(action.type).toBe('done');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-engine.test.ts`
Expected: FAIL（`advance` 未定义）。

- [ ] **Step 3: 在 engine.ts 追加实现**

```typescript
function edgePolicy(flow: FlowDefinition, t: FlowTransition) {
  return t.policy ?? flow.defaults.policy;
}

export function selectTransition(flow: FlowDefinition, state: FlowState): FlowTransition | null {
  const outgoing = flow.transitions.filter((t) => t.from === state.currentNode);
  for (const t of outgoing) {
    if (t.on == null || evalCondition(t.on, state)) return t;
  }
  return null;
}

function proceedTransition(flow: FlowDefinition, state: FlowState): FlowState {
  const node = flow.nodes[state.currentNode as string];
  const t = node.terminal ? null : selectTransition(flow, state);
  if (!t) return { ...state, done: true, pending: null };

  const policy = edgePolicy(flow, t);
  if (policy === 'gate') {
    return { ...state, pending: { kind: 'confirm', at: 'edge', atId: node.id, edgeTo: t.to } };
  }
  if (policy === 'hitl') {
    const hitl = t.hitl ?? { question: '', options: [] };
    return {
      ...state,
      pending: { kind: 'hitl', at: 'edge', atId: node.id, edgeTo: t.to, question: hitl.question, options: hitl.options },
    };
  }
  return enterNode(flow, state, t.to);
}

export function advance(flow: FlowDefinition, state: FlowState): { state: FlowState; action: FlowAction } {
  let next = state;

  if (state.pending?.kind === 'confirm') {
    next = state.pending.at === 'node'
      ? { ...state, pending: null }
      : enterNode(flow, state, state.pending.edgeTo as string);
    return { state: next, action: decide(flow, next) };
  }

  if (state.pending?.kind === 'hitl') {
    throw new Error('hitl pending requires answer(), not advance()');
  }

  // no pending => the invoke_skill just completed; validate exit guard
  const node = flow.nodes[state.currentNode as string];
  if (node.exit && !evalCondition(node.exit, state)) {
    return { state, action: { type: 'guard_failed', reason: `exit not satisfied: ${JSON.stringify(node.exit)}` } };
  }

  // before_advance hitl on the node (decision to leave)
  if (node.hitl && state.vars[`choice_${node.id}`] == null) {
    next = {
      ...state,
      pending: { kind: 'hitl', at: 'node', atId: node.id, question: node.hitl.question, options: node.hitl.options },
    };
    return { state: next, action: decide(flow, next) };
  }

  next = proceedTransition(flow, state);
  return { state: next, action: decide(flow, next) };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-engine.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/flow/engine.ts test/ts/flow-engine.test.ts
git commit -m "feat(flow): add transition selection and advance with exit guards"
```

### Task 7: answer + classify

**Files:**
- Modify: `src/flow/engine.ts`
- Test: `test/ts/flow-engine.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

```typescript
import { answer, classify } from '../../src/flow/engine.js';

describe('answer', () => {
  it('records choice and proceeds on node hitl', () => {
    const f = flow();
    f.nodes.open.hitl = { question: '确认?', options: [{ label: '继续' }, { label: '调整' }] };
    // simulate: at open with exit met, advance -> node hitl pending
    let s = { ...startFlow(f).state, artifacts: { proposal: 'p.md' } };
    s = advance(f, s).state; // pending hitl @ open
    expect(s.pending?.kind).toBe('hitl');
    const res = answer(f, s, '继续');
    expect(res.state.vars['choice_open']).toBe('继续');
    expect(res.state.currentNode).toBe('design');
  });

  it('option.to routes directly', () => {
    const f = flow();
    f.nodes.open.hitl = { question: 'q', options: [{ label: '跳过', to: 'design' }] };
    let s = { ...startFlow(f).state, artifacts: { proposal: 'p.md' } };
    s = advance(f, s).state;
    const res = answer(f, s, '跳过');
    expect(res.state.currentNode).toBe('design');
  });
});

describe('classify', () => {
  it('routes to intent target', () => {
    const f = flow({
      entry: { router: { classifyBy: 'agent', intents: [{ id: 'full', to: 'open', default: true }] } },
    });
    const s = startFlow(f).state;
    const res = classify(f, s, 'full');
    expect(res.state.currentNode).toBe('open');
    expect(res.action.type).toBe('invoke_skill');
  });

  it('throws on unknown intent', () => {
    const f = flow({
      entry: { router: { classifyBy: 'agent', intents: [{ id: 'full', to: 'open', default: true }] } },
    });
    const s = startFlow(f).state;
    expect(() => classify(f, s, 'nope')).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-engine.test.ts`
Expected: FAIL。

- [ ] **Step 3: 在 engine.ts 追加实现**

```typescript
export function answer(flow: FlowDefinition, state: FlowState, choice: string): { state: FlowState; action: FlowAction } {
  if (state.pending?.kind !== 'hitl') {
    throw new Error('answer() called without a pending hitl prompt');
  }
  const pending = state.pending;
  const option = (pending.options ?? []).find((o) => o.label === choice);
  const recorded: FlowState = {
    ...state,
    vars: { ...state.vars, [`choice_${pending.atId}`]: choice },
    pending: null,
  };

  let next: FlowState;
  if (option?.to) {
    next = enterNode(flow, recorded, option.to);
  } else if (pending.at === 'edge') {
    next = enterNode(flow, recorded, pending.edgeTo as string);
  } else {
    next = proceedTransition(flow, recorded);
  }
  return { state: next, action: decide(flow, next) };
}

export function classify(flow: FlowDefinition, state: FlowState, intentId: string): { state: FlowState; action: FlowAction } {
  const intent = flow.entry?.router.intents.find((i) => i.id === intentId);
  if (!intent) throw new Error(`unknown intent: ${intentId}`);
  const next = enterNode(flow, state, intent.to);
  return { state: next, action: decide(flow, next) };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-engine.test.ts`
Expected: PASS（全部 engine 测试）。

- [ ] **Step 5: 提交**

```bash
git add src/flow/engine.ts test/ts/flow-engine.test.ts
git commit -m "feat(flow): add answer (hitl) and classify (intent routing)"
```

---

## Milestone 5：校验

### Task 8: validateFlow

**Files:**
- Create: `src/flow/validate.ts`
- Test: `test/ts/flow-validate.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, expect, it } from 'vitest';
import { validateFlow } from '../../src/flow/validate.js';
import type { FlowDefinition } from '../../src/flow/types.js';

function flow(over: Partial<FlowDefinition> = {}): FlowDefinition {
  return {
    name: 'x',
    defaults: { policy: 'auto' },
    nodes: { open: { id: 'open', phase: 'open', skill: 'a/b' } },
    transitions: [],
    adapters: {},
    ...over,
  };
}

describe('validateFlow', () => {
  it('passes a minimal valid flow', () => {
    expect(validateFlow(flow())).toEqual([]);
  });

  it('flags transition to unknown node', () => {
    const errors = validateFlow(flow({ transitions: [{ from: 'open', to: 'ghost' }] }));
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('flags transition from unknown node', () => {
    const errors = validateFlow(flow({ transitions: [{ from: 'ghost', to: 'open' }] }));
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('flags router intent to unknown node', () => {
    const errors = validateFlow(
      flow({ entry: { router: { classifyBy: 'agent', intents: [{ id: 'i', to: 'ghost' }] } } }),
    );
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('flags skill without adapter entry only when adapters non-empty', () => {
    const errors = validateFlow(
      flow({ nodes: { open: { id: 'open', phase: 'open', skill: 'x/y' } }, adapters: { 'a/b': { invoke: 'cmd' } } }),
    );
    expect(errors.some((e) => e.includes('x/y'))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-validate.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 validate.ts**

```typescript
import type { FlowDefinition } from './types.js';

export function validateFlow(flow: FlowDefinition): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(Object.keys(flow.nodes));

  if (!flow.name) errors.push('flow: missing name');
  if (nodeIds.size === 0) errors.push('flow: no nodes defined');

  for (const t of flow.transitions) {
    if (!nodeIds.has(t.from)) errors.push(`transition.from references unknown node: ${t.from}`);
    if (!nodeIds.has(t.to)) errors.push(`transition.to references unknown node: ${t.to}`);
  }

  for (const intent of flow.entry?.router.intents ?? []) {
    if (!nodeIds.has(intent.to)) errors.push(`router intent "${intent.id}" -> unknown node: ${intent.to}`);
  }

  const adapterKeys = new Set(Object.keys(flow.adapters));
  if (adapterKeys.size > 0) {
    for (const node of Object.values(flow.nodes)) {
      if (node.skill && !adapterKeys.has(node.skill)) {
        errors.push(`node "${node.id}" skill "${node.skill}" has no adapter entry`);
      }
    }
  }

  return errors;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-validate.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/flow/validate.ts test/ts/flow-validate.test.ts
git commit -m "feat(flow): add flow validation (graph connectivity + adapters)"
```

---

## Milestone 6：图导出

### Task 9: toMermaid + toAscii

**Files:**
- Create: `src/flow/graph.ts`
- Test: `test/ts/flow-graph.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, expect, it } from 'vitest';
import { toMermaid, toAscii } from '../../src/flow/graph.js';
import type { FlowDefinition, FlowState } from '../../src/flow/types.js';

function flow(): FlowDefinition {
  return {
    name: 'classic',
    defaults: { policy: 'auto' },
    nodes: {
      open: { id: 'open', phase: 'open', skill: 'os/new' },
      'build.plan': { id: 'build.plan', phase: 'build', skill: 'sp/plan' },
      'build.tdd': { id: 'build.tdd', phase: 'build', skill: 'sp/tdd' },
    },
    transitions: [
      { from: 'open', to: 'build.plan', policy: 'auto' },
      { from: 'build.plan', to: 'build.tdd', policy: 'gate' },
    ],
    adapters: {},
  };
}

describe('toMermaid', () => {
  it('renders edges and phase subgraphs', () => {
    const out = toMermaid(flow());
    expect(out).toContain('flowchart');
    expect(out).toContain('open --> build.plan');
    expect(out).toContain('subgraph build');
  });

  it('highlights current node when state given', () => {
    const state = { currentNode: 'build.plan' } as FlowState;
    const out = toMermaid(flow(), state);
    expect(out).toContain('class build.plan current');
  });
});

describe('toAscii', () => {
  it('lists nodes grouped by phase', () => {
    const out = toAscii(flow());
    expect(out).toContain('[open]');
    expect(out).toContain('build:');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-graph.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 graph.ts**

```typescript
import { derivePhase } from './load.js';
import type { FlowDefinition, FlowState } from './types.js';

function groupByPhase(flow: FlowDefinition): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const id of Object.keys(flow.nodes)) {
    const phase = flow.nodes[id].phase ?? derivePhase(id);
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase)!.push(id);
  }
  return groups;
}

export function toMermaid(flow: FlowDefinition, state?: FlowState): string {
  const lines: string[] = ['flowchart TD'];
  for (const [phase, ids] of groupByPhase(flow)) {
    if (ids.length > 1) {
      lines.push(`  subgraph ${phase}`);
      for (const id of ids) lines.push(`    ${id}["${id}"]`);
      lines.push('  end');
    } else {
      lines.push(`  ${ids[0]}["${ids[0]}"]`);
    }
  }
  for (const t of flow.transitions) {
    const label = t.policy && t.policy !== 'auto' ? `|${t.policy}|` : '';
    lines.push(`  ${t.from} -->${label} ${t.to}`);
  }
  if (state?.currentNode) {
    lines.push(`  class ${state.currentNode} current`);
    lines.push('  classDef current fill:#fdd,stroke:#f00');
  }
  return lines.join('\n');
}

export function toAscii(flow: FlowDefinition, state?: FlowState): string {
  const lines: string[] = [`flow: ${flow.name}`];
  for (const [phase, ids] of groupByPhase(flow)) {
    if (ids.length > 1) {
      lines.push(`${phase}:`);
      for (const id of ids) lines.push(`  - [${id}]${state?.currentNode === id ? '  <- current' : ''}`);
    } else {
      lines.push(`[${ids[0]}]${state?.currentNode === ids[0] ? '  <- current' : ''}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-graph.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/flow/graph.ts test/ts/flow-graph.test.ts
git commit -m "feat(flow): add mermaid + ascii graph export with phase subgraphs"
```

---

## Milestone 7：CLI

### Task 10: `comet flow` 命令组

**说明**：状态存放目录由 `--change <dir>` 指定（默认当前目录）。`next` 输出 action JSON；`advance/answer/classify` 改状态后也打印新 action JSON，方便 driver 消费。

**Files:**
- Create: `src/commands/flow.ts`
- Modify: `src/cli/index.ts`
- Test: `test/ts/flow-cli.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { flowRun, flowNext, flowAdvance } from '../../src/commands/flow.js';

describe('flow cli', () => {
  let dir: string;
  let flowFile: string;
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `flow-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    flowFile = path.join(dir, 'c.flow.yaml');
    await fs.writeFile(
      flowFile,
      [
        'name: c',
        'defaults: { policy: auto }',
        'nodes:',
        '  open: { skill: a/b, exit: artifact proposal exists }',
        '  done: { skill: c/d, terminal: true }',
        'transitions:',
        '  - { from: open, to: done, policy: auto }',
        'adapters: {}',
        '',
      ].join('\n'),
    );
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function capture() {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    return () => {
      const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
      log.mockRestore();
      return out;
    };
  }

  it('run then next returns invoke_skill', async () => {
    await flowRun(flowFile, { change: dir });
    const done = capture();
    await flowNext({ change: dir });
    const out = done();
    expect(JSON.parse(out).type).toBe('invoke_skill');
  });

  it('advance with --set records artifact and reaches done', async () => {
    await flowRun(flowFile, { change: dir });
    await flowAdvance({ change: dir, set: ['proposal=p.md'] }); // open.exit met -> auto -> done terminal
    const done = capture();
    await flowNext({ change: dir });
    expect(JSON.parse(done()).type).toBe('done');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-cli.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 flow.ts**

```typescript
import path from 'path';
import { loadFlow } from '../flow/load.js';
import { readFlowState, writeFlowState } from '../flow/state-io.js';
import { startFlow, advance, answer, classify, decide } from '../flow/engine.js';
import { validateFlow } from '../flow/validate.js';
import { toMermaid, toAscii } from '../flow/graph.js';
import type { FlowDefinition, FlowState } from '../flow/types.js';

interface FlowOptions {
  change?: string;
  set?: string[];
}

function changeDir(opts: FlowOptions): string {
  return path.resolve(opts.change ?? '.');
}

function applySet(state: FlowState, set: string[] = []): FlowState {
  const artifacts = { ...state.artifacts };
  const vars = { ...state.vars };
  for (const pair of set) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    // heuristic: a path-like value is an artifact, otherwise a var
    if (value.includes('/') || value.includes('.')) artifacts[key] = value;
    else vars[key] = value;
  }
  return { ...state, artifacts, vars };
}

async function loadFlowForState(opts: FlowOptions, state: FlowState): Promise<FlowDefinition> {
  // flow definition path is stored alongside state via convention: <change>/<flow>.flow.yaml
  const file = path.join(changeDir(opts), `${state.flow}.flow.yaml`);
  return loadFlow(file);
}

function emit(action: unknown): void {
  console.log(JSON.stringify(action, null, 2));
}

export async function flowRun(flowFile: string, opts: FlowOptions): Promise<void> {
  const flow = await loadFlow(flowFile);
  const errors = validateFlow(flow);
  if (errors.length > 0) {
    console.error('Invalid flow:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  const { state, action } = startFlow(flow);
  // copy flow file into the change dir so subsequent commands can resolve it
  const dest = path.join(changeDir(opts), `${flow.name}.flow.yaml`);
  const fs = await import('fs');
  await fs.promises.mkdir(changeDir(opts), { recursive: true });
  await fs.promises.copyFile(flowFile, dest);
  await writeFlowState(changeDir(opts), state);
  emit(action);
}

export async function flowNext(opts: FlowOptions): Promise<void> {
  const state = await readFlowState(changeDir(opts));
  if (!state) throw new Error('no active flow; run `comet flow run` first');
  const flow = await loadFlowForState(opts, state);
  emit(decide(flow, state));
}

export async function flowAdvance(opts: FlowOptions): Promise<void> {
  let state = await readFlowState(changeDir(opts));
  if (!state) throw new Error('no active flow');
  const flow = await loadFlowForState(opts, state);
  state = applySet(state, opts.set);
  const res = advance(flow, state);
  await writeFlowState(changeDir(opts), res.state);
  emit(res.action);
}

export async function flowAnswer(choice: string, opts: FlowOptions): Promise<void> {
  const state = await readFlowState(changeDir(opts));
  if (!state) throw new Error('no active flow');
  const flow = await loadFlowForState(opts, state);
  const res = answer(flow, state, choice);
  await writeFlowState(changeDir(opts), res.state);
  emit(res.action);
}

export async function flowClassify(intentId: string, opts: FlowOptions): Promise<void> {
  const state = await readFlowState(changeDir(opts));
  if (!state) throw new Error('no active flow');
  const flow = await loadFlowForState(opts, state);
  const res = classify(flow, state, intentId);
  await writeFlowState(changeDir(opts), res.state);
  emit(res.action);
}

export async function flowStatus(opts: FlowOptions): Promise<void> {
  const state = await readFlowState(changeDir(opts));
  if (!state) {
    console.log('No active flow.');
    return;
  }
  console.log(`flow: ${state.flow}`);
  console.log(`current: ${state.currentNode ?? '(routing)'}`);
  console.log(`history: ${state.history.join(' -> ')}`);
  console.log(`done: ${state.done}`);
}

export async function flowValidate(flowFile: string): Promise<void> {
  const flow = await loadFlow(flowFile);
  const errors = validateFlow(flow);
  if (errors.length === 0) {
    console.log('OK');
    return;
  }
  console.error(errors.map((e) => `  - ${e}`).join('\n'));
  process.exitCode = 1;
}

export async function flowGraph(flowFile: string, opts: FlowOptions & { current?: boolean }): Promise<void> {
  const flow = await loadFlow(flowFile);
  const state = opts.current ? await readFlowState(changeDir(opts)) : null;
  console.log(toMermaid(flow, state ?? undefined));
  console.log('\n---\n');
  console.log(toAscii(flow, state ?? undefined));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-cli.test.ts`
Expected: PASS。

- [ ] **Step 5: 注册命令到 cli/index.ts**

在 `src/cli/index.ts` 顶部 import 后追加：

```typescript
import {
  flowRun,
  flowNext,
  flowAdvance,
  flowAnswer,
  flowClassify,
  flowStatus,
  flowValidate,
  flowGraph,
} from '../commands/flow.js';
```

在 `program.parse();` 之前插入：

```typescript
const flow = program.command('flow').description('Generic skill orchestration engine');

flow
  .command('run <file>')
  .description('Start a flow instance')
  .option('--change <dir>', 'State directory', '.')
  .action(async (file, options) => {
    await flowRun(file, options);
  });

flow
  .command('next')
  .description('Print the next action')
  .option('--change <dir>', 'State directory', '.')
  .action(async (options) => {
    await flowNext(options);
  });

flow
  .command('advance')
  .description('Validate exit guard and transition')
  .option('--change <dir>', 'State directory', '.')
  .option('--set <pair...>', 'Set artifact/var as key=value')
  .action(async (options) => {
    await flowAdvance(options);
  });

flow
  .command('answer <choice>')
  .description('Record a HITL decision')
  .option('--change <dir>', 'State directory', '.')
  .action(async (choice, options) => {
    await flowAnswer(choice, options);
  });

flow
  .command('classify <intentId>')
  .description('Record an Agent intent classification result')
  .option('--change <dir>', 'State directory', '.')
  .action(async (intentId, options) => {
    await flowClassify(intentId, options);
  });

flow
  .command('status')
  .description('Show flow runtime status')
  .option('--change <dir>', 'State directory', '.')
  .action(async (options) => {
    await flowStatus(options);
  });

flow
  .command('validate <file>')
  .description('Validate a flow file')
  .action(async (file) => {
    await flowValidate(file);
  });

flow
  .command('graph <file>')
  .description('Export flow topology (mermaid + ascii)')
  .option('--change <dir>', 'State directory', '.')
  .option('--current', 'Overlay runtime current node')
  .action(async (file, options) => {
    await flowGraph(file, options);
  });
```

- [ ] **Step 6: 全量测试 + 构建**

Run: `pnpm exec vitest run && pnpm run build`
Expected: 全绿，构建成功。

- [ ] **Step 7: 提交**

```bash
git add src/commands/flow.ts src/cli/index.ts test/ts/flow-cli.test.ts
git commit -m "feat(cli): add comet flow command group"
```

---

## Milestone 8：classic 预设 + driver SKILL.md

### Task 11: classic.flow.yaml

**Files:**
- Create: `assets/flows/classic.flow.yaml`
- Test: `test/ts/flow-validate.test.ts`（追加：加载真实资产校验）

- [ ] **Step 1: 追加资产校验测试**

```typescript
import { loadFlow } from '../../src/flow/load.js';
import path from 'path';

describe('classic.flow.yaml asset', () => {
  it('loads and validates clean', async () => {
    const file = path.resolve('assets/flows/classic.flow.yaml');
    const flow = await loadFlow(file);
    expect(validateFlow(flow)).toEqual([]);
    expect(flow.nodes['build.plan'].phase).toBe('build');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run test/ts/flow-validate.test.ts`
Expected: FAIL（文件不存在）。

- [ ] **Step 3: 创建 classic.flow.yaml**

```yaml
name: classic
defaults:
  policy: auto

entry:
  router:
    classifyBy: agent
    intents:
      - id: full
        when: "需要完整 OpenSpec 流程：新功能、跨模块、架构变更"
        to: open
        default: true

nodes:
  open:
    skill: openspec/opsx-new
    exit:
      - artifact proposal exists
      - artifact tasks exists
    hitl:
      question: "确认提案/设计/任务？"
      options: [{ label: 继续 }, { label: 调整 }]
    produces: [proposal, design, tasks]

  design:
    skill: superpowers/brainstorming
    policy: gate
    prompt: |
      重点关注与现有 OpenSpec 提案的一致性；
      设计必须给出 2-3 个方案对比并显式推荐其一。
    exit: artifact design_doc exists
    produces: [design_doc]

  build.plan:
    skill: superpowers/writing-plans
    exit: artifact plan exists
    produces: [plan]
  build.tdd:
    skill: superpowers/test-driven-development
    policy: auto
  build.review:
    skill: common/code-reviewer
    policy: gate
  build.commit:
    skill: common/git-workflow
    exit: var tasks_all_checked == true
    produces: [code_commits]

  verify:
    skill: comet/verify
    exit: var verify_result != pending
    produces: [verification_report]

  archive:
    skill: openspec/archive
    terminal: true

transitions:
  - { from: open, to: design, policy: auto }
  - { from: design, to: build.plan, policy: auto }
  - { from: build.plan, to: build.tdd, policy: auto }
  - { from: build.tdd, to: build.review, policy: auto }
  - { from: build.review, to: build.commit, policy: auto }
  - { from: build.commit, to: verify, policy: gate }
  - { from: verify, to: archive, on: "var verify_result == pass", policy: auto }
  - from: verify
    to: build.plan
    on: "var verify_result == fail"
    policy: hitl
    hitl:
      question: "修复还是接受偏差？"
      options: [{ label: 修复, to: build.plan }, { label: 接受, to: archive }]

adapters:
  openspec/opsx-new:
    invoke: "Skill(openspec:opsx-new)"
  superpowers/brainstorming:
    invoke: "Skill(superpowers:brainstorming)"
    doneCheck: artifact design_doc exists
    produces:
      design_doc: "docs/superpowers/specs/*-design.md"
  superpowers/writing-plans:
    invoke: "Skill(superpowers:writing-plans)"
    doneCheck: artifact plan exists
  superpowers/test-driven-development:
    invoke: "Skill(superpowers:test-driven-development)"
  common/code-reviewer:
    invoke: "Skill(common:code-reviewer)"
  common/git-workflow:
    invoke: "Skill(common:git-workflow)"
  comet/verify:
    invoke: "Skill(comet:verify)"
  openspec/archive:
    invoke: "Skill(openspec:archive)"
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run test/ts/flow-validate.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add assets/flows/classic.flow.yaml test/ts/flow-validate.test.ts
git commit -m "feat(assets): add classic.flow.yaml preset for the new engine"
```

### Task 12: driver SKILL.md（中文先行，再英文）

**说明**：遵循 AGENTS.md「中文先、确认后英文」。本任务两个文件成对落地；driver 内容取自 spec §8.2。

**Files:**
- Create: `assets/skills-zh/comet-flow/SKILL.md`
- Create: `assets/skills/comet-flow/SKILL.md`

> 用新目录 `comet-flow` 承载 v1 driver，避免覆盖现役 `comet` skill，便于灰度。后续计划再切换默认。

- [ ] **Step 1: 创建中文 driver**

`assets/skills-zh/comet-flow/SKILL.md`：

````markdown
---
name: comet-flow
description: 通用 skill 编排驱动器（引擎决策 + Agent 执行）
---

# Comet 驱动循环

你是编排执行器。**不要自己规划阶段顺序**——每一步都问引擎，忠实执行返回的动作。

## 启动

`comet flow run <flow文件> --change <change目录>`，拿到首个 action。

## 主循环

重复 `comet flow next --change <dir>`，按 `action.type` 执行，直到 `done`：

- **invoke_skill**：用 Skill 工具**真正触发** `action.skill`，以 `action.handoff`
  （含编排者自定义 `prompt` 与已登记 `artifacts`）为上下文。完成后产物落盘，
  调 `comet flow advance --change <dir> --set <name>=<path>` 登记产物并推进。
- **classify_intent**：对 `action.candidates`（每个含 `when` 自然语言判据）做语义意图识别，
  选出最匹配 `id` → `comet flow classify <id> --change <dir>`。
- **ask_user**：用 AskUserQuestion 呈现 `action.hitl.question` 与 `options`，
  得到选择 → `comet flow answer <choice> --change <dir>`。
- **await_confirm**：暂停，等用户说"继续" → `comet flow advance --change <dir>`。
- **guard_failed**：把 `action.reason` 交给自己修复（补产物/改状态），修完重试 advance。
- **done**：结束。

## 铁律

- **真正触发 skill，不是"看起来像触发"**——必须用 Skill 工具。
- **不跳步、不自创流程**：顺序、分支、退出门全听引擎。
- 拿不准意图就走 `classify_intent` 让引擎给候选，别自己拍脑袋路由。
- 断点恢复：任何时候重跑 `comet flow next` 即从 `.comet.flow.yaml` 续上。
````

- [ ] **Step 2: 创建英文 driver**

`assets/skills/comet-flow/SKILL.md`（同结构英文版）：

````markdown
---
name: comet-flow
description: Generic skill orchestration driver (engine decides, agent executes)
---

# Comet Driver Loop

You are the orchestration executor. **Do not plan the phase order yourself** — ask the engine each step and faithfully run the returned action.

## Start

`comet flow run <flow-file> --change <change-dir>` to get the first action.

## Main Loop

Repeat `comet flow next --change <dir>`, dispatch on `action.type` until `done`:

- **invoke_skill**: use the Skill tool to *actually trigger* `action.skill`, with
  `action.handoff` (orchestrator `prompt` + registered `artifacts`) as context. When the
  skill finishes and writes its artifacts, run
  `comet flow advance --change <dir> --set <name>=<path>` to register outputs and advance.
- **classify_intent**: semantically classify against `action.candidates` (each has a natural
  language `when`), pick the best `id` → `comet flow classify <id> --change <dir>`.
- **ask_user**: present `action.hitl.question` and `options` via AskUserQuestion,
  then `comet flow answer <choice> --change <dir>`.
- **await_confirm**: pause for the user's "continue" → `comet flow advance --change <dir>`.
- **guard_failed**: fix `action.reason` (produce artifacts / set state), then retry advance.
- **done**: finish.

## Hard Rules

- **Actually trigger skills** — must use the Skill tool, never simulate.
- **No skipping, no improvising** — order, branches, and exit gates come from the engine.
- When intent is unclear, use `classify_intent` candidates; do not route by guesswork.
- Resume: re-running `comet flow next` continues from `.comet.flow.yaml` anytime.
````

- [ ] **Step 3: 提交**

```bash
git add assets/skills-zh/comet-flow/SKILL.md assets/skills/comet-flow/SKILL.md
git commit -m "feat(skills): add comet-flow driver skill (zh + en)"
```

### Task 13: 接入 manifest

**Files:**
- Modify: `assets/manifest.json`

- [ ] **Step 1: 查看 manifest 结构**

Run: `cat assets/manifest.json`
Expected: 看清 skill 条目格式（路径、语言、hash 等）。

- [ ] **Step 2: 按既有格式追加 `comet-flow` 与 `flows/classic.flow.yaml` 两类条目**

参照已有 `comet` skill 条目，为 `comet-flow`（zh+en）补对应记录；若 manifest 用 hash 校验，按 `AGENTS.md` 的 `sha256sum`/`shasum` 规范生成。flow 资产若需纳管，新增 `assets/flows/classic.flow.yaml` 条目。

- [ ] **Step 3: 全量测试（含 manifest 一致性测试）**

Run: `pnpm exec vitest run`
Expected: 全绿（含 `comet-scripts.test.ts` 等对 manifest 的校验）。

- [ ] **Step 4: 提交**

```bash
git add assets/manifest.json
git commit -m "chore(assets): register comet-flow driver and classic flow in manifest"
```

---

## Milestone 9：收尾

### Task 14: CHANGELOG + 端到端冒烟

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 端到端冒烟（手动验证驱动闭环）**

```bash
mkdir -p /tmp/comet-smoke
node bin/comet.js flow run assets/flows/classic.flow.yaml --change /tmp/comet-smoke
node bin/comet.js flow next --change /tmp/comet-smoke
node bin/comet.js flow advance --change /tmp/comet-smoke --set proposal=openspec/changes/x/proposal.md --set tasks=openspec/changes/x/tasks.md
node bin/comet.js flow next --change /tmp/comet-smoke
node bin/comet.js flow graph assets/flows/classic.flow.yaml --change /tmp/comet-smoke --current
```

Expected: 第一个 `next` 输出 `classify_intent`（router）；`classify full` 后到 `open`；登记产物后命中 `open.hitl`；graph 高亮当前节点。按需补 `classify full`、`answer 继续` 等调用走完一段。

- [ ] **Step 2: 写 CHANGELOG 条目（置顶，版本与 package.json 对齐）**

```markdown
## What's Changed [0.4.0] - 2026-06-01

### Added

- **通用编排引擎**: 新增 `src/flow/`（types/load/predicates/engine/state-io/validate/graph）与 `comet flow` CLI（run/next/advance/answer/classify/status/validate/graph），用 `*.flow.yaml` 状态图编排任意 skill。
- **classic 预设**: `assets/flows/classic.flow.yaml` 用新引擎重写 open→design→build→verify→archive，多 skill 阶段以 `build.*` key 前缀分组。
- **driver skill**: `comet-flow`（中英）瘦驱动循环，引擎决策 + Agent 执行。

### Tests

- 新增 flow-load / flow-predicates / flow-engine / flow-state-io / flow-validate / flow-graph / flow-cli 七组测试，覆盖引擎纯函数与 CLI 闭环。
```

- [ ] **Step 3: 同步 package.json version 为 0.4.0**

Run: 编辑 `package.json` 的 `"version": "0.4.0"`。

- [ ] **Step 4: 全量测试 + lint + 构建**

Run: `pnpm exec vitest run && pnpm run lint && pnpm run build`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add CHANGELOG.md package.json
git commit -m "docs: changelog and version bump for flow engine v1 (0.4.0)"
```

---

## Self-Review 检查表（实现者完成后自检）

1. **Spec 覆盖**：状态机(engine)/退出门(predicates+advance)/意图识别(classify+router)/HITL(answer+pending)/断点恢复(state-io+decide 纯函数) 各有对应任务 ✔；五大特性 → 原子组件映射齐全。
2. **占位符扫描**：无 TBD/TODO；每个代码步骤给出完整实现。
3. **类型一致性**：`FlowState`/`FlowAction`/`Policy`/`Condition` 在 types.ts 定义，被 load/predicates/engine/graph/cli 一致引用；函数名 `decide/startFlow/enterNode/advance/answer/classify/selectTransition/proceedTransition` 全程一致。

## 非本计划范围（后续计划）

- `.comet.yaml` 旧字段 → 引擎状态的迁移脚本与 `status` 命令统一（spec §10）。
- hotfix/tweak 入口子图与 `classify:` 流中升级（spec §6.3 transition 语义判断）。
- handoff hash 校验落地（spec §7，复用 `comet-handoff.sh` 思路）。
- 默认 skill 由 `comet` 切换为 `comet-flow` 的灰度与文档更新。

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-01-comet-orchestration-engine.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每个 Task 派发新 subagent，任务间双段审查，迭代快。

**2. Inline Execution** - 本会话内用 executing-plans 批量执行 + 检查点。

**Which approach?**
