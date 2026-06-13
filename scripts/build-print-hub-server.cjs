// Bundles the Print Hub Server (src/printHubServer/serverMain.ts + the typed core) into a single
// CJS file the standalone Electron tray process can load. Resolves the "@/" alias to src/.

const esbuild = require("esbuild");
const path = require("node:path");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "src", "printHubServer", "serverMain.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: path.join(__dirname, "..", "electron", "printHubServer.bundle.cjs"),
    external: ["electron"],
    alias: { "@": path.join(__dirname, "..", "src") },
    logLevel: "info"
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
