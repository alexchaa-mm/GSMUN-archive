# GSMUN master completion — local evidence and release gate

23 October 2026. **Verdict: Ready after specified configuration and verification.** This is not a production-ready/live-service certification. No account was connected, production credential used, live SQL executed, resource provisioned, photo uploaded/published remotely, DNS changed or deployment performed.

## A. Baseline and scope

Inspected the existing reports, source, routes, Auth/RLS/storage/import helpers, schema, tests, `.env.example`, Docker/Caddy configuration and unchanged review-only import bundle. There is **no Git repository** in the supplied checkout, so `git status`/diff is unavailable. A source-only rollback snapshot, excluding `.env.local`, real credentials and uploaded media, was preserved at `C:/Users/Admin/Desktop/mint-playground-main/.gsmun-backups/master-completion-20261023`.

Baseline: **68/68 automated tests passed, zero skips**, against the guarded running public preview, including isolated PGlite RLS tests. Existing browser and persistent sandbox workflows had also passed in the preceding implementation. The application is an existing Next16.2.10 standalone Node app, not a static Pages app. Source remains the authority where older reports describe earlier test counts or a skipped SQL test.

### Local changes in this pass

| File | Specific purpose |
| --- | --- |
| `app/ProgressLibrary.tsx` | Move the existing `ShelfGuidance` node into its own header layout cell; no engine call/camera/scene changes |
| `app/public-navigation.css` | Replace viewport-height positioning with responsive header-grid placement; phone row/compact header-padding band; existing font/colour/wording/opacity transition unchanged |
| `app/archive-metadata.ts` (new), `app/layout.tsx` | Replace stale template domain/social photograph with configured `GSMUN_PUBLIC_ORIGIN` and the existing identity PNG; no visible page redesign |
| `Dockerfile` | Accept the already-required public origin at build time as well as runtime, so statically generated share metadata uses the approved host |
| `lib/supabase/request.ts` (new), `lib/supabase/server.ts`, `proxy.ts`, `lib/cms/drive-worker.ts` | Bound stalled server SDK requests while preserving caller cancellation and existing authentication/RLS; no mutation retry wrapper |
| `lib/cms/launch-readiness.mjs`, `.env.example`, `scripts/offline-guard.cjs` | Validate/document/reset server-only `GSMUN_DATABASE_TIMEOUT_MS`; no real environment file edited |
| `tests/hint-composition-smoke.mjs` (new) | Actual WebGL pixel-envelope gap checks, full-size canvas and header-position checks, native drag/fade, reduced-motion, 11 screen sizes and screenshots |
| `tests/browser-smoke.mjs`, `tests/hint-visual-check.mjs` | Validate the new dedicated layout area instead of the obsolete vh placement; retain all interaction assertions |
| `tests/launch-readiness.test.mjs`, `tests/rendered-html.test.mjs` | New configured-origin/identity metadata test and exact replacement of legacy template-social-image expectations, not removal of coverage |
| `tests/release.test.mjs`, `tests/release-browser-smoke.mjs` | Assert retained originals and explicitly return only this run's synthetic QA descendants to drafts after acceptance testing |
| `scripts/test.mjs` | Include the new responsive pixel test in the existing optional browser-smoke sequence |
| This report, `docs/LAUNCH-READINESS.md`, `docs/RELEASE-GUIDE.md`, `docs/DRIVE-IMPORT-SETUP.md`, `docs/NAVIGATION-DRIVE-IMPLEMENTATION.md` | Current results, superseded baseline labels, classified gates and exact approval-sized next steps |

**Preserved:** `ShelfEngine.ts`, `book-motion.ts`, `cover-art.ts`, source catalogue/IDs/order, book dimensions/placement, camera, lights, shadows, animation, all24 original artwork files, `globals.css`, existing hint wording/font/fade component, drawer destinations, chapters, admin UI, manual uploader and existing schema. `ProgressLibrary` changes are JSX placement only. No database/migration/import bundle regeneration.

