// DOM Elements
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const refreshText = refreshBtn ? refreshBtn.querySelector('.refresh-text') : null;
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const userInfo = document.getElementById('userInfo');
const userName = document.getElementById('userName');

// Settings inputs
const clientIdInput = document.getElementById('clientId');
const clientSecretInput = document.getElementById('clientSecret');
const boardIdInput = document.getElementById('boardId');

// Stats
const totalHoursEl = document.getElementById('totalHours');
const avgPerDayEl = document.getElementById('avgPerDay');
const taskCountEl = document.getElementById('taskCount');
const sprintNameEl = document.getElementById('sprintName');
const sprintDatesEl = document.getElementById('sprintDates');
const fetchProgress = document.getElementById('fetchProgress');

// Grid
const timesheetGrid = document.getElementById('timesheetGrid');

// Worklog modal
const worklogModal = document.getElementById('worklogModal');
const worklogIssueEl = document.getElementById('worklogIssue');
const worklogDateEl = document.getElementById('worklogDate');
const worklogHoursInput = document.getElementById('worklogHoursInput');
const saveWorklogBtn = document.getElementById('saveWorklogBtn');
const cancelWorklogBtn = document.getElementById('cancelWorklogBtn');
const clearWorklogBtn = document.getElementById('clearWorklogBtn');
const closeWorklogBtn = document.getElementById('closeWorklogBtn');
const decreaseWorklogBtn = document.getElementById('decreaseWorklogBtn');
const increaseWorklogBtn = document.getElementById('increaseWorklogBtn');
const statusPopover = document.getElementById('statusPopover');
const statusPopoverBackdrop = document.getElementById('statusPopoverBackdrop');
const statusList = document.getElementById('statusList');

// State
let currentData = null;
let pendingWorklog = null;
let issueOrder = [];
let worklogLoading = new Set();
let activeLoadId = 0;
let isBatchLoading = false;
let pendingWorklogUpdates = 0;
let pendingStatusUpdates = 0;
let activeStatusIssue = null;
let statusAnchorEl = null;
let statusOrderMap = new Map();
let transitionCache = new Map();
let transitionRequests = new Map();

const TRANSITION_PREFETCH_CONCURRENCY = 3;

// Platform styling
if (navigator.platform && navigator.platform.toLowerCase().includes('mac')) {
  document.body.classList.add('is-mac');
}

// Initialize
async function init() {
  const auth = await window.api.getAuthStatus();
  
  if (auth.isAuthenticated) {
    showDashboard(auth.siteName);
    loadSprintData();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  userInfo.classList.add('hidden');
  document.title = 'Sprint Timesheet';
}

function showDashboard(siteName) {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userName.textContent = siteName || 'Connected';
}

function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove('hidden');
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

function showToast(message, isError = true) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 5000);
}

