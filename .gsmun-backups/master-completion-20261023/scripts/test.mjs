import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readdir, cp, mkdir } from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, "127.0.0.1", resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const url = `http://127.0.0.1:${port}/`;
const root=fileURLToPath(new URL("../",import.meta.url));
const dist=process.env.GSMUN_OFFLINE_VERIFY==="1" ? ".local/offline-next" : "dist";
const standalone=join(root,dist,"standalone","experiences","complete-shelf");
await mkdir(join(standalone,dist),{recursive:true});
await cp(join(root,"public"),join(standalone,"public"),{recursive:true});
await cp(join(root,dist,"static"),join(standalone,dist,"static"),{recursive:true});
const server = spawn(process.execPath, [join(standalone,"server.js")], {
  stdio: "inherit", env: { ...process.env, PORT:String(port),HOSTNAME:"127.0.0.1",NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", GSMUN_CONTENT_SOURCE: "local" },
});
let exitCode = 1;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Production server failed to start.");
    try { const response = await fetch(url); if (response.ok) { ready = true; break; } } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Production server did not become ready.");
  const tests = (await readdir(new URL("../tests/", import.meta.url))).filter(name => name.endsWith(".test.mjs")).map(name => `tests/${name}`);
  const runner = spawn(process.execPath, ["--experimental-strip-types", "--test", ...tests], {
    stdio: "inherit", env: { ...process.env, TEST_SITE_URL: url },
  });
  exitCode = await new Promise(resolve => runner.on("exit", code => resolve(code ?? 1)));
  if (exitCode === 0 && process.env.GSMUN_BROWSER_SMOKE === "1") {
    for (const script of ["tests/browser-smoke.mjs", "tests/admin-browser-smoke.mjs"]) {
      const browser = spawn(process.execPath, [script], { stdio: "inherit", env: { ...process.env, GSMUN_TEST_URL: url } });
      exitCode = await new Promise(resolve => browser.on("exit", code => resolve(code ?? 1)));
      if (exitCode !== 0) break;
    }
  }
} finally { server.kill(); }
process.exitCode = exitCode;