## B. Hint placement and visual verification

Root cause: the prior `top:25vh` / `22vh` overlay ignored the actual full-viewport WebGL composition. The desktop book starts around76–107px down while the hint was around180–280px down. Raising its z-index or moving the books would not fix that relationship.

The header now has a dedicated centered introduction cell; normal phones put it in a full-width row beneath the existing identity. Desktop uses the otherwise empty header-padding band, aligned to the text's own line height; compact/landscape screens use that top band rather than consuming scene space. No viewport-height offset, opaque box, clipping fix, canvas resize, scene transform or book relocation is used. Identity and hamburger coordinates are regression-checked. The hint remains pointer-transparent. `ShelfGuidance.tsx` is byte-identical, preserving passive wheel/pointer observation, fade/reappearance and reduced motion.

Final source is checked at **320×568,360×640,375×667,390×844,393×852,430×932,393×1000,667×375,844×390,1366×768,1920×1080**. The automated check captures the transparent WebGL canvas inside a render frame and finds the first opaque book pixels (excluding translucent shadows), then compares the actual hint rectangle. It requires at least8px initial separation and no overlap while visible during native pointer drag. The canvas must retain its original full viewport client dimensions. Separate screenshots support human inspection; this readback exists **only in tests**, not production layout/per-frame processing.

Clean production-build browser verification **passed at all11 sizes**, including native mouse drag, wheel fade and reduced-motion hide/reappearance. Measured initial gaps (hint bottom → first opaque book pixels):

| Viewport | Measured gap |
| --- | ---: |
| 320×568 |119.2px |
| 360×640 |29.2px |
| 375×667 |32.9px |
| 390×844 |75.3px |
| 393×852 |76.6px |
| 430×932 |89.4px |
| 393×1000 |112.6px |
| 667×375 |36.2px |
| 844×390 |38.2px |
| 1366×768 |50.0px |
| 1920×1080 |81.0px |

The compact320px phone and landscape layouts use existing top padding rather than overlaying the book/identity. Screenshot output: `.local/hint-composition/shelf-WIDTH-HEIGHT.png`. Browser automation uses Windows Chromium/SwiftShader, **not physical iPhone Safari or a real production GPU/device**. It does not certify every possible viewport or arbitrarily long future title/artwork; future geometry changes must rerun these tests.

**Remaining short-landscape limitation:** inspection of the844×390 screenshot shows the existing lower information overlay obscuring part of the selected book. The hint itself remains above the book, and canvas/book/overlay composition was intentionally not changed in this position-only pass. Thus the hint checks pass, but they must not be read as certification that the entire selected book is unobstructed in short landscape. Any correction to that pre-existing composition needs a separately scoped responsive change; assess its launch priority on a physical phone.

Final loopback route checks returnedHTTP200 for `http://127.0.0.1:5211/`, `http://127.0.0.1:5210/admin/` and `http://127.0.0.1:5210/admin/shelf/`. Anonymous admin checks can follow the login redirect; authenticated simulated-admin checks are separate browser tests, not evidence of real Supabase authentication.

## C. Google Drive — reused, not rebuilt

Implementation: `lib/cms/drive-client.ts`, `drive-import.ts`, `drive-admin.ts`, `drive-worker.ts`; `/api/admin/drive/`, `/api/internal/drive-sync/`; existing `app/admin/DriveImportPanel.tsx`.

Lifecycle: dedicated read-only service account → only the explicitly shared final-selection root → bounded folder/file backfill and persisted change-feed cursors → deterministic existing book/chapter matching or explicit mapping → stable Drive-file upload ID → MIME/size/decoded image/checksum/version checks → existing private upload/variant pipeline → asset/photo relationships → **draft** admin review. No second approval system. Moving/deleting source files never withdraws existing archived photos. New material never auto-publishes.

