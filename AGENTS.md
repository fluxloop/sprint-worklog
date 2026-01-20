# Repository Guidelines

## Project Structure & Module Organization
- `src/main/` contains the Electron main process (`main.js`) and preload bridge (`preload.js`).
- `src/renderer/` holds the UI layer: `index.html`, `styles.css`, and `renderer.js`.
- Root files include `package.json`, `package-lock.json`, and `README.md`.
- Runtime dependencies live in `node_modules/` (not committed or edited directly).

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm start` launches the Electron app using the production entry (`src/main/main.js`).
- `npm run dev` starts the app with `NODE_ENV=development`.
- `npx electron-builder` packages the app (install `electron-builder` first if needed).

## Coding Style & Naming Conventions
- JavaScript and CSS use 2-space indentation and semicolons.
- Main process uses CommonJS (`require`) and keeps Electron lifecycle logic in `src/main/main.js`.
- Renderer code manipulates DOM nodes by ID; keep IDs in `src/renderer/index.html` in sync with `src/renderer/renderer.js`.
- CSS conventions rely on `:root` custom properties (e.g., `--bg-primary`); prefer extending the variable set over hardcoding colors.
- Filenames are lowercase (e.g., `renderer.js`, `styles.css`).

## Testing Guidelines
- No test framework or `npm test` script is configured.
- If you add tests, introduce a runner (e.g., Playwright/Jest), add scripts to `package.json`, and document how to run them here.

## Commit & Pull Request Guidelines
- No Git history is available in this checkout, so no repository-specific commit convention is enforced.
- Use short, imperative commit messages (e.g., "Add settings validation") and keep changes scoped.
- PRs should include a clear summary, manual test notes, and UI screenshots when visual changes are made.

## Security & Configuration Tips
- OAuth credentials can be set via the Settings UI or environment variables `ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET`.
- The OAuth callback is `http://localhost:8089/callback`; keep it consistent with Atlassian app settings.
- Secrets are stored via `electron-store`; do not commit credentials to the repo.
