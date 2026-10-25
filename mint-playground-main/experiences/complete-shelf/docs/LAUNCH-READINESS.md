# GSMUN — implemented local release and external verification gates

23 October 2026. **Local software verified; not a live integration or public deployment.** No Google account, real Drive contents, R2 bucket or Supabase project was contacted by this implementation. No remote SQL, credentials, memberships, objects, publication statuses or bills were changed.

## 1. What is ready locally

**Latest pass:** [MASTER-COMPLETION-REPORT.md](MASTER-COMPLETION-REPORT.md) supersedes earlier hint-placement/test-count details below: dedicated header layout, unchanged hint font/fade/full-size canvas, configured GSMUN share metadata, bounded server SDK requests and70 passing automated tests. Actual-WebGL pixel/native-touch checks cover11 representative viewports. External approval gates remain unchanged.

- Hint is horizontally centered in its own responsive header layout region, entirely above the rendered books instead of at a vh offset. Its white Inter800 styling and `ShelfGuidance.tsx` passive scroll/fade logic are unchanged. Existing Inter is OFL; no new Futura use/dependency was introduced. Existing Futura titles remain untouched; owner should retain proof of their web licence.
- Fixed confirmed importer defects: incomplete metadata now retries automatically; inaccessible child folders no longer stall the change feed; new folders reconcile while other retries wait; pending moved folders require explicit assignment review. Network failures retry with safe messages. Durable jobs/cursors plus renewed global leases guard restarts and repeated attempts.
- Saved originals recover failed variants/photo links without re-downloading Drive; SHA-256 and size are verified. Lost completion responses reconcile the same identity. Changed source originals are never overwritten. Imported photos always remain draft. Completed imports remain archived if their source disappears.
- Actual S3 SDK supports private R2 default/EU/US/FedRAMP endpoints, bounded 60-second operations (configurable 1–180 seconds), three SDK attempts, conditional non-overwriting writes and hash comparison on conflicts. Private cache keys include endpoint identity. Published image requests go through existing authorization-aware proxy; no public bucket/domain is needed.
- Existing manual uploader, admin review/bulk controls and gallery remain in place. A Drive failure need not block launch if manual R2 uploads pass live tests.
- New administrator-only `/api/admin/readiness/` checks configured project, configuration shape, table readability and worker status. It returns no secret values. It **cannot certify RLS installation, bucket privacy or actual external connectivity**. Production refuses an unconfigured/local-catalogue fallback; guarded offline previews remain intentionally separate.

```text
Dedicated Drive final-selection folder (read-only service account)
    → bounded initial scan + changes polling → private job/cursor records
    → existing original/variant upload pipeline → private R2
    → existing photo rows (DRAFT) → existing admin review
    → explicit publication → existing public archive → authorized image proxy
Manual uploader ────────────────────────────────┘
Supabase retains existing Auth, administrator membership, content and RLS.
```

## 2. Exact four-table migration review

Canonical local migration: `supabase/migrations/20261023012405_navigation_drive_tracking.sql`; byte-identical review copy: `docs/sql/NAVIGATION-DRIVE-PROPOSAL.sql`.

| Object | Purpose / relationship | API access |
| --- | --- | --- |
| `archive_navigation` | Private draft and separately published JSON configurations; optimistic version numbers | Anonymous/non-admin read only `published`; admin SELECT/INSERT/UPDATE |
| `drive_folder_mappings` | Discovered Drive folder/root → existing book and chapter | Admin SELECT/INSERT/UPDATE only; FK cascade when destination deleted |
| `drive_import_jobs` | Unique Drive file → stable upload UUID, source metadata/checksum, destination, asset/photo, retries and leases | Admin SELECT/INSERT/UPDATE only; nullable FKs preserve tracking if referenced content is deliberately deleted |
| `drive_sync_state` | Singleton root, bounded discovery queue/change cursor, byte budget and global lease | Admin SELECT/INSERT/UPDATE only |

