const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAuthStatus: () => ipcRenderer.invoke('get-auth-status'),
  startTokenLogin: () => ipcRenderer.invoke('start-token-login'),
  logout: () => ipcRenderer.invoke('logout'),
  fetchSprintData: () => ipcRenderer.invoke('fetch-sprint-data'),
  fetchSprintIssues: () => ipcRenderer.invoke('fetch-sprint-issues'),
  fetchIssueWorklogs: (payload) => ipcRenderer.invoke('fetch-issue-worklogs', payload),
  setWorklogHours: (payload) => ipcRenderer.invoke('set-worklog-hours', payload),
  fetchIssueTransitions: (payload) => ipcRenderer.invoke('fetch-issue-transitions', payload),
  transitionIssue: (payload) => ipcRenderer.invoke('transition-issue', payload),
  deleteIssue: (payload) => ipcRenderer.invoke('delete-issue', payload),
  updateIssueSummary: (payload) => ipcRenderer.invoke('update-issue-summary', payload),
  updateIssueDescription: (payload) => ipcRenderer.invoke('update-issue-description', payload),
  fetchIssueDetails: (payload) => ipcRenderer.invoke('fetch-issue-details', payload),
  updateStoryPoints: (payload) => ipcRenderer.invoke('update-story-points', payload),
  createSubtask: (payload) => ipcRenderer.invoke('create-subtask', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
});
