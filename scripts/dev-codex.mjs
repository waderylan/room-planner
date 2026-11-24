import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const sibling = path.resolve(
  "..",
  "kessel",
  ".venv",
  process.platform === "win32" ? "Scripts/kessel.exe" : "bin/kessel",
);
const explicit = process.env.KESSEL_EXECUTABLE;
const candidates = explicit
  ? [explicit]
  : ["kessel", ...(existsSync(sibling) ? [sibling] : [])];
const args = [
  "run",
  "--provider",
  "codex",
  "--",
  "npm",
  "run",
  "dev",
  "--",
  ...process.argv.slice(2),
];
let child;
function launch(index) {
  child = spawn(candidates[index], args, {
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  child.on("error", (error) => {
    if (error.code === "ENOENT" && index + 1 < candidates.length)
      return launch(index + 1);
    process.stderr.write(
      "Kessel could not start. Install kessel-gateway or set KESSEL_EXECUTABLE to its executable.\n",
    );
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
// Kessel and Vite retain the console and receive Ctrl+C directly.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => child?.kill("SIGTERM"));
launch(0);
