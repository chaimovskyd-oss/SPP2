# SPP2 Memory / Lifecycle / Rendering Audit

## Scenario
- Pages:
- Images:
- Switches:
- Electron/dev build:
- Date:

## Console Commands
```js
window.sppDebug.reset()
await window.sppDebug.runStressTest({ pages: 50, images: 50, switches: 150 })
window.sppDebug.getReport()
```

## Findings
| Severity | Location | Estimated impact | Evidence |
| --- | --- | --- | --- |
|  |  |  |  |

## Memory Hotspots
- Document/page/asset data:
- Undo/history:
- Decoded images:
- Konva caches:
- Print/preview temp renders:

## Render Hotspots
- Page switch:
- Thumbnail/sidebar:
- Canvas/Konva:
- Export/print:

## Leak Suspects
- Konva cached nodes:
- Image elements:
- Object URLs:
- Temp files / print manifests:
- React mounts:

## Recommended Fixes
### Quick Wins
- 

### Medium Refactor
- 

### Architecture Changes
- 
