// Builds the SppAdvancedPrintWorker.exe (C#/.NET) into spp2_advanced_print_worker/dist/.
//
// Prerequisite: the .NET 8 SDK must be installed (https://aka.ms/dotnet/download). If it is
// not present, this script logs a clear message and exits 0 WITHOUT failing the overall build —
// the app degrades gracefully (the Advanced Print path falls back to PDF/Electron when the
// worker exe is missing). Pass --strict to make a missing SDK a hard failure (CI/release).

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const projectDir = path.join(__dirname, "..", "spp2_advanced_print_worker");
const csproj = path.join(projectDir, "SppAdvancedPrintWorker.csproj");
const outDir = path.join(projectDir, "dist");
const strict = process.argv.includes("--strict");

function ensureDistExists() {
  // electron-builder's extraResources `from` must exist, even when we skip the build.
  fs.mkdirSync(outDir, { recursive: true });
  const marker = path.join(outDir, "WORKER_NOT_BUILT.txt");
  if (!fs.existsSync(path.join(outDir, "SppAdvancedPrintWorker.exe")) && !fs.existsSync(marker)) {
    fs.writeFileSync(
      marker,
      "SppAdvancedPrintWorker.exe was not built (the .NET 8 SDK was unavailable).\n" +
        "Advanced Print falls back to PDF/Electron until the worker is built.\n",
      "utf-8"
    );
  }
}

function fail(msg) {
  if (strict) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(msg + " (skipping — Advanced Print will fall back to PDF/Electron)");
  ensureDistExists();
  process.exit(0);
}

// Is the .NET SDK available?
const probe = spawnSync("dotnet", ["--list-sdks"], { encoding: "utf-8", shell: true });
if (probe.status !== 0 || !probe.stdout || probe.stdout.trim().length === 0) {
  fail("[advanced-print-worker] .NET 8 SDK not found.");
}

console.log("[advanced-print-worker] Publishing native worker…");
const result = spawnSync(
  "dotnet",
  [
    "publish",
    csproj,
    "-c", "Release",
    "-r", "win-x64",
    "--self-contained", "true",
    "-p:PublishSingleFile=true",
    "-o", outDir
  ],
  { stdio: "inherit", shell: true }
);

if (result.status !== 0) {
  fail("[advanced-print-worker] dotnet publish failed.");
}

const exe = path.join(outDir, "SppAdvancedPrintWorker.exe");
if (!fs.existsSync(exe)) {
  fail("[advanced-print-worker] Build finished but exe not found at " + exe);
}
console.log("[advanced-print-worker] Built " + exe);
