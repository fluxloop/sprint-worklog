// DOM Elements
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const loginBtn = document.getElementById('loginBtn');
const settingsLogoutBtn = document.getElementById('settingsLogoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const refreshText = refreshBtn ? refreshBtn.querySelector('.refresh-text') : null;
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const userInfo = document.getElementById('userInfo');
const userName = document.getElementById('userName');
const apiTokenLink = document.getElementById('apiTokenLink');

// Settings inputs
const emailInput = document.getElementById('email');
const apiTokenInput = document.getElementById('apiToken');
const siteUrlInput = document.getElementById('siteUrl');
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

// Task detail modal
const taskDetailModal = document.getElementById('taskDetailModal');
const taskDetailTitle = document.getElementById('taskDetailTitle');
const closeTaskDetailBtn = document.getElementById('closeTaskDetailBtn');
const taskDetailLoading = document.getElementById('taskDetailLoading');
const taskDetailContent = document.getElementById('taskDetailContent');
const addSubtaskBtn = document.getElementById('addSubtaskBtn');
const openInJiraBtn = document.getElementById('openInJiraBtn');
const deleteIssueBtn = document.getElementById('deleteIssueBtn');

// State
let appVersion = '';
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
let activeTaskDetailKey = null;

const TRANSITION_PREFETCH_CONCURRENCY = 3;

// Platform styling
if (navigator.platform && navigator.platform.toLowerCase().includes('mac')) {
  document.body.classList.add('is-mac');
}

// Initialize
const appTitle = () => `Jira Sprint Worklog - v${appVersion}`;

async function init() {
  const auth = await window.api.getAuthStatus();
  appVersion = auth.version || '';

  const titleSpan = document.querySelector('.app-title span');
  if (titleSpan) titleSpan.textContent = appTitle();

  if (auth.isAuthenticated) {
    showDashboard(auth.displayName);
    loadSprintData();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  userInfo.classList.add('hidden');
  document.title = appTitle();
}

function showDashboard(displayName) {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userName.textContent = displayName || 'Connected';
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

const openSettingsModal = async () => {
  const settings = await window.api.getSettings();
  emailInput.value = settings.email || '';
  apiTokenInput.value = settings.apiToken || '';
  siteUrlInput.value = settings.siteUrl || '';
  boardIdInput.value = settings.boardId || '';
  settingsModal.classList.remove('hidden');
};

// Auth handlers
loginBtn.addEventListener('click', async () => {
  try {
    const settings = await window.api.getSettings();
    if (!settings.email || !settings.apiToken || !settings.siteUrl) {
      await openSettingsModal();
      showToast('Please complete settings before connecting.');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Connecting...';
    
    const result = await window.api.startTokenLogin();
    
    if (result.success) {
      showDashboard(result.displayName);
      loadSprintData();
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `
      Connect to Atlassian
    `;
  }
});

settingsLogoutBtn.addEventListener('click', async () => {
  await window.api.logout();
  settingsModal.classList.add('hidden');
  showLogin();
});

// Settings handlers
settingsBtn.addEventListener('click', async () => {
  await openSettingsModal();
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

if (apiTokenLink) {
  apiTokenLink.addEventListener('click', async (event) => {
    event.preventDefault();
    const url = apiTokenLink.getAttribute('href');
    if (!url) return;
    try {
      await window.api.openExternal(url);
    } catch (error) {
      showToast(error.message);
    }
  });
}

saveSettingsBtn.addEventListener('click', async () => {
  await window.api.saveSettings({
    email: emailInput.value.trim(),
    apiToken: apiTokenInput.value.trim(),
    siteUrl: siteUrlInput.value.trim(),
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
    const toggleBtn = target.closest('.subtask-toggle');
    if (toggleBtn) {
      event.preventDefault();
      event.stopPropagation();
      const row = toggleBtn.closest('tr');
      const parentKey = row?.dataset.issueKey;
      if (parentKey) {
        const isCollapsed = toggleBtn.classList.toggle('is-collapsed');
        const tbody = row.closest('tbody');
        if (tbody) {
          tbody.querySelectorAll('tr.subtask-row').forEach((subtaskRow) => {
            const subtaskData = currentData.worklogs[subtaskRow.dataset.issueKey];
            if (subtaskData && subtaskData.parentKey === parentKey) {
              subtaskRow.style.display = isCollapsed ? 'none' : '';
            }
          });
        }
      }
      return;
    }

    const externalLinkBtn = target.closest('.external-link-btn');
    if (externalLinkBtn) {
      event.preventDefault();
      event.stopPropagation();
      openIssueInBrowser(externalLinkBtn.dataset.issueKey);
      return;
    }

    const issueLink = target.closest('.issue-link');
    if (issueLink) {
      event.preventDefault();
      event.stopPropagation();
      openTaskDetailModal(issueLink.dataset.issueKey);
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
      updateDetailStatusPill(issueKey);
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
        isSubtask: issue.isSubtask || false,
        parentKey: issue.parentKey || null,
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
  let flat;
  if (issueOrder.length > 0) {
    flat = issueOrder.map((key) => [key, data.worklogs[key]]).filter(([, issue]) => !!issue);
  } else {
    flat = Object.entries(data.worklogs);
  }

  // Group subtasks directly after their parent issue
  const parentKeys = new Set(flat.filter(([, issue]) => !issue.isSubtask).map(([key]) => key));
  const result = [];
  const subtasksByParent = new Map();

  for (const entry of flat) {
    const [, issue] = entry;
    if (issue.isSubtask && issue.parentKey && parentKeys.has(issue.parentKey)) {
      if (!subtasksByParent.has(issue.parentKey)) subtasksByParent.set(issue.parentKey, []);
      subtasksByParent.get(issue.parentKey).push(entry);
    }
  }

  for (const entry of flat) {
    const [key, issue] = entry;
    if (issue.isSubtask && issue.parentKey && parentKeys.has(issue.parentKey)) continue;
    result.push(entry);
    if (subtasksByParent.has(key)) {
      result.push(...subtasksByParent.get(key));
    }
  }

  return result;
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

function updateDetailStatusPill(issueKey) {
  if (!taskDetailContent || activeTaskDetailKey !== issueKey) return;
  const issue = currentData?.worklogs?.[issueKey];
  if (!issue) return;
  const pill = taskDetailContent.querySelector('.detail-status-pill');
  if (!pill) return;
  const statusClass = getStatusClass(issue.statusCategory);
  pill.className = `status-pill detail-status-pill ${statusClass}`;
  pill.textContent = issue.status || 'Unknown';
}

function updateSummaryCell(issueKey) {
  if (!currentData || !timesheetGrid) return;
  const issue = currentData.worklogs[issueKey];
  if (!issue) return;
  const row = timesheetGrid.querySelector(`tbody tr[data-issue-key="${issueKey}"]`);
  if (!row) return;
  const link = row.querySelector('.issue-link');
  if (link) link.textContent = issue.summary;
}

function updatePointsCell(issueKey) {
  if (!currentData || !timesheetGrid) return;
  const issue = currentData.worklogs[issueKey];
  if (!issue) return;
  const row = timesheetGrid.querySelector(`tbody tr[data-issue-key="${issueKey}"]`);
  if (!row) return;
  const pointsCell = row.querySelector('td.points-cell');
  if (pointsCell) pointsCell.textContent = Number.isFinite(issue.points) ? formatPoints(issue.points) : '-';
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
  document.title = `${appTitle()} - ${data.sprint.name} (${formatDate(data.sprint.startDate)} - ${formatDate(data.sprint.endDate)})`;
  
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
  
  // Body — determine which parents have subtasks
  const parentsWithSubtasks = new Set();
  issues.forEach(([, issue]) => {
    if (issue.isSubtask && issue.parentKey) parentsWithSubtasks.add(issue.parentKey);
  });

  let bodyHtml = '';
  issues.forEach(([key, issue]) => {
    let rowTotal = 0;
    const statusClass = getStatusClass(issue.statusCategory);
    const labelsHtml = renderLabels(issue.labels || []);
    const pointsDisplay = Number.isFinite(issue.points) ? formatPoints(issue.points) : '-';
    const isLoading = worklogLoading.has(key);
    const isSubtask = issue.isSubtask || false;
    const hasSubtasks = parentsWithSubtasks.has(key);

    const toggleBtn = hasSubtasks ? '<button class="subtask-toggle" type="button" title="Toggle subtasks"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/></svg></button>' : '';
    let rowHtml = `
      <tr data-issue-key="${key}"${isSubtask ? ' class="subtask-row"' : ''}>
        <td class="issue-cell">
          <div class="issue-cell-left">
            <div class="issue-key-row">
              <span class="issue-key">${key}</span>
              <button class="external-link-btn" type="button" data-issue-key="${key}" title="Open in Jira"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10M10 2h4v4M7 9l7-7"/></svg></button>
              <span class="issue-spinner ${isLoading ? 'is-visible' : ''}"></span>
            </div>
            <div class="issue-summary">
              <button class="issue-link" type="button" data-issue-key="${key}" title="View details">
                ${escapeHtml(issue.summary)}
              </button>
            </div>
          </div>
          ${toggleBtn}
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

// Task Detail Modal
const openTaskDetailModal = async (issueKey) => {
  if (!issueKey || !taskDetailModal) return;
  activeTaskDetailKey = issueKey;
  taskDetailTitle.textContent = issueKey;
  taskDetailLoading.classList.remove('hidden');
  taskDetailContent.classList.add('hidden');
  taskDetailContent.innerHTML = '';
  addSubtaskBtn.classList.add('hidden');
  taskDetailModal.classList.remove('hidden');

  try {
    const details = await window.api.fetchIssueDetails({ issueKey });
    if (activeTaskDetailKey !== issueKey) return;
    renderTaskDetail(details);
    taskDetailLoading.classList.add('hidden');
    taskDetailContent.classList.remove('hidden');
    if (!details.isSubtask) {
      addSubtaskBtn.classList.remove('hidden');
    }
  } catch (error) {
    taskDetailLoading.classList.add('hidden');
    taskDetailContent.classList.remove('hidden');
    taskDetailContent.innerHTML = `<p style="color:var(--accent-red)">${escapeHtml(error.message)}</p>`;
  }
};

const closeTaskDetailModal = () => {
  activeTaskDetailKey = null;
  if (taskDetailModal) taskDetailModal.classList.add('hidden');
  if (taskDetailContent) taskDetailContent.innerHTML = '';
  if (addSubtaskBtn) addSubtaskBtn.classList.add('hidden');
};

const formatDetailDate = (isoStr) => {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const htmlToAdf = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');

  const convertInline = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text) return [];
      return [{ type: 'text', text }];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const tag = node.tagName.toLowerCase();
    const markMap = { strong: 'strong', b: 'strong', em: 'em', i: 'em', s: 'strike', u: 'underline', code: 'code' };
    if (markMap[tag]) {
      const children = [];
      node.childNodes.forEach((c) => children.push(...convertInline(c)));
      return children.map((c) => {
        if (c.type !== 'text') return c;
        const marks = [...(c.marks || []), { type: markMap[tag] }];
        return { ...c, marks };
      });
    }
    if (tag === 'a') {
      const children = [];
      node.childNodes.forEach((c) => children.push(...convertInline(c)));
      return children.map((c) => {
        if (c.type !== 'text') return c;
        const marks = [...(c.marks || []), { type: 'link', attrs: { href: node.getAttribute('href') || '' } }];
        return { ...c, marks };
      });
    }
    if (tag === 'br') return [{ type: 'hardBreak' }];
    const children = [];
    node.childNodes.forEach((c) => children.push(...convertInline(c)));
    return children;
  };

  const convertBlock = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (!text) return [];
      return [{ type: 'paragraph', content: [{ type: 'text', text }] }];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const tag = node.tagName.toLowerCase();
    if (tag === 'p' || tag === 'div') {
      const content = [];
      node.childNodes.forEach((c) => content.push(...convertInline(c)));
      return [{ type: 'paragraph', content: content.length ? content : [{ type: 'text', text: '' }] }];
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const content = [];
      node.childNodes.forEach((c) => content.push(...convertInline(c)));
      return [{ type: 'heading', attrs: { level }, content: content.length ? content : [{ type: 'text', text: '' }] }];
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = [];
      node.querySelectorAll(':scope > li').forEach((li) => {
        const content = [];
        li.childNodes.forEach((c) => {
          const childTag = c.nodeType === Node.ELEMENT_NODE ? c.tagName.toLowerCase() : '';
          if (childTag === 'ul' || childTag === 'ol') {
            content.push(...convertBlock(c));
          } else {
            content.push(...convertInline(c));
          }
        });
        const inlineContent = content.filter((c) => c.type === 'text' || c.type === 'hardBreak');
        const blockContent = content.filter((c) => c.type !== 'text' && c.type !== 'hardBreak');
        const itemContent = [];
        if (inlineContent.length) itemContent.push({ type: 'paragraph', content: inlineContent });
        itemContent.push(...blockContent);
        items.push({ type: 'listItem', content: itemContent.length ? itemContent : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] });
      });
      return [{ type: tag === 'ul' ? 'bulletList' : 'orderedList', content: items }];
    }
    if (tag === 'blockquote') {
      const content = [];
      node.childNodes.forEach((c) => content.push(...convertBlock(c)));
      return [{ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }];
    }
    if (tag === 'pre') {
      const text = node.textContent || '';
      return [{ type: 'codeBlock', content: [{ type: 'text', text }] }];
    }
    if (tag === 'hr') return [{ type: 'rule' }];
    // Fallback: treat as paragraph with inline content
    const content = [];
    node.childNodes.forEach((c) => content.push(...convertInline(c)));
    if (content.length) return [{ type: 'paragraph', content }];
    return [];
  };

  const content = [];
  doc.body.childNodes.forEach((c) => content.push(...convertBlock(c)));
  return { version: 1, type: 'doc', content: content.length ? content : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] };
};

const EDITOR_TOOLBAR_HTML = `
  <div class="desc-editor-toolbar">
    <button type="button" data-cmd="bold" title="Bold"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2h4.5a3.5 3.5 0 012.447 6A3.5 3.5 0 019.5 14H4V2zm2 5h2.5a1.5 1.5 0 000-3H6v3zm0 2v3h3.5a1.5 1.5 0 000-3H6z"/></svg></button>
    <button type="button" data-cmd="italic" title="Italic"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M6 2h6v2h-2.2l-2.6 8H9v2H3v-2h2.2l2.6-8H6V2z"/></svg></button>
    <button type="button" data-cmd="insertUnorderedList" title="Bullet list"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="2" cy="4" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="2" cy="12" r="1.5"/><rect x="5" y="3" width="10" height="2" rx="0.5"/><rect x="5" y="7" width="10" height="2" rx="0.5"/><rect x="5" y="11" width="10" height="2" rx="0.5"/></svg></button>
    <button type="button" data-cmd="insertOrderedList" title="Numbered list"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><text x="0" y="5.5" font-size="5" font-weight="600" font-family="sans-serif">1.</text><text x="0" y="9.5" font-size="5" font-weight="600" font-family="sans-serif">2.</text><text x="0" y="13.5" font-size="5" font-weight="600" font-family="sans-serif">3.</text><rect x="5" y="3" width="10" height="2" rx="0.5"/><rect x="5" y="7" width="10" height="2" rx="0.5"/><rect x="5" y="11" width="10" height="2" rx="0.5"/></svg></button>
    <span class="desc-editor-spacer"></span>
    <button type="button" class="desc-editor-cancel" title="Cancel">Cancel</button>
    <button type="button" class="desc-editor-save btn-primary btn-small" title="Save">Save</button>
  </div>
`;

const renderTaskDetail = (details) => {
  if (!taskDetailContent) return;
  const statusClass = getStatusClass(details.statusCategory);
  const parentRow = details.parentKey
    ? `<div class="detail-row"><span class="detail-label">Parent</span><span class="detail-value"><button class="detail-parent-link" data-issue-key="${escapeHtml(details.parentKey)}">${escapeHtml(details.parentKey)}${details.parentSummary ? ' - ' + escapeHtml(details.parentSummary) : ''}</button></span></div>`
    : '';
  const labelsHtml = (details.labels && details.labels.length)
    ? `<div class="labels-list">${details.labels.map((label) => {
        const hue = Math.abs(hashString(label)) % 360;
        return `<span class="label-pill" style="--label-hue:${hue}">${escapeHtml(label)}</span>`;
      }).join('')}</div>`
    : '-';
  const pointsDisplay = Number.isFinite(details.points) ? formatPoints(details.points) : '-';
  const descriptionHtml = details.description
    ? `<div class="detail-description">${details.description}</div>`
    : '<span class="text-muted">No description</span>';

  taskDetailContent.innerHTML = `
    <div class="detail-summary-row">
      <span class="detail-summary">${escapeHtml(details.summary)}</span>
      <button class="detail-summary-edit-btn" type="button" title="Edit summary">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>
      </button>
    </div>
    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="status-pill detail-status-pill ${statusClass}">${escapeHtml(details.status)}</span></span></div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${escapeHtml(details.issueType)}</span></div>
      <div class="detail-row"><span class="detail-label">Priority</span><span class="detail-value">${escapeHtml(details.priority || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Assignee</span><span class="detail-value">${escapeHtml(details.assignee)}</span></div>
      <div class="detail-row"><span class="detail-label">Reporter</span><span class="detail-value">${escapeHtml(details.reporter || '-')}</span></div>
      <div class="detail-row">
        <span class="detail-label">Story Points</span>
        <span class="detail-value detail-points-value">
          <span class="detail-points-display">${pointsDisplay}</span>
          <button class="detail-points-edit-btn" type="button" title="Edit story points">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>
          </button>
        </span>
      </div>
      <div class="detail-row"><span class="detail-label">Labels</span><span class="detail-value">${labelsHtml}</span></div>
      ${parentRow}
      <div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${formatDetailDate(details.created)}</span></div>
      <div class="detail-row"><span class="detail-label">Updated</span><span class="detail-value">${formatDetailDate(details.updated)}</span></div>
    </div>
    <div class="detail-row detail-desc-header" style="margin-top:16px">
      <span class="detail-label">Description</span>
      <button class="detail-desc-edit-btn" type="button" title="Edit description">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>
      </button>
    </div>
    <div class="detail-desc-container">
      ${descriptionHtml}
    </div>
  `;
};

const submitSubtask = async () => {
  if (!activeTaskDetailKey) return;
  const summaryInput = taskDetailContent.querySelector('.subtask-summary-input');
  const pointsInput = taskDetailContent.querySelector('.subtask-points-input');
  const summary = summaryInput ? summaryInput.value.trim() : '';
  if (!summary) {
    showToast('Subtask summary is required.');
    return;
  }
  const points = pointsInput && pointsInput.value.trim() !== '' ? Number(pointsInput.value) : null;
  if (points !== null && !Number.isFinite(points)) {
    showToast('Invalid story points value.');
    return;
  }

  const createBtn = taskDetailContent.querySelector('.subtask-create-btn');
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
  }

  try {
    const result = await window.api.createSubtask({
      parentKey: activeTaskDetailKey,
      summary,
      points
    });
    closeTaskDetailModal();
    showToast(`Subtask ${result.key} created.`, false);
    loadSprintData();
  } catch (error) {
    showToast(error.message);
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
    }
  }
};

if (closeTaskDetailBtn) closeTaskDetailBtn.addEventListener('click', closeTaskDetailModal);
if (taskDetailModal) {
  const backdrop = taskDetailModal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeTaskDetailModal);
}

if (openInJiraBtn) {
  openInJiraBtn.addEventListener('click', () => {
    if (activeTaskDetailKey) openIssueInBrowser(activeTaskDetailKey);
  });
}

if (deleteIssueBtn) {
  deleteIssueBtn.addEventListener('click', () => {
    if (!activeTaskDetailKey) return;
    const issueKey = activeTaskDetailKey;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <p class="confirm-dialog-message">Delete <strong>${escapeHtml(issueKey)}</strong>?</p>
        <p class="confirm-dialog-hint">This action cannot be undone.</p>
        <div class="confirm-dialog-actions">
          <button class="btn-secondary confirm-cancel-btn" type="button">Cancel</button>
          <button class="btn-secondary btn-danger confirm-delete-btn" type="button">Delete</button>
        </div>
      </div>
    `;
    taskDetailModal.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.confirm-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('.confirm-delete-btn').addEventListener('click', async () => {
      const btn = overlay.querySelector('.confirm-delete-btn');
      btn.disabled = true;
      btn.textContent = 'Deleting...';
      try {
        await window.api.deleteIssue({ issueKey });
        close();
        closeTaskDetailModal();
        showToast(`${issueKey} deleted.`, false);
        loadSprintData();
      } catch (error) {
        showToast(error.message);
        close();
      }
    });
  });
}

if (addSubtaskBtn) {
  addSubtaskBtn.addEventListener('click', () => {
    if (!taskDetailContent) return;
    // Don't add form if already present
    if (taskDetailContent.querySelector('.subtask-form')) return;
    const form = document.createElement('div');
    form.className = 'subtask-form';
    form.innerHTML = `
      <div class="form-group">
        <label>Subtask Summary</label>
        <input type="text" class="subtask-summary-input" placeholder="Subtask summary">
      </div>
      <div class="form-group">
        <label>Story Points (optional)</label>
        <input type="number" class="subtask-points-input" min="0" step="0.5" placeholder="0">
      </div>
      <div class="subtask-form-actions">
        <button class="btn-secondary subtask-cancel-btn" type="button">Cancel</button>
        <button class="btn-primary subtask-create-btn" type="button">Create</button>
      </div>
    `;
    taskDetailContent.appendChild(form);
    const summaryInput = form.querySelector('.subtask-summary-input');
    if (summaryInput) summaryInput.focus();

    form.querySelector('.subtask-cancel-btn').addEventListener('click', () => form.remove());
    form.querySelector('.subtask-create-btn').addEventListener('click', submitSubtask);
    form.querySelectorAll('input').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitSubtask(); }
      });
    });
  });
}

if (taskDetailContent) {
  taskDetailContent.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    const detailStatusPill = target ? target.closest('.detail-status-pill') : null;
    if (detailStatusPill && activeTaskDetailKey) {
      event.preventDefault();
      openStatusPopover(activeTaskDetailKey, detailStatusPill);
      return;
    }
    const editSummaryBtn = target ? target.closest('.detail-summary-edit-btn') : null;
    if (editSummaryBtn) {
      event.preventDefault();
      const row = taskDetailContent.querySelector('.detail-summary-row');
      if (!row || row.querySelector('.detail-summary-input')) return;
      const display = row.querySelector('.detail-summary');
      const currentText = display ? display.textContent.trim() : '';
      editSummaryBtn.classList.add('hidden');
      display.classList.add('hidden');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'detail-summary-input';
      input.value = currentText;
      row.insertBefore(input, editSummaryBtn);
      input.focus();
      input.select();

      const saveSummary = async () => {
        const val = input.value.trim();
        if (!val) { showToast('Summary cannot be empty.'); return; }
        if (val === currentText) {
          input.remove();
          display.classList.remove('hidden');
          editSummaryBtn.classList.remove('hidden');
          return;
        }
        input.disabled = true;
        try {
          await window.api.updateIssueSummary({ issueKey: activeTaskDetailKey, summary: val });
          display.textContent = val;
          if (currentData?.worklogs?.[activeTaskDetailKey]) {
            currentData.worklogs[activeTaskDetailKey].summary = val;
            updateSummaryCell(activeTaskDetailKey);
          }
          showToast('Summary updated.', false);
        } catch (err) {
          showToast(err.message);
        } finally {
          input.remove();
          display.classList.remove('hidden');
          editSummaryBtn.classList.remove('hidden');
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveSummary(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          input.remove();
          display.classList.remove('hidden');
          editSummaryBtn.classList.remove('hidden');
        }
      });
      input.addEventListener('blur', () => { if (input.parentElement) saveSummary(); });
      return;
    }
    const editDescBtn = target ? target.closest('.detail-desc-edit-btn') : null;
    if (editDescBtn) {
      event.preventDefault();
      const container = taskDetailContent.querySelector('.detail-desc-container');
      if (!container || container.querySelector('.desc-editor')) return;
      const descEl = container.querySelector('.detail-description');
      const noDescEl = container.querySelector('.text-muted');
      const currentHtml = descEl ? descEl.innerHTML : '';

      // Hide original content
      if (descEl) descEl.classList.add('hidden');
      if (noDescEl) noDescEl.classList.add('hidden');
      editDescBtn.classList.add('hidden');

      // Create editor
      const editor = document.createElement('div');
      editor.className = 'desc-editor';
      editor.innerHTML = EDITOR_TOOLBAR_HTML;
      const editable = document.createElement('div');
      editable.className = 'desc-editor-body detail-description';
      editable.contentEditable = 'true';
      editable.innerHTML = currentHtml || '<p><br></p>';
      editor.appendChild(editable);
      container.appendChild(editor);
      editable.focus();

      // Toolbar commands
      editor.querySelector('.desc-editor-toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cmd]');
        if (btn) {
          e.preventDefault();
          document.execCommand(btn.dataset.cmd, false, null);
          editable.focus();
        }
      });

      const closeEditor = () => {
        editor.remove();
        if (descEl) descEl.classList.remove('hidden');
        if (noDescEl && !descEl) noDescEl.classList.remove('hidden');
        editDescBtn.classList.remove('hidden');
      };

      editor.querySelector('.desc-editor-cancel').addEventListener('click', (e) => {
        e.preventDefault();
        closeEditor();
      });

      editor.querySelector('.desc-editor-save').addEventListener('click', async (e) => {
        e.preventDefault();
        const saveBtn = editor.querySelector('.desc-editor-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
          const adf = htmlToAdf(editable.innerHTML);
          await window.api.updateIssueDescription({ issueKey: activeTaskDetailKey, description: adf });
          // Update the display
          const newHtml = editable.innerHTML;
          if (descEl) {
            descEl.innerHTML = newHtml;
          } else {
            // Was "No description", create the element
            if (noDescEl) noDescEl.remove();
            const newDesc = document.createElement('div');
            newDesc.className = 'detail-description';
            newDesc.innerHTML = newHtml;
            container.insertBefore(newDesc, editor);
          }
          editor.remove();
          editDescBtn.classList.remove('hidden');
          showToast('Description updated.', false);
        } catch (err) {
          showToast(err.message);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
      });
      return;
    }
    const parentLink = target ? target.closest('.detail-parent-link') : null;
    if (parentLink) {
      event.preventDefault();
      openTaskDetailModal(parentLink.dataset.issueKey);
      return;
    }
    const editPointsBtn = target ? target.closest('.detail-points-edit-btn') : null;
    if (editPointsBtn) {
      event.preventDefault();
      const container = taskDetailContent.querySelector('.detail-points-value');
      if (!container || container.querySelector('.detail-points-input')) return;
      const display = container.querySelector('.detail-points-display');
      const currentText = display ? display.textContent.trim() : '';
      const currentVal = currentText !== '-' ? currentText : '';
      editPointsBtn.classList.add('hidden');
      display.classList.add('hidden');
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'detail-points-input';
      input.min = '0';
      input.step = '0.5';
      input.value = currentVal;
      container.insertBefore(input, editPointsBtn);
      input.focus();
      input.select();

      const savePoints = async () => {
        const val = input.value.trim();
        const points = val === '' ? null : Number(val);
        if (points !== null && !Number.isFinite(points)) {
          showToast('Invalid story points value.');
          return;
        }
        input.disabled = true;
        try {
          await window.api.updateStoryPoints({ issueKey: activeTaskDetailKey, points });
          if (display) display.textContent = points !== null ? formatPoints(points) : '-';
          if (currentData?.worklogs?.[activeTaskDetailKey]) {
            currentData.worklogs[activeTaskDetailKey].points = points;
            updatePointsCell(activeTaskDetailKey);
            updateFooterTotals();
          }
          showToast('Story points updated.', false);
        } catch (err) {
          showToast(err.message);
        } finally {
          input.remove();
          if (display) display.classList.remove('hidden');
          editPointsBtn.classList.remove('hidden');
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); savePoints(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          input.remove();
          if (display) display.classList.remove('hidden');
          editPointsBtn.classList.remove('hidden');
        }
      });
      input.addEventListener('blur', () => {
        if (input.parentElement) savePoints();
      });
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && taskDetailModal && !taskDetailModal.classList.contains('hidden')) {
    closeTaskDetailModal();
  }
});

// Start
init();
