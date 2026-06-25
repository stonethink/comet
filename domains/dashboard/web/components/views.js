// Compose / Eval view sections.
//
// The live dashboard collector currently reads openspec/changes only. These
// views accept optional demo data shaped after BundleAuthoringState and
// BundleEvalResult; without that data they render the command-oriented empty
// states.

import { escape, icon } from '../utils.js';

export function renderComposeView({ data } = {}) {
  const root = document.getElementById('composeView');
  if (!root) return;
  if (!data) {
    root.innerHTML = renderComposeEmpty();
    return;
  }

  const selected = data.bundles[0];
  root.innerHTML = `
    <div class="section-head">
      <h2>组合 Skill</h2>
      <span class="hint">查看组合产物、调用链路与发布准备度</span>
    </div>
    <section class="skill-workbench">
      <article class="skill-panel skill-list-panel">
        <div class="panel-header flat">
          <div>
            <h2 class="panel-title">组合列表</h2>
            <p class="panel-subtitle">候选、状态与下一步</p>
          </div>
          <span class="pill status-current">${data.bundles.length} 个</span>
        </div>
        <div class="skill-card-list">
          ${data.bundles.map(renderBundleCard).join('')}
        </div>
      </article>
      <article class="skill-panel skill-detail-panel">
        <div class="panel-header flat">
          <div>
            <h2 class="panel-title">${escape(selected.name)}</h2>
            <p class="panel-subtitle">${escape(selected.name)}</p>
          </div>
          <span class="pill ${bundleStatusClass(selected.status)}">${bundleStatusLabel(selected.status)}</span>
        </div>
        <div class="skill-detail-body">
          <p class="skill-goal">${escape(selected.goal)}</p>
          <div class="skill-detail-grid">
            <section class="card-block">
              <div class="cb-head">
                <h4>调用链路</h4>
                <span class="pill mono">${selected.callChain.length} 步</span>
              </div>
              ${renderCallChain(selected.callChain)}
            </section>
            <section class="card-block">
              <div class="cb-head">
                <h4>生成产物</h4>
                <span class="pill mono">${selected.generatedControlPlane.length} 个</span>
              </div>
              ${renderControlPlane(selected)}
            </section>
          </div>
        </div>
      </article>
      <aside class="skill-side-stack">
        ${renderComposeSidePanel(data.summary, selected)}
      </aside>
    </section>
  `;
}

export function renderEvalView({ data } = {}) {
  const root = document.getElementById('evalView');
  if (!root) return;
  if (!data) {
    root.innerHTML = renderEvalEmpty();
    return;
  }

  const selected = data.results[0];
  root.innerHTML = `
    <div class="section-head">
      <h2>评估 Skill</h2>
      <span class="hint">查看评估结果、检查项、基准对比与运行成本</span>
    </div>
    <section class="skill-workbench">
      <article class="skill-panel skill-list-panel">
        <div class="panel-header flat">
          <div>
            <h2 class="panel-title">评估结果</h2>
            <p class="panel-subtitle">通过率、证据与摘要</p>
          </div>
          <span class="pill ${selected.passed ? 'tag-ok' : 'tag-danger'}">
            ${selected.passed ? '通过' : '失败'}
          </span>
        </div>
        <div class="eval-card-list">
          ${data.results.map(renderEvalResultCard).join('')}
        </div>
      </article>
      <article class="skill-panel skill-detail-panel">
        <div class="panel-header flat">
          <div>
            <h2 class="panel-title">${escape(selected.name)}</h2>
            <p class="panel-subtitle">${escape(selected.name)}</p>
          </div>
          <span class="pill ${selected.passed ? 'tag-ok' : 'tag-danger'}">${selected.passed ? '通过' : '失败'}</span>
        </div>
        <div class="skill-detail-body">
          <p class="skill-goal">${evalSummaryLabel(selected.summary)}</p>
          <div class="skill-detail-grid">
            <section class="card-block">
              <div class="cb-head">
                <h4>入口覆盖</h4>
                <span class="pill mono">${selected.entries.length} 项</span>
              </div>
              <div class="entry-list compact">
                ${selected.entries.map(renderEntryRow).join('')}
              </div>
            </section>
            <section class="card-block">
              <div class="cb-head">
                <h4>基准对比</h4>
                <span class="pill mono">${selected.benchmark.cases} 例</span>
              </div>
              ${renderBenchmark(selected)}
            </section>
          </div>
        </div>
      </article>
      <aside class="skill-side-stack">
        ${renderEvalSidePanel(data.summary, selected, data.results)}
      </aside>
    </section>
  `;
}

