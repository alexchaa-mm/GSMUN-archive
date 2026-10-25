/** Server-side SDK transport only. Never retries a mutation here: upload/job
 * identities own recovery. Bound a stalled provider request and keep its abort. */
export const archiveDatabaseFetch:typeof fetch=(input,init)=>{
  const timeout=Number(process.env.GSMUN_DATABASE_TIMEOUT_MS || "60000");
  if(!Number.isInteger(timeout) || timeout<1000 || timeout>180000)throw new Error("GSMUN_DATABASE_TIMEOUT_MS must be 1000–180000 milliseconds.");
  const caller=init?.signal ?? (input instanceof Request?input.signal:undefined);
  const deadline=AbortSignal.timeout(timeout);
  return fetch(input,{...init,cache:"no-store",signal:caller?AbortSignal.any([caller,deadline]):deadline});
};
