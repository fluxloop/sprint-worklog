const { app, BrowserWindow, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

const formatJiraDateTime = (date) => {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}${offsetMins}`;
};

const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const FIELD_CACHE_TTL_MS = 10 * 60 * 1000;
const BOARD_CACHE_TTL_MS = 10 * 60 * 1000;
let userCache = null;
let userCacheAt = 0;
let fieldCache = null;
let fieldCacheAt = 0;
let boardStatusCache = null;
let boardStatusCacheAt = 0;

const requestJson = async (fetch, url, headers) => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    const baseMessage = `API error: ${response.status} - ${text}`;
    if (response.status === 401 && text.includes('scope does not match')) {
      const hint = url.includes('/rest/agile/1.0/')
        ? 'Make sure your Jira user has Jira Software access and the token has the required permissions.'
        : 'Check your Jira permissions and API token.';
      throw new Error(`${baseMessage}. ${hint}`);
    }
    throw new Error(baseMessage);
  }
  return response.json();
};

const formatDateInTimeZone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = {};
  for (const part of parts) {
    values[part.type] = part.value;
  }
  return `${values.year}-${values.month}-${values.day}`;
};

const buildDatesArray = (startDateKey, endDateKey) => {
  const parseDateKey = (dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const dates = [];
  const currentDate = parseDateKey(startDateKey);
  const endDateMidnight = parseDateKey(endDateKey);
  while (currentDate <= endDateMidnight) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  return dates;
};

const normalizeSiteUrl = (siteUrl) => {
  const trimmed = String(siteUrl || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const getApiContext = () => {
  const email = store.get('email');
  const apiToken = store.get('apiToken');
  const siteUrl = normalizeSiteUrl(store.get('siteUrl'));
  if (!email || !apiToken || !siteUrl) {
    throw new Error('Not authenticated');
  }
  const baseUrl = siteUrl;
  const authToken = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${authToken}`,
    'Accept': 'application/json'
  };
  return { baseUrl, headers, siteUrl };
};

const getSiteUrl = () => normalizeSiteUrl(store.get('siteUrl'));

const getUserContext = async (fetch, baseUrl, headers) => {
  if (userCache && Date.now() - userCacheAt < USER_CACHE_TTL_MS) {
    return userCache;
  }
  const myself = await requestJson(fetch, `${baseUrl}/rest/api/3/myself`, headers);
  userCache = {
    myAccountId: myself.accountId,
    jiraTimeZone: myself.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    displayName: myself.displayName
  };
  userCacheAt = Date.now();
  return userCache;
};

const getStoryPointsFieldId = async (fetch, baseUrl, headers) => {
  if (fieldCache && Date.now() - fieldCacheAt < FIELD_CACHE_TTL_MS) {
    return fieldCache;
  }
  const fields = await requestJson(fetch, `${baseUrl}/rest/api/3/field`, headers);
  const normalized = (value) => String(value || '').toLowerCase();
  const normalizedFields = fields.map((field) => ({
    field,
    name: normalized(field.name)
  }));
  const matchers = [
    (name) => name === 'story point estimate',
    (name) => name === 'story points',
    (name) => name.includes('story point estimate'),
    (name) => name.includes('story points'),
    (name) => name.includes('story point')
  ];
  let match = null;
  for (const matcher of matchers) {
    match = normalizedFields.find((entry) => matcher(entry.name));
    if (match) break;
  }
  fieldCache = match ? match.field.id : null;
  fieldCacheAt = Date.now();
  return fieldCache;
};

const getBoardStatusOrder = async (fetch, baseUrl, headers, boardId) => {
  if (boardStatusCache && Date.now() - boardStatusCacheAt < BOARD_CACHE_TTL_MS) {
    return boardStatusCache;
  }
  const config = await requestJson(
    fetch,
    `${baseUrl}/rest/agile/1.0/board/${boardId}/configuration`,
    headers
  );
  const statuses = [];
  const columns = config?.columnConfig?.columns || [];
  columns.forEach((column) => {
    (column.statuses || []).forEach((status) => {
      if (status && (status.id || status.name)) {
        statuses.push({ id: status.id || null, name: status.name || '' });
      }
    });
  });
  boardStatusCache = statuses;
  boardStatusCacheAt = Date.now();
  return boardStatusCache;
};

