// ── STATE ──────────────────────────────────────────────────
const STATE_KEY = 'va_timetracker_v1';
let state = {
  clients: [],
  projects: [],
  tasks: [],
  entries: [],
  timer: { running: false, startMs: null, entryId: null, notified60min: false },
  theme: 'light',
};

const COLORS = ['#e57cd8','#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#8b5cf6','#ec4899','#14b8a6','#f97316'];

function load() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch {}
  ['clients','projects','tasks','entries'].forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
  if (!state.timer) state.timer = { running: false, startMs: null, entryId: null, notified60min: false };
  if (!state.theme) state.theme = 'light';
  // Validate timer state — if startMs is missing or entry no longer exists, reset
  if (state.timer.running) {
    const entry = state.entries.find(e => e.id === state.timer.entryId);
    if (!entry || !state.timer.startMs) {
      state.timer = { running: false, startMs: null, entryId: null };
    }
  }
}

function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── TIMER ──────────────────────────────────────────────────
let timerInterval = null;

function timerStart(desc, clientId, projectId, taskId) {
  if (state.timer.running) timerStop();
  const id = uid();
  const now = Date.now();
  state.entries.push({
    id, desc: desc || 'Untitled',
    clientId: clientId || null,
    projectId: projectId || null,
    taskId: taskId || null,
    startMs: now, endMs: null,
    manual: false,
  });
  state.timer = { running: true, startMs: now, entryId: id, notified60min: false };
  requestNotificationPermission();
  save();
  renderTopbar();
  startTimerInterval();
  renderCurrentView();
}

function timerStop() {
  if (!state.timer.running) return;
  const entry = state.entries.find(e => e.id === state.timer.entryId);
  if (entry) entry.endMs = Date.now();
  state.timer = { running: false, startMs: null, entryId: null, notified60min: false };
  save();
  clearInterval(timerInterval);
  timerInterval = null;
  renderTopbar();
  renderCurrentView();
}

function startTimerInterval() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderTopbarTimer();
    if (currentView === 'tracker') renderRunningEntry();
    check60MinuteNotification();
  }, 1000);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function check60MinuteNotification() {
  if (!state.timer.running || state.timer.notified60min) return;
  const elapsed = Date.now() - state.timer.startMs;
  const sixtyMinutesMs = 60 * 60 * 1000;
  if (elapsed >= sixtyMinutesMs) {
    state.timer.notified60min = true;
    const entry = state.entries.find(e => e.id === state.timer.entryId);
    const desc = entry ? entry.desc : 'Your timer';
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Time Tracker Alert', {
        body: `${desc} has been running for 60 minutes`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⏱</text></svg>',
      });
    }
  }
}

function formatMs(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0:00';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`;
}

function msToDec(ms) {
  return (ms / 3600000).toFixed(2);
}

// ── HELPERS ────────────────────────────────────────────────
function getClient(id) { return state.clients.find(c => c.id === id); }
function getProject(id) { return state.projects.find(p => p.id === id); }
function getTask(id) { return state.tasks.find(t => t.id === id); }

function clientName(id) { const c = getClient(id); return c ? c.name : '—'; }
function projectName(id) { const p = getProject(id); return p ? p.name : '—'; }
function taskName(id) { const t = getTask(id); return t ? t.name : '—'; }
function clientColor(id) { const c = getClient(id); return c ? c.color : '#9ca3af'; }
function projectColor(id) { const p = getProject(id); return p ? p.color : '#9ca3af'; }
function taskColor(id) {
  const t = getTask(id);
  if (!t) return '#9ca3af';
  if (t.projectId) return projectColor(t.projectId);
  return '#9ca3af';
}

function entryDuration(e) {
  if (e.endMs) return e.endMs - e.startMs;
  if (state.timer.running && e.id === state.timer.entryId) return Date.now() - e.startMs;
  return 0;
}