All four enable RLS and revoke broad/default privileges. No API-role DELETE grant. Policies reuse existing `is_archive_admin()`; no extra account or service-role bypass. New trigger-only **SECURITY INVOKER** `check_drive_destination()` rejects a chapter belonging to another book; it has an empty search path and no direct API execute grant. Paired lease constraints, unique Drive file/upload IDs, `id = upload_id`, foreign keys and queue/FK indexes enforce integrity. Update triggers reuse existing `touch_updated_at()`.

The transaction checks prerequisite functions and fails on unexpected existing names instead of silently accepting incompatible objects. It inserts **zero rows**, changes no existing function, Auth user, membership, catalogue row, storage setting or existing RLS policy, and publishes nothing. It is intentionally not a blindly rerunnable schema script. In-memory PostgreSQL tests verify permissions/constraints and that existing membership/storage configuration are retained. Actual restored-project compatibility is still unverified.

Before any approved application: inspect current schema/migration history and project `lofuwoctrqjnnovbggxj`; take independently recoverable schema/data/RLS/functions/membership and storage-inventory backups. Compare these four names and trigger function before applying **only the reviewed new transaction**, once, using the owner's approved migration process/SQL editor. Do not run the original migration, legacy importer, `db reset` or blind `db push`. Record the applied migration in deployment history. Rollback means disabling worker and restoring the prior application image while retaining new tracking tables/files; dropping objects is a separate approval, not an automated rollback.

## 3. Owner setup sequence — approval required, not executed

