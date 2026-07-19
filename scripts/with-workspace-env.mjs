import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const childEnvironment = { ...process.env };

function readValue(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .match(new RegExp(`^\\s*${escaped}\\s*=\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, "m"))?.[1]
    ?.trim();
}

if (!childEnvironment.OPENAI_API_KEY && !childEnvironment.OPEN_AI_KEY) {
  for (const candidate of [
    path.resolve(projectRoot, "../../env.txt"),
    path.resolve(projectRoot, "../env.txt"),
  ]) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8");
    const value = readValue(text, "OPENAI_API_KEY") ?? readValue(text, "OPEN_AI_KEY");
    if (value) {
      childEnvironment.OPENAI_API_KEY = value;
      break;
    }
  }
}

const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: childEnvironment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
