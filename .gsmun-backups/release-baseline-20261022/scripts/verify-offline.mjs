import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const guard = fileURLToPath(new URL("./offline-guard.cjs", import.meta.url)).replaceAll("\\", "/");
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", GSMUN_CONTENT_SOURCE: "local", GSMUN_RUN_LOCAL_SQL_TESTS: "", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: `--require "${guard}"` };
const commands = [
  [require.resolve("next/dist/bin/next"), "build"],
  ["scripts/test.mjs"],
  [require.resolve("typescript/bin/tsc"), "--noEmit"],
  [join(dirname(require.resolve("eslint/package.json")), "bin/eslint.js"), "."],
];
for (const args of commands) {
  const child = spawn(process.execPath, args, { stdio: "inherit", env });
  const code = await new Promise(resolve => { child.on("exit", resolve); child.on("error", () => resolve(1)); });
  if (code !== 0) { process.exitCode = code ?? 1; break; }
}
