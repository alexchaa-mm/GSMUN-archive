# Focused public navigation / Drive implementation report

**23 October 2026 — LOCAL implementation, not live cloud activation.**

**Latest follow-up:** [MASTER-COMPLETION-REPORT.md](MASTER-COMPLETION-REPORT.md) records dedicated hint layout, server timeout hardening and **70/70 passing tests with no skips**, including isolated PostgreSQL/RLS; [LAUNCH-READINESS.md](LAUNCH-READINESS.md) provides guarded real QA/setup. The58-test/one-skip table below is historical, not the current suite. No real project migration/integration was performed.

## Result

Public galleries are simpler; the existing bookshelf has an accessible supplementary drawer, yellow italic Inter descriptions and a fading introduction. Admin now has **Public Navigation** and **Drive imports**. Durable navigation drafts/publication and a retryable Drive-to-private-storage-to-draft-photo pipeline are implemented against existing content/upload/storage conventions. No second CMS, photo approval system, event renderer or bookshelf engine was created.

The preservation brief governed the frontend work: existing colour/font tokens and native dialog accessibility were used instead of a redesign. Supabase operations reuse verified users, membership checks, anonymous published reads and existing publication boundaries. New RLS is **proposed only**, not represented as installed or live-tested.

## Use the local previews

- Public design: **http://127.0.0.1:5211/**. Actual Next.js public route and original eight-volume local catalogue, no demo photographs. Open the right-side menu; entries focus the existing book presentation, then use Open archive normally.
- Admin simulation: **http://127.0.0.1:5210/admin/**. Click **Enter simulated administrator** (do not enter a real password), then Public Navigation or Drive imports. Data persists in the isolated local store. Drive correctly reports **Not connected**; it does not pretend to upload to a cloud account.
- Private simulated draft shelf: **http://127.0.0.1:5210/admin/shelf/**, after entering the simulated admin.

All three URLs were checked after restart and returned HTTP200 (private routes redirect to simulated login without its session). These previews use separate data sources; sandbox uploads do not appear in the read-only5211 design preview. Never expose the simulated admin to the LAN/internet.

No Opening/Closing Ceremony was fabricated. They can be ordinary existing-model books/chapters, explicitly published by the administrator, then assigned a direct navigation link. Navigation settings never publish content themselves.

## Executed verification

| Check | Actual result |
| --- | --- |
| Production-mode Next16.2.10 standalone build with offline/blank-cloud configuration | PASS; final standalone server starts |
| Automated suite | **58 tests:57 PASS,1 deliberately SKIPPED,0 failures** |
| Skipped test | Actual SQL/PostgreSQL RLS execution; no SQL authorization granted |
| TypeScript `tsc --noEmit` | PASS |
| ESLint | **0 errors;11 existing img-element warnings** |
| Public Chromium responsive browser test | PASS at390×844,393×852,430×932,1024×768,1440×900 |
| Drawer | Open/close, Escape, outside click, keyboard containment/focus return, published entries, focus rather than automatic archive entry, reduced-motion behavior; PASS |
| Hint / type / gallery | Passive canvas-scroll fade, italic Inter/#FFA800, absence of public search controls, existing chapters/return and no overflow/demo photos; PASS |
| Admin Chromium test | Existing uploads/search/selection/publication plus group/entry labels/order/hiding, draft save/reload, unsaved preview, navigation publication, safely disabled Drive controls; PASS in contract store |
| Persisted acceptance test | PASS with synthetic local PNGs: new book/3chapters, uploads/interruption/retry, caption/filename/order, focus/direct-chapter/browser Back, exact-original hash/download, share fallback/deep links, zoom/keys/close, gallery pages, publication/withdrawal and unauthorized access |
| Persisted gallery sizes |390×844,393×852,430×932,768×1024,1440×900; PASS |
| Drive service tests |13 offline tests covering nav/Drive services and routes, including draft relationships, original hashes/variants, duplicate IDs/copies, unknown-folder mapping, invalid/unsupported/changed/moved sources, partial storage/DB failure, cursor expiry/page recovery, live-lease contention,2000 delayed jobs, endpoint denial, private session rotation and disable/refresh race |
| Existing R2 adapter test | Actual S3 SDK against loopback object-storage double; not Cloudflare: conditional writes, original integrity/ranges and publication withdrawal PASS |
| Reviewed import / artwork | `node scripts/check-import.mjs` PASS:8books/8archives/32chapters/24artworks, all drafts, zero photos/demo URLs, original sizes/hashes unchanged |
| Visual review | Mobile/desktop drawer screenshots inspected; final closed-header screenshots captured under `.local/navigation-browser/` |

