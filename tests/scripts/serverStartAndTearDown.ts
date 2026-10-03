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
// Spawn node directly (not via "npm run start"), otherwise kill() only stops npm and the server keeps the port
async function startServer() {
  const serverProcess = spawn("node", ["dist"], {
    cwd: externalDir,
    stdio: ["ignore", "pipe", "inherit"],
  });
  externalProcess = serverProcess;

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start in time")), 5000);
    serverProcess.stdout!.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      if (chunk.toString().includes("Server listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProcess.once("exit", code => {
      clearTimeout(timer);
      reject(new Error("Server exited during startup with code " + code));
    });
  });
}

// --- Stop server ---
async function stopServer() {
  const serverProcess = externalProcess;
  externalProcess = null;
  if (serverProcess && serverProcess.exitCode === null) {
    console.warn("Stopping server...")
    const exited = new Promise(res => serverProcess.once("exit", res));
    serverProcess.kill();
    await exited;
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
afterAll(async () => {
  await stopServer();
});
