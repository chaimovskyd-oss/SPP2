# SppAdvancedPrintWorker

Native Windows print helper for SPP2's **Experimental Advanced Print Engine**.

It exists because Electron's `webContents.print` cannot replay a Windows **DEVMODE**, choose a
tray/bypass/roll, enable real driver borderless, or defer paper/orientation to the driver. This
worker does, by talking to the Win32 spooler API and `System.Drawing.Printing`.

## Protocol

Framed JSON-RPC over **stdin/stdout** (identical framing to the Python smart-selection sidecar):

```
[4-byte big-endian length][UTF-8 JSON]
```

- Request: `{ "id": number, "method": string, "params": object }`
- Response: `{ "id": number, "result": any }` or `{ "id": number, "error": { "message": string } }`

### Methods

| Method               | Params                                                              | Result |
|----------------------|---------------------------------------------------------------------|--------|
| `health`             | —                                                                   | `{ ok, worker, version }` |
| `list-printers`      | —                                                                   | `{ printers: string[] }` |
| `get-capabilities`   | `{ printerName }`                                                    | paper sizes, sources, color/duplex, isWideFormat/isRoll |
| `open-driver-dialog` | `{ printerName }`                                                    | `{ cancelled, devmodeBase64, orientation, driverVersion }` |
| `get-default-devmode`| `{ printerName }`                                                    | `{ devmodeBase64 }` |
| `print` / `test-page`| `{ printerName, imagePath, devmodeBase64?, paperWidthMm, paperHeightMm, placementXmm, placementYmm, placementWidthMm, placementHeightMm, copies }` | `{ success, actualOrientation, actualPaperSize, devmodeApplied, error }` |

The app sends the **already color-managed, oriented bitmap** plus the placement rectangle from
the authoritative `PrintLayout`. The worker only replays driver settings and places the bitmap —
it does not re-derive geometry. It echoes back the **actual** orientation/paper it used so the app
can verify preview and job agree.

## Build

Requires the **.NET 8 SDK** (`win-x64`).

```
node scripts/build-advanced-print-worker.cjs            # graceful: skips if SDK missing
node scripts/build-advanced-print-worker.cjs --strict   # CI/release: hard-fail if SDK missing
```

Output: `spp2_advanced_print_worker/dist/SppAdvancedPrintWorker.exe`, shipped via electron-builder
`extraResources` to `resources/spp2_advanced_print_worker/`.

If the exe is absent at runtime the Advanced Print path falls back down the engine ladder
(PDF → Electron → export-only), so the app never gets stuck.

## Notes / future work

- `System.Drawing.Printing` is sufficient for V1 bitmap placement + DEVMODE replay. If a driver
  proves uncooperative, the next step is raw GDI (`StartDoc`/`StartPage`) via the existing P/Invoke
  surface in `Win32.cs`.
- `printableAreaByPaper` is returned empty for now; per-paper printable area can be added via
  `DeviceCapabilities`/`GetDeviceCaps` when needed.
- Borderless/tray verification is owned by the app's preflight + test-print flow, not assumed here.
