// Thin launcher for the Print Hub Server tray app. The real logic lives in the bundled
// printHubServer.bundle.cjs (built by scripts/build-print-hub-server.cjs from the typed core).
// Run with: electron electron/printHubServer.cjs --hub="C:\\SPP_PrintHub"
require("./printHubServer.bundle.cjs");
