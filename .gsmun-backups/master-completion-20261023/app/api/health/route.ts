export const dynamic="force-dynamic";
// Process liveness only: no credentials, account information or database claim.
export function GET(){return Response.json({status:"ok"},{headers:{"Cache-Control":"no-store"}});}
