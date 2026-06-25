// Task progress card: an SVG ring + fraction, the task section table, and the
// remaining-task list. Renders into #taskProgressWrap (ring + fraction),
// #taskTable, and #remainingTasks.

import { escape } from '../utils.js';
import { SECTION_LABEL, SECTION_STATUS_CLASS } from './constants.js';

export function renderTaskProgress({ change }) {
  const percent = change.tasks.total
    ? Math.round((change.tasks.completed / change.tasks.total) * 100)
    : 0;

  document.getElementById('taskPercent').textContent = `${percent}%`;
  renderRing(percent, change);
  animateRing(percent);
  renderTaskTable(change);
  renderRemainingTasks(change);
}

function renderRing(percent, change) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - percent / 100);
  const remaining = change.tasks.total - change.tasks.completed;
  const note = remaining > 0 ? `剩余 ${remaining} 项未完成` : '全部任务已完成';
  const doneSections = change.tasks.sections.filter((section) => section.status === 'done').length;
  const totalSections = change.tasks.sections.length;
  document.getElementById('taskProgressWrap').innerHTML = `
    <div class="task-ring-row">
      <div class="ring">
        <svg width="84" height="84">
          <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--border-soft)" stroke-width="8"/>
          <circle
            class="ring-progress"
            cx="42" cy="42" r="${r}" fill="none"
            stroke="var(--accent)" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
            data-circ="${circ}" data-target="${off}"
          />
        </svg>
        <div class="ring-val" data-target="${percent}">0%</div>
      </div>
      <div>
        <div class="task-frac">${change.tasks.completed}<span class="of"> / ${change.tasks.total} 任务</span></div>
        <div class="desc" style="margin-top:4px">${escape(note)}</div>
      </div>
    </div>
    <div class="task-mini-grid" aria-label="任务进度摘要">
      <div class="task-mini">
        <span>已完成</span>
        <strong>${change.tasks.completed}</strong>
      </div>
      <div class="task-mini">
        <span>剩余</span>
        <strong>${Math.max(remaining, 0)}</strong>
      </div>
      <div class="task-mini">
        <span>分组</span>
        <strong>${doneSections}/${totalSections || 0}</strong>
      </div>
    </div>
    <div class="task-next-line">
      <span class="task-next-dot"></span>
      <span>${escape(note)}，完成后进入 Verify。</span>
    </div>
  `;
}

function animateRing(targetPercent) {
  const wrap = document.getElementById('taskProgressWrap');
  const progress = wrap.querySelector('.ring-progress');
  const value = wrap.querySelector('.ring-val');
  if (!progress || !value) return;

  const circ = Number(progress.dataset.circ);
  const targetOffset = Number(progress.dataset.target);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    progress.setAttribute('stroke-dashoffset', String(targetOffset));
    value.textContent = `${targetPercent}%`;
    return;
  }

  const duration = 760;
  const start = performance.now();
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function tick(now) {
    const elapsed = Math.min((now - start) / duration, 1);
    const eased = easeOut(elapsed);
    const currentPercent = Math.round(targetPercent * eased);
    const offset = circ - (circ - targetOffset) * eased;

    progress.setAttribute('stroke-dashoffset', String(offset));
    value.textContent = `${currentPercent}%`;

    if (elapsed < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function renderTaskTable(change) {
  const body = change.tasks.sections.length
    ? change.tasks.sections.map(renderTaskSectionRow).join('')
    : '<div class="tt-row"><span class="tt-name muted">暂无任务分组</span><span></span><span></span></div>';

  document.getElementById('taskTable').innerHTML = body;
}

function renderTaskSectionRow(section) {
  const cls = SECTION_STATUS_CLASS[section.status] ?? 'st-pending';
  const label = SECTION_LABEL[section.status] ?? SECTION_LABEL.pending;
  return `
    <div class="tt-row">
      <span class="tt-name">${escape(section.title)}</span>
      <span class="tt-frac">${section.completed}/${section.total}</span>
      <span class="status-chip ${cls}">${escape(label)}</span>
    </div>
  `;
}

function renderRemainingTasks(change) {
  const list = document.getElementById('remainingTasks');
  if (change.tasks.incomplete.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = change.tasks.incomplete
    .slice(0, 12)
    .map((task) => `<li>${escape(task)}</li>`)
    .join('');
}
