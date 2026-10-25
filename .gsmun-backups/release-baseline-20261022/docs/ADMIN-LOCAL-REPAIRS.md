# Local CMS repair audit — 18 October 2026

## Phase A: confirmed code findings

- Public data flows through `public-content.ts`, the content provider and the
  database mapper into the existing public renderers. No engine replacement is needed.
- Auth uses verified Supabase users and `is_archive_admin`, not a hidden-route
  password. The existing account/membership must be preserved. An unconfirmed
  email cannot be fixed offline: verify ownership and use Supabase's existing
  confirmation flow after separate approval. Do not disable confirmation or reset it.
- Book publication currently requests cascading publication of draft descendants.
- Admin saves have no synchronous in-flight guard; expired-session redirects lose
  unsaved form state. Artwork selection also saves unrelated unsaved metadata.
- Uploads are sequential, abort the batch at its first error, and use a new asset
  identity on each retry. A lost response can duplicate content. Failed cleanup
  can lose the association between a stored object and the upload that created it.
- Collection listing is bounded but only supports accumulating pages; it lacks
  search/status filters and makes large collections progressively expensive to edit.
- The local fallback still contains Unsplash references. These must be excluded
  at the content boundary; the historical catalogue/import snapshot is preserved.
- The legacy importer imports demo photographs and publishes automatically. It
  must not be used; the reviewed no-demo bundle is the only recovery proposal.

## Local repair scope

Keep the existing tables, RPCs, RLS, bucket, account and renderer. Add bounded,
retryable uploads with persistent upload identities and tracked assets; paginated
admin listing/filtering; deliberate non-cascading status controls; reliable form
submission/error handling; safe auth errors; and mock-based offline tests.

No live Supabase requests, SQL execution (including embedded PostgreSQL tests),
uploads, policy changes or publication are authorized for this phase. The import
bundle at `.local/catalog-import-v1-no-demo/` is not regenerated or executed.

## Approval boundaries / not yet verified

Live account confirmation/login, session refresh, database persistence, storage
uploads, RLS enforcement and provider-plan capacity require approved live testing.
The schema permits multiple administrator memberships; enforcing exactly one
requires a separately reviewed schema/security decision. No membership is changed.
No database index is added. Existing parent/status/order indexes are reused;
checksum/text-search indexing can be proposed after measuring real queries.

Local cancellation stops the browser transfer, not a transaction already accepted
by the server. Retry the SAME upload identity to reconcile an uncertain result.
Failed uploads retain tracked asset metadata/files rather than deleting storage.
Cross-browser atomic upload ordering and distributed processing locks would need
a separately approved RPC/schema enhancement; no such migration is applied here.

## Phase B: local implementation

- Kept verified `getUser()` + `is_archive_admin()` authorization on every content
  and upload endpoint. No service key is used. Mutation requests require the same
  Origin. Logout terminates only the caller's session; it is not a content API.
- Cookie refresh retains previously set cookies. Auth outages are distinct from
  expired sessions, forbidden membership and unconfirmed email. Login/logout
  report errors safely, never provider internals or tokens. No signup/reset or
  account-confirmation bypass was introduced.
- One synchronous in-flight save guard plus disabled form controls prevents
  duplicate submissions. Expired sessions leave forms in place; sign in in a
  second tab and retry. Cancelled confirmations do not report a successful save.
- Book creation still uses the existing atomic book/archive RPC. Ordering still
  uses the existing scoped reorder RPC. Saves/deletions require a returned row.
- Metadata and artwork saves are separate. A metadata save cannot revert artwork.
  Published items must be explicitly unpublished before edits/deletion/replacement;
  there is no hidden revision system. New chapters/photos are always drafts.
- Book status changes always use `include_drafts: false`. Chapter/photo status
  buttons and selected-page bulk photo actions are separate deliberate operations.
  Parent and descendant status rules in the existing RLS/mapper remain unchanged.
- Bulk photo actions report partial failures; successful rows are not falsely
  described as rolled back. Bulk actions operate only on selected visible rows.
- Admin collections now use 48-record pages, search, status filters and explicit
  order/newest/oldest/name sorting. Image previews lazy-load. Pages replace the
  current list rather than accumulating 2,000 mounted editing forms. A Move to
  control supports explicit IDs across pages; drag/arrow ordering remains.
