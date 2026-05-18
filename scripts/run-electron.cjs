const { spawnSync } = require("node:child_process");
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(npmCmd, ["run", "build"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const app = spawnSync(electronPath, ["."], {
  stdio: "inherit",
  env
});

if (app.error) {
  console.error(app.error);
  process.exit(1);
}

process.exit(app.status ?? 0);
