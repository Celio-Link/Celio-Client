import { ChildProcess } from "child_process";
import {spawn, spawnSync} from "node:child_process";

let serverProcess: ChildProcess;

export default async function () {
  // Start the server
  const externalDir = "/Users/nilskirchhof/Repo/linkServer";

  // 1. Install deps (optional, skip if already installed)
  spawnSync("npm", ["install"], {
    cwd: externalDir,
    stdio: "inherit"
  });

  // 2. Build the TypeScript project
  spawnSync("npm", ["run", "build"], {
    cwd: externalDir,
    stdio: "inherit"
  });

  // 3. Start the external project's server
  let externalProcess = spawn("npm", ["run", "start"], {
    cwd: externalDir,
    stdio: "inherit"
  });

  // 4. Wait for server to boot
  await new Promise(res => setTimeout(res, 800));

  // 5. Provide teardown
  return () => {
    externalProcess.kill();
  };
}