- Photo uploads run two transfers at a time, with per-file and overall progress,
  queued/processing/saved/failed/cancelled states, retry, pause and per-file cancel.
  Failed files do not stop the rest of the batch. Browser file references are not
  decoded en masse; successful file references are released.
- Upload IDs persist as small browser receipts (not image bytes or credentials).
  Failed/interrupted batches can be reselected after reload. If browser history
  was cleared, recover a photo by copying its tracked asset UUID from Media and
  selecting the original file in the correct book/chapter's recovery control.
  Receipt writes are throttled; new IDs and terminal states flush immediately.
- Retries use the same asset UUID, destination and checksum; original/derivative
  conflicts are byte-hash checked, never overwritten. Uploading creates a tracked
  processing asset before storing bytes; only a ready asset is attached to a new
  draft photo. Link failures leave a recoverable ready asset. No automated file
  deletion or destructive storage cleanup is performed. Replacement checks the
  previous asset ID so a delayed request cannot overwrite a subsequent edit.
- Duplicate filenames are warnings, not proof of identical bytes. Server checks
  SHA-256 duplicates within the selected chapter. An intentional duplicate needs
  explicit confirmation in the failed-file controls. Cross-tab duplicate detection
  is advisory; without a unique constraint simultaneous distinct upload IDs can
  still produce intentional-looking duplicate rows. No schema change is hidden.
- Both client transfer concurrency and per-Node-process decoding are bounded at
  two. The HTTP body reader enforces the multipart size cap even without a
  Content-Length header. Server decoded-file/MIME/pixel validation is preserved.
- Local public fallback supplies the original books/chapters with zero photos.
  The database mapper/asset route reject Unsplash demo sources. Historical source
  catalogue and artwork/import checksums are unchanged. The retired importer now
  refuses `--apply`/`--resume` before any network operation.

## Practical operator workflow (after approved live verification)

1. Open `/admin/login/` and sign in using the existing administrator account.
2. Books → Create book → save draft metadata. An archive is created atomically.
3. Edit the book to upload/select cover, spine and back artwork separately.
4. Add any number of chapters. Each has its own title, slug and explicit order.
5. Edit / photos on the desired chapter. Select/drop images into that exact
   book → chapter, monitor progress and retry failed files. Nothing auto-publishes.
6. Save captions, credits, credit links and alternative text. Use search/status
   filters, page navigation, drag/arrows/Move to and selected-page status actions.
7. Open the private Preview volume link. It uses the existing public renderer,
   not a second shelf. Draft previews require administrator authorization.
8. Publish the intended photographs and chapters separately, then the book.
   Publishing a parent never changes descendant statuses. Unpublish/archive hides
   content without deleting it. Unpublish before editing published content.
9. Delete only after the deliberate confirmation. Book/chapter deletion cascades
   contained records, not stored files. Old/replaced assets remain tracked in Media;
   production storage cleanup is a separate reviewed maintenance operation.

## Phase C: verification boundaries and commands

`pnpm test` (also `pnpm verify:offline`) runs the real production Next build,
automated tests, `tsc --noEmit` and ESLint in a credential-cleared environment.
The preload guard blocks non-loopback fetch/HTTP requests and disables SQL tests
before Next reads `.env.local`. It does not edit `.env.local` or application config.
Offline Next output is isolated under `.local/offline-next/` through a test-only
`GSMUN_OFFLINE_VERIFY` config branch; the normal `dist` setting is unchanged.
TypeScript includes this generated test output in addition to normal route types.
Deploy only a fresh normal production build, never the offline fixture build.

Optional browser tests use installed Playwright/Chrome, not another app dependency:

```powershell
$env:GSMUN_BROWSER_SMOKE = '1'
$env:GSMUN_PLAYWRIGHT_MODULE = 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:GSMUN_CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm test
```

- Contract tests use the actual route/service implementation with a test-only
  in-memory database/storage double. They are NOT evidence of real RLS, Supabase
  Auth sessions, transactional behavior, storage availability or persistent data.
- A 2,000-row fixture exercises actual pagination/search/filter/sort query building;
  a real React browser harness exercises 2,002 rows, creation of a new book/three
  chapters, image processing/upload contracts, retry, caption save, refresh and
  non-cascading publishing/logout. It never creates real database records.
