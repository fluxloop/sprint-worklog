# Sprint Timesheet

A beautiful Electron app to view your Jira sprint worklogs.

![Sprint Timesheet](screenshot.png)

## Features

- 🔐 **Atlassian OAuth 2.0** - Secure authentication with your Atlassian account
- 📊 **Visual Grid** - See your logged hours across tasks and days
- 📈 **Statistics** - Total hours, average per day, and task count
- 🌙 **Dark Theme** - Easy on the eyes
- 🔄 **Real-time Refresh** - Fetch latest data with one click

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
