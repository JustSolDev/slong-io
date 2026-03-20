# Error Log

## [2026-03-08 19:01] npm PS1 script execution disabled
- **Error**: `npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.`
- **Context**: Attempting to run `npm run dev` in PowerShell.
- **Resolution Path**: Attempting to run via `cmd /c` or `npx`.