- Public Chrome regression uses the actual production app at 390×844, 393×852,
  430×932, 1024×768 and 1440×900. It checks the original shelf entry/return,
  chapter navigation, identity/header, responsive columns, overflow and zero demo
  photographs. Actual conference-photo viewer/storage testing awaits real content.
- The existing PostgreSQL/RLS test is deliberately skipped because it executes
  SQL, even though its engine is embedded/local. No SQL is executed in this pass.
- Import tests only inspect the existing SQL text, counts, relationships and local
  SHA-256 hashes. They do NOT execute the reviewed SQL or prove live import success.
- Frozen engine/motion/art/CSS hashes, catalogue checksum and all 24 artwork
  checksums are checked. Public renderer files and public assets are not edited.

### Final executed results — 18 October 2026

- `pnpm test` with the optional browser variables above: exit 0.
- Production Next.js build in `.local/offline-next/`: passed.
- Automated suite: **32 passed, 0 failed, 1 deliberately skipped** (SQL/RLS engine
  test). The 15 added local repair tests are included in the 32 passing tests.
- `tsc --noEmit`: passed (run by the verification command).
- ESLint: **0 errors, 9 existing `no-img-element` warnings**. Image rendering was
  not redesigned to suppress these warnings.
- Actual production-app Chrome smoke: passed at all five listed viewport sizes;
  book selection, chapter navigation, direct return, header, column rules and no
  horizontal overflow/demo photography. No page/runtime errors or external page
  requests observed.
- Real React admin + actual API/service contract browser harness: passed with a
  new test book, three chapters, mixed valid/invalid multi-file selection,
  intentionally failed transfer + retry, saved caption, refresh, 2,002-photo
  listing/pagination/search, selected publication and non-cascading book status.
  Its data/storage existed only in memory and disappeared when the harness closed.
- Protected engine/motion/art/CSS hashes and source catalogue/ID-helper hashes
  match the reviewed snapshot; all 24 original artwork checksums match.
- No live Supabase request, SQL execution, upload, credential/account change,
  production security change or publication was performed. Test servers closed
  after verification. Real login, Supabase persistence, RLS and quota remain untested.

## Storage/performance planning — estimates, not a quota measurement

Existing code limits remain: 30 MiB per original, JPEG/PNG/WebP only, single frame,
32–16,000 pixels per side and 50 million decoded pixels. HEIC must be exported to
JPEG first. Next Proxy's configured 32 MB request limit is unchanged. The bucket
was previously observed as private with a 32 MiB object cap; it was NOT queried
again here. Hosting payload/time/memory limits may be tighter than these values.

Each photo retains its original and up to two locally processed WebP derivatives:
760px grid (quality 80), 2400px viewer (quality 88), both fit-inside/no enlargement.
No paid Supabase Image Transformation service is required or enabled. New artwork
bytes remain unchanged; no new cover/spine/back transformation is introduced.

Illustrative retained-storage estimates for 2,000 photographs:

| Example sizes per photograph | Approximate total |
| --- | --- |
| 4 MiB original + 0.15 MiB thumbnail + 0.8 MiB viewer | 9.67 GiB |
| 8 MiB original + 0.2 MiB thumbnail + 1.2 MiB viewer | 18.36 GiB |

Add the existing 89,438,700 artwork bytes (~85.3 MiB), replacement assets, incomplete
uploads retained for recovery, backups and growth headroom. 2,000 ordinary uploads
create about 6,000 objects, 2,000 asset rows and 2,000 photo rows. Real derivative
sizes depend on the image; originals alone are not the full storage requirement.

