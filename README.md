# Jira Sprint Worklog

A beautiful Electron app to view your Jira sprint worklogs.

![Jira Sprint Worklog](screenshot.png)

## Features

- 🔐 **Atlassian API Token** - Authenticate with your Atlassian account
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

### 1. Create an Atlassian API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Copy the token (you will need it in Settings)

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
2. Enter your **Email**, **API Token**, and **Jira Site URL**
3. Enter your **Board ID** (find it in your Jira board URL: `/boards/123`)
4. Click **Save Settings**

### 5. Sign In

Click "Connect to Atlassian" to validate your credentials.

## Usage

- **Story points**: The far right column shows the story point estimate per issue (when your Jira field is available).
- **Update status**: Click the status pill in a row to choose a new workflow status.
- **Edit worklogs**: Click any day cell to add, edit, or clear hours (including past days in the sprint).

## Troubleshooting

- **401 Unauthorized**: Verify your email, API token, and Jira site URL are correct. Ensure your account has Jira Software access.
- **No active sprint found**: Confirm the board ID and that there is an active sprint on that board.
- **Missing story points**: Your Jira instance should have a story point field such as "Story point estimate".

## Development

```bash
npm run dev
```

## Building for Distribution

```bash
npm install
npm run build:mac
```

Artifacts are written to `dist/`:

- macOS: `.dmg`
- Windows: portable `.exe` (run `npm run build:win` on Windows)

## Tech Stack

- **Electron** - Cross-platform desktop app
- **Atlassian API tokens** - Authentication
- **Jira REST API** - Sprint and worklog data
- **Vanilla JS/CSS** - No framework overhead, fast and light

## License

MIT
