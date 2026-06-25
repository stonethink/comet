// Comet Dashboard frontend entry.
//
// Fetches /api/dashboard, owns the top-level state (selectedId / activeTab /
// currentView / query / snapshot), and delegates the DOM work to the small
// components in ./components/. Each component owns a subtree by id reference —
// there is no virtual DOM, just functions that produce HTML.

import {
  applySnapshot,
  getState,
  getSelected,
  getVisibleChanges,
  selectChange,
  setActiveTab,
  setLoading,
  setQuery,
  setView,
} from './state.js';
import { renderTopbar } from './components/topbar.js';
import { renderSummaryGrid } from './components/summary-grid.js';
import { renderEmptyState } from './components/empty-state.js';
import { renderChangesExplorer } from './components/changes-explorer.js';
import { renderSelectedDetail } from './components/selected-detail.js';
import { renderSidePanel } from './components/side-panel.js';
import { renderComposeView, renderEvalView } from './components/views.js';
import { DEMO_SKILL_VISUALS, DEMO_SNAPSHOT } from './demo.js';

document.addEventListener('DOMContentLoaded', () => {
  bindTabs();
  bindRefresh();
  bindKeyboardNav();
  bindSearch();
  bindRail();
  renderComposeView();
  renderEvalView();
  void loadSnapshot();
});

function bindTabs() {
  document.querySelectorAll('.changes-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      // Tabs filter the list view only — never re-target the selection.
      setActiveTab(tab.dataset.tab);
      renderChangesView();
    });
  });
}

function bindRefresh() {
  document.getElementById('refreshButton').addEventListener('click', () => {
    void loadSnapshot(true);
  });
}

function bindKeyboardNav() {
  const tabs = Array.from(document.querySelectorAll('.changes-tab'));
  tabs.forEach((tab, idx) => {
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(idx + dir + tabs.length) % tabs.length];
      next.focus();
      setActiveTab(next.dataset.tab);
      renderChangesView();
    });
  });
}

function bindSearch() {
  document.getElementById('searchInput').addEventListener('input', (event) => {
    setQuery(event.target.value);
    renderChangesView();
  });
}

function bindRail() {
  const rail = document.getElementById('rail');
  const scrim = document.getElementById('scrim');
  const openRail = () => {
    rail.classList.add('open');
    scrim.classList.add('open');
  };
  const closeRail = () => {
    rail.classList.remove('open');
    scrim.classList.remove('open');
  };

  document.getElementById('menuBtn').addEventListener('click', openRail);
  scrim.addEventListener('click', closeRail);

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      document
        .querySelectorAll('.nav-item')
        .forEach((x) => x.classList.toggle('active', x === item));
      setView(item.dataset.view);
      applyView();
      if (window.innerWidth < 1024) closeRail();
    });
  });
}

async function loadSnapshot(manual = false) {
  const button = document.getElementById('refreshButton');
  const label = document.getElementById('refreshLabel');
  setLoading(true);
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  label.textContent = '刷新中';

  const useDemo = new URLSearchParams(window.location.search).has('demo');

  try {
    if (useDemo) {
      applySnapshot(DEMO_SNAPSHOT);
      renderComposeView({ data: DEMO_SKILL_VISUALS.compose });
      renderEvalView({ data: DEMO_SKILL_VISUALS.eval });
    } else {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snapshot = await res.json();
      applySnapshot(snapshot);
      renderComposeView();
      renderEvalView();
    }
    renderChangesView();
    if (manual) {
      const selected = getSelected();
      const note = selected ? `状态已刷新，仍选中 ${selected.name}` : '状态已刷新';
      showToast(note);
    }
  } catch (error) {
    showToast(`刷新失败：${error.message}`);
  } finally {
    setLoading(false);
    button.setAttribute('aria-busy', 'false');
    button.disabled = false;
    label.textContent = '刷新状态';
  }
}

/**
 * Render the Changes view (the only data-backed section). Called whenever the
 * snapshot, selection, active tab, or search query changes.
 */
function renderChangesView() {
  const { snapshot } = getState();
  if (!snapshot) return;

  const selected = getSelected();

  renderTopbar({ project: snapshot.project });
  renderSummaryGrid({ snapshot, git: snapshot.git });
  renderEmptyState({ snapshot });
  renderChangesExplorer({
    visible: getVisibleChanges(),
    selectedId: getState().selectedId,
    activeTab: getState().activeTab,
    onSelect: handleCardClick,
  });

  const detailPanel = document.getElementById('detailPanel');
  const sidePanel = document.getElementById('sidePanel');
  if (!selected) {
    detailPanel.hidden = true;
    sidePanel.hidden = true;
    return;
  }
  detailPanel.hidden = false;
  sidePanel.hidden = false;

  renderSelectedDetail({ change: selected });
  renderSidePanel({ change: selected, git: snapshot.git });
  announceSelection(selected);
}

/**
 * Switch which top-level view section is visible. The Changes view holds the
 * live state machine; Compose / Eval are static (no data source yet).
 */
function applyView() {
  const { currentView } = getState();
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.dataset.view === currentView);
  });
}

function handleCardClick(id) {
  selectChange(id);
  renderChangesView();
}

function announceSelection(change) {
  document.getElementById('selectedAnnounce').textContent = `已选中 ${change.displayName}`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}