const getActiveSprintInfo = async (fetch, baseUrl, headers, boardId) => {
  const sprints = await requestJson(
    fetch,
    `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`,
    headers
  );
  if (sprints.values && sprints.values.length > 0) {
    const s = sprints.values[0];
    return {
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      completeDate: s.completeDate
    };
  }
  throw new Error('No active sprint found on this board');
};

let mainWindow;

function createWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../../build/icon.ico')
    : path.join(__dirname, '../../build/icon_rounded.png');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(__dirname, '../../build/icon_rounded.png');
    const dockIcon = nativeImage.createFromPath(dockIconPath);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handlers

ipcMain.handle('get-auth-status', async () => {
  const email = store.get('email');
  const apiToken = store.get('apiToken');
  const siteUrl = getSiteUrl();
  const displayName = store.get('displayName');
  return { 
    isAuthenticated: !!(email && apiToken && siteUrl),
    displayName,
    siteUrl
  };
});

ipcMain.handle('get-settings', async () => {
  return {
    email: store.get('email', ''),
    apiToken: store.get('apiToken', ''),
    siteUrl: store.get('siteUrl', ''),
    boardId: store.get('boardId', '')
  };
});

ipcMain.handle('save-settings', async (event, settings) => {
  store.set('email', settings.email);
  store.set('apiToken', settings.apiToken);
  store.set('siteUrl', normalizeSiteUrl(settings.siteUrl));
  store.set('boardId', settings.boardId);
  return true;
});

ipcMain.handle('start-token-login', async () => {
  const email = store.get('email');
  const apiToken = store.get('apiToken');
  const siteUrl = getSiteUrl();

  if (!email || !apiToken || !siteUrl) {
    throw new Error('Please configure email, API token, and site URL in Settings first');
  }
  if (!/^https?:\/\//i.test(siteUrl)) {
    throw new Error('Site URL must start with https://');
  }

  const fetch = require('node-fetch');
  const { baseUrl, headers } = getApiContext();
  const myself = await requestJson(fetch, `${baseUrl}/rest/api/3/myself`, headers);
  store.set('displayName', myself.displayName || email);
  return { success: true, displayName: myself.displayName || email };
});

ipcMain.handle('logout', async () => {
  store.delete('email');
  store.delete('apiToken');
  store.delete('siteUrl');
  store.delete('displayName');
  store.delete('accessToken');
  store.delete('refreshToken');
  store.delete('cloudId');
  store.delete('siteName');
  userCache = null;
  userCacheAt = 0;
  fieldCache = null;
  fieldCacheAt = 0;
  boardStatusCache = null;
  boardStatusCacheAt = 0;
  return true;
});

