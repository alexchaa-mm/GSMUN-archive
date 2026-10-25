/* eslint @typescript-eslint/no-require-imports: "off" -- Node's pre-load guard must be CommonJS. */
// Loaded before Next reads .env.local. These values intentionally override it.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.GSMUN_CONTENT_SOURCE = "local";
process.env.GSMUN_OFFLINE_VERIFY = "1";
process.env.GSMUN_RUN_LOCAL_SQL_TESTS = "";
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.GSMUN_OBJECT_STORAGE = "supabase";
process.env.GSMUN_PUBLIC_ORIGIN = "";
process.env.GSMUN_MEDIA_CACHE_DIR = "";
process.env.GSMUN_STORAGE_LIMIT_GB = "35";
process.env.GSMUN_R2_DELIVERY = "proxy";
for (const name of ["R2_ACCOUNT_ID","R2_BUCKET","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY"]) process.env[name] = "";
for (const name of ["GSMUN_DRIVE_ENABLED","GSMUN_DRIVE_ROOT_FOLDER_ID","GSMUN_DRIVE_KEY_FILE","GSMUN_DRIVE_WORKER_SESSION_FILE","GSMUN_DRIVE_WORKER_SECRET_FILE","GOOGLE_APPLICATION_CREDENTIALS"]) process.env[name]="";
const { syncBuiltinESMExports } = require("node:module");
const allowed = value => {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Offline verification blocked a non-loopback request.");
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { allowed(typeof input === "string" || input instanceof URL ? input : input.url); return originalFetch(input, init); };
for (const name of ["node:http", "node:https"]) {
  const transport = require(name);
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function (input, ...args) {
      if (typeof input === "string" || input instanceof URL) allowed(input);
      else if (!["127.0.0.1", "localhost", "::1"].includes(input?.hostname ?? input?.host ?? "localhost")) throw new Error("Offline verification blocked a non-loopback request.");
      return original.call(this, input, ...args);
    };
  }
}
syncBuiltinESMExports();
