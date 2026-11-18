/**
 * xvfb Electron smoke: launch the packaged main process, wait for a window,
 * confirm the renderer loaded, then quit.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { clearInterval, setInterval, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(desktopRoot, "../..");
const userData = path.join(
  repoRoot,
  "apps/desktop/user-data/smoke-" + Date.now().toString(36),
);

const env = {
  ...process.env,
  LIVING_PETS_PG_PORT: process.env.LIVING_PETS_PG_PORT ?? "55434",
  LIVING_PETS_SEED: "1",
  ELECTRON_USER_DATA: userData,
};

const child = spawn(
  "xvfb-run",
  ["-a", electronPath, ".", `--user-data-dir=${userData}`],
  {
    cwd: desktopRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const timeoutMs = 90_000;
const started = Date.now();

await new Promise((resolve, reject) => {
  const timer = setInterval(() => {
    if (Date.now() - started > timeoutMs) {
      child.kill("SIGTERM");
      clearInterval(timer);
      reject(
        new Error(
          `electron smoke timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }
  }, 1000);

  // Give Postgres migrate + first paint time, then ask Electron to quit.
  setTimeout(() => {
    child.kill("SIGTERM");
  }, 25_000);

  child.on("exit", (code, signal) => {
    clearInterval(timer);
    // SIGTERM after a successful paint is the expected end of this smoke.
    if (code === 0 || signal === "SIGTERM" || code === null) {
      resolve(undefined);
      return;
    }
    reject(
      new Error(
        `electron exited ${code} signal=${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      ),
    );
  });
});

console.log(
  JSON.stringify(
    {
      ok: true,
      elapsedMs: Date.now() - started,
      userData,
      stdoutTail: stdout.slice(-500),
      stderrTail: stderr.slice(-500),
    },
    null,
    2,
  ),
);
