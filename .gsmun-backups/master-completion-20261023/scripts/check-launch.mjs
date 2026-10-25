// Configuration inspection only: no network, no implicit .env loading, no values printed.
import {inspectLaunchConfig} from "../lib/cms/launch-readiness.mjs";
const expected=process.argv[2] || "lofuwoctrqjnnovbggxj";
if(!/^[a-z0-9]{20}$/.test(expected))throw new Error("Supply only the approved Supabase project reference.");
const report=inspectLaunchConfig(process.env,expected);
for(const check of report.checks)console.log(`${check.ok?"OK":"MISSING/UNSAFE"} ${check.id}: ${check.message}`);
console.log(`Drive is optional for a manual-upload launch: ${report.drive.configured?"configuration present, NOT connectivity verified":"not configured"}.`);
console.log("Configuration inspection only. No account, RLS, bucket privacy, connectivity or deployment has been verified.");
if(!report.ready)process.exitCode=1;