The project's actual subscription, available storage, egress and request quotas
were NOT inspected because live access is outside this phase. Published Supabase
pricing currently lists 1 GB file storage on Free, 100 GB included on Pro and Pro
starting at $25/month ([official pricing](https://supabase.com/pricing)); these examples exceed Free storage. Compute, uncached
egress, extra projects, hosting bandwidth and overages can add costs. Nothing was
upgraded or charged. Check the actual dashboard/plan before real bulk uploads.
Private authorized image delivery currently has `private, no-store` caching and
buffers the requested original/variant in Node; that preserves access control but
adds application bandwidth and memory. It is not a CDN-capacity guarantee.

Transfers are retryable whole-file multipart transfers, **not TUS/chunk-resumable
uploads**. Supabase recommends resumable uploads above 6 MB. For weak connections
or serverless hosts with lower payload limits, separately approve/test a direct
authenticated resumable upload + finalize workflow before large production use.
No such storage/security architecture is silently added here. Current runtime
requires suitable Node hosting; arbitrary serverless upload limits are not fixed
by Next's Proxy body limit.

Homepage queries still fetch book/artwork metadata only. The selected public
archive still receives its photo metadata as one DTO, with lazy image bytes;
chapter-level public metadata pagination remains a potential future optimization,
not a change to the approved public gallery during this pass.

Official references (public documentation only; no project API accessed):

- [Supabase pricing](https://supabase.com/pricing)
- [Standard uploads / resumable recommendation](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [File limits](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [SSR session verification/cookie refresh](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)

## Files changed in this local repair pass

Modified:

- `app/admin/AdminDashboard.tsx`, `BookEditor.tsx`, `SectionManager.tsx`,
  `PhotoManager.tsx`, `admin-client.ts`, `admin.module.css`, `login/LoginForm.tsx`.
- `app/api/admin/content/route.ts`, `app/api/admin/upload/route.ts`,
  `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`,
  `app/api/assets/[id]/route.ts`.
- `lib/cms/model.ts`, `http.ts`, `content-mapper.ts`;
  `lib/supabase/server.ts`; `proxy.ts`; `app/local-content.ts`.
- `scripts/migrate-content.mjs`, `scripts/test.mjs`, `package.json`,
  `eslint.config.mjs`, `next.config.ts` (test-only output isolation), `tsconfig.json`
  (generated offline route-type includes); `tests/cms.test.mjs`, `tests/browser-smoke.mjs`.
- `docs/SUPABASE-SETUP.md`, `docs/CMS-IMPLEMENTATION.md` (restored-project warnings).

Added:

- `lib/cms/admin-operations.ts`, `errors.ts`, `listing.ts`, `upload-queue.ts`,
  `upload-service.ts`, `upload-slots.ts`.
- `scripts/offline-guard.cjs`, `scripts/verify-offline.mjs`.
- `tests/admin-repairs.test.mjs`, `tests/admin-browser-smoke.mjs`,
  `tests/helpers/load-typescript.mjs`, `fake-database.mjs`, `browser-loader.cjs`,
  `tests/fixtures/admin-browser-entry.tsx`, `browser-link.tsx`.
- This audit/implementation report.

Test/build tools generate ignored `.local/offline-next/`, Next/TypeScript cache and
`.local/admin-browser-test/admin.js`. The reviewed import folder is untouched.
No dependencies, lockfile, environment file, migration, credential, public
renderer, 3D engine, catalogue record or artwork file is changed.

## Phase D onward — stop before production operations

The existing no-demo bundle remains 8 draft books, 8 draft archives, 32 draft
chapters, 24 artwork assets and zero photos. It has NOT been regenerated, executed
or uploaded. Import and publication remain separate operations.

Before any live write: get explicit approval, verify the project again, preserve
a recoverable database/storage/auth-membership backup and check conflicts. Review
the existing manifest/guarded SQL and upload checksum verification. Then request
separate approval for import-as-drafts/artwork upload, legitimate account access
recovery and temporary live CRUD/upload/RLS testing. Publication/deployment needs
its own subsequent approval. Do not create another administrator or bypass email
confirmation. Enforcing a one-row administrator membership constraint also needs
a separate reviewed schema/security proposal; none is applied here.

For the unconfirmed account, first verify the existing user/email ownership and
the configured Supabase email template, redirect allowlist and delivery settings
after approval. Use the provider-supported confirmation flow for that SAME user;
then verify password login and existing membership. Do not disable confirmation,
force-confirm through SQL, create a replacement account or reset the password as
a shortcut. No confirmation message was sent during this local phase.

A future single-administrator constraint could limit `archive_admins` to one row,
but it would also require a controlled replacement transaction if the designated
account ever changes. Back up/check membership before proposing its actual DDL;
do not silently enforce that policy as part of these local code repairs.

Remaining practical limitations: whole-file retry (not byte-offset resume),
advisory duplicate detection across simultaneous distinct upload IDs, possible
concurrent new-photo sort-order ties (stable ID tie-break and explicit reorder),
retained failed/replaced assets consuming quota, public per-volume metadata DTOs,
and host-specific request/timeout/memory limits. Real deployment needs HTTPS and
verified forwarded-origin/cookie behavior. These are explicit release checks,
not assumed successes or a reason to change the approved bookshelf.
