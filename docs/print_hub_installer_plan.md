# SPP2 Print Hub — Installer & Standalone Tray Plan

Status: **approved**, implementation in progress.

## Architecture (approved)

**Dual-mode single binary.** One packaged executable, two entry modes:
- `SPP2.exe` → editor (default).
- `SPP2.exe --print-hub-server` → Print Hub Tray app (standalone, runs by the clock, survives the editor being closed).

The installer creates two separate shortcuts: **SPP2** and **SPP2 Print Hub**.

## Decisions

1. Dual-mode binary (editor / `--print-hub-server`). Separate shortcuts.
2. Print Hub is a real standalone Tray app — starts independently, keeps running with the editor closed.
3. **Single-instance:** the editor keeps Electron's `requestSingleInstanceLock`. The server does **not** use it — it uses its own **lockfile** (`<userData>/print-hub-server.lock`, PID-checked) so editor + server run in parallel and only a 2nd *server* is blocked.
4. **Startup = Tray is the single source of truth.** Autostart is one HKCU `Run` key named `SPP2PrintHub` pointing to `"<exe>" --print-hub-server`. The Tray's "הפעל עם Windows" toggle reads/writes that exact key (via `reg`), and the installer writes/removes the same key — **no duplicate mechanisms** (we do NOT also use `setLoginItemSettings`). The installer may also launch the hub once with `--enable-autostart` to turn it on at first run.
5. **Context menu:** HKCU only (no admin) for V1. Adds "שלח ל-SPP Print Hub" on `.jpg/.jpeg/.png` → `"<exe>" --quick-print "%1"`. HEIC/PDF deferred to V2.
6. **per-user** install (`perMachine:false`) stays for V1. No `perMachine:true`.
7. **Build:** `dist`/`pack` must run `build:print-hub-server` before `electron-builder` so the current server bundle is packaged (never an old/missing bundle).
8. **Installer UI — component checkboxes:** SPP2 Editor (always) · SPP2 Print Hub (shortcut) · Start Print Hub with Windows · Install right-click Quick Print.
9. **Uninstall:** remove shortcuts, the `SPP2PrintHub` Run key, and the context-menu keys. Do **NOT** auto-delete `C:\SPP_PrintHub` / order history without explicit confirmation.

## Implementation map

| Area | File | Change |
|---|---|---|
| Dual-mode entry | `electron/main.cjs` | top-of-file: if argv has `--print-hub-server` → `require("./printHubServer.bundle.cjs")` and `return` (skip editor bootstrap) |
| Server lock | `src/printHubServer/serverMain.ts` | replace `requestSingleInstanceLock` with PID-checked lockfile; honor `--enable-autostart` |
| Autostart source of truth | `src/printHubServer/serverMain.ts` | `autostartEnabled/setAutostart` via HKCU `Run\SPP2PrintHub` (reg.exe), not `setLoginItemSettings` |
| Build pipeline | `package.json` scripts | `dist`/`dist:mac`/`pack` run `build:print-hub-server` before electron-builder |
| Installer | `build/installer.nsh` (+ `nsis.include`) | component checkboxes; `customInstall`/`customUnInstall`: Print Hub shortcut, Run key, context-menu keys; cleanup on uninstall |

## Notes / risks
- `installer.nsh` (NSIS) cannot be unit-tested in this environment — it is written best-effort to electron-builder's documented macros and must be validated on a real `npm run dist` Windows build.
- Top-level `return` is valid in a CommonJS module (it is wrapped in a function), so the dual-mode guard is safe.
- The runtime "Install context menu" button in SPP2 and the installer checkbox write the **same** HKCU keys (idempotent).
