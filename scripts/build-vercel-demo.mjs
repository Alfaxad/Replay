import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(scriptDirectory, "with-workspace-env.mjs");
const child = spawn(process.execPath, [runner, "build"], {
  cwd: path.resolve(scriptDirectory, ".."),
  env: {
    ...process.env,
    NEXT_PUBLIC_REPLAY_DEMO: "1",
    REPLAY_DEMO_MODE: "1",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
