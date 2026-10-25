/** No network or credentials. The explicit approval file scopes a future live QA run. */
import {z} from "zod";
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
export const livePlanSchema=z.object({
  approved:z.literal(true),
  origin:z.string().url().refine(value=>{const u=new URL(value);return u.protocol==="https:" && !u.username && !u.password && u.pathname==="/" && !u.search && !u.hash;},"Use an exact approved HTTPS origin."),
  expectedProject:z.string().regex(/^[a-z0-9]{20}$/),
  bookId:id,chapterId:id,driveFileId:id,
  originalPath:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/),
  maxSyncTicks:z.number().int().min(1).max(30).default(12),
  testPublication:z.boolean().default(false),
  manualUploadId:z.string().uuid().optional(),
  retryExistingFailure:z.boolean().default(false),
  assistedSourceRemoval:z.boolean().default(false),
}).strict();
export const liveVerificationSteps=["Human logs into the existing admin account in a temporary browser session.","Verify approved Supabase project, R2/proxy configuration, schema access and stopped unattended worker.","Require a dedicated INTEGRATION TEST draft book/chapter; never change catalogue records.","Sync only the approved Drive file, verify assignment, draft privacy, original SHA-256 and generated variants.","Repeat sync and verify stable photo/asset identity; optionally retry this file's existing failure.","Optionally test the manual uploader and explicit temporary QA publication, then withdraw in finally.","Optionally ask the owner to move the QA Drive source and verify the retained archive copy.","Leave QA records/files as drafts for inspection; never automatically delete records, objects or accounts."];
