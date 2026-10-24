// V3 artboards: the shell (top bar, right rail, status bar) drawn from data attributes, so
// every artboard shows the same shell. Load before icons.js.
//   <header data-shell="top" data-stage="plan" data-progress="100,40,0,0"></header>
//   <nav data-shell="rail" data-on="overview" data-live></nav>
//   <footer data-shell="status" data-ctx="34" data-changes="+12 -3"></footer>
(function () {
  const STAGES = [
    ['plan', 'Plan'],
    ['design', 'Design'],
    ['development', 'Development'],
    ['deployment', 'Deployment'],
  ];
  const RAIL = [
    ['overview', 'layout-dashboard', 'Overview'],
    ['live', 'activity', 'Live'],
    ['github', 'git-pull-request', 'GitHub'],
    ['chat', 'message-square', 'Chat'],
  ];

  function top(el) {
    const on = el.dataset.stage;
    const p = (el.dataset.progress || '0,0,0,0').split(',').map(Number);
    const tabs = STAGES.map(([id, name], i) => {
      const done = p[i] >= 100;
      return `<button class="stage${id === on ? ' on' : ''}${done ? ' complete' : ''}" aria-current="${id === on ? 'page' : 'false'}">
        <span class="n">0${i + 1}</span>${name}${done ? '<i data-i="check" data-s="13" data-w="2.25" class="done"></i>' : ''}
        <span class="track"><i style="width:${p[i]}%"></i></span></button>`;
    }).join('');
    el.className = 'top';
    el.innerHTML = `
      <div class="top-left">
        <img class="badge" src="../../brand/cherry-badge.png" alt="">
        <i data-wordmark data-h="14"></i>
        <span class="slash">/</span>
        <button class="proj">${el.dataset.project || 'runlog'}<i data-i="chevrons-up-down" data-s="13"></i></button>
      </div>
      <nav class="stages" aria-label="Stages">${tabs}</nav>
      <div class="top-right">
        <button class="btn ghost sm" style="gap:8px"><i data-i="search" data-s="13"></i>Search or run a command<kbd>Ctrl K</kbd></button>
        <button class="ibtn" aria-label="Settings"><i data-i="settings" data-s="16"></i></button>
      </div>`;
  }

  function rail(el) {
    const on = el.dataset.on;
    el.className = 'rail';
    el.setAttribute('aria-label', 'Side views');
    el.innerHTML =
      RAIL.map(
        ([id, icon, name]) =>
          `<button class="ibtn${id === on ? ' on' : ''}" aria-label="${name}" title="${name}"><i data-i="${icon}" data-s="17"></i>${
            id === 'live' && el.hasAttribute('data-live') ? '<span class="badge-dot"></span>' : ''
          }</button>`,
      ).join('') +
      `<span class="sp"></span><button class="ibtn" aria-label="Hide side views (Ctrl B)" title="Ctrl B"><i data-i="panel-right" data-s="17"></i></button>`;
  }

  function status(el) {
    const d = el.dataset;
    const ctx = Number(d.ctx || 34);
    el.className = 'status';
    el.innerHTML = `
      <span class="it"><i data-i="git-branch" data-s="12"></i>${d.branch || 'main'}</span>
      <span class="it">${d.sync || '↑1 ↓0'}</span>
      <span class="it">${(d.changes || '+12 -3').replace(/(\+\d+)/, '<span class="add">$1</span>').replace(/(-\d+)/, '<span class="del">$1</span>')}</span>
      ${d.run ? `<span class="it"><span class="dot live"></span>${d.run}</span>` : ''}
      <span class="grow"></span>
      ${d.agent ? `<span class="it" style="color:var(--t2)">${d.agent}</span>` : ''}
      <span class="it">${d.model || 'Opus'}</span>
      <span class="it">ctx <span class="bar"><i style="width:${ctx}%"></i></span>${ctx}%</span>
      <span class="it">5h 29% · wk 71%</span>
      <span class="it"><span class="dot ok"></span>Claude Code</span>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-shell="top"]').forEach(top);
    document.querySelectorAll('[data-shell="rail"]').forEach(rail);
    document.querySelectorAll('[data-shell="status"]').forEach(status);
  });
})();