function weekStart(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function weekEnd(d) {
  const e = new Date(weekStart(d));
  e.setDate(e.getDate() + 6);
  e.setHours(23,59,59,999);
  return e;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function todayMs() {
  const now = new Date();
  now.setHours(0,0,0,0);
  return now.getTime();
}

function entryMetaLine(e) {
  const parts = [];
  if (e.clientId) parts.push(clientName(e.clientId));
  if (e.projectId) parts.push(projectName(e.projectId));
  if (e.taskId) parts.push(taskName(e.taskId));
  return parts.join(' › ') || 'No project';
}

// ── NAVIGATION ────────────────────────────────────────────
let currentView = 'dashboard';

function navigate(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  renderCurrentView();
}

function renderCurrentView() {
  const views = { dashboard: renderDashboard, tracker: renderTracker, clients: renderClients, projects: renderProjects, tasks: renderTasksPage, reports: renderReports };
  const fn = views[currentView];
  if (fn) fn();
}

// ── TOPBAR ────────────────────────────────────────────────
function renderTopbar() {
  const tb = document.getElementById('topbar');
  const titles = { dashboard: 'Dashboard', tracker: 'Time Tracker', clients: 'Clients', projects: 'Projects', tasks: 'Tasks', reports: 'Reports' };
  tb.innerHTML = `
    <div class="topbar-left">
      <button class="btn btn-ghost btn-icon" id="menu-toggle" onclick="document.querySelector('.sidebar').classList.toggle('open')">☰</button>
      <span class="page-title">${titles[currentView] || 'VA Time Tracker'}</span>
    </div>
    <div class="timer-bar ${state.timer.running ? 'running' : ''}" id="topbar-timer">
      <span class="timer-display" id="timer-display">${state.timer.running ? formatMs(Date.now() - state.timer.startMs) : '00:00:00'}</span>
      ${state.timer.running ? `<span class="timer-desc" id="timer-desc">${(state.entries.find(e=>e.id===state.timer.entryId)||{}).desc||''}</span>` : ''}
    </div>
  `;
}

function renderTopbarTimer() {
  const disp = document.getElementById('timer-display');
  if (disp && state.timer.running) {
    disp.textContent = formatMs(Date.now() - state.timer.startMs);
  }
}

// ── DASHBOARD ─────────────────────────────────────────────
function renderDashboard() {
  const todayStart = todayMs();
  const todayEnd = todayStart + 86400000;
  const wStart = weekStart(new Date()).getTime();
  const wEnd = weekEnd(new Date()).getTime();

  const todayEntries = state.entries.filter(e => e.startMs >= todayStart && e.startMs < todayEnd && (e.endMs || state.timer.entryId === e.id));
  const weekEntries = state.entries.filter(e => e.startMs >= wStart && e.startMs <= wEnd && (e.endMs || state.timer.entryId === e.id));

  const todayMs_ = todayEntries.reduce((sum, e) => sum + entryDuration(e), 0);
  const weekMs_ = weekEntries.reduce((sum, e) => sum + entryDuration(e), 0);

  const recent = [...state.entries]
    .filter(e => e.endMs || (state.timer.running && e.id === state.timer.entryId))
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, 8);

  // Group week by client
  const byClient = {};
  weekEntries.forEach(e => {
    const key = e.clientId || '__none__';
    byClient[key] = (byClient[key] || 0) + entryDuration(e);
  });
  const clientRows = Object.entries(byClient).sort((a,b) => b[1]-a[1]);

  document.getElementById('app-content').innerHTML = `
    <div class="content">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Today</div>
          <div class="stat-value">${formatDuration(todayMs_)}</div>
          <div class="stat-sub">${todayEntries.length} entr${todayEntries.length===1?'y':'ies'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">This Week</div>
          <div class="stat-value">${formatDuration(weekMs_)}</div>
          <div class="stat-sub">${weekEntries.length} entr${weekEntries.length===1?'y':'ies'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Clients</div>
          <div class="stat-value">${state.clients.length}</div>
          <div class="stat-sub">${state.projects.length} projects</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Timer</div>
          <div class="stat-value ${state.timer.running ? 'text-green' : 'text-muted'}">${state.timer.running ? 'Running' : 'Stopped'}</div>
          <div class="stat-sub">${state.timer.running ? 'Tap tracker to stop' : 'Go to tracker'}</div>
        </div>
      </div>

      ${weekClientChart(clientRows)}

      <div class="card mt-4">
        <div style="padding:16px 18px; border-bottom:1px solid var(--border)" class="section-header">
          <span class="section-title">Recent Entries</span>
          <button class="btn btn-ghost btn-sm" onclick="navigate('tracker')">View All</button>
        </div>
        <div style="padding:10px 8px">
          ${recent.length === 0 ? `<div class="empty-state"><div class="empty-icon">⏱️</div><h3>No entries yet</h3><p>Start tracking time in the Tracker tab.</p></div>` : recent.map(e => entryRowHTML(e)).join('')}
        </div>
      </div>
    </div>
  `;
}

function weekClientChart(rows) {
  if (!rows.length) return '';
  const max = rows[0][1];
  return `<div class="card" style="padding:18px 20px">
    <div class="section-header"><span class="section-title">This Week by Client</span></div>
    ${rows.map(([cid, ms]) => {
      const pct = Math.round((ms / max) * 100);
      const color = cid === '__none__' ? '#9ca3af' : clientColor(cid);
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span style="display:flex;align-items:center;gap:6px">
            <span class="color-dot" style="background:${color}"></span>
            <strong>${cid === '__none__' ? 'No Client' : clientName(cid)}</strong>
          </span>
          <span class="text-muted">${formatDuration(ms)}</span>
        </div>
        <div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .3s"></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderRunningEntry() {
  if (!state.timer.running) return;
  const el = document.querySelector(`[data-entry-id="${state.timer.entryId}"] .entry-duration`);
  if (el) el.textContent = formatDuration(entryDuration(state.entries.find(e=>e.id===state.timer.entryId)));
}

// ── TRACKER ──────────────────────────────────────────────
let trackerWeekOffset = 0;

function renderTracker() {
  const base = new Date();
  base.setDate(base.getDate() + trackerWeekOffset * 7);
  const ws = weekStart(base);
  const we = weekEnd(base);

  const entries = state.entries
    .filter(e => {
      const active = e.endMs || (state.timer.running && e.id === state.timer.entryId);
      return active && e.startMs >= ws.getTime() && e.startMs <= we.getTime();
    })
    .sort((a, b) => b.startMs - a.startMs);

  const grouped = {};
  entries.forEach(e => {
    const d = new Date(e.startMs);
    d.setHours(0,0,0,0);
    const key = d.getTime();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  const days = Object.keys(grouped).sort((a,b) => b-a);
  const wsLabel = ws.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  const weLabel = we.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  document.getElementById('app-content').innerHTML = `
    <div class="content">
      ${quickTimerHTML()}
      <button class="btn btn-ghost btn-sm" style="margin-bottom:16px" onclick="openManualEntry()">+ Add manual entry</button>
      <div class="date-nav">
        <button class="date-nav-btn" onclick="trackerWeekOffset--;renderTracker()">‹</button>
        <span class="date-range-label">${wsLabel} – ${weLabel}</span>
        <button class="date-nav-btn" onclick="if(trackerWeekOffset<0){trackerWeekOffset++;renderTracker()}" ${trackerWeekOffset===0?'disabled style="opacity:.4"':''}>›</button>
        ${trackerWeekOffset!==0?`<button class="btn btn-ghost btn-sm" onclick="trackerWeekOffset=0;renderTracker()">Today</button>`:''}
      </div>
      <div class="entries-list">
        ${days.length === 0 ? `<div class="empty-state"><div class="empty-icon">⏳</div><h3>No entries this week</h3><p>Use the timer above or add a manual entry.</p></div>` :
          days.map(dayKey => {
            const dayEntries = grouped[dayKey];
            const dayTotal = dayEntries.reduce((s,e) => s + entryDuration(e), 0);
            const d = new Date(parseInt(dayKey));
            const isToday = sameDay(d, new Date());
            const label = isToday ? 'Today' : d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' });
            return `<div class="entry-group">
              <div class="entry-group-header">
                <span>${label}</span>
                <span class="entry-group-total">${formatDuration(dayTotal)}</span>
              </div>
              ${dayEntries.map(e => entryRowHTML(e)).join('')}
            </div>`;
          }).join('')}
      </div>
    </div>
  `;
}

function quickTimerHTML() {
  const running = state.timer.running;
  const runEntry = running ? state.entries.find(e=>e.id===state.timer.entryId) : null;
  return `
    <div class="quick-timer ${running ? 'running' : ''}">
      <div class="qt-field qt-desc">
        <label>Description</label>
        <input id="qt-desc" type="text" placeholder="What are you working on?" value="${running ? (runEntry?.desc||'') : ''}" ${running?'disabled':''}>
      </div>
      <div class="qt-field">
        <label>Client</label>
        <select id="qt-client" ${running?'disabled':''} onchange="updateProjectSelect('qt-project','qt-client')">
          <option value="">No Client</option>
          ${state.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="qt-field">
        <label>Project</label>
        <select id="qt-project" ${running?'disabled':''}>
          <option value="">No Project</option>
          ${state.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="qt-field">
        <label>Task</label>
        <select id="qt-task" ${running?'disabled':''}>
          <option value="">No Task</option>
          ${state.tasks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn ${running ? 'btn-red' : 'btn-green'}" style="height:38px;min-width:90px" onclick="${running ? 'timerStop();renderTracker()' : 'qtStart()'}">
        ${running ? '⏹ Stop' : '▶ Start'}
      </button>
    </div>
  `;
}

function updateProjectSelect(projId, clientSelectId) {
  const clientSel = document.getElementById(clientSelectId);
  const projSel = document.getElementById(projId);
  if (!projSel) return;
  const cid = clientSel?.value || '';
  const filtered = cid ? state.projects.filter(p => p.clientId === cid) : state.projects;
  projSel.innerHTML = `<option value="">No Project</option>` + filtered.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

function qtStart() {
  const desc = document.getElementById('qt-desc')?.value.trim();
  const clientId = document.getElementById('qt-client')?.value || null;
  const projectId = document.getElementById('qt-project')?.value || null;
  const taskId = document.getElementById('qt-task')?.value || null;
  timerStart(desc, clientId, projectId, taskId);
}

function entryRowHTML(e) {
  const running = state.timer.running && e.id === state.timer.entryId;
  const dur = entryDuration(e);
  const color = e.clientId ? clientColor(e.clientId) : (e.projectId ? projectColor(e.projectId) : '#9ca3af');
  return `<div class="entry-row" data-entry-id="${e.id}">
    <span class="entry-dot" style="background:${color}"></span>
    <div class="entry-info">
      <div class="entry-desc">${e.desc || 'Untitled'}</div>
      <div class="entry-meta">${entryMetaLine(e)}</div>
    </div>
    <div class="entry-time text-muted">${formatTime(e.startMs)}${e.endMs?' – '+formatTime(e.endMs):''}</div>
    <div class="entry-duration ${running?'text-green':''}">${running ? formatMs(dur) : formatDuration(dur)}</div>
    <div class="entry-actions">
      <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="editEntry('${e.id}')">✏️</button>
      <button class="btn btn-ghost btn-icon btn-sm" title="Delete" onclick="deleteEntry('${e.id}')">🗑️</button>
    </div>
  </div>`;
}

// ── MANUAL ENTRY ─────────────────────────────────────────
function openManualEntry(id) {
  const entry = id ? state.entries.find(e=>e.id===id) : null;
  const now = new Date();
  const toLocalDT = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  const defaultStart = toLocalDT(now.getTime() - 3600000);
  const defaultEnd = toLocalDT(now.getTime());

  openModal('manual-entry-modal', `${entry ? 'Edit' : 'Add'} Time Entry`, `
    <div class="form-grid">
      <div class="form-group full">
        <label>Description</label>
        <input id="me-desc" type="text" placeholder="What did you work on?" value="${entry?.desc||''}">
      </div>
      <div class="form-group">
        <label>Client</label>
        <select id="me-client" onchange="updateProjectSelect('me-project','me-client')">
          <option value="">No Client</option>
          ${state.clients.map(c=>`<option value="${c.id}" ${entry?.clientId===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Project</label>
        <select id="me-project">
          <option value="">No Project</option>
          ${state.projects.map(p=>`<option value="${p.id}" ${entry?.projectId===p.id?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Task</label>
        <select id="me-task">
          <option value="">No Task</option>
          ${state.tasks.map(t=>`<option value="${t.id}" ${entry?.taskId===t.id?'selected':''}>${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Start Time</label>
        <input id="me-start" type="datetime-local" value="${entry ? toLocalDT(entry.startMs) : defaultStart}">
      </div>
      <div class="form-group">
        <label>End Time</label>
        <input id="me-end" type="datetime-local" value="${entry ? toLocalDT(entry.endMs||now.getTime()) : defaultEnd}">
      </div>
    </div>
  `, () => saveManualEntry(id));
}

function editEntry(id) { openManualEntry(id); }

function saveManualEntry(existingId) {
  const desc = document.getElementById('me-desc')?.value.trim() || 'Untitled';
  const clientId = document.getElementById('me-client')?.value || null;
  const projectId = document.getElementById('me-project')?.value || null;
  const taskId = document.getElementById('me-task')?.value || null;
  const startVal = document.getElementById('me-start')?.value;
  const endVal = document.getElementById('me-end')?.value;
  if (!startVal || !endVal) return alert('Please fill in start and end times.');
  const startMs = new Date(startVal).getTime();
  const endMs = new Date(endVal).getTime();
  if (endMs <= startMs) return alert('End time must be after start time.');

  if (existingId) {
    const e = state.entries.find(en => en.id === existingId);
    if (e) Object.assign(e, { desc, clientId, projectId, taskId, startMs, endMs, manual: true });
  } else {
    state.entries.push({ id: uid(), desc, clientId, projectId, taskId, startMs, endMs, manual: true });
  }
  save();
  closeModal();
  renderCurrentView();
}

function deleteEntry(id) {
  if (!confirm('Delete this time entry?')) return;
  if (state.timer.running && state.timer.entryId === id) timerStop();
  state.entries = state.entries.filter(e => e.id !== id);
  save();
  renderCurrentView();
}

// ── CLIENTS ──────────────────────────────────────────────
function renderClients() {
  document.getElementById('app-content').innerHTML = `
    <div class="content">
      <div class="section-header">
        <span class="section-title">Clients</span>
        <button class="btn btn-primary btn-sm" onclick="openClientModal()">+ New Client</button>
      </div>
      ${state.clients.length === 0 ? `<div class="empty-state"><div class="empty-icon">🏢</div><h3>No clients yet</h3><p>Add your first client to get started.</p></div>` :
        `<div class="entity-grid">${state.clients.map(c => clientCardHTML(c)).join('')}</div>`}
    </div>
  `;
}

function clientCardHTML(c) {
  const projCount = state.projects.filter(p => p.clientId === c.id).length;
  const entries = state.entries.filter(e => e.clientId === c.id && e.endMs);
  const totalMs = entries.reduce((s,e) => s + (e.endMs - e.startMs), 0);
  return `<div class="entity-card">
    <div class="entity-card-actions">
      <button class="btn btn-ghost btn-icon btn-sm" onclick="openClientModal('${c.id}')">✏️</button>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteClient('${c.id}')">🗑️</button>
    </div>
    <div class="entity-card-header">
      <span class="color-dot" style="background:${c.color};width:16px;height:16px"></span>
      <span class="entity-card-title">${c.name}</span>
    </div>
    ${c.notes ? `<div class="entity-card-sub" style="margin-bottom:6px">${c.notes}</div>` : ''}
    <div style="display:flex;gap:14px;margin-top:8px">
      <div><div class="stat-label" style="font-size:10px">Projects</div><div style="font-weight:700">${projCount}</div></div>
      <div><div class="stat-label" style="font-size:10px">Total Time</div><div style="font-weight:700">${formatDuration(totalMs)}</div></div>
    </div>
  </div>`;
}

function openClientModal(id) {
  const c = id ? state.clients.find(cl=>cl.id===id) : null;
  openModal('client-modal', `${c?'Edit':'New'} Client`, `
    <div class="form-grid">
      <div class="form-group full">
        <label>Name</label>
        <input id="cl-name" type="text" placeholder="Client name" value="${c?.name||''}">
      </div>
      <div class="form-group full">
        <label>Notes</label>
        <input id="cl-notes" type="text" placeholder="Optional notes" value="${c?.notes||''}">
      </div>
      <div class="form-group full">
        <label>Colour</label>
        <div class="color-picker" id="cl-color-picker">
          ${COLORS.map(col=>`<div class="color-swatch${(c?.color||COLORS[0])===col?' selected':''}" style="background:${col}" data-color="${col}" onclick="selectColor('cl-color-picker',this)"></div>`).join('')}
        </div>
        <input type="hidden" id="cl-color" value="${c?.color||COLORS[0]}">
      </div>
    </div>
  `, () => saveClient(id));
}

function selectColor(pickerId, el) {
  document.querySelectorAll(`#${pickerId} .color-swatch`).forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
  const hiddenInput = document.getElementById(pickerId.replace('-picker',''));
  if (hiddenInput) hiddenInput.value = el.dataset.color;
}

function saveClient(existingId) {
  const name = document.getElementById('cl-name')?.value.trim();
  if (!name) return alert('Client name is required.');
  const notes = document.getElementById('cl-notes')?.value.trim() || '';
  const color = document.getElementById('cl-color')?.value || COLORS[0];
  if (existingId) {
    const c = state.clients.find(cl=>cl.id===existingId);
    if (c) Object.assign(c, { name, notes, color });
  } else {
    state.clients.push({ id: uid(), name, notes, color });
  }
  save(); closeModal(); renderClients();
}

function deleteClient(id) {
  if (!confirm('Delete this client? Time entries will not be deleted.')) return;
  state.clients = state.clients.filter(c => c.id !== id);
  state.projects.forEach(p => { if (p.clientId === id) p.clientId = null; });
  state.entries.forEach(e => { if (e.clientId === id) e.clientId = null; });
  save(); renderClients();
}

// ── PROJECTS ─────────────────────────────────────────────
function renderProjects() {
  document.getElementById('app-content').innerHTML = `
    <div class="content">
      <div class="section-header">
        <span class="section-title">Projects</span>
        <button class="btn btn-primary btn-sm" onclick="openProjectModal()">+ New Project</button>
      </div>
      ${state.projects.length === 0 ? `<div class="empty-state"><div class="empty-icon">📁</div><h3>No projects yet</h3><p>Create a project to organise your time entries.</p></div>` :
        `<div class="entity-grid">${state.projects.map(p => projectCardHTML(p)).join('')}</div>`}
    </div>
  `;
}

function projectCardHTML(p) {
  const taskCount = state.tasks.filter(t => t.projectId === p.id).length;
  const entries = state.entries.filter(e => e.projectId === p.id && e.endMs);
  const totalMs = entries.reduce((s,e) => s + (e.endMs - e.startMs), 0);
  const client = p.clientId ? getClient(p.clientId) : null;
  return `<div class="entity-card">
    <div class="entity-card-actions">
      <button class="btn btn-ghost btn-icon btn-sm" onclick="openProjectModal('${p.id}')">✏️</button>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteProject('${p.id}')">🗑️</button>
    </div>
    <div class="entity-card-header">
      <span class="color-dot" style="background:${p.color};width:16px;height:16px"></span>
      <span class="entity-card-title">${p.name}</span>
    </div>
    ${client ? `<div class="entity-card-sub" style="margin-bottom:4px;display:flex;align-items:center;gap:5px"><span class="color-dot" style="background:${client.color}"></span>${client.name}</div>` : ''}
    <div style="display:flex;gap:14px;margin-top:8px">
      <div><div class="stat-label" style="font-size:10px">Tasks</div><div style="font-weight:700">${taskCount}</div></div>
      <div><div class="stat-label" style="font-size:10px">Total Time</div><div style="font-weight:700">${formatDuration(totalMs)}</div></div>
    </div>
  </div>`;
}

function openProjectModal(id) {
  const p = id ? state.projects.find(pr=>pr.id===id) : null;
  openModal('project-modal', `${p?'Edit':'New'} Project`, `
    <div class="form-grid">
      <div class="form-group full">
        <label>Name</label>
        <input id="pr-name" type="text" placeholder="Project name" value="${p?.name||''}">
      </div>
      <div class="form-group full">
        <label>Client</label>
        <select id="pr-client">
          <option value="">No Client</option>
          ${state.clients.map(c=>`<option value="${c.id}" ${p?.clientId===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label>Colour</label>
        <div class="color-picker" id="pr-color-picker">
          ${COLORS.map(col=>`<div class="color-swatch${(p?.color||COLORS[1])===col?' selected':''}" style="background:${col}" data-color="${col}" onclick="selectColor('pr-color-picker',this)"></div>`).join('')}
        </div>
        <input type="hidden" id="pr-color" value="${p?.color||COLORS[1]}">
      </div>
    </div>
  `, () => saveProject(id));
}

function saveProject(existingId) {
  const name = document.getElementById('pr-name')?.value.trim();
  if (!name) return alert('Project name is required.');
  const clientId = document.getElementById('pr-client')?.value || null;
  const color = document.getElementById('pr-color')?.value || COLORS[1];
  if (existingId) {
    const p = state.projects.find(pr=>pr.id===existingId);
    if (p) Object.assign(p, { name, clientId, color });
  } else {
    state.projects.push({ id: uid(), name, clientId, color });
  }
  save(); closeModal(); renderProjects();
}

function deleteProject(id) {
  if (!confirm('Delete this project?')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
  state.entries.forEach(e => { if (e.projectId === id) e.projectId = null; });
  save(); renderProjects();
}

// ── TASKS ─────────────────────────────────────────────────
function renderTasksPage() {
  document.getElementById('app-content').innerHTML = `
    <div class="content">
      <div class="section-header">
        <span class="section-title">Tasks</span>
        <button class="btn btn-primary btn-sm" onclick="openTaskModal()">+ New Task</button>
      </div>
      ${state.tasks.length === 0 ? `<div class="empty-state"><div class="empty-icon">✅</div><h3>No tasks yet</h3><p>Create tasks to track specific types of work.</p></div>` :
        `<div class="card"><table>
          <thead><tr><th>Task</th><th>Project</th><th>Client</th><th>Total Time</th><th></th></tr></thead>
          <tbody>
            ${state.tasks.map(t => {
              const proj = t.projectId ? getProject(t.projectId) : null;
              const client = proj?.clientId ? getClient(proj.clientId) : null;
              const entries = state.entries.filter(e => e.taskId === t.id && e.endMs);
              const totalMs = entries.reduce((s,e) => s + (e.endMs - e.startMs), 0);
              return `<tr>
                <td><strong>${t.name}</strong></td>
                <td>${proj ? `<span class="color-dot" style="background:${proj.color}"></span>${proj.name}` : '—'}</td>
                <td>${client ? `<span class="color-dot" style="background:${client.color}"></span>${client.name}` : '—'}</td>
                <td>${formatDuration(totalMs)}</td>
                <td class="text-right" style="white-space:nowrap">
                  <button class="btn btn-ghost btn-icon btn-sm" onclick="openTaskModal('${t.id}')">✏️</button>
                  <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTask('${t.id}')">🗑️</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`}
    </div>
  `;
}

function openTaskModal(id) {
  const t = id ? state.tasks.find(tk=>tk.id===id) : null;
  openModal('task-modal', `${t?'Edit':'New'} Task`, `
    <div class="form-grid">
      <div class="form-group full">
        <label>Name</label>
        <input id="tk-name" type="text" placeholder="Task name" value="${t?.name||''}">
      </div>
      <div class="form-group full">
        <label>Project</label>
        <select id="tk-project">
          <option value="">No Project</option>
          ${state.projects.map(p=>`<option value="${p.id}" ${t?.projectId===p.id?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
    </div>
  `, () => saveTask(id));
}

function saveTask(existingId) {
  const name = document.getElementById('tk-name')?.value.trim();
  if (!name) return alert('Task name is required.');
  const projectId = document.getElementById('tk-project')?.value || null;
  if (existingId) {
    const t = state.tasks.find(tk=>tk.id===existingId);
    if (t) Object.assign(t, { name, projectId });
  } else {
    state.tasks.push({ id: uid(), name, projectId });
  }
  save(); closeModal(); renderTasksPage();
}

function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  state.entries.forEach(e => { if (e.taskId === id) e.taskId = null; });
  save(); renderTasksPage();
}

// ── REPORTS ──────────────────────────────────────────────
let reportWeekOffset = 0;
let reportGroupBy = 'client';
let reportFilterClient = '';
let reportFilterProject = '';

function renderReports() {
  const base = new Date();
  base.setDate(base.getDate() + reportWeekOffset * 7);
  const ws = weekStart(base);
  const we = weekEnd(base);

  let entries = state.entries.filter(e => e.endMs && e.startMs >= ws.getTime() && e.startMs <= we.getTime());
  if (reportFilterClient) entries = entries.filter(e => e.clientId === reportFilterClient);
  if (reportFilterProject) entries = entries.filter(e => e.projectId === reportFilterProject);

  const totalMs = entries.reduce((s,e) => s + (e.endMs - e.startMs), 0);
  const wsLabel = ws.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  const weLabel = we.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  // Group data
  const grouped = {};
  entries.forEach(e => {
    let key, label, color;
    if (reportGroupBy === 'client') { key = e.clientId||'__none__'; label = e.clientId ? clientName(e.clientId) : 'No Client'; color = e.clientId ? clientColor(e.clientId) : '#9ca3af'; }
    else if (reportGroupBy === 'project') { key = e.projectId||'__none__'; label = e.projectId ? projectName(e.projectId) : 'No Project'; color = e.projectId ? projectColor(e.projectId) : '#9ca3af'; }
    else { key = e.taskId||'__none__'; label = e.taskId ? taskName(e.taskId) : 'No Task'; color = e.taskId ? taskColor(e.taskId) : '#9ca3af'; }
    if (!grouped[key]) grouped[key] = { label, color, ms: 0, entries: [] };
    grouped[key].ms += (e.endMs - e.startMs);
    grouped[key].entries.push(e);
  });

  const rows = Object.values(grouped).sort((a,b) => b.ms - a.ms);

  document.getElementById('app-content').innerHTML = `
    <div class="content">
      <div class="report-header">
        <div>
          <h2>Weekly Timesheet Report</h2>
          <div class="report-period">${wsLabel} – ${weLabel}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="printReport()">🖨️ Print</button>
          <button class="btn btn-ghost btn-sm" onclick="downloadCSV()">⬇ CSV</button>
          <button class="btn btn-primary btn-sm" onclick="emailReport()">✉️ Email Report</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
        <button class="date-nav-btn" onclick="reportWeekOffset--;renderReports()">‹</button>
        <span class="date-range-label" style="font-size:13px">${wsLabel} – ${weLabel}</span>
        <button class="date-nav-btn" onclick="if(reportWeekOffset<0){reportWeekOffset++;renderReports()}" ${reportWeekOffset===0?'disabled style="opacity:.4"':''}>›</button>
        ${reportWeekOffset!==0?`<button class="btn btn-ghost btn-sm" onclick="reportWeekOffset=0;renderReports()">Current Week</button>`:''}
      </div>

      <div class="filters">
        <select class="filter-select" onchange="reportGroupBy=this.value;renderReports()">
          <option value="client" ${reportGroupBy==='client'?'selected':''}>Group by Client</option>
          <option value="project" ${reportGroupBy==='project'?'selected':''}>Group by Project</option>
          <option value="task" ${reportGroupBy==='task'?'selected':''}>Group by Task</option>
        </select>
        <select class="filter-select" onchange="reportFilterClient=this.value;renderReports()">
          <option value="">All Clients</option>
          ${state.clients.map(c=>`<option value="${c.id}" ${reportFilterClient===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="reportFilterProject=this.value;renderReports()">
          <option value="">All Projects</option>
          ${state.projects.map(p=>`<option value="${p.id}" ${reportFilterProject===p.id?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>

      <div class="report-summary-grid">
        <div class="report-summary-card">
          <div class="stat-label">Total Hours</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${msToDec(totalMs)}h</div>
          <div class="stat-sub">${formatDuration(totalMs)}</div>
        </div>
        <div class="report-summary-card">
          <div class="stat-label">Entries</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${entries.length}</div>
        </div>
        <div class="report-summary-card">
          <div class="stat-label">Groups</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${rows.length}</div>
        </div>
      </div>

      ${rows.length === 0 ? `<div class="empty-state"><div class="empty-icon">📊</div><h3>No data for this period</h3><p>Track time or adjust the filters.</p></div>` : `
        <div class="card" style="overflow:hidden">
          <table id="report-table">
            <thead><tr>
              <th>Group</th><th>Hours (dec)</th><th>Duration</th><th>Entries</th><th>% of Total</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td><span class="color-dot" style="background:${r.color}"></span><strong>${r.label}</strong></td>
                <td>${msToDec(r.ms)}</td>
                <td>${formatDuration(r.ms)}</td>
                <td>${r.entries.length}</td>
                <td>${totalMs ? Math.round(r.ms/totalMs*100) : 0}%</td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr class="table-total">
              <td><strong>Total</strong></td>
              <td><strong>${msToDec(totalMs)}</strong></td>
              <td><strong>${formatDuration(totalMs)}</strong></td>
              <td><strong>${entries.length}</strong></td>
              <td><strong>100%</strong></td>
            </tfoot>
          </table>
        </div>

        <div class="card mt-4" style="overflow:hidden">
          <div style="padding:14px 18px;border-bottom:1px solid var(--border)"><strong>Detailed Entries</strong></div>
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Client</th><th>Project</th><th>Task</th><th>Start</th><th>End</th><th>Duration</th></tr></thead>
            <tbody>
              ${entries.sort((a,b)=>a.startMs-b.startMs).map(e=>`<tr>
                <td>${formatDate(e.startMs)}</td>
                <td>${e.desc||'—'}</td>
                <td>${e.clientId?clientName(e.clientId):'—'}</td>
                <td>${e.projectId?projectName(e.projectId):'—'}</td>
                <td>${e.taskId?taskName(e.taskId):'—'}</td>
                <td>${formatTime(e.startMs)}</td>
                <td>${e.endMs?formatTime(e.endMs):'—'}</td>
                <td>${formatDuration(e.endMs-e.startMs)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function printReport() {
  window.print();
}

function downloadCSV() {
  const base = new Date();
  base.setDate(base.getDate() + reportWeekOffset * 7);
  const ws = weekStart(base);
  const we = weekEnd(base);
  let entries = state.entries.filter(e => e.endMs && e.startMs >= ws.getTime() && e.startMs <= we.getTime());
  if (reportFilterClient) entries = entries.filter(e => e.clientId === reportFilterClient);
  if (reportFilterProject) entries = entries.filter(e => e.projectId === reportFilterProject);

  if (entries.length === 0) return alert('No entries found for this period.');
  const rows = [['Date','Description','Client','Project','Task','Start','End','Duration (h)']];
  entries.sort((a,b)=>a.startMs-b.startMs).forEach(e => {
    rows.push([
      formatDate(e.startMs), e.desc||'',
      e.clientId ? clientName(e.clientId) : '',
      e.projectId ? projectName(e.projectId) : '',
      e.taskId ? taskName(e.taskId) : '',
      formatTime(e.startMs),
      e.endMs ? formatTime(e.endMs) : '',
      msToDec(e.endMs - e.startMs),
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `timesheet-${ws.toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function emailReport() {
  const base = new Date();
  base.setDate(base.getDate() + reportWeekOffset * 7);
  const ws = weekStart(base);
  const we = weekEnd(base);
  let entries = state.entries.filter(e => e.endMs && e.startMs >= ws.getTime() && e.startMs <= we.getTime());
  if (reportFilterClient) entries = entries.filter(e => e.clientId === reportFilterClient);
  if (reportFilterProject) entries = entries.filter(e => e.projectId === reportFilterProject);
  if (entries.length === 0) return alert('No entries found for this period.');
  const totalMs = entries.reduce((s,e) => s + (e.endMs - e.startMs), 0);

  const wsLabel = ws.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  const weLabel = we.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  let body = `Weekly Timesheet: ${wsLabel} – ${weLabel}\n\n`;
  body += `Total Hours: ${msToDec(totalMs)}h (${formatDuration(totalMs)})\n\n`;
  body += `ENTRIES:\n${'─'.repeat(60)}\n`;
  entries.sort((a,b)=>a.startMs-b.startMs).forEach(e => {
    body += `${formatDate(e.startMs)} | ${formatTime(e.startMs)}–${e.endMs?formatTime(e.endMs):'?'} | ${msToDec(e.endMs-e.startMs)}h | ${e.desc||'Untitled'}\n`;
    const meta = entryMetaLine(e);
    if (meta !== 'No project') body += `  → ${meta}\n`;
  });

  const recipient = prompt('Send to email address (leave blank to use default email client):', '');
  const subject = encodeURIComponent(`Timesheet ${wsLabel} – ${weLabel}`);
  const bodyEnc = encodeURIComponent(body);
  const mailLink = `mailto:${recipient||''}?subject=${subject}&body=${bodyEnc}`;
  // mailto URIs have browser length limits; offer clipboard fallback for long reports
  if (mailLink.length > 2000 && navigator.clipboard) {
    navigator.clipboard.writeText(body).then(() => {
      alert('Report copied to clipboard (too long for mailto). Paste into your email client.');
    });
  } else {
    window.location.href = mailLink;
  }
}

// ── MODAL ─────────────────────────────────────────────────
function openModal(id, title, bodyHTML, onSave) {
  let overlay = document.getElementById('modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal" id="${id}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="modal-save-btn">Save</button>
      </div>
    </div>
  `;
  overlay.classList.remove('hidden');
  document.getElementById('modal-save-btn').onclick = onSave;
  document.addEventListener('keydown', modalKeyHandler);
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.removeEventListener('keydown', modalKeyHandler);
}

function modalKeyHandler(e) {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.ctrlKey) document.getElementById('modal-save-btn')?.click();
}

// ── THEME ─────────────────────────────────────────────────
function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.getElementById('theme-label').textContent = state.theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
  save();
}

// ── BOOTSTRAP ─────────────────────────────────────────────
function buildShell() {
  document.body.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="logo-mark">⏱</div>
          <div><div class="logo-text">VA Time Tracker</div><div class="logo-sub">North Star VA</div></div>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section">
            <div class="nav-label">Overview</div>
            <div class="nav-item active" data-view="dashboard" onclick="navigate('dashboard')"><span class="icon">🏠</span> Dashboard</div>
            <div class="nav-item" data-view="tracker" onclick="navigate('tracker')"><span class="icon">⏱</span> Time Tracker</div>
          </div>
          <div class="nav-section">
            <div class="nav-label">Manage</div>
            <div class="nav-item" data-view="clients" onclick="navigate('clients')"><span class="icon">🏢</span> Clients</div>
            <div class="nav-item" data-view="projects" onclick="navigate('projects')"><span class="icon">📁</span> Projects</div>
            <div class="nav-item" data-view="tasks" onclick="navigate('tasks')"><span class="icon">✅</span> Tasks</div>
          </div>
          <div class="nav-section">
            <div class="nav-label">Analyse</div>
            <div class="nav-item" data-view="reports" onclick="navigate('reports')"><span class="icon">📊</span> Reports</div>
          </div>
        </nav>
        <div class="sidebar-footer">
          <div class="theme-toggle" onclick="toggleTheme()">
            <span id="theme-label">🌙 Dark Mode</span>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar" id="topbar"></header>
        <div id="app-content"></div>
      </div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  document.documentElement.setAttribute('data-theme', state.theme);
  buildShell();
  const themeLabel = document.getElementById('theme-label');
  if (themeLabel) themeLabel.textContent = state.theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
  renderTopbar();
  navigate('dashboard');
  if (state.timer.running) startTimerInterval();
});