The persisted acceptance test's latest synthetic volume is `ab70dcac-a67f-4415-92f9-7d7ad9706e98`. Its parent was returned to draft and test navigation was restored. Synthetic files/records are retained privately, never sent to production. Descendants may retain test publication statuses but are not public through their draft parent. Tests do not prove physical iPhone Safari or live Google/R2/Supabase behavior.

### Concrete local defects found and repaired during testing

- Dynamic private-file paths initially caused overly broad Turbopack tracing, copying source package metadata into standalone output and breaking server startup (`require is not defined in ES module scope`). Runtime-mounted credential paths are now excluded from filesystem tracing. A regression test checks that release traces do not include source/environment/private-file directories. **Application package type was not changed to hide the problem.**
- The old test store omitted PostgreSQL-generated material/text defaults for newly created books, causing `quoteBy.toUpperCase()` to fail in the simulated procedural fallback. The **test store only** now mirrors installed SQL defaults, including older simulated rows. ShelfEngine/cover-art were not changed.
- Worker disable/reauthorization is serialized with private token rotation, so a refresh begun before Disable cannot restore an old authorization.

## Files changed / added

Paths are relative to `experiences/complete-shelf` unless noted. Existing files are modified, not replacements of their systems.

### Public presentation / navigation

- Modified `app/CommitteeArchive.tsx`: remove public search/sort/result toolbar; keep chapter grids/paging/viewer.
- Modified `app/PhotoViewer.tsx`: optional actual caption/credit only, no visible filename-as-caption fallback.
- Modified `app/search/page.tsx`: redirect former public search home; compatible helpers/API retained, no public search UI.
- Added `app/NavigationDrawer.tsx`, `app/ShelfGuidance.tsx`, `app/public-navigation.css`.
- Modified `app/ProgressLibrary.tsx`: wire UI and existing `browseTo` only; no engine behavior edits.
- Modified `app/ArchiveRouter.tsx`: existing direct destinations and history/focus URL handling.
- Modified `app/page.tsx`: load published navigation metadata through the service boundary.
- Modified `app/layout.tsx`: drawer CSS and existing Inter italic font package import.
- Modified `app/globals.css`: **one requested font-family declaration only**, serif→sans for `.browse-caption__author`.

### Admin / server / storage integration

- Modified `app/admin/AdminDashboard.tsx`; added `app/admin/NavigationEditor.tsx`, `app/admin/DriveImportPanel.tsx`.
- Added `lib/cms/navigation.ts`, `lib/cms/navigation-service.ts`.
- Added `lib/cms/drive-client.ts`, `drive-import.ts`, `drive-admin.ts`, `drive-worker.ts`.
- Added `app/api/admin/navigation/route.ts`, `app/api/admin/drive/route.ts`, `app/api/internal/drive-sync/route.ts`.
- Modified `app/api/admin/export/route.ts`: include optional private navigation/job/mapping/cursor metadata; no credentials/Auth/files/policies.
- Added `instrumentation.ts`: opt-in single-Node-process polling, disabled by default.
- Modified `.env.example`, `Dockerfile`, `Dockerfile.dockerignore`, `deploy/compose.yaml`: documented private mounts, persistent worker-state directory/volume, secret exclusions; no real environment/deployment changes.
- Modified `package.json` and workspace-root **`pnpm-lock.yaml`**: pinned official `google-auth-library@11.3.1`. No new frontend/UI framework.

### Offline tests / previews / documentation