1. **Host/HTTPS approval:** select an always-on EU Node host and final HTTPS hostname; obtain an actual tax-inclusive/renewal quote. Existing Next.js standalone server, request-time auth/API routes, native Sharp, private disk cache and one-process poller need a Node runtime; this is not an unchanged Cloudflare Pages static upload. Use existing Docker/Caddy files; one replica. Windows standalone tests do not verify Linux Docker or TLS. Keep Node port private, only 80/443 public; restrict SSH. Caddy now denies external `/api/internal/*`; the worker calls loopback and still independently checks its private secret/admin session.
2. **Existing Supabase:** verify the restored project, existing user's confirmed email/ownership, login/logout/session expiry and membership. Do not create another admin/reset credentials as a shortcut. Preserve RLS and inspect public chain visibility. Approve backups and only the new migration separately. No service-role key is needed. Retain the separate draft catalogue import gate below.
3. **Google:** create/select the owner's approved Cloud project; enable Drive API after quota/billing review. Create a dedicated service account without Owner/Editor roles or domain-wide delegation. If organizational policy permits, generate one private JSON key and place it outside repository, build context and web roots; 0600 file/0700 parent or equivalent ACL. Share only **Final archive selections** with its email as Viewer, allowing downloads. Do not connect all team working folders. Organization sharing restrictions require owner resolution, not a security workaround. Authentication uses [Google's server-to-server flow](https://developers.google.com/identity/protocols/oauth2/service-account) with `drive.readonly`.
4. **Folders:** `Final archive selections / DISEC / THE ROOM / approved-photo.jpg`, and equivalent existing book/chapter names, slugs or IDs. Unknown/ambiguous folders wait for mapping in **Drive imports**. No automatic book/chapter creation; no artwork folders. Include existing files for backfill. Limits: 6 levels, 1,000 tracked folders, 100 metadata entries/page, up to five files/tick. Polling every minute plus six-hour reconciliation is sufficient; no push/webhook setup needed.
5. **R2:** after billing/resource approval, create one **Standard private** bucket. Disable both r2.dev and public custom-domain access; no public CORS needed. Create scoped Object Read & Write S3 credentials for **that bucket only**, not account-admin permissions. Choose its jurisdiction before upload and configure matching endpoint; do not later reinterpret existing references under a different account/bucket/jurisdiction. [R2 authentication/jurisdiction instructions](https://developers.cloudflare.com/r2/api/tokens/); [S3 conditional-write compatibility](https://developers.cloudflare.com/r2/api/s3/api/). Normal app operations never delete old objects automatically.
6. **Private environment:** fill the names below privately, never in chat/commits. Keep development/staging and production files separate. Build-time `NEXT_PUBLIC_*` values must match runtime public configuration. Blank privileged-key variable remains unused. Restart the approved app after configuration; no live setup has occurred here.
7. **New SQL:** inspect/back up/approve/apply the exact new transaction as described above; verify actual anonymous and non-admin denials. Table readability alone is insufficient. Test original private Supabase Storage policies too; existing artworks retain their original provider references.
8. **Offline checks, then approved real QA:** run the commands below. First use one approved test original in a dedicated **INTEGRATION TEST** draft book/chapter. Keep unattended polling disabled during scoped verification. Only after successful live QA, optionally mount worker files using `deploy/compose.drive.yaml`, explicitly authorize a private delegated session through the existing admin, and observe last-run/status/restart/session expiry. Session files are credentials; never include them in public backups.
9. **Draft catalogue recovery / launch:** independently approve the existing guarded import bundle, byte-verified non-overwriting artwork upload and conflict checks. Preserve 8 books/8 archives/32 chapters/24 artworks as drafts, zero photos; no demo URLs. Do not regenerate or run legacy importer. Review real conference batches as drafts, obtain separate publication/deployment approval, then verify real anonymous URLs/downloads and physical iPhone Safari before declaring launch-ready.

### Environment names

Use `.env.example` as the shape, not a deployable filled configuration:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<existing approved project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing publishable/anon key>
GSMUN_DATABASE_TIMEOUT_MS=60000
GSMUN_PUBLIC_ORIGIN=https://<approved-hostname>
GSMUN_OBJECT_STORAGE=r2
R2_ACCOUNT_ID=<account ID>
R2_BUCKET=<private Standard bucket>
R2_ACCESS_KEY_ID=<scoped S3 key>
R2_SECRET_ACCESS_KEY=<scoped S3 secret>
R2_JURISDICTION=default
GSMUN_R2_DELIVERY=proxy
GSMUN_STORAGE_TIMEOUT_MS=60000
GSMUN_STORAGE_LIMIT_GB=35
GSMUN_MEDIA_CACHE_DIR=/tmp/gsmun-media-cache
GSMUN_MEDIA_CACHE_GB=8
GSMUN_DRIVE_ENABLED=1
GSMUN_DRIVE_ROOT_FOLDER_ID=<dedicated folder ID>
GSMUN_DRIVE_KEY_FILE=/run/gsmun-private/google-drive-service-account.json
GSMUN_DRIVE_DAILY_GB=25
GSMUN_DRIVE_WORKER_SECRET_FILE=/run/gsmun-private/drive-worker-secret.txt
GSMUN_DRIVE_WORKER_SESSION_FILE=/var/lib/gsmun-worker/session.json
```

For EU/US/FedRAMP buckets set `R2_JURISDICTION` accordingly; default endpoint is `https://ACCOUNT.r2.cloudflarestorage.com`, jurisdiction endpoint inserts `.eu`, `.us` or `.fedramp` after account ID. Use region `auto`. No arbitrary endpoint override exists in production. R2 provider references remain `books/_r2/BUCKET/books/...` in metadata, compatible with the installed path CHECK; actual object keys are `books/{bookId}/...`. No new storage-schema migration is needed. **Proxy** rechecks RLS before every read, including cache hits; optional signed delivery would leave issued bearer URLs usable up to 30 seconds and is not recommended for this release. Previously downloaded copies cannot be recalled.

## 4. Repeatable verification commands

From this application directory, **safe offline**:

```powershell
node scripts/verify-offline.mjs
node scripts/check-import.mjs
node scripts/verify-live-integration.mjs
```

The final command defaults to **PLAN ONLY**, makes no requests and does not read credentials. `verify-offline` clears real cloud environment and blocks external fetch/HTTP; its PostgreSQL tests instantiate empty **in-memory PGlite** only. It does not connect to the restored project or apply SQL remotely.

After owner-approved private environment provisioning, `node --env-file=/PRIVATE/staging.env scripts/check-launch.mjs lofuwoctrqjnnovbggxj` checks configuration **without network or printing values**. Missing configuration produces exit 1; it is not a connectivity certificate. Do not use the guarded public preview as a cloud configuration.

### Real integration harness — prepared, NOT executed

Requires a headed Playwright/Chromium installation available to the operator (`GSMUN_PLAYWRIGHT_MODULE` may point to an installed Playwright directory; optional `GSMUN_CHROME_PATH`). No extra production dependency. Human logs in in the temporary browser; no password/session is requested in the terminal or saved by the script. Create a private, owner-approved JSON file **outside the repository**, for example:

```json
{
  "approved": true,
  "origin": "https://YOUR-APPROVED-STAGING-HOST",
  "expectedProject": "lofuwoctrqjnnovbggxj",
  "bookId": "EXISTING-DEDICATED-QA-BOOK-ID",
  "chapterId": "EXISTING-DEDICATED-QA-CHAPTER-ID",
  "driveFileId": "APPROVED-QA-DRIVE-FILE-ID",
  "originalPath": "C:/PRIVATE/approved-qa-original.jpg",
  "sha256": "REPLACE-WITH-64-CHARACTER-LOWERCASE-SHA256",
  "maxSyncTicks": 12,
  "testPublication": false,
  "retryExistingFailure": false,
  "assistedSourceRemoval": false
}
```

Example deliberately requires real IDs/hash, so cannot accidentally run unchanged. Calculate hash locally with `Get-FileHash -Algorithm SHA256 -LiteralPath 'C:/PRIVATE/approved-qa-original.jpg'`; enter its lowercase value privately. No tokens/keys belong in the approval JSON. The dedicated draft book's title must start **INTEGRATION TEST**; every chapter must be draft. Use a unique consented test image, not a demo/stock conference substitute.

**Only after explicit approval for those exact writes:**

```powershell
node scripts/verify-live-integration.mjs --execute --approval-file C:/PRIVATE/gsmun-integration-approval.json
```

It checks the server's expected project/R2/proxy/schema and refuses an authorized background worker. Only the approved Drive file can produce image/photo writes during scoped sync; discovery can still create private job/cursor metadata for other files beneath the designated root. It verifies assignment, draft privacy, original hash, WebP dimensions, repeated sync identity and admin visibility. A `manualUploadId` UUID option explicitly authorizes one additional manual-upload draft using the same QA original; preserve the same UUID for retries. Public visibility of thumbnails/viewer/original is separately checked when publication is opted in.

Set `testPublication: true` **only with separate temporary QA-publication approval**. It publishes only that QA parent/chapter/photo, verifies the existing public viewer and exact original download, then attempts withdrawal in `finally` and checks anonymous denial. If the process is killed, network fails or session expires, automatic cleanup cannot be guaranteed: manually confirm all QA items are draft. It never deletes records or files. `retryExistingFailure: true` retries only an existing eligible QA failure; deliberate fault injection must be on approved staging, not production. `assistedSourceRemoval: true` pauses for the owner to move/remove only the QA source themselves, then confirms archive copies remain. Source actions are manual and cannot be independently certified by the script. Test interruption/restart, expired session and non-admin denial explicitly; mocks are not substitutes.

Required live results: same-admin login/logout and non-admin/anonymous mutation denial; QA import→correct chapter→original/variants in private R2→draft admin preview→idempotent sync→failure/retry→restart persistence→explicit QA publication/viewer/download→withdrawal→old URL denial→retained copy after source removal. Then repeat manual upload fallback and approve intended content separately. No live test results are claimed yet.

Scoped QA clarification: discovery can **create or update** private tracking/cursor metadata for other files under the designated root. Image/photo writes remain limited to the explicitly approved QA file IDs; no other photo publication is performed.

## 5. Costs — conditional, not a spending cap

Official public documentation rechecked **23 October 2026**; no account-specific checkout, usage, billing switch or quota verified.

| Component | Verified published allowance/price | Planning assumption / risk |
| --- | --- | --- |
| [OVH VPS](https://www.ovhcloud.com/en-ie/vps/) | From €3.81 ex-VAT/month; advertised VPS-1 2 vCPU/4GB RAM/40GB SSD, unlimited traffic / 500Mbps | Actual availability, region, renewal, commitment and tax-inclusive quote unverified; one small Node host, no extras |
| [R2 Standard](https://developers.cloudflare.com/r2/pricing/) | 10GB-month, 1M Class A and 10M Class B monthly included; additional $0.015/GB-month, $4.50/M A, $0.36/M B; billing-unit rounding; direct egress free | Bucket/billing approval needed; not an enforced hard cap; no Images/Workers paid service assumed |
| [Supabase Free](https://supabase.com/pricing) | $0; 500MB database, 50K MAU, 5GB egress plus 5GB cached egress, 1GB object storage; pause after a week inactive | Existing project plan/usage unverified; metadata/Auth only, except existing artwork. No Pro upgrade assumed. Cold pauses/errors need an operator |
| [Drive API](https://developers.google.com/workspace/drive/api/guides/limits) | Standard use no additional cost; newer projects 1M units/min/project, 325K/user/min, 400M units/day billing threshold, 1TB/day egress threshold; later-2026 billing changes require notice | Existing project-specific quota/billing rollout unverified. API allowance does not supply Drive disk space; source collection already needs capacity |
| Image processing / polling | Existing Node Sharp and one-process poller, no extra SaaS | CPU/RAM/transfer throughput must be measured on selected host; no new recurring job service |

Measured artwork: **24 files, 89,438,700 bytes**, unchanged. Central estimate: `5000 × (4MiB original +150KiB thumbnail +800KiB viewer) +89,438,700 =25,924,958,700 bytes ≈25.925GB`. Round billable storage after allowance to16GB ×$0.015 ≈**$0.24/month**. Metadata estimate ~32MB plus indexes/headroom; actual database usage unverified. Original4MiB is an assumption, not a quality-destroying recompression policy. At8MiB originals the total becomes ~46.897GB, rounded37GB billable ≈**$0.555/month**. Replacements/failed retained assets/backups add storage. Initial objects: ~15,000 photo writes plus artwork, before retries; not millions of new variants.

Host planning: `€3.81 ×1.21 assumed VAT =€4.6101`; with illustrative €1/$1 FX and central R2 storage, **~€4.85/month**, conservatively **~€4.90**. At8MiB originals, roughly **€5.17** before other charges. Tax/FX are assumptions, not verified personal tax advice or account quotes. Domain registration/renewal and any extra backup service are **not included**; use an already-owned authorized hostname or approve their actual additional cost. Existing master originals need independent backup capacity. The ~€5 goal is plausible under central assumptions, not guaranteed. No automatic upgrade/failover/subscription is enabled.

Bandwidth examples (estimates, no browser-cache discount): per visit assume60 ×150KiB thumbnails +4 ×800KiB viewer images +1 ×4MiB explicit original =16,687,104bytes. At1K /10K /100K visits monthly, ~16.7 /166.9 /1668.7GB delivered through Node. R2 direct egress charge remains zero under stated pricing; Node network/CPU, Supabase metadata egress and request counts remain constraints. Approx65 uncached reads/visit gives65K /650K /6.5M reads, below10M R2 Class B allowance; retries/extra originals/ranges/other apps can change this. A metadata request per image still reaches Supabase even with local variant cache, so measure real metadata traffic before relying on Free at heavy usage. Application35GB admission and25GB/day Drive transfer controls are **not provider spending caps** or atomic account-wide reservations. Budget alerts do not prevent a bill.

**Cold-shelf bandwidth correction:** the photo-transfer scenarios above exclude the existing89.4MB custom-artwork preload on a cold root visit. Add~89.4GB per1000 cold bookshelf visits, plus other page assets; warm caches/direct chapter links change the mix. The master report records measured artwork headers and estimated transfer/GPU implications. These source assets were not optimized or replaced; physical phone cold-load verification is required. Existing Drive working/source storage and independent backups also need verified capacity/cost beyond this model; do not assume API allowances include disk space.

## 6. Launch blockers / rollback

- Owner-approved accounts, final host/HTTPS quote, bucket jurisdiction/scoped credentials and Google sharing are not configured/tested.
- Restored Supabase schema/RLS/admin confirmation, four-table approval, independent backup and initial draft-only import remain live gates. An empty real public catalogue is expected until approved content is imported **and deliberately published**; the local design preview does not prove public data recovery.
- Live external workflow, Linux Docker/Sharp/Caddy/TLS, physical iPhone Safari, sustained worker/session behavior, original-file privacy/consent and actual resource use must pass. No artificial keepalive bypass or SLA for Supabase Free is promised.
- Whole-file retries, not resumable byte offsets. One process/replica; jobs store durable progress but host downtime stops polling. Five files/minute is only an ideal upper bound (~17h for5K), not measured throughput. Import failures retain tracked bytes; cleanup is deliberate, not automatic. Stop poller before cleanup/replacement of unfinished imports.
- Preserve independent originals/checksums and private database/schema/policy exports. A content-export JSON is not an Auth/RLS/file backup. Test a private restoration; protect delegated worker sessions separately. Never restore old status snapshots blindly and republish withdrawn photos.
- Roll back by disabling worker, waiting for current file/tick to settle, restoring previous **R2-compatible** image/config, and keeping storage/rows/tracking. Do not drop tables or delete objects as rollback. Revoking permissions/keys, changing memberships and deleting QA content require their own approval.

Local rollback snapshot (source, no secrets): `C:/Users/Admin/Desktop/mint-playground-main/.gsmun-backups/launch-readiness-20261023`. Existing unrelated work is preserved; no Git repository was available for a rollback commit.

## 7. Validation and exact file scope

Executed locally:

- `node scripts/verify-offline.mjs` with browser smoke enabled: **production build passed, typecheck passed, 68/68 automated tests passed, zero skips**. This includes the previously opt-in original schema test and the new four-table test in isolated PGlite, never a live database. Lint: **0 errors / 11 existing `no-img-element` warnings**; no image framework conversion was made merely to silence warnings.
- Browser smoke:390×844,393×852,430×932,1024×768,1440×900; original shelf selection/open/return, drawer focus/direct links, keyboard/outside-close/reduced-motion, header, two-column phone gallery structure, fade and no overflow/demo photography passed. The master report supersedes the earlier desktop-on-cover hint with11 measured, entirely-above-book layouts. No book movement/resize was used.
- Real React admin contract tests: simulated login/logout, book/chapter CRUD/slugs, selected chapter upload, progress/retry, caption/order, separate artwork, non-cascading publication and2,002-row pagination/search/bulk statuses passed.
- `tests/release-browser-smoke.mjs` on persistent loopback sandbox: created a labelled synthetic QA book/three chapters, multi-file upload with forced first-request failure/retry, captions/filenames, ordering, explicit simulated publication/withdrawal, navigation, viewer/zoom/keyboard/share, exact original download hash, 390/393/430/768/1440 layouts and unauthorized denial passed. Synthetic QA records remain private drafts locally for inspection, not real conference photos or cloud content.
- Actual AWS S3 SDK **loopback** test includes conditional non-overwrite/hash conflicts, 503 retry/timeout, ranges, public withdrawal/private preview and fake Drive→real image processor→loopback S3→draft relationship recovery. Google OAuth/HTTP tests use synthetic tokens and mocked fixed Google URLs; **neither proves Google or R2 connectivity**.
- `node scripts/check-import.mjs`: unchanged8books/8archives/32chapters/24artwork assets, all drafts, zero photos/demo assets/external URLs; file hashes and relationships match. No remote conflict check. `verify-live-integration` plan-only invocation makes no requests. Guarded `check-launch` correctly fails configuration checks for this deliberately cloud-disabled preview; this is expected, not live-provider verification.
- Typecheck and changed-file lint rerun after verification tooling additions: passed. No application source changes followed the successful build.

Changed/new files this pass:

- Presentation: `app/public-navigation.css` only; existing hint component/engine/geometry/motion/camera/lighting/artwork/catalogue/navigation UI/admin UI untouched.
- Routes/services: `app/api/admin/drive/route.ts`, new `app/api/admin/readiness/route.ts`; `lib/cms/drive-admin.ts`, `drive-client.ts`, `drive-import.ts`, `object-storage.ts`, new `storage-config.mjs` / `launch-readiness.mjs`; `lib/supabase/config.ts`.
- Tooling/tests: new `scripts/check-launch.mjs`, `live-verification-plan.mjs`, `verify-live-integration.mjs`; changed `scripts/offline-guard.cjs`, `verify-offline.mjs`; `tests/browser-smoke.mjs`, `cms.test.mjs`, `navigation-drive.test.mjs`, `release.test.mjs`; new `tests/launch-readiness.test.mjs`, `hint-visual-check.mjs`.
- Review schema: new canonical migration above, matching updated `docs/sql/NAVIGATION-DRIVE-PROPOSAL.sql`. Existing `202610090001_archive_cms.sql` unchanged.
- Deployment/docs: `.env.example`, `.gitignore`, `Dockerfile.dockerignore` (exclude private worker/QA files from build context), `deploy/Caddyfile`, new `deploy/compose.drive.yaml`; this report, `docs/DRIVE-IMPORT-SETUP.md`, `docs/RELEASE-GUIDE.md`.

Local previews use existing scripts: `node scripts/preview-public.mjs` → `http://127.0.0.1:5211/` (real approved public renderer, local read-only catalogue, zero photos); `node --require ./scripts/offline-guard.cjs scripts/preview-sandbox.mjs` → `http://127.0.0.1:5210/admin/` and private `http://127.0.0.1:5210/admin/shelf/` (explicit simulated Auth/database/storage; click **Enter simulated administrator**, never a real password). Neither is a cloud deployment. Existing `dev` script remains Next.js loopback5203; do not guess or expose sandbox to LAN.

## 8. Approval-sized next steps

**Ready now:** local preview, unchanged cinematic renderer/artwork, manual uploader/admin, repaired importer, offline security/integrity tests, unapplied reviewed migration and guarded external QA tool.

**Needs owner approval or credentials:** exact host/HTTPS/billing quote; private R2 bucket/jurisdiction and scoped keys; Google project/service account/folder sharing; existing Supabase schema/account verification; backup and new four-table transaction; separate draft catalogue/artwork import. Configure secrets privately, never send values in chat.

**Needs real external-service test:** actual existing-admin login/permissions/session expiry, Drive scan/retry/restart, private R2 writes/reads/variants/downloads, anonymous/non-admin denial, explicitly approved QA publication/withdrawal and retained copies after source removal. The prepared harness reduces this to one scoped QA workflow; no live result is claimed.

**Required before public launch:** approved working deployment/HTTPS on an independent host; tested backups/rollback; actual private/public photo controls and original downloads; catalogue/content review and separate publication approval; physical phone check, usage/cost monitoring and original-photo consent/retention. Automated Drive polling is optional for launch if the verified manual uploader is ready; essential storage/auth/privacy gates are not optional.
