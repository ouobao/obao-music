# Project working rules

## Verify every change

- After every code or UI change, start the application and verify the affected behavior in the running app. For this Electron project, use `npm run dev:start` from the repository root and wait for the Electron renderer-ready confirmation.
- Take a real screenshot of the running app after verification and save it under the repository-root `screenshots/` directory. Use a descriptive, unique filename, for example `screenshots/2026-09-29-playback-login-check.png`. On Windows, prefer `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-electron-window.ps1 -OutputPath screenshots/<name>.png` so the capture comes from the Electron window rather than the desktop/assistant window.
- Review the captured screenshot before finishing. Do not create placeholder images, rename an unrelated image, or claim a screenshot/test was completed if it was not.
- If the app cannot be started or the relevant state cannot be reached, report the blocker and the verification that was actually performed; never fabricate a screenshot.
- Keep screenshots that document meaningful verification. Do not overwrite existing screenshots unless the user explicitly asks.

## Verification commands

- `npm run dev:start` starts the development app and reports when the Electron renderer is ready.
- `npm run dev:stop` stops the app started by that development launcher.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-electron-window.ps1 -OutputPath screenshots/<name>.png` captures the actual Electron window with `PrintWindow`.
- Run `npm run typecheck` and/or `npm run build` when relevant to the change; a successful build does not replace runtime/UI verification.