ipcMain.handle('fetch-sprint-data', async () => {
  const fetch = require('node-fetch');

  const boardId = store.get('boardId');

  if (!boardId) {
    throw new Error('Please configure Board ID in Settings');
  }

  const { baseUrl, headers } = getApiContext();

  const getJson = async (url) => {
    console.log('Fetching:', url);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const text = await response.text();
      console.error('API Error:', response.status, text);
      throw new Error(`API error: ${response.status} - ${text}`);
    }
    return response.json();
  };

  const getStoryPointsFieldId = async () => {
    const fields = await getJson(`${baseUrl}/rest/api/3/field`);
    const normalized = (value) => String(value || '').toLowerCase();
    const normalizedFields = fields.map((field) => ({
      field,
      name: normalized(field.name)
    }));
    const matchers = [
      (name) => name === 'story point estimate',
      (name) => name === 'story points',
      (name) => name.includes('story point estimate'),
      (name) => name.includes('story points'),
      (name) => name.includes('story point')
    ];
    let match = null;
    for (const matcher of matchers) {
      match = normalizedFields.find((entry) => matcher(entry.name));
      if (match) break;
    }
    return match ? match.field.id : null;
  };

  // 1) Get current user first
  console.log('Getting current user...');
  const myself = await getJson(`${baseUrl}/rest/api/3/myself`);
  const myAccountId = myself.accountId;
  console.log('User:', myself.displayName);

  const jiraTimeZone = myself.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatDateInTimeZone = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const values = {};
    for (const part of parts) {
      values[part.type] = part.value;
    }
    return `${values.year}-${values.month}-${values.day}`;
  };
  const formatDateKey = (date) => formatDateInTimeZone(date, jiraTimeZone);

  // 2) Get active sprint from board using Agile API
  console.log('Getting active sprint from board', boardId);
  let sprintInfo;
  try {
    const sprints = await getJson(`${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`);
    if (sprints.values && sprints.values.length > 0) {
      const s = sprints.values[0];
      sprintInfo = {
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate
      };
      console.log('Found sprint:', sprintInfo.name);
    }
  } catch (e) {
    console.error('Agile API failed:', e.message);
    throw new Error('Could not get sprint. Make sure you have Jira Software permissions and the Board ID is correct.');
  }

  if (!sprintInfo) {
    throw new Error('No active sprint found on this board');
  }

  const sprintId = sprintInfo.id;
  const sprintName = sprintInfo.name;
  const startDate = new Date(sprintInfo.startDate);
  const rawEndDate = sprintInfo.endDate || sprintInfo.completeDate;
  const endDate = rawEndDate ? new Date(rawEndDate) : new Date();
  const startDateKey = formatDateKey(startDate);
  const endDateKey = formatDateKey(endDate);

  // 3) Get issues assigned to you in the active sprint
  console.log('Getting your issues...');
 
  // JQL: Issues assigned to you in this sprint
  const jql = `assignee = currentUser() AND sprint = ${sprintId} ORDER BY key`;
  const storyPointsFieldId = await getStoryPointsFieldId();
  const issueFields = ['key', 'summary', 'status', 'labels'];
  if (storyPointsFieldId) issueFields.push(storyPointsFieldId);
  
  let allIssues = [];
  let startAt = 0;
  
  while (true) {
    const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=100&fields=${issueFields.join(',')}`;
    const data = await getJson(url);
    allIssues.push(...data.issues.map((i) => {
      const rawPoints = storyPointsFieldId ? i.fields[storyPointsFieldId] : null;
      let pointsValue = null;
      if (rawPoints !== null && rawPoints !== undefined && rawPoints !== '') {
        pointsValue = typeof rawPoints === 'number' ? rawPoints : Number(rawPoints);
        if (!Number.isFinite(pointsValue)) pointsValue = null;
      }
      return {
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name || '',
        statusCategory: i.fields.status?.statusCategory?.colorName || 'medium-gray',
        labels: i.fields.labels || [],
        points: pointsValue
      };
    }));
    const total = data.total || 0;
    const maxResults = data.maxResults || 100;
    console.log(`Fetched ${allIssues.length} of ${total} issues`);
    if (startAt + maxResults >= total) break;
    startAt += maxResults;
  }
  console.log('Found', allIssues.length, 'issues');

  // 4) Get worklogs for each issue
  console.log('Getting worklog details...');
  const worklogsGrid = {};
  
  for (const issue of allIssues) {
    worklogsGrid[issue.key] = {
      summary: issue.summary,
      status: issue.status,
      statusCategory: issue.statusCategory,
      labels: issue.labels,
      points: issue.points,
      days: {}
    };
    
    let wStart = 0;
    while (true) {
      const wl = await getJson(`${baseUrl}/rest/api/3/issue/${issue.key}/worklog?startAt=${wStart}&maxResults=100`);
      
      for (const w of wl.worklogs || []) {
        const started = new Date(w.started);
        const dateStr = formatDateKey(started);
        
        // Filter by sprint date range
        if (dateStr < startDateKey || dateStr > endDateKey) continue;
        // Filter by current user
        if (w.author?.accountId !== myAccountId) continue;
        
        worklogsGrid[issue.key].days[dateStr] = (worklogsGrid[issue.key].days[dateStr] || 0) + w.timeSpentSeconds;
      }
      
      if (wStart + (wl.maxResults || 100) >= (wl.total || 0)) break;
      wStart += (wl.maxResults || 100);
    }
  }
  console.log('Done fetching worklogs');

  // Build dates array
  const dates = [];
  const parseDateKey = (dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const currentDate = parseDateKey(startDateKey);
  const endDateMidnight = parseDateKey(endDateKey);
  while (currentDate <= endDateMidnight) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return {
    sprint: {
      name: sprintName,
      startDate: startDateKey,
      endDate: endDateKey
    },
    dates,
    worklogs: worklogsGrid,
    user: myself.displayName
  };
});

ipcMain.handle('fetch-sprint-issues', async () => {
  const fetch = require('node-fetch');

  const boardId = store.get('boardId');
  if (!boardId) {
    throw new Error('Please configure Board ID in Settings');
  }

  const { baseUrl, headers } = getApiContext();
  const { jiraTimeZone, displayName } = await getUserContext(fetch, baseUrl, headers);
  const siteUrl = getSiteUrl();

  let sprintInfo;
  try {
    sprintInfo = await getActiveSprintInfo(fetch, baseUrl, headers, boardId);
  } catch (e) {
    if (e.message && e.message.includes('No active sprint')) {
      throw e;
    }
    throw new Error('Could not get sprint. Make sure you have Jira Software permissions and the Board ID is correct.');
  }

  const startDate = new Date(sprintInfo.startDate);
  const rawEndDate = sprintInfo.endDate || sprintInfo.completeDate;
  const endDate = rawEndDate ? new Date(rawEndDate) : new Date();
  const startDateKey = formatDateInTimeZone(startDate, jiraTimeZone);
  const endDateKey = formatDateInTimeZone(endDate, jiraTimeZone);
  const dates = buildDatesArray(startDateKey, endDateKey);

  const storyPointsFieldId = await getStoryPointsFieldId(fetch, baseUrl, headers);
  let statusOrder = [];
  try {
    statusOrder = await getBoardStatusOrder(fetch, baseUrl, headers, boardId);
  } catch (error) {
    if (error?.message?.includes('scope does not match')) {
      console.warn('Skipping board status order due to missing scopes');
    } else {
      throw error;
    }
  }
  const issueFields = ['key', 'summary', 'status', 'labels'];
  if (storyPointsFieldId) issueFields.push(storyPointsFieldId);

  const jql = `assignee = currentUser() AND sprint = ${sprintInfo.id} ORDER BY key`;
  let allIssues = [];
  let startAt = 0;

  while (true) {
    const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=100&fields=${issueFields.join(',')}`;
    const data = await requestJson(fetch, url, headers);
    allIssues.push(...data.issues.map((i) => {
      const rawPoints = storyPointsFieldId ? i.fields[storyPointsFieldId] : null;
      let pointsValue = null;
      if (rawPoints !== null && rawPoints !== undefined && rawPoints !== '') {
        pointsValue = typeof rawPoints === 'number' ? rawPoints : Number(rawPoints);
        if (!Number.isFinite(pointsValue)) pointsValue = null;
      }
      return {
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name || '',
        statusCategory: i.fields.status?.statusCategory?.colorName || 'medium-gray',
        labels: i.fields.labels || [],
        points: pointsValue
      };
    }));
    const total = data.total || 0;
    const maxResults = data.maxResults || 100;
    if (startAt + maxResults >= total) break;
    startAt += maxResults;
  }

  return {
    sprint: {
      name: sprintInfo.name,
      startDate: startDateKey,
      endDate: endDateKey
    },
    dates,
    issues: allIssues,
    statusOrder,
    siteUrl,
    user: displayName
  };
});