// Auth handlers
loginBtn.addEventListener('click', async () => {
  try {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Connecting...';
    
    const result = await window.api.startOAuth();
    
    if (result.success) {
      showDashboard(result.siteName);
      loadSprintData();
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M11.571 5.143c0 2.286-.857 3.714-2.571 4.286l4.286 9.428h-3.429L5.57 9.43H4.286v9.428H1.143V5.143h5.143c3.143 0 5.285 1.143 5.285 4v.143zm-7.285 3h1.857c1.429 0 2.143-.714 2.143-2 0-1.143-.714-1.857-2.143-1.857H4.286v3.857zM23.43 18.857h-3.143v-6c0-1.714-.572-2.571-1.715-2.571-1.428 0-2.143 1.143-2.143 2.857v5.714h-3.143V7.714h3.143v1.715c.572-1.143 1.714-2 3.429-2 2.285 0 3.571 1.428 3.571 4.285v7.143z"/>
      </svg>
      Sign in with Atlassian
    `;
  }
});

logoutBtn.addEventListener('click', async () => {
  await window.api.logout();
  showLogin();
});

// Settings handlers
settingsBtn.addEventListener('click', async () => {
  const settings = await window.api.getSettings();
  clientIdInput.value = settings.clientId || '';
  clientSecretInput.value = settings.clientSecret || '';
  boardIdInput.value = settings.boardId || '';
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', async () => {
  await window.api.saveSettings({
    clientId: clientIdInput.value.trim(),
    clientSecret: clientSecretInput.value.trim(),
    boardId: boardIdInput.value.trim()
  });
  settingsModal.classList.add('hidden');
  showToast('Settings saved!', false);
});

// Data loading
refreshBtn.addEventListener('click', () => loadSprintData());

const setWorklogModalOpen = (open) => {
  if (!worklogModal) return;
  worklogModal.classList.toggle('hidden', !open);
};

const setFetchProgressVisible = (visible) => {
  if (!fetchProgress) return;
  fetchProgress.classList.toggle('hidden', !visible);
};

const setRefreshLoading = (loading) => {
  if (!refreshBtn) return;
  refreshBtn.classList.toggle('is-loading', loading);
  refreshBtn.disabled = loading;
  if (refreshText) refreshText.textContent = loading ? 'Loading..' : 'Refresh';
};

const updateProgressVisibility = () => {
  const isLoading = isBatchLoading || pendingWorklogUpdates > 0 || pendingStatusUpdates > 0;
  setFetchProgressVisible(isLoading);
  setRefreshLoading(isLoading);
};

const setIssueLoading = (issueKey, isLoading) => {
  if (!issueKey) return;
  if (isLoading) {
    worklogLoading.add(issueKey);
  } else {
    worklogLoading.delete(issueKey);
  }
  if (!timesheetGrid) return;
  const spinner = timesheetGrid.querySelector(`tbody tr[data-issue-key="${issueKey}"] .issue-spinner`);
  if (spinner) {
    spinner.classList.toggle('is-visible', isLoading);
  }
};

const selectWorklogInput = () => {
  if (!worklogHoursInput) return;
  worklogHoursInput.focus();
  worklogHoursInput.select();
};

const openWorklogModal = ({ issueKey, date, seconds }) => {
  if (!worklogModal) return;
  pendingWorklog = { issueKey, date, seconds };
  if (worklogIssueEl) worklogIssueEl.textContent = issueKey;
  if (worklogDateEl) worklogDateEl.textContent = formatDate(date);
  if (worklogHoursInput) {
    worklogHoursInput.value = (seconds / 3600).toFixed(1);
    requestAnimationFrame(selectWorklogInput);
  }
  setWorklogModalOpen(true);
};

const closeWorklogModal = () => {
  pendingWorklog = null;
  setWorklogModalOpen(false);
};

const setStatusPopoverOpen = (open) => {
  if (statusPopover) statusPopover.classList.toggle('hidden', !open);
  if (statusPopoverBackdrop) statusPopoverBackdrop.classList.toggle('hidden', !open);
};

const closeStatusPopover = () => {
  activeStatusIssue = null;
  statusAnchorEl = null;
  setStatusPopoverOpen(false);
  if (statusList) statusList.innerHTML = '';
};

const positionStatusPopover = (anchor) => {
  if (!statusPopover || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const padding = 12;
  const width = statusPopover.offsetWidth || 240;
  const height = statusPopover.offsetHeight || 200;
  const left = Math.min(window.innerWidth - width - padding, Math.max(padding, rect.left));
  const top = Math.min(window.innerHeight - height - padding, rect.bottom + 8);
  statusPopover.style.left = `${left}px`;
  statusPopover.style.top = `${top}px`;
};

const renderStatusOptions = (transitions) => {
  if (!statusList) return;
  if (!transitions.length) {
    statusList.innerHTML = '<div class="label-empty">No transitions available</div>';
    return;
  }
  const ordered = [...transitions].sort((a, b) => {
    const aKey = a.to?.id || a.to?.name || a.name;
    const bKey = b.to?.id || b.to?.name || b.name;
    const aIndex = statusOrderMap.has(aKey) ? statusOrderMap.get(aKey) : Number.MAX_SAFE_INTEGER;
    const bIndex = statusOrderMap.has(bKey) ? statusOrderMap.get(bKey) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(aKey).localeCompare(String(bKey));
  });
  statusList.innerHTML = ordered.map((transition) => {
    const name = transition.to?.name || transition.name;
    const statusClass = getStatusClass(transition.to?.statusCategory);
    return `
      <button class="status-option" type="button" data-transition-id="${transition.id}">
        <span class="status-pill ${statusClass}">${escapeHtml(name)}</span>
      </button>
    `;
  }).join('');
};

const fetchIssueTransitionsCached = async (issueKey) => {
  if (!issueKey) return [];
  if (transitionCache.has(issueKey)) {
    return transitionCache.get(issueKey);
  }
  if (transitionRequests.has(issueKey)) {
    return transitionRequests.get(issueKey);
  }
  const request = window.api.fetchIssueTransitions({ issueKey })
    .then((transitions) => {
      transitionCache.set(issueKey, transitions);
      return transitions;
    })
    .finally(() => {
      transitionRequests.delete(issueKey);
    });
  transitionRequests.set(issueKey, request);
  return request;
};

const prefetchIssueTransitions = async (issueKeys) => {
  if (!Array.isArray(issueKeys) || issueKeys.length === 0) return;
  let index = 0;
  const workers = Array.from({ length: TRANSITION_PREFETCH_CONCURRENCY }, async () => {
    while (index < issueKeys.length) {
      const issueKey = issueKeys[index];
      index += 1;
      if (!issueKey || transitionCache.has(issueKey)) continue;
      try {
        await fetchIssueTransitionsCached(issueKey);
      } catch (_) {
        // Best effort prefetch; ignore failures.
      }
    }
  });
  await Promise.all(workers);
};

const saveWorklog = async ({ hoursOverride } = {}) => {
  if (!pendingWorklog) return;
  const rawValue = worklogHoursInput ? worklogHoursInput.value.trim() : '';
  const hours = Number.isFinite(hoursOverride) ? hoursOverride : Number(rawValue);
  if (!Number.isFinite(hours) || hours < 0) {
    showToast('Please enter a valid number of hours.');
    return;
  }

  const issueKey = pendingWorklog.issueKey;
  const date = pendingWorklog.date;
  closeWorklogModal();

  pendingWorklogUpdates += 1;
  updateProgressVisibility();
  setIssueLoading(issueKey, true);

  try {
    await window.api.setWorklogHours({ issueKey, date, hours });
    if (!currentData || !currentData.sprint) {
      await loadSprintData();
      showToast('Hours updated.', false);
      return;
    }
    const result = await window.api.fetchIssueWorklogs({
      issueKey,
      startDate: currentData.sprint.startDate,
      endDate: currentData.sprint.endDate
    });
    if (currentData.worklogs[issueKey]) {
      currentData.worklogs[issueKey].days = result.days;
    }
    updateIssueRow(issueKey);
    updateFooterTotals();
    showToast('Hours updated.', false);
  } catch (error) {
    showToast(error.message);
  } finally {
    setIssueLoading(issueKey, false);
    pendingWorklogUpdates = Math.max(0, pendingWorklogUpdates - 1);
    updateProgressVisibility();
  }
};

const openIssueInBrowser = async (issueKey) => {
  if (!issueKey) return;
  const siteUrl = currentData?.siteUrl;
  if (!siteUrl) {
    showToast('Jira site URL not available yet.');
    return;
  }
  const url = `${siteUrl.replace(/\/+$/, '')}/browse/${issueKey}`;
  try {
    await window.api.openExternal(url);
  } catch (error) {
    showToast(error.message);
  }
};

const openStatusPopover = async (issueKey, anchor) => {
  if (!issueKey) return;
  activeStatusIssue = issueKey;
  statusAnchorEl = anchor;
  setStatusPopoverOpen(true);
  positionStatusPopover(anchor);
  if (transitionCache.has(issueKey)) {
    renderStatusOptions(transitionCache.get(issueKey));
    requestAnimationFrame(() => positionStatusPopover(statusAnchorEl));
    return;
  }
  if (statusList) statusList.innerHTML = '<div class="label-empty">Loading...</div>';
  try {
    const transitions = await fetchIssueTransitionsCached(issueKey);
    if (activeStatusIssue !== issueKey) return;
    renderStatusOptions(transitions);
    requestAnimationFrame(() => positionStatusPopover(statusAnchorEl));
  } catch (error) {
    showToast(error.message);
    closeStatusPopover();
  }
};

if (timesheetGrid) {
  timesheetGrid.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!target) return;
    const issueLink = target.closest('.issue-link');
    if (issueLink) {
      event.preventDefault();
      event.stopPropagation();
      openIssueInBrowser(issueLink.dataset.issueKey);
      return;
    }

    const statusPill = target.closest('.status-pill');
    if (statusPill) {
      const row = statusPill.closest('tr');
      const issueKey = row?.dataset.issueKey;
      if (issueKey) {
        event.preventDefault();
        event.stopPropagation();
        openStatusPopover(issueKey, statusPill);
      }
      return;
    }

    const cell = target ? target.closest('td.hours-cell') : null;
    if (!cell || !cell.dataset.issueKey) return;

    openWorklogModal({
      issueKey: cell.dataset.issueKey,
      date: cell.dataset.date,
      seconds: Number(cell.dataset.seconds || 0)
    });
  });
}

if (worklogModal) {
  const backdrop = worklogModal.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeWorklogModal);
  }
}

if (cancelWorklogBtn) cancelWorklogBtn.addEventListener('click', closeWorklogModal);
if (closeWorklogBtn) closeWorklogBtn.addEventListener('click', closeWorklogModal);
if (saveWorklogBtn) saveWorklogBtn.addEventListener('click', () => saveWorklog());
if (clearWorklogBtn) {
  clearWorklogBtn.addEventListener('click', () => {
    if (worklogHoursInput) worklogHoursInput.value = '0';
    saveWorklog({ hoursOverride: 0 });
  });
}
if (worklogHoursInput) {
  worklogHoursInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveWorklog();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeWorklogModal();
    }
  });
  worklogHoursInput.addEventListener('focus', selectWorklogInput);
  worklogHoursInput.addEventListener('click', selectWorklogInput);
}

const adjustWorklogHours = (delta) => {
  if (!worklogHoursInput) return;
  const rawValue = worklogHoursInput.value.trim();
  const current = Number(rawValue);
  const next = Number.isFinite(current) ? current + delta : delta;
  worklogHoursInput.value = Math.max(0, next).toFixed(1);
  selectWorklogInput();
};

if (decreaseWorklogBtn) {
  decreaseWorklogBtn.addEventListener('click', () => adjustWorklogHours(-0.5));
}
if (increaseWorklogBtn) {
  increaseWorklogBtn.addEventListener('click', () => adjustWorklogHours(0.5));
}

if (statusPopoverBackdrop) {
  statusPopoverBackdrop.addEventListener('click', closeStatusPopover);
}
if (statusList) {
  statusList.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    const button = target ? target.closest('.status-option') : null;
    if (!button || !activeStatusIssue) return;
    const transitionId = button.dataset.transitionId;
    if (!transitionId) return;
    const issueKey = activeStatusIssue;
    closeStatusPopover();

    pendingStatusUpdates += 1;
    updateProgressVisibility();
    setIssueLoading(issueKey, true);

    try {
      const result = await window.api.transitionIssue({
        issueKey,
        transitionId
      });
      transitionCache.delete(issueKey);
      if (currentData?.worklogs?.[issueKey]) {
        currentData.worklogs[issueKey].status = result.status;
        currentData.worklogs[issueKey].statusCategory = result.statusCategory;
      }
      updateStatusCell(issueKey);
      showToast('Status updated.', false);
    } catch (error) {
      showToast(error.message);
    } finally {
      setIssueLoading(issueKey, false);
      pendingStatusUpdates = Math.max(0, pendingStatusUpdates - 1);
      updateProgressVisibility();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeStatusPopover();
  }
});

async function loadSprintData() {
  const loadId = ++activeLoadId;
  isBatchLoading = true;
  updateProgressVisibility();

  try {
    const data = await window.api.fetchSprintIssues();
    if (loadId !== activeLoadId) return;

    currentData = {
      sprint: data.sprint,
      dates: data.dates,
      worklogs: {},
      siteUrl: data.siteUrl
    };
    issueOrder = data.issues.map((issue) => issue.key);
    worklogLoading = new Set(issueOrder);
    transitionCache = new Map();
    transitionRequests = new Map();
    statusOrderMap = new Map();
    if (Array.isArray(data.statusOrder)) {
      data.statusOrder.forEach((status, index) => {
        if (status?.id) statusOrderMap.set(status.id, index);
        if (status?.name) statusOrderMap.set(status.name, index);
      });
    }
    data.issues.forEach((issue) => {
      currentData.worklogs[issue.key] = {
        summary: issue.summary,
        status: issue.status,
        statusCategory: issue.statusCategory,
        labels: issue.labels,
        points: issue.points,
        days: {}
      };
    });

    renderDashboard(currentData);
    prefetchIssueTransitions(issueOrder).catch(() => {});

    for (const issue of data.issues) {
      if (loadId !== activeLoadId) return;
      setIssueLoading(issue.key, true);
      try {
        const result = await window.api.fetchIssueWorklogs({
          issueKey: issue.key,
          startDate: data.sprint.startDate,
          endDate: data.sprint.endDate
        });
        if (loadId !== activeLoadId) return;
        if (currentData.worklogs[issue.key]) {
          currentData.worklogs[issue.key].days = result.days;
        }
      } catch (error) {
        showToast(error.message);
      } finally {
        setIssueLoading(issue.key, false);
        updateIssueRow(issue.key);
        updateFooterTotals();
      }
    }
  } catch (error) {
    showToast(error.message);
    sprintNameEl.textContent = 'Error loading data';
    sprintDatesEl.textContent = error.message;
  } finally {
    if (loadId === activeLoadId) {
      isBatchLoading = false;
      updateProgressVisibility();
    }
  }
}

function getOrderedIssues(data) {
  if (!data || !data.worklogs) return [];
  if (issueOrder.length > 0) {
    return issueOrder.map((key) => [key, data.worklogs[key]]).filter(([, issue]) => !!issue);
  }
  return Object.entries(data.worklogs);
}

function calculateTotals(issues) {
  let totalSeconds = 0;
  const dayTotals = {};
  let pointsTotal = 0;
  let hasPoints = false;

  issues.forEach(([_, issue]) => {
    Object.entries(issue.days).forEach(([date, seconds]) => {
      totalSeconds += seconds;
      dayTotals[date] = (dayTotals[date] || 0) + seconds;
    });
    if (Number.isFinite(issue.points)) {
      pointsTotal += issue.points;
      hasPoints = true;
    }
  });

  return { totalSeconds, dayTotals, pointsTotal, hasPoints };
}

function updateIssueRow(issueKey) {
  if (!currentData || !timesheetGrid) return;
  const issue = currentData.worklogs[issueKey];
  if (!issue) return;
  const row = timesheetGrid.querySelector(`tbody tr[data-issue-key="${issueKey}"]`);
  if (!row) return;

  let rowTotal = 0;
  currentData.dates.forEach((date) => {
    const cell = row.querySelector(`td.hours-cell[data-date="${date}"]`);
    if (!cell) return;
    const seconds = issue.days[date] || 0;
    rowTotal += seconds;
    cell.dataset.seconds = seconds;
    cell.classList.toggle('has-hours', seconds > 0);
    cell.textContent = seconds > 0 ? formatHoursShort(seconds) : '-';
  });

  const totalCell = row.querySelector('td.total-cell');
  if (totalCell) totalCell.textContent = formatHoursShort(rowTotal);
}

function updateStatusCell(issueKey) {
  if (!currentData || !timesheetGrid) return;
  const issue = currentData.worklogs[issueKey];
  if (!issue) return;
  const row = timesheetGrid.querySelector(`tbody tr[data-issue-key="${issueKey}"]`);
  if (!row) return;
  const statusCell = row.querySelector('td.status-cell');
  if (!statusCell) return;
  const statusClass = getStatusClass(issue.statusCategory);
  statusCell.innerHTML = `<span class="status-pill ${statusClass}">${escapeHtml(issue.status || 'Unknown')}</span>`;
}

function updateFooterTotals() {
  if (!currentData || !timesheetGrid) return;
  const issues = getOrderedIssues(currentData);
  const totals = calculateTotals(issues);
  const tfoot = timesheetGrid.querySelector('tfoot');
  if (!tfoot || !tfoot.firstElementChild) return;
  const footerRow = tfoot.firstElementChild;

  currentData.dates.forEach((date) => {
    const cell = footerRow.querySelector(`td.hours-cell[data-date="${date}"]`);
    if (!cell) return;
    const seconds = totals.dayTotals[date] || 0;
    cell.classList.toggle('has-hours', seconds > 0);
    cell.textContent = seconds > 0 ? formatHoursShort(seconds) : '-';
  });

  const totalCell = footerRow.querySelector('td.total-cell');
  if (totalCell) totalCell.textContent = formatHoursShort(totals.totalSeconds);
  const pointsCell = footerRow.querySelector('td.points-cell');
  if (pointsCell) pointsCell.textContent = totals.hasPoints ? formatPoints(totals.pointsTotal) : '-';
}

function renderDashboard(data) {
  // Update sprint info
  sprintNameEl.textContent = data.sprint.name;
  sprintDatesEl.textContent = `${formatDate(data.sprint.startDate)} → ${formatDate(data.sprint.endDate)}`;
  document.title = `Sprint Timesheet - ${data.sprint.name} (${formatDate(data.sprint.startDate)} - ${formatDate(data.sprint.endDate)})`;
  
  const issues = getOrderedIssues(data);
  const totals = calculateTotals(issues);

  const workingDays = data.dates.filter(d => {
    const day = new Date(d).getDay();
    return day !== 0 && day !== 6;
  }).length;
  
  // Update stats if present in the UI
  if (totalHoursEl) totalHoursEl.textContent = formatHours(totals.totalSeconds);
  if (avgPerDayEl) avgPerDayEl.textContent = formatHours(workingDays > 0 ? totals.totalSeconds / workingDays : 0);
  if (taskCountEl) taskCountEl.textContent = issues.length;
  
  // Render grid
  renderGrid(data.dates, issues, totals.dayTotals, totals.totalSeconds, totals.hasPoints ? totals.pointsTotal : null);
}

function renderGrid(dates, issues, dayTotals, grandTotal, pointsTotal) {
  const thead = timesheetGrid.querySelector('thead');
  const tbody = timesheetGrid.querySelector('tbody');
  const tfoot = timesheetGrid.querySelector('tfoot');
  
  // Header
  let headerHtml = '<tr><th class="issue-col">Issue</th><th class="status-col">Status</th><th class="labels-col">Labels</th>';
  dates.forEach(date => {
    const d = new Date(date);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.getDate();
    headerHtml += `
      <th class="date-col ${isWeekend ? 'weekend' : ''}">
        ${dayNum}
        <span class="day-name">${dayName}</span>
      </th>
    `;
  });
  headerHtml += '<th class="total-col">Total</th><th class="points-col">Points</th></tr>';
  thead.innerHTML = headerHtml;
  
  // Body
  let bodyHtml = '';
  issues.forEach(([key, issue]) => {
    let rowTotal = 0;
    const statusClass = getStatusClass(issue.statusCategory);
    const labelsHtml = renderLabels(issue.labels || []);
    const pointsDisplay = Number.isFinite(issue.points) ? formatPoints(issue.points) : '-';
    const isLoading = worklogLoading.has(key);
    let rowHtml = `
      <tr data-issue-key="${key}">
        <td class="issue-cell">
          <div class="issue-key-row">
            <span class="issue-key">${key}</span>
            <span class="issue-spinner ${isLoading ? 'is-visible' : ''}"></span>
          </div>
          <div class="issue-summary">
            <button class="issue-link" type="button" data-issue-key="${key}" title="Open in Jira">
              ${escapeHtml(issue.summary)}
            </button>
          </div>
        </td>
        <td class="status-cell">
          <span class="status-pill ${statusClass}">${escapeHtml(issue.status || 'Unknown')}</span>
        </td>
        <td class="labels-cell">${labelsHtml}</td>
    `;
    
    dates.forEach(date => {
      const d = new Date(date);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const seconds = issue.days[date] || 0;
      rowTotal += seconds;
      const cellAttrs = `data-issue-key="${key}" data-date="${date}" data-seconds="${seconds}" title="Click to edit hours"`;
      
      if (seconds > 0) {
        rowHtml += `<td class="hours-cell has-hours ${isWeekend ? 'weekend' : ''}" ${cellAttrs}>${formatHoursShort(seconds)}</td>`;
      } else {
        rowHtml += `<td class="hours-cell ${isWeekend ? 'weekend' : ''}" ${cellAttrs}>-</td>`;
      }
    });
    
    rowHtml += `<td class="total-cell">${formatHoursShort(rowTotal)}</td><td class="points-cell">${pointsDisplay}</td></tr>`;
    bodyHtml += rowHtml;
  });
  tbody.innerHTML = bodyHtml;
  
  // Footer
  const pointsFooter = Number.isFinite(pointsTotal) ? formatPoints(pointsTotal) : '-';
  let footerHtml = '<tr><td class="issue-cell"><strong>TOTAL</strong></td><td class="status-cell"></td><td class="labels-cell"></td>';
  dates.forEach(date => {
    const d = new Date(date);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const seconds = dayTotals[date] || 0;
    
    if (seconds > 0) {
      footerHtml += `<td class="hours-cell has-hours ${isWeekend ? 'weekend' : ''}" data-date="${date}">${formatHoursShort(seconds)}</td>`;
    } else {
      footerHtml += `<td class="hours-cell ${isWeekend ? 'weekend' : ''}" data-date="${date}">-</td>`;
    }
  });
  footerHtml += `<td class="total-cell">${formatHoursShort(grandTotal)}</td><td class="points-cell">${pointsFooter}</td></tr>`;
  tfoot.innerHTML = footerHtml;
}

// Helpers
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatHours(seconds) {
  const hours = seconds / 3600;
  return `${hours.toFixed(1)}h`;
}

function formatHoursShort(seconds) {
  const hours = seconds / 3600;
  if (hours >= 10) {
    return `${Math.round(hours)}h`;
  }
  return `${hours.toFixed(1)}h`;
}

function formatPoints(points) {
  if (!Number.isFinite(points)) return '-';
  if (Math.abs(points - Math.round(points)) < 0.001) {
    return `${Math.round(points)}`;
  }
  return `${points.toFixed(1)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getStatusClass(colorName) {
  const normalized = String(colorName || '').toLowerCase().replace(/\s+/g, '-');
  return `status-${normalized || 'default'}`;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function renderLabels(labels) {
  if (!labels.length) return '<span class="label-empty">-</span>';
  const items = labels.map(label => {
    const safe = escapeHtml(label);
    const hue = Math.abs(hashString(label)) % 360;
    return `<span class="label-pill" style="--label-hue:${hue}">${safe}</span>`;
  }).join('');
  return `<div class="labels-list">${items}</div>`;
}

// Start
init();