function renderComposeEmpty() {
  return `
    <div class="section-head">
      <h2>组合 Skill</h2>
      <span class="hint">把原子 Skill 组合为多阶段工作流（comet bundle factory-*）</span>
    </div>
    <div class="view-list">
      <article class="view-card">
        <div class="vc-head">
          <span style="color: var(--meta)">${icon('i-box', 30, 30)}</span>
          <div class="vc-title">暂无组合 Skill 数据</div>
          <p class="vc-meta">
            仪表盘目前只采集 openspec/changes 变更数据。当组合 Skill（bundle）的采集接入后，
            此处将展示每个 bundle 的调用链、选择项与生成问题。
          </p>
        </div>
        <div class="vc-cmds">
          <code>$ comet bundle factory-propose &lt;name&gt;</code>
          <code>$ comet bundle factory-generate &lt;name&gt;</code>
        </div>
      </article>
    </div>
  `;
}

function renderEvalEmpty() {
  return `
    <div class="section-head">
      <h2>评估 Skill</h2>
      <span class="hint">编译 / 安全 / 运行时 / 基准对比</span>
    </div>
    <div class="view-list">
      <article class="view-card">
        <div class="vc-head">
          <span style="color: var(--meta)">${icon('i-alert', 30, 30)}</span>
          <div class="vc-title">暂无评估结果</div>
          <p class="vc-meta">
            仪表盘目前只采集 openspec/changes 变更数据。当 Skill 评估（comet eval）的结果接入后，
            此处将展示 bundle 的编译/安全检查、entry 通过率与基准对比。
          </p>
        </div>
        <div class="vc-cmds">
          <code>$ comet eval run --skill-path &lt;bundle&gt; --quick</code>
          <code>$ comet eval run --skill-path &lt;bundle&gt; --full</code>
        </div>
      </article>
    </div>
  `;
}

function renderComposeSummary(summary) {
  return `
    <section class="skill-kpi-grid" aria-label="组合 Skill 概览">
      ${renderSkillKpi('草稿', summary.drafts, '组合状态')}
      ${renderSkillKpi('评估通过', summary.evalPassed, '已通过')}
      ${renderSkillKpi('审阅通过', summary.reviewApproved, '已通过')}
      ${renderSkillKpi('目标平台', summary.targetPlatforms, '分发目标')}
    </section>
  `;
}

function renderEvalSummary(summary) {
  return `
    <section class="skill-kpi-grid" aria-label="评估 Skill 概览">
      ${renderSkillKpi('评估结果', summary.totalResults, `${summary.passedResults} 个通过`)}
      ${renderSkillKpi('入口通过率', formatPercent(summary.entryPassRate), '加权平均')}
      ${renderSkillKpi('Token', formatCompact(summary.tokenCount), '总工作量')}
      ${renderSkillKpi('耗时', formatDuration(summary.durationMs), '总耗时')}
    </section>
  `;
}

function renderSkillKpi(label, value, note) {
  return `
    <article class="skill-kpi">
      <span>${escape(label)}</span>
      <strong>${escape(value)}</strong>
      <small>${escape(note)}</small>
    </article>
  `;
}

