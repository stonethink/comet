// Topbar: project name + path. The phase context for the selected change
// already lives in the detail panel header, so the topbar stays minimal.

export function renderTopbar({ project }) {
  document.getElementById('projectName').textContent = '项目仪表盘';
  document.getElementById('projectPath').textContent = project.path || '—';
}
