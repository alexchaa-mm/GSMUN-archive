/** Server/CLI shared validation. Never serialize the returned credentials. */
export function r2ConnectionConfig(env=process.env){
  const account=env.R2_ACCOUNT_ID,bucket=env.R2_BUCKET,accessKeyId=env.R2_ACCESS_KEY_ID,secretAccessKey=env.R2_SECRET_ACCESS_KEY;
  if(!account || !/^[a-f0-9]{32}$/i.test(account) || !bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !accessKeyId || !secretAccessKey || /\s/.test(accessKeyId+secretAccessKey))throw new Error("Private R2 configuration is incomplete or invalid. Check R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY on the server.");
  const jurisdiction=env.R2_JURISDICTION || "default";
  if(!["default","eu","us","fedramp"].includes(jurisdiction))throw new Error("R2_JURISDICTION must match the bucket: default, eu, us or fedramp.");
  const delivery=env.GSMUN_R2_DELIVERY || "proxy";
  if(!["proxy","signed"].includes(delivery))throw new Error("GSMUN_R2_DELIVERY must be proxy or signed. Use proxy for immediate withdrawal checks.");
  const timeoutMs=Number(env.GSMUN_STORAGE_TIMEOUT_MS || "60000");
  if(!Number.isInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>180000)throw new Error("GSMUN_STORAGE_TIMEOUT_MS must be 1000–180000 milliseconds.");
  return {account,bucket,accessKeyId,secretAccessKey,jurisdiction,delivery,timeoutMs,endpoint:`https://${account}${jurisdiction==="default"?"":"."+jurisdiction}.r2.cloudflarestorage.com`};
}
