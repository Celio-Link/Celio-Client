import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { spawn, spawnSync, ChildProcess } from "node:child_process";

const externalDir = "/Users/nilskirchhof/Repo/linkServer";
let externalProcess: ChildProcess | null = null;

// --- Install + Build only once ---
beforeAll(() => {
  spawnSync("npm", ["install"], {
    cwd: externalDir,
    stdio: "inherit"
  });

  spawnSync("npm", ["run", "build"], {
    cwd: externalDir,
    stdio: "inherit"
  });
});

// --- Start server ---
async function startServer() {
  externalProcess = spawn("npm", ["run", "start"], {
    cwd: externalDir,
    stdio: "inherit",
  });

  // Wait for server to be ready
  await new Promise((res) => setTimeout(res, 800));
}

// --- Stop server ---
async function stopServer() {
  if (externalProcess) {
    console.warn("Stopping server...")
    externalProcess.kill();
    externalProcess = null;
    await new Promise((res) => setTimeout(res, 800));
  }
}

// Start before each test
beforeEach(async () => {
  await startServer();
});

// Stop after each test
afterEach(async () => {
  await stopServer();
});

// Final global cleanup (optional)
afterAll(() => {
  stopServer();
});
