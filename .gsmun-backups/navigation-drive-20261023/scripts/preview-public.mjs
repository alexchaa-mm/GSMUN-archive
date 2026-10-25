// The actual Next.js public app, with the existing read-only catalogue provider.
// No new application, database writes, sample photos or authentication bypass.
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
const server=fileURLToPath(new URL("../.local/offline-next/standalone/experiences/complete-shelf/server.js",import.meta.url));
const guard=fileURLToPath(new URL("./offline-guard.cjs",import.meta.url));
if(!existsSync(server))throw new Error("Offline public build missing. Run node scripts/verify-offline.mjs first; it blocks cloud access.");
console.log("OFFLINE PUBLIC DESIGN PREVIEW: http://127.0.0.1:5211/ — original eight books, no photos, no cloud connection. Admin sandbox remains on 5210.");
const child=spawn(process.execPath,["--require",guard,server],{stdio:"inherit",env:{...process.env,PORT:"5211",HOSTNAME:"127.0.0.1"}});
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
child.on("error",()=>{console.error("Could not start the existing offline Next.js public server.");process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code ?? 0;});
