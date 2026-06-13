// Quick Print from Windows Explorer (Phase 9, spec §22). Parses the --quick-print CLI args and
// installs/removes a per-user (HKCU, no admin) right-click context-menu entry on image files that
// launches SPP2 with the selected file(s).

const { spawn } = require("node:child_process");

const IMAGE_EXTS = [".jpg", ".jpeg", ".png"];
const MENU_KEY = "SPPPrintHub";
const MENU_LABEL = "שלח ל-SPP Print Hub";

/** Extracts image file paths from argv: everything after --quick-print, else bare image args. */
function extractQuickPrintFiles(argv) {
  const out = [];
  const idx = argv.indexOf("--quick-print");
  if (idx >= 0) {
    for (let i = idx + 1; i < argv.length; i += 1) {
      const a = argv[i];
      if (!a || a.startsWith("--")) break;
      out.push(a);
    }
  }
  if (out.length === 0) {
    for (let i = 1; i < argv.length; i += 1) {
      const a = argv[i];
      if (a && !a.startsWith("-") && IMAGE_EXTS.some((e) => a.toLowerCase().endsWith(e))) out.push(a);
    }
  }
  return out;
}

function runReg(args) {
  return new Promise((resolve) => {
    const proc = spawn("reg", args, { windowsHide: true });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

async function installContextMenu(exePath) {
  if (process.platform !== "win32") return { success: false, error: "Windows only" };
  const command = `"${exePath}" --quick-print "%1"`;
  for (const ext of IMAGE_EXTS) {
    const base = `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\${MENU_KEY}`;
    const okLabel = await runReg(["add", base, "/ve", "/d", MENU_LABEL, "/f"]);
    const okCmd = await runReg(["add", `${base}\\command`, "/ve", "/d", command, "/f"]);
    if (!okLabel || !okCmd) return { success: false, error: `נכשל רישום עבור ${ext}` };
  }
  return { success: true };
}

async function uninstallContextMenu() {
  if (process.platform !== "win32") return { success: false, error: "Windows only" };
  for (const ext of IMAGE_EXTS) {
    const base = `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\${MENU_KEY}`;
    await runReg(["delete", base, "/f"]);
  }
  return { success: true };
}

function registerQuickPrintIpc(deps) {
  const { ipcMain, getExePath } = deps;
  ipcMain.handle("spp:printHub:install-context-menu", () => installContextMenu(getExePath()));
  ipcMain.handle("spp:printHub:uninstall-context-menu", () => uninstallContextMenu());
}

module.exports = { extractQuickPrintFiles, installContextMenu, uninstallContextMenu, registerQuickPrintIpc, IMAGE_EXTS };
