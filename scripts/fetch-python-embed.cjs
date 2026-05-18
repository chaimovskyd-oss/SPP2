/**
 * Downloads the Windows embeddable Python distribution into build/python-embed/
 * and patches python311._pth so `import site` is enabled (required for venv).
 *
 * Run once before `npm run dist`. Skips work if build/python-embed/python.exe
 * already exists.
 *
 * Usage:
 *   npm run fetch:python
 *   npm run fetch:python -- --force         # re-download
 *   npm run fetch:python -- --version 3.11.9
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { execSync } = require("node:child_process");

const DEFAULT_VERSION = "3.11.9";
const args = process.argv.slice(2);
const force = args.includes("--force");
const versionFlagIdx = args.indexOf("--version");
const version = versionFlagIdx >= 0 ? args[versionFlagIdx + 1] : DEFAULT_VERSION;

const projectRoot = path.resolve(__dirname, "..");
const targetDir = path.join(projectRoot, "build", "python-embed");
const zipPath = path.join(projectRoot, "build", `python-${version}-embed-amd64.zip`);
const url = `https://www.python.org/ftp/python/${version}/python-${version}-embed-amd64.zip`;

function log(msg) {
  process.stdout.write(`[fetch-python] ${msg}\n`);
}

function download(srcUrl, destPath, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) {
      reject(new Error("Too many redirects"));
      return;
    }
    const file = fs.createWriteStream(destPath);
    https
      .get(srcUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(destPath);
          download(res.headers.location, destPath, redirects - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`HTTP ${res.statusCode} fetching ${srcUrl}`));
          return;
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        let lastReport = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total > 0 && Date.now() - lastReport > 250) {
            const pct = ((received / total) * 100).toFixed(1);
            process.stdout.write(`\r[fetch-python] downloading… ${pct}%`);
            lastReport = Date.now();
          }
        });
        res.pipe(file);
        file.on("finish", () => {
          process.stdout.write("\n");
          file.close(() => resolve());
        });
      })
      .on("error", (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
  });
}

function unzip(zip, dest) {
  // Use PowerShell's Expand-Archive on Windows; fall back to `unzip` elsewhere.
  fs.mkdirSync(dest, { recursive: true });
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`unzip -o "${zip}" -d "${dest}"`, { stdio: "inherit" });
  }
}

function patchPthFile(dir) {
  // Enable `import site` so the embedded python can host a venv.
  const entries = fs.readdirSync(dir).filter((f) => /^python\d+\._pth$/.test(f));
  if (entries.length === 0) {
    log("WARNING: no python*._pth file found; venv creation may fail");
    return;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let content = fs.readFileSync(full, "utf-8");
    // Uncomment `#import site` if present.
    const patched = content.replace(/^#\s*import\s+site\s*$/m, "import site");
    if (patched !== content) {
      fs.writeFileSync(full, patched, "utf-8");
      log(`patched ${name}: enabled import site`);
    } else if (!/^import\s+site\s*$/m.test(content)) {
      fs.writeFileSync(full, content.trimEnd() + "\nimport site\n", "utf-8");
      log(`patched ${name}: appended import site`);
    } else {
      log(`${name} already enables import site`);
    }
  }
}

function fetchGetPip(dir) {
  const dest = path.join(dir, "get-pip.py");
  if (fs.existsSync(dest)) {
    log("get-pip.py already present");
    return Promise.resolve();
  }
  log("fetching get-pip.py …");
  return download("https://bootstrap.pypa.io/get-pip.py", dest);
}

(async () => {
  try {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });

    const pythonExe = path.join(targetDir, "python.exe");
    if (fs.existsSync(pythonExe) && !force) {
      log(`already present: ${pythonExe} (use --force to refetch)`);
      return;
    }

    if (fs.existsSync(targetDir)) {
      log("removing existing python-embed/ for fresh install");
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    log(`downloading ${url}`);
    await download(url, zipPath);

    log(`extracting → ${targetDir}`);
    unzip(zipPath, targetDir);
    fs.unlinkSync(zipPath);

    patchPthFile(targetDir);
    await fetchGetPip(targetDir);

    log(`done. Python ${version} embeddable distribution ready at build/python-embed/`);
  } catch (err) {
    process.stderr.write(`[fetch-python] FAILED: ${err.message}\n`);
    process.exit(1);
  }
})();