Already implemented and revalidated: incomplete metadata automatic retry, unknown/ambiguous folders, unsupported/unreadable files, MD5/SHA256 checks, exact-copy deduplication, per-file retry/backoff, delayed inaccessible folders that do not block unrelated files/change polling, source move/change review, lease renewal, process-restart recovery, same-ID reconciliation after lost responses and partial storage/database failures. Saved original bytes can rebuild failed variants/linking even if the Drive file is gone. Errors are authored safe messages, not raw provider responses.

Polling: one-minute ticks, up to5 processed files/tick,100 metadata entries/page, six-hour reconciliation, durable cursor/job state; one long-lived Node replica. A stopped host cannot poll. Whole-file retries, not byte-offset resume. Ideal ~300 files/hour is an upper bound, not measured throughput. Worker requires explicit existing-admin authorization and a private delegated-session file; refresh/user/membership checks continue under existing RLS. Tokens/key files never go to the browser/export. Google push notifications are **not implemented or required**.

**Real Google connection: UNVERIFIED.** No real source folder, organizational sharing policy, account quota or live authentication was inspected. See [exact owner setup](DRIVE-IMPORT-SETUP.md) and [scoped live QA procedure](LAUNCH-READINESS.md#4-repeatable-verification-commands). Manual uploads remain the fallback if Drive setup is delayed.

## D. R2 — implemented, not live-certified

Existing adapter: `lib/cms/object-storage.ts`, `storage-config.mjs`; image generation in `images.ts`; existing upload/asset routes. Actual S3 SDK patterns: SigV4, region`auto`, fixed Cloudflare default/jurisdiction endpoint, configured private bucket only, bounded operations/retries, conditional Put without overwrite, conflicting bytes verified by SHA256, original plus two WebPs, streamed proxy original/range reads and safe missing/error responses. Stored provider paths are validated, not arbitrary visitor-supplied URLs/keys. Supabase objects retain their own provider references.

Default delivery is **server proxy**, with publication-aware RLS/admin preview authorization **before every read/cache lookup**. No public R2 bucket, delivery domain or browser CORS is needed. Optional signed URLs expire after30seconds but cannot instantly revoke an already issued bearer URL; proxy remains the release recommendation. Originals are preserved byte-for-byte; thumbnails/viewer images are separate. Previously downloaded files cannot be recalled.

Local S3 tests exercise the real AWS SDK against **loopback**, not R2: original hashes, variants, ranges, duplicate/conflict writes,503 retry/timeout, missing objects, withdrawal/private preview and fake Drive→actual processor→S3 transport. This proves local application/SDK behavior only.

**Deletion:** draft photo/book/chapter record deletion is implemented; publication-chain removal makes original API links private. Physical object/asset purge is deliberately **not implemented** as an admin cleanup button. Asset deletion is blocked and references retained for recovery/budget tracking. Nothing is automatically deleted as a failed-upload cleanup. After separate owner approval, inspect exact test asset/variant keys and usages, stop importer, back up verified bytes/metadata, withdraw/delete the QA photo relationship, verify anonymous404, then have the owner remove only approved unreferenced test objects via the provider's private tooling and reconcile metadata under a reviewed maintenance operation. No bulk prefix cleanup or automatic live deletion test is authorized here.

**Real R2 bucket: UNVERIFIED.** No bucket, scoped key, billing setting, CORS/privacy setting or actual R2 operation was used. The setup must disable r2.dev/public custom domains, scope Object Read & Write S3 credentials to one approved Standard bucket, and use matching jurisdiction. All R2 secrets are server-only. Configuration names/purposes and the repeatable exact-original QA test are in [LAUNCH-READINESS.md](LAUNCH-READINESS.md).

## E. Supabase schema / security status

Review-ready **unapplied** migration: `supabase/migrations/20261023012405_navigation_drive_tracking.sql`; identical review copy `docs/sql/NAVIGATION-DRIVE-PROPOSAL.sql`. Existing installed-schema file `202610090001_archive_cms.sql` was not altered or replayed against a real project.

- `archive_navigation`: private draft and separately published/versioned JSON settings. Published settings only are anonymous-readable; public service still filters destination existence/publication.
- `drive_folder_mappings`: root/folder → existing book/chapter. Individual FKs and invoker trigger validate actual ownership.
- `drive_import_jobs`: unique Drive file/stable upload IDs, source metadata, destination, asset/photo references, status, retries and leases. Independent photo publication remains in existing tables.
- `drive_sync_state`: persisted singleton root/cursors, bounded scan/retry state, byte admission and lease.

All are used by actual services; existing photo/content tables cannot replace queue/cursor/config state without mixing responsibilities. New tables have RLS, explicit least-privilege grants, queue/FK indexes, constraints and no API DELETE grant. Only the published navigation row is publicly readable; private import metadata requires existing admin membership. No new views bypass RLS. The new trigger is SECURITY INVOKER with empty search path/direct execution revoked; existing auth/membership/functions/policies remain untouched.

The migration inserts zero rows, uploads/publishes nothing and fails on unexpected existing names. It is **not** a blindly rerunnable schema script. Isolated PGlite tests exercised actual PostgreSQL RLS/permissions, FK ownership, duplicate/lease constraints and retention of synthetic original membership/bucket rows. Those tests recreate minimal Supabase platform contracts in memory; they are **not real Supabase staging/advisor verification**.

**No production migration was applied.** Before approval: confirm project`lofuwoctrqjnnovbggxj`, current schema/migration history, function definitions/grants and object-name conflicts; export schema/data/RLS/functions/membership and private storage inventory independently; verify restoration on approved staging. Apply only the reviewed new transaction once under the owner's approved process, not blind `db push`/reset or the legacy importer. Verify actual anon/non-admin/admin access afterward. Rollback application first while keeping new tables/objects; destructive schema rollback is not automatically safe and needs separate export/review/approval.

## F. Test evidence

Exact baseline command used existing guarded localhost5211, with no real credentials:

```powershell
$env:TEST_SITE_URL='http://127.0.0.1:5211/'
$env:GSMUN_RUN_ISOLATED_SQL_TESTS='1'
$testFiles=Get-ChildItem tests/*.test.mjs | ForEach-Object { $_.FullName }
node --require ./scripts/offline-guard.cjs --experimental-strip-types --test @testFiles
```

Result:68PASS/0FAIL/0SKIP. Full final command:

```powershell
$env:GSMUN_BROWSER_SMOKE='1'
$env:GSMUN_PLAYWRIGHT_MODULE='C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:GSMUN_CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/verify-offline.mjs
```

This runs guarded production build, all unit/contract/PostgreSQL tests, public/admin/pixel browser checks, `tsc --noEmit`, then `eslint .`. The bundled browser-module path is specific to this workstation; another operator supplies an installed Playwright/Chromium path. All cloud environment is cleared and external HTTP/fetch blocked before Next loads `.env.local`.

Final complete `verify-offline` command **exited0**: **70PASS/0FAIL/0SKIP**, production build and typecheck passed, public5-viewport browser smoke passed, React admin workflow test passed,11-viewport WebGL pixel/mouse-drag/reduced-motion checks and native Chromium touch checks on phone/landscape sizes passed. Lint: **0errors /11 existing img-element warnings**; no test/assertion removed to silence warnings. The added deadline test verifies timeout/caller abort and no automatic mutation replay. Additional persistent admin acceptance `node --require ./scripts/offline-guard.cjs tests/release-browser-smoke.mjs` (same browser paths) **passed** again on the restarted sandbox: creates QA book/three chapters; tests multi-upload/interruption/retry, caption/filename, ordering, private preview, explicit local publication/withdrawal, viewer/keyboard/zoom/share, exact original hashes,5 responsive layouts and unauthorized denial. Its cleanup explicitly drafts this run's synthetic children as well as parent; stored-state recheck confirmed1draft book/3draft chapters/15draft photos. It retains original bytes and touches no other local books. These are synthetic loopback records/images, never production content. Import checker: `node scripts/check-import.mjs` — draft-only8books/8archives/32chapters/24assets,0photos/demo URLs, byte hashes/relationships preserved.

Intermediate failures were real and fixed rather than hidden: a landscape centering assertion exposed absolute-grid positioning; corrected with an explicit compact header band. The metadata helper initially had an environment-dictionary typing error; corrected. A legacy rendered-HTML assertion still expected the original template photograph; replaced with **stricter exact** GSMUN identity URL/dimension checks. No tests were removed. An earlier direct test invocation without required `TEST_SITE_URL` failed; corrected baseline above passed. Sandbox launch errors were worked around with approved offline-only execution permissions. Any remaining failed final check must remain a blocker, not be reported as passed.

## G. Classified launch checklist

| Item | Classification | Exact remaining condition |
| --- | --- | --- |
| Existing public bookshelf/gallery/nav/manual uploader/admin CRUD | Implemented and verified locally | Synthetic/offline browser coverage; unchanged locked engine hashes |
| Hint typography/fade preservation and responsive dedicated area | Implemented and verified locally | Final measured viewport results below; physical Safari still required |
| Drive import recovery/polling and R2 private adapter | Implemented but awaiting real-service verification | Approved account/bucket/folder/environment + scoped end-to-end QA |
| Real existing-admin login, email confirmation and session/provider policy | Requires configuration | Owner verifies existing account; no reset/additional account as shortcut |
| Four new tables / target compatibility / RLS | Requires owner approval | Backup, inspect, staging-test and approve only new transaction |
| Initial catalogue/artwork recovery | Requires owner approval | Separately review unchanged import bundle/conflicts, verify bytes, import drafts; no demo photographs |
| Host, runtime, domain/DNS, HTTPS and renewal/billing | Requires owner approval | Choose approved independent Node host and actual total; no deployment or DNS action performed |
| Production public/server variables | Requires configuration | Supabase public URL/key; exact HTTPS origin; private R2 keys/jurisdiction; optional private Drive/worker files |
| Supabase Auth Site URL / allowed redirect URLs | Requires configuration | Owner-approved HTTPS hostname and intended admin-login return, no broad wildcard; verify public signups disabled and provider abuse protection. Existing app uses password login, not a public signup/Google-user OAuth callback |
| Linux Docker/Sharp/Caddy validation | Blocked | Docker client29.7.2 present, Linux daemon pipe unavailable on this computer. Must test approved Linux staging runtime; do not mistake Windows build for that |
| Actual upload/download/private bucket/public withdrawal | Implemented but awaiting real-service verification | Exact original hash/variants, anon/non-admin denial, restart/session expiry and old-URL withdrawal |
| Unattended worker operations | Implemented but awaiting real-service verification | Private mounts, explicit session delegation, live rotation/revocation/restart monitoring; one replica |
| Push notifications / byte-offset resumable transfers / automatic object purge | Not implemented | Optional; polling + per-file retry + retained tracked originals are the current supported workflow |
| Backups and recovery drill | Requires configuration | Independent originals/checksums + private DB/schema/policy exports; test restore without republishing withdrawals |
| Physical phone and public hostname acceptance | Requires owner approval | Approved deployment/staging access, real Safari + desktop/mobile final checks before publication |
| Cold-shelf phone/network/GPU performance | Blocked | No physical Safari/network test here. Existing24-artwork preload is89.4MB; retain source art/engine and seek separate approval for optimized copies/references only if real testing requires them |
| Photo consent, original metadata/EXIF retention and public-release decision | Requires owner approval | Owner reviews real content/privacy/retention before intentional publishing |

No code change is currently required merely to connect configured private R2/Drive. That is conditional on the actual external tests passing. If real-service behavior reveals a defect, fix/test that concrete defect before launch. Do not label configuration/documentation as live verification.

Server transport hardening is implemented and tested locally: `GSMUN_DATABASE_TIMEOUT_MS` defaults to60000ms, accepts1000–180000, and applies to Auth/metadata plus legacy Supabase Storage requests in server clients/proxy/worker. It composes caller abort signals, forces no-store requests and does **not** replay ambiguous mutations. Stable upload identities/version checks and explicit retry own recovery. This fixes an actual missing-deadline path; no external outage test is claimed.

Deployment parsing was verified without daemon/resources/credentials using dummy `ARCHIVE_HOST=archive.example.test`, `GSMUN_SECRETS_DIR=C:/PRIVATE-UNCONFIGURED` and:

```sh
docker compose --env-file .env.example -f deploy/compose.yaml config --no-env-resolution --quiet
docker compose --env-file .env.example -f deploy/compose.yaml -f deploy/compose.drive.yaml config --no-env-resolution --quiet
```

Both exited0; this is YAML/interpolation validation only, **not a container, Caddy, TLS or private-file-access test**. On the approved Linux host, mounted key/secret files must be readable by container node UID/GID1000 without becoming world-readable (for example file owner1000:1000/mode0600, protected private parent). Verify access without printing contents; root-owned0600 bind files are not automatically readable by node. No host permission change was made here.

## H. Smallest ordered path to public use

1. Preview locally: **http://127.0.0.1:5211/** is the actual public renderer with approved local8book catalogue, empty chapters and zero real/demo photos. **http://127.0.0.1:5210/admin/** is the private, labelled simulator; click **Enter simulated administrator**, never a real password. **/admin/shelf/** on5210 is simulator-only; actual production draft preview is `/admin/preview/{bookId}/`.
2. Approve the actual hosting/hostname/R2 quote and private bucket setup. Existing-compatible path: one always-on EU Node container + Caddy HTTPS, current Supabase Database/Auth, private R2 Standard. Cloudflare Pages cannot host this unchanged app's sessions/API/native Sharp/private files/poller as a static export.
3. Privately configure server variables from `.env.example`; never send values in chat. `NEXT_PUBLIC_SUPABASE_URL` and publishable key are public; R2 credentials, Google JSON key and delegated worker secret/session are **server-only**. `GSMUN_PUBLIC_ORIGIN` is public information but server-configured, used for origin checks and share metadata. Set it at build/runtime. Leave privileged/service-role key unused. `GSMUN_CONTENT_SOURCE=local` and offline guard are not production settings.
4. Approve backup/current-schema inspection/new migration staging validation separately. Preserve current admin membership. Then separately approve the guarded draft-only initial catalogue/artwork import after conflict checks. Real empty public content remains expected until import **and explicit publication**; do not bypass this by serving local snapshots in production.
5. Prefer manual-upload QA first: existing admin login → dedicated test book/chapter → two approved test originals → retry/caption/order/preview → verify private originals/variants/hash → separately approved small publication/withdrawal test. Test public API directly as anon and ordinary non-admin, not just hidden UI buttons. No real credentials or cloud results have been tested here.
6. For Drive, owner creates/enables approved Cloud project/API and dedicated read-only service account, shares only final-selection root as Viewer with downloads allowed, uses book/chapter subfolders, and configures the private key path. No public Google links/thumbnails, domain-wide delegation or owner/editor project role needed. Unknown mappings wait for review. See existing setup guide for exact steps.
7. Use `scripts/verify-live-integration.mjs` plan-only first. After explicit scoped QA approval and private manifest, run its `--execute --approval-file ABSOLUTE_PRIVATE_PATH` flow. It requires a dedicated INTEGRATION TEST draft destination, human existing-admin login, expected-project/R2/proxy/schema checks and stopped worker. It writes only approved QA photo bytes/records, but discovery may create/update private tracking/cursor metadata elsewhere under the dedicated source root. Temporary publication needs a separate manifest opt-in; withdrawal is attempted in finally, never guaranteed after process/network failure. It never automatically deletes data. Do not run it here without approval.
8. After approved Linux build/TLS/deployment, verify new host, redirects, secure cookies, uploads, public original downloads, private drafts, rollback and physical Safari. Authorize unattended polling only after manual/Drive QA passes. Manual uploader can launch first if Google organization access is delayed; storage/auth/privacy cannot be skipped.
9. Review intended real photographs and approve public publication/deployment separately. Upload batches rather than one giant request. Monitor Supabase inactivity/metadata egress, R2 usage, host memory/disk, failed jobs and backups. Never auto-upgrade or silently switch providers.

Release-image example (future owner action, not executed; run at repository root; variables are private shell environment names, not literal values):

```sh
docker build -f experiences/complete-shelf/Dockerfile \
  --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --build-arg GSMUN_PUBLIC_ORIGIN \
  -t gsmun-archive:reviewed-release .
```

Tag the **reviewed** image as the compose release tag only after successful staging checks. Runtime uses existing `deploy/compose.yaml` + ignored0600 `.env.production` beside it; no secret values belong in the image. Optional approved `compose.drive.yaml` mounts private key/secret files read-only from outside the repository, with persistent private worker state. Only Node loopback/internal networking and HTTPS should be exposed as documented. Compose/host activation itself requires approval.

Rollback: disable polling, let current file settle, restore prior **R2-compatible** image/private config, retain objects/rows/job tracking, verify private/public status. Never reset Supabase, rerun original migrations, drop tables or purge storage as rollback. Never restore a publication snapshot blindly and republish withdrawn content.

## I. Costs and unresolved account-specific settings

Existing [assumption-based cost model and official links](LAUNCH-READINESS.md#5-costs--conditional-not-a-spending-cap) were checked23October: host reference€3.81exVAT, R2 Standard metered beyond allowance, Supabase Free metadata/Auth under quotas. Central5K profile—4MiB original +150KiB thumbnail +800KiB viewer per image plus89,438,700 measured artwork bytes—uses~25.925GB, estimated~$0.24R2/month. Illustrative21%VAT and€1/$1 FX yield~€4.85, conservatively~€4.90/month total. **Not a verified checkout, renewal quote or spending maximum.** At8MiB originals the model is~€5.17 before extras. Domain/independent-backup additions, tax/FX, request volume, Google billing rollout and changed host terms can exceed€5. Nothing billable was enabled.

**Additional measured size / estimated delivery risk:** all24 unchanged artwork files total89,438,700encoded bytes. Header inspection gives244,828,480source-resolution RGBA bytes, or an estimated326,437,974bytes with a full mip chain; **not measured GPU/VRAM allocation**. The existing engine waits for all custom artwork. A cold root visit therefore needs~89.4MB of book art before identity/background/fonts/code; ideal art-only transfer is~71.6seconds at10Mbps,14.3seconds at50Mbps, excluding latency/decode. Those are estimates, not measured phone speeds. Photo-only traffic figures in the earlier report exclude this cold shelf load: add~89.4GB per1000 cold root visits (~894GB per10K;8.94TB per100K). Warm caches/direct archive links change that mix. This is a meaningful prelaunch phone-performance gate, not a new regression or permission to alter approved artwork/engine silently.

Drive source/backup allocation is **not included** in the~€4.90 model. At5000×4MiB selected originals need~20.97GB; copied selections can add that beyond working folders. Verify existing Drive capacity/cost, or use manual-upload fallback and separately approved retention/backup arrangements. API quotas do not supply disk space. Never automatically delete source files to force the budget to fit.

Owner must check actual provider plan/quota/billing/cap settings, bucket privacy/jurisdiction, Google external-sharing restrictions, host region/renewal/traffic terms, administrator confirmation and backup capacity. R2 has no claimed enforced€5 spending cap; application admission limits/alerts are not account-wide billing caps. Heavy traffic can exceed Supabase Free metadata egress even with cached R2 variants. No unlimited-free or guaranteed-availability claim is made.

**Final verdict remains Ready after specified configuration and verification.** The local implementation is testable; external accounts, migration/import approval, actual private uploads/downloads/security, independent HTTPS deployment and content approval still block a safe public launch. Those gates are not replaced by a passing build.