ipcMain.handle('fetch-issue-worklogs', async (event, payload) => {
  const fetch = require('node-fetch');

  if (!payload || !payload.issueKey || !payload.startDate || !payload.endDate) {
    throw new Error('Invalid worklog request');
  }

  const { baseUrl, headers } = getApiContext();
  const { myAccountId, jiraTimeZone } = await getUserContext(fetch, baseUrl, headers);

  const issueKey = payload.issueKey;
  const startDateKey = payload.startDate;
  const endDateKey = payload.endDate;
  const formatDateKey = (date) => formatDateInTimeZone(date, jiraTimeZone);

  const days = {};
  let wStart = 0;
  while (true) {
    const wl = await requestJson(
      fetch,
      `${baseUrl}/rest/api/3/issue/${issueKey}/worklog?startAt=${wStart}&maxResults=100`,
      headers
    );

    for (const w of wl.worklogs || []) {
      if (w.author?.accountId !== myAccountId) continue;
      const dateKey = formatDateKey(new Date(w.started));
      if (dateKey < startDateKey || dateKey > endDateKey) continue;
      days[dateKey] = (days[dateKey] || 0) + w.timeSpentSeconds;
    }

    if (wStart + (wl.maxResults || 100) >= (wl.total || 0)) break;
    wStart += (wl.maxResults || 100);
  }

  return { issueKey, days };
});

