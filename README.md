# Sprint Timesheet

A beautiful Electron app to view your Jira sprint worklogs.

![Sprint Timesheet](screenshot.png)

## Features

- 🔐 **Atlassian OAuth 2.0** - Secure authentication with your Atlassian account
- 📊 **Visual Grid** - See your logged hours across tasks and days
- 📈 **Statistics** - Total hours, average per day, and task count
- 🎯 **Story Points** - View story point estimates per issue
- 🔁 **Status Updates** - Change issue status directly from the grid
- ✏️ **Editable Worklogs** - Adjust previous worklog hours
- 🌙 **Dark Theme** - Easy on the eyes
- 🔄 **Real-time Refresh** - Fetch latest data with one click

## Prerequisites

- Node.js 18+ and npm
- A Jira Cloud site with Jira Software
- A board ID you have access to

## Setup

### 1. Create an Atlassian OAuth 2.0 App

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click **Create** → **OAuth 2.0 integration**
3. Give it a name (e.g., "Sprint Timesheet")
4. Under **Authorization**, add a callback URL:
   ```
   http://localhost:8089/callback
   ```
5. Under **Permissions**, add:
   - `read:jira-work`
   - `read:jira-user`
   - `write:jira-work`
   - `read:sprint:jira-software`
   - `read:board-scope:jira-software`
   If you change scopes later, sign out in the app and sign in again.
6. Copy your **Client ID** and **Client Secret**

### 2. Install Dependencies

```bash
cd electron-app
npm install
```

### 3. Run the App

```bash
npm start
```

### 4. Configure

1. Click the **Settings** (gear icon) in the top right
2. Enter your **Client ID** and **Client Secret**
3. Enter your **Board ID** (find it in your Jira board URL: `/boards/123`)
4. Click **Save Settings**

### 5. Sign In

Click "Sign in with Atlassian" and authorize the app.

## Usage

- **Story points**: The far right column shows the story point estimate per issue (when your Jira field is available).
- **Update status**: Click the status pill in a row to choose a new workflow status.
- **Edit worklogs**: Click any day cell to add, edit, or clear hours (including past days in the sprint).

## Optional Environment Variables

You can provide OAuth credentials via environment variables instead of the UI:

- `ATLASSIAN_CLIENT_ID`
- `ATLASSIAN_CLIENT_SECRET`

The board ID is still set via the Settings UI.

## Troubleshooting

- **401 scope does not match**: Ensure the scopes above are set on the OAuth app, then sign out and sign in again.
- **No active sprint found**: Confirm the board ID and that there is an active sprint on that board.
- **Missing story points**: Your Jira instance should have a story point field such as "Story point estimate".

## Development

```bash
npm run dev
```

## Building for Distribution

To package the app for distribution, you can use [electron-builder](https://www.electron.build/):

```bash
npm install electron-builder --save-dev
npx electron-builder
```

## Tech Stack

- **Electron** - Cross-platform desktop app
- **Atlassian OAuth 2.0** - Secure authentication
- **Jira REST API** - Sprint and worklog data
- **Vanilla JS/CSS** - No framework overhead, fast and light

## License

MIT