- Modified `scripts/offline-guard.cjs`, `scripts/preview-sandbox.mjs`.
- Modified `tests/helpers/fake-database.mjs`, `tests/fixtures/release-sandbox-entry.tsx`.
- Added `tests/navigation-drive.test.mjs`.
- Modified `tests/cms.test.mjs`, `tests/browser-smoke.mjs`, `tests/admin-browser-smoke.mjs`, `tests/release-browser-smoke.mjs`.
- Added `docs/DRIVE-IMPORT-SETUP.md`, **review-only** `docs/sql/NAVIGATION-DRIVE-PROPOSAL.sql`, this report; updated `docs/RELEASE-GUIDE.md`.
- Local source rollback snapshot: outer-workspace `.gsmun-backups/navigation-drive-20261023/`. No Git repository was available; no user work was reset. Test builds/screenshots and sandbox state remain under ignored `.local/`.

### Intentionally untouched

`app/ShelfEngine.ts`, `app/book-motion.ts`, `app/cover-art.ts`, catalogue/local provider, content mapper, existing photo manager/upload pipeline/object-storage adapter, original migration, existing RLS/functions/Auth account, existing artwork/identity/background assets and review-only no-demo import bundle. Protected source hashes and artwork checks pass. The global stylesheet guard normalizes **only** the approved single font-family change before comparing its original hash.

## Commands executed

From the application directory unless noted:

```powershell
# Dependency change only, at workspace root; no cloud account connection.
pnpm --filter @mint/playground-experience-complete-shelf add google-auth-library@11.3.1 --save-exact

node scripts/verify-offline.mjs
# Also run with GSMUN_BROWSER_SMOKE=1 and the installed local Playwright/Chrome paths.
node --require ./scripts/offline-guard.cjs --experimental-strip-types --test tests/navigation-drive.test.mjs
node --require ./scripts/offline-guard.cjs tests/browser-smoke.mjs
node --require ./scripts/offline-guard.cjs tests/admin-browser-smoke.mjs
node --require ./scripts/offline-guard.cjs tests/release-browser-smoke.mjs
node scripts/check-import.mjs
node scripts/preview-public.mjs
node --require ./scripts/offline-guard.cjs scripts/preview-sandbox.mjs
```

`verify-offline` executes Next build, all test files, TypeScript and ESLint with cloud credentials cleared and non-loopback HTTP blocked. Repeated runs followed fixes. Browser scripts were supplied the installed Playwright module and Chrome executable via the existing test environment variables. Windows sandbox permissions required elevated local test execution for browser/listener/atomic-temp-file access; that did not authorize or perform cloud writes.

## Remaining approval / launch gates

1. **Review/approve new tables and policies**, after backups and target/schema conflict checks. No SQL was executed. The proposal changes only the four new metadata tables and reuses existing functions. Production navigation persistence/import jobs cannot work until installed and live RLS checked.
2. Approve/configure the dedicated read-only Google service account/folder/API; private server credential file; correct private R2 adapter and budget; optionally a private worker secret/session volume. Do not send passwords, tokens or private keys in chat.
3. Explicitly authorize unattended imports with the existing administrator session if desired. Live token rotation/expiry/revocation/organization sharing restrictions are **unverified**. Manual sync/panel polling remain available.
4. Run a separately approved small real import and verify draft denial, exact-original downloads, variants, restart/retry and explicit publication/withdrawal. **Polling is implemented; push channels and byte-offset resumability are not.** Single-process Node deployment only; five files/tick is conservatively capped and actual throughput remains unmeasured.
5. Existing production HTTPS/hosting/account/backups/catalogue-import gates remain. Nothing was deployed, imported or published remotely. No paid service was enabled. No service-role credential was used.

Costs and exact authorization steps: [DRIVE-IMPORT-SETUP.md](DRIVE-IMPORT-SETUP.md). Existing whole-system estimate remains **approximately€4.90/month**, conditional on the reviewed host quote, assumed tax/FX,5000×4MiB originals and ordinary usage. It is **not** a hard€5cap; hosting/renewal, average originals, retained replacements, traffic, requests and future Google billing can exceed it. No additional paid queue/image service was introduced.