function renderBundleCard(bundle) {
  return `
    <article class="bundle-card">
      <div class="bundle-card-main">
        <div class="bundle-title-row">
          <h3>${escape(bundle.name)}</h3>
          <span class="pill ${bundleStatusClass(bundle.status)}">${bundleStatusLabel(bundle.status)}</span>
        </div>
        <p>${escape(bundle.goal)}</p>
        <div class="bundle-meta-row">
          <span>${modeLabel(bundle.mode)}</span>
          <span>${engineModeLabel(bundle.engineMode)}</span>
          <span>${runnerModeLabel(bundle.runnerMode)}</span>
          <span>下一步 ${stepLabel(bundle.currentStep)}</span>
        </div>
      </div>
      <div class="reuse-list">
        ${bundle.reusedSkills.map(renderReusedSkill).join('')}
      </div>
    </article>
  `;
}

function renderReusedSkill(skill) {
  const status =
    skill.status === 'available'
      ? 'tag-ok'
      : skill.status === 'ambiguous'
        ? 'tag-warn'
        : 'tag-danger';
  return `
    <span class="reuse-chip ${status}">
      ${escape(skill.skill)}
      <small>${skill.sourceCount} 处</small>
    </span>
  `;
}

function renderCallChain(chain) {
  return `
    <ol class="chain-list">
      ${chain
        .map(
          (step, index) => `
            <li>
              <span class="chain-index">${String(index + 1).padStart(2, '0')}</span>
              <span class="chain-name">${escape(step)}</span>
            </li>
          `,
        )
        .join('')}
    </ol>
  `;
}