ipcMain.handle('set-worklog-hours', async (event, payload) => {
  const fetch = require('node-fetch');

  const { baseUrl, headers } = getApiContext();

  if (!payload || !payload.issueKey || !payload.date || !Number.isFinite(payload.hours)) {
    throw new Error('Invalid worklog update payload');
  }

  if (payload.hours < 0) {
    throw new Error('Hours must be 0 or greater');
  }

  const requestHeaders = {
    ...headers,
    'Content-Type': 'application/json'
  };

  const sendRequest = async (url, options) => {
    const response = await fetch(url, { ...options, headers: requestHeaders });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error: ${response.status} - ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  };

  const { myAccountId, jiraTimeZone } = await getUserContext(fetch, baseUrl, headers);
  const formatDateKey = (date) => formatDateInTimeZone(date, jiraTimeZone);

  const issueKey = payload.issueKey;
  const targetDate = payload.date;
  const targetSeconds = Math.round(payload.hours * 3600);

  const worklogs = [];
  let wStart = 0;
  while (true) {
    const wl = await requestJson(fetch, `${baseUrl}/rest/api/3/issue/${issueKey}/worklog?startAt=${wStart}&maxResults=100`, headers);
    worklogs.push(...(wl.worklogs || []));
    const total = wl.total || 0;
    const maxResults = wl.maxResults || 100;
    if (wStart + maxResults >= total) break;
    wStart += maxResults;
  }

  const dayWorklogs = worklogs
    .filter((w) => w.author?.accountId === myAccountId)
    .filter((w) => formatDateKey(new Date(w.started)) === targetDate)
    .sort((a, b) => new Date(b.started) - new Date(a.started));

  const currentSeconds = dayWorklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);

  if (currentSeconds === targetSeconds) {
    return { updated: false, seconds: currentSeconds };
  }

  if (targetSeconds > currentSeconds) {
    const delta = targetSeconds - currentSeconds;
    const started = formatJiraDateTime(new Date(`${targetDate}T12:00:00`));
    await sendRequest(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog`, {
      method: 'POST',
      body: JSON.stringify({ timeSpentSeconds: delta, started })
    });
  } else {
    let toRemove = currentSeconds - targetSeconds;
    for (const worklog of dayWorklogs) {
      if (toRemove <= 0) break;
      if (toRemove >= worklog.timeSpentSeconds) {
        await sendRequest(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog/${worklog.id}?notifyUsers=false`, {
          method: 'DELETE'
        });
        toRemove -= worklog.timeSpentSeconds;
      } else {
        const updatedSeconds = worklog.timeSpentSeconds - toRemove;
        await sendRequest(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog/${worklog.id}?notifyUsers=false`, {
          method: 'PUT',
          body: JSON.stringify({ timeSpentSeconds: updatedSeconds, started: worklog.started })
        });
        toRemove = 0;
      }
    }

    if (toRemove > 0) {
      throw new Error('Unable to reduce worklog hours to the requested value.');
    }
  }

  return { updated: true, seconds: targetSeconds };
});

ipcMain.handle('fetch-issue-transitions', async (event, payload) => {
  const fetch = require('node-fetch');

  if (!payload || !payload.issueKey) {
    throw new Error('Invalid issue transition request');
  }

  const { baseUrl, headers } = getApiContext();
  const data = await requestJson(
    fetch,
    `${baseUrl}/rest/api/3/issue/${payload.issueKey}/transitions`,
    headers
  );

  return (data.transitions || []).map((transition) => ({
    id: transition.id,
    name: transition.name,
    to: {
      id: transition.to?.id || null,
      name: transition.to?.name || transition.name,
      statusCategory: transition.to?.statusCategory?.colorName || 'medium-gray'
    }
  }));
});

ipcMain.handle('transition-issue', async (event, payload) => {
  const fetch = require('node-fetch');

  if (!payload || !payload.issueKey || !payload.transitionId) {
    throw new Error('Invalid issue transition payload');
  }

  const { baseUrl, headers } = getApiContext();
  const response = await fetch(`${baseUrl}/rest/api/3/issue/${payload.issueKey}/transitions`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ transition: { id: payload.transitionId } })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} - ${text}`);
  }

  const issue = await requestJson(
    fetch,
    `${baseUrl}/rest/api/3/issue/${payload.issueKey}?fields=status`,
    headers
  );

  return {
    status: issue.fields.status?.name || '',
    statusCategory: issue.fields.status?.statusCategory?.colorName || 'medium-gray'
  };
});

ipcMain.handle('open-external', async (event, url) => {
  if (!url || typeof url !== 'string') return false;
  await shell.openExternal(url);
  return true;
});