function renderControlPlane(bundle) {
  return `
    <div class="control-plane-list">
      ${bundle.generatedControlPlane
        .map(
          (item) => `
            <div class="control-row">
              <span class="control-dot dot-ok"></span>
              <span class="mono">${escape(item)}</span>
            </div>
          `,
        )
        .join('')}
    </div>
    <div class="confirm-list">
      ${bundle.requiredConfirmations
        .map(
          (item) => `
            <div class="confirm-row ${item.confirmed ? 'confirmed' : ''}">
              <span>${confirmationLabel(item.label)}</span>
              <small>${item.required ? '必需' : '可选'}</small>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderDistribution(distribution) {
  return `
    <div class="distribution-grid">
      <div class="distribution-stat">
        <span>计划文件</span>
        <strong>${distribution.plannedFiles}</strong>
      </div>
      <div class="distribution-stat">
        <span>可执行项</span>
        <strong>${distribution.executables}</strong>
      </div>
      <div class="platform-list">
        ${distribution.platforms
          .map(
            (platform) => `
              <div class="platform-row">
                <span>${escape(platform.platform)}</span>
                <small>${platformStatusLabel(platform.status)}</small>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderEvalResultCard(result) {
  return `
    <article class="eval-result-card ${result.passed ? '' : 'is-failed'}">
      <div class="eval-result-head">
        <div>
          <h3>${escape(result.name)}</h3>
          <p>${evalSummaryLabel(result.summary)}</p>
        </div>
        <span class="pill ${result.passed ? 'tag-ok' : 'tag-danger'}">${evalLevelLabel(result.level)}</span>
      </div>
      <div class="entry-list compact">
        ${result.entries.map(renderEntryRow).join('')}
      </div>
    </article>
  `;
}

function renderEntryRow(entry) {
  return `
    <div class="entry-row">
      <div>
        <strong>${escape(entry.id)}</strong>
        <small>${entry.evidence.map(escape).join(', ')}</small>
      </div>
      <div class="entry-rate">
        <span>${formatPercent(entry.passRate)}</span>
        <i style="--rate: ${Math.round(entry.passRate * 100)}%"></i>
      </div>
      <span class="status-chip ${entry.passed ? 'st-done' : 'st-failed'}">
        ${entry.passed ? '通过' : '失败'}
      </span>
    </div>
  `;
}

function renderGateStatus(result) {
  const gates = [
    ['编译', result.bundle.compilePassed, result.bundle.evidence[0] ?? 'compile evidence'],
    ['安全', result.bundle.safetyPassed, result.bundle.evidence[1] ?? 'safety evidence'],
    ['总体', result.passed, providerLabel(result.provider)],
  ];
  return `
    <div class="gate-list">
      ${gates
        .map(
          ([label, passed, evidence]) => `
            <div class="gate-row ${passed ? 'passed' : 'failed'}">
              <span class="gate-mark">${passed ? icon('i-check', 14, 14) : '!'}</span>
              <div>
                <strong>${escape(label)}</strong>
                <small>${escape(evidence)}</small>
              </div>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderBenchmark(result) {
  const baseline = Math.round(result.benchmark.baselinePassRate * 100);
  const withSkill = Math.round(result.benchmark.withSkillPassRate * 100);
  return `
    <div class="benchmark-bars">
      ${renderBenchmarkBar('基线', baseline)}
      ${renderBenchmarkBar('使用 Skill', withSkill)}
    </div>
    <div class="benchmark-meta">
      <span>${result.benchmark.cases} 个样例</span>
      <span>${formatCompact(result.benchmark.tokenCount)} token</span>
      <span>${formatDuration(result.benchmark.durationMs)}</span>
      ${
        result.benchmark.variance == null
          ? ''
          : `<span>波动 ${formatPercent(result.benchmark.variance)}</span>`
      }
    </div>
  `;
}

function renderBenchmarkBar(label, value) {
  return `
    <div class="benchmark-row">
      <span>${escape(label)}</span>
      <div class="bar-track"><i style="--bar: ${value}%"></i></div>
      <strong>${value}%</strong>
    </div>
  `;
}

function renderEvalCost(results) {
  const totalTokens = results.reduce((sum, result) => sum + result.benchmark.tokenCount, 0);
  const totalDuration = results.reduce((sum, result) => sum + result.benchmark.durationMs, 0);
  const failed = results.filter((result) => !result.passed).length;
  return `
    <div class="cost-stack">
      ${renderCostRow('Token 工作量', formatCompact(totalTokens))}
      ${renderCostRow('总耗时', formatDuration(totalDuration))}
      ${renderCostRow('失败结果', failed)}
    </div>
  `;
}

function renderCostRow(label, value) {
  return `
    <div class="cost-row">
      <span>${escape(label)}</span>
      <strong>${escape(value)}</strong>
    </div>
  `;
}

function renderComposeSidePanel(summary, selected) {
  return `
    <article class="card command-card">
      <div class="card-head">
        <h3>下一步建议</h3>
        <span class="pill">${stepLabel(selected.currentStep)}</span>
      </div>
      <div class="cmd">
        <span class="prompt">$</span>
        <code>comet publish review ${escape(selected.name)}</code>
      </div>
      <p class="body-copy">
        当前组合已生成 ${selected.generatedControlPlane.length} 个产物，${selected.requiredConfirmations.filter((item) => item.confirmed).length} 个确认项已完成。
      </p>
    </article>
    <article class="card">
      <div class="card-head">
        <h3>组合概览</h3>
        <span class="pill">${summary.drafts} 个草稿</span>
      </div>
      <div class="side-metric-list">
        ${renderSideMetric('评估通过', summary.evalPassed)}
        ${renderSideMetric('审阅通过', summary.reviewApproved)}
        ${renderSideMetric('目标平台', summary.targetPlatforms)}
      </div>
    </article>
    <article class="card">
      <div class="card-head">
        <h3>发布预览</h3>
        <span class="pill">${readinessLabel(selected.distribution.readiness)}</span>
      </div>
      ${renderDistribution(selected.distribution)}
    </article>
  `;
}

function renderEvalSidePanel(summary, selected, results) {
  return `
    <article class="card command-card">
      <div class="card-head">
        <h3>下一步建议</h3>
        <span class="pill">${selected.passed ? '可复核' : '需处理'}</span>
      </div>
      <div class="cmd">
        <span class="prompt">$</span>
        <code>comet eval run --quick</code>
      </div>
      <p class="body-copy">
        当前通过率 ${formatPercent(summary.entryPassRate)}，${summary.passedResults}/${summary.totalResults} 个结果通过。
      </p>
    </article>
    <article class="card">
      <div class="card-head">
        <h3>检查项</h3>
        <span class="pill">${selected.passed ? '通过' : '失败'}</span>
      </div>
      ${renderGateStatus(selected)}
    </article>
    <article class="card">
      <div class="card-head">
        <h3>运行成本</h3>
        <span class="pill">${results.length} 次</span>
      </div>
      ${renderEvalCost(results)}
    </article>
  `;
}

function renderSideMetric(label, value) {
  return `
    <div class="side-metric">
      <span>${escape(label)}</span>
      <strong>${escape(value)}</strong>
    </div>
  `;
}

function bundleStatusClass(status) {
  return status === 'ready' || status === 'review-approved'
    ? 'tag-ok'
    : status === 'eval-passed'
      ? 'tag-warn'
      : 'tag-neutral';
}

function bundleStatusLabel(status) {
  return (
    {
      draft: '草稿',
      'eval-passed': '评估通过',
      'review-approved': '审阅通过',
      ready: '可发布',
      'drift-conflict': '有漂移',
    }[status] ?? escape(status)
  );
}

function modeLabel(mode) {
  return mode === 'optimize' ? '优化现有 Skill' : '创建 Skill';
}

function engineModeLabel(mode) {
  return mode === 'adaptive' ? '自适应引擎' : mode === 'none' ? '无引擎' : '确定性引擎';
}

function runnerModeLabel(mode) {
  return mode === 'standalone' ? '独立运行' : '变更流';
}

function stepLabel(step) {
  return (
    {
      publish: '发布复核',
      review: '等待审阅',
      'needs-eval': '等待评估',
      'needs-generation': '生成产物',
    }[step] ?? escape(step)
  );
}

function confirmationLabel(label) {
  return (
    {
      'Factory proposal confirmed': '方案已确认',
      'Eval result attached': '评估结果已绑定',
      'Review approved': '审阅已通过',
      'Executable disclosure reviewed': '可执行项待确认',
      'Resolved Skill choices': 'Skill 选择已确认',
      'Authoring lanes complete': '作者分工已完成',
      'Run quick eval': '快速评估已执行',
      'Resolve ambiguous GitHub Skill': '需确认 GitHub Skill',
      'Generate control plane': '需生成控制面',
    }[label] ?? escape(label)
  );
}

function readinessLabel(value) {
  return (
    {
      publishable: '可发布',
      'needs review approval': '待审阅',
      'blocked by candidate ambiguity': '候选不明确',
    }[value] ?? escape(value)
  );
}

function platformStatusLabel(value) {
  return (
    {
      previewed: '已预览',
      planned: '已计划',
      waiting: '等待中',
      'capability warning': '能力提示',
    }[value] ?? escape(value)
  );
}

function evalLevelLabel(level) {
  return level === 'full' ? '完整评估' : '快速评估';
}

function providerLabel(provider) {
  return provider === 'native-skill-creator' ? '原生生成器' : 'Comet 回退';
}

function evalSummaryLabel(summary) {
  return (
    {
      'Generated package passed route conformance, control-plane validation, and publish readiness.':
        '生成包已通过路由一致性、控制面校验和发布准备度检查。',
      'Quick eval passed authoring-lane coverage, entry smoke, and install-preview checks.':
        '快速评估已通过作者分工覆盖、入口冒烟和安装预览检查。',
      'Entry smoke found one unresolved GitHub Skill candidate and a missing hook disclosure.':
        '入口冒烟发现 GitHub Skill 候选未确认，并缺少 hook 披露。',
    }[summary] ?? escape(summary)
  );
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function formatCompact(value) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact' }).format(Number(value));
}

function formatDuration(ms) {
  const seconds = Math.round(Number(ms) / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
