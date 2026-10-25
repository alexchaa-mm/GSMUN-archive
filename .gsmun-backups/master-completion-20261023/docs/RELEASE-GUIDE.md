# GSMUN release implementation and operator guide

Updated **23 October 2026**. This documents implemented local software, not a live deployment. The target launch is **25 October 2026**; 28 October is a fallback only if a production gate cannot safely pass. The former hard-€0 audits are historical: the current budget is **approximately €5/month**. Nothing has been purchased, deployed, imported or published remotely.

**Latest implementation / approval checklist:** [LAUNCH-READINESS.md](LAUNCH-READINESS.md). The new four-table SQL is now a CLI-generated, locally tested **unapplied** migration, not a request to repeat any installed schema. All 68 automated tests now run, including two isolated in-memory PostgreSQL/RLS tests; this does not verify restored-project policies. New production startup/content checks fail closed instead of silently displaying the local catalogue when cloud configuration is absent. The guarded public design preview explicitly remains an offline exception, not a deployment configuration. Real integration execution needs a separate private owner-approved QA manifest.

## Focused navigation / Drive update — 23 October

See [DRIVE-IMPORT-SETUP.md](DRIVE-IMPORT-SETUP.md) for the exact configuration, approval gates, costs and limitations. Public search/sort controls have been removed; admin tools remain. A published-content-only drawer supplements the unchanged bookshelf, with an initial scroll-fading hint and the requested yellow italic Inter description. **Public Navigation** manages groups/entries/labels/order/visibility/focus/direct destinations with private drafts and explicit publication. **Drive imports** reuses the existing private upload/variant/draft-photo workflow, with durable jobs, initial scan/change-feed polling, folder mapping, checksums and retries. No real Drive account is connected and no production schema/data/policies are changed.

The four new tables are **review-only, unapplied** at `supabase/migrations/20261023012405_navigation_drive_tracking.sql` (matching `docs/sql/NAVIGATION-DRIVE-PROPOSAL.sql`); approval, backup and live RLS verification are required before installation. This is separate from the existing draft catalogue import. The optional unattended worker delegates the existing administrator session to a private server file only after an explicit admin action; it is disabled/unconfigured by default. No service-role key or extra admin account is introduced. Google push channels are not enabled; reliable polling is the initial implementation.

## October 23–25 demo and launch checklist

### Use the demo now

| Purpose | Exact local URL | Data / security |
| --- | --- | --- |
| **Normal public-facing design** | **http://127.0.0.1:5211/** | Actual Next.js `/` route and approved Three.js renderer; read-only local catalogue, 8 books / 32 chapters / unchanged artwork / zero photos. No login or cloud access. |
| Admin workflow | http://127.0.0.1:5210/admin/ | Real admin UI and handlers with explicitly simulated Auth/database/storage; persistent local files. Click **Enter simulated administrator**, never enter a real password. |
| Private draft shelf | http://127.0.0.1:5210/admin/shelf/ | Requires the simulated session; includes draft local content. Not a production route. |
| Publication-aware simulated public site | http://127.0.0.1:5210/ | Only deliberately published sandbox content. Empty while all parent volumes are drafts. |

The public route was not missing. Its sandbox source had **zero published books**, so it correctly showed an empty state. No draft statuses were changed to make the design preview work. Port 5211 uses the existing local provider, which removes all demo photography. It is **not** a cloud deployment and does not show uploads from the separate sandbox. The production URL will be `https://{approved-hostname}/`; no domain/deployment has been configured.

Run the existing offline verification once if its build is missing, then keep these two commands in separate terminals from the application directory:

```powershell
node scripts/preview-public.mjs
node --require ./scripts/offline-guard.cjs scripts/preview-sandbox.mjs
```

Package aliases: `pnpm preview:public` and `pnpm preview:sandbox`. Both bind only to this computer. Do not expose the simulated admin to delegates over the internet/LAN. A clearly labelled delegate demonstration on this computer is available now, even while production is not ready.

### Photo-management workflow (implemented locally)

1. Admin → **Conference photos** → **Select book** → **Select chapter**. The full destination is repeated above the uploader. Artwork has its own **Artwork / assets** area; the artwork picker also excludes photo objects.
2. Select or drop a batch of supported originals. Start with **50–100 files per operational batch**, review results, then continue; the queue also has a 300-file automated stress test. Two transfers run concurrently, with individual progress, validation messages, retry/cancel and retained upload IDs. Successful files are not resent. A destination change warns while uploads are pending.
3. Resolve errors before clearing browser storage. After a reload/restart, reselect the **same files in the same book/chapter**; this reuses tracked IDs. This is safe whole-file retry, not byte-offset resumable transfer. No full-resolution files are preloaded merely to show the photo list.
4. Edit captions/alt/credit and filenames, reorder with arrows or drag controls, preview privately, and explicitly select intended photos to publish/unpublish. Publishing a parent does not publish all descendants. Published metadata/image replacements require unpublishing first.
5. Book and chapter slugs are suggested from new names, editable, checked in the form and again before saving. Book slugs are globally unique; chapter slugs are unique **within their own archive**. Renaming an existing record does not regenerate its slug. Deliberate slug changes require confirmation; ID-based shared links remain stable.

Original JPEG/PNG/WebP bytes are preserved; normal browsing uses generated variants. The same existing authenticated upload route enforces 30 MiB, single-frame, 32–16000 pixels/side and 50 MP limits. No live upload or provider capacity is asserted by the simulation.

### Launch-critical gates — all must pass before calling October 25 launch-ready

- [ ] **Owner approval/account setup:** approve the actual all-in Node-host quote/renewal, HTTPS hostname and private R2 account/bucket credentials. No accounts, subscriptions or paid resources were created here. R2 must have no public bucket endpoint; secrets stay server-only.
- [ ] **Secure existing administrator:** verify the same Supabase user's ownership/email confirmation, login/logout/session expiry and existing membership without resetting credentials or creating another admin. Test anonymous and non-admin denial independently on content, upload, slug-check, preview and export routes.
- [ ] **Backup before import:** owner-approved exports of current content, schema/functions/RLS/membership plus storage inventory. Preserve the reviewed bundle and original artwork independently. Confirm the target `lofuwoctrqjnnovbggxj` and private conflicts; anonymous empty results are not enough.
- [ ] **Separately approved draft import:** upload only the 24 approved artwork files without overwrite, verify hashes, then execute the reviewed guarded data-only SQL after approval. Do not rerun schema migrations or import any demo photos. Verify 8 books / 8 archives / 32 chapters as drafts, zero photos, preserving any pre-existing data.
- [ ] **Real end-to-end staging test:** after explicit write approval, create/manage a temporary draft book/chapter, upload several approved files, retry an interrupted upload, edit/reorder, log out/in and restart the deployed process. Compare downloaded original hashes, check display variants, and test from physical iPhone Safari and desktop.
- [ ] **Publication/withdrawal:** explicitly approve a small intended test publication, verify anonymous access, then withdraw it and verify old direct API/image links stop serving. Check draft-photo and parent-chain privacy against actual RLS/storage, not just mock tests. Retained copies already downloaded cannot be recalled.
- [ ] **Linux runtime/HTTPS:** build and test the supplied Node container, native Sharp, private cache permissions and Caddy TLS on the approved host. Docker CLI exists locally but its Linux daemon was unavailable; this gate is not verified by a Windows standalone build.
- [ ] **Conference batches:** confirm consent/privacy for originals (including EXIF/GPS), upload a first real batch to the correct chapter as drafts after approval, review images/captions, verify storage use and server memory, then repeat. Do not upload all 5,000 files in one request or auto-publish after upload.
- [ ] **Recovery and rollback:** keep a prior R2-compatible image, private runtime environment and independent original-file/checksum backups. Test restoration privately. Roll back application images without resetting the database or deleting objects. Never deploy a restored status snapshot without reviewing withdrawals.
- [ ] **Separate public-release approval:** only after these checks pass, explicitly approve production publication and public deployment. Monitor errors, free Supabase quotas/inactivity and R2/VPS usage; never auto-upgrade.

**Specific present blockers:** approved/provisioned production hosting and HTTPS, private R2 configuration/billing, verified existing administrator access/RLS, owner backup + catalogue import approval, and actual live CRUD/upload/download/withdrawal tests. These are not solved by the localhost demo. The fastest safe path is to complete account/configuration/approval gates in parallel with content preparation, then run one small end-to-end staging workflow before any bulk conference upload. If these cannot pass by October 25, keep the local demo and delay public release rather than expose drafts or weaken authorization.

**Cost distinction (official pages rechecked October 23):** published OVH starting price **€3.81 ex VAT/month**, not a checked final/renewal quote; R2 Standard **$0.015/GB-month after its 10 GB allowance**, metered requests and free direct egress; Supabase Free **$0/month** subject to quotas/inactivity. [OVH](https://www.ovhcloud.com/en-ie/vps/), [R2](https://developers.cloudflare.com/r2/pricing/), [Supabase](https://supabase.com/pricing). The roughly **€4.90/month** central 5,000-photo plan below is **estimated**, using stated VAT/FX/file-size/cache assumptions, not a hard cap or account-specific quote. No spend was enabled. Account terms, taxes, request volume, domain/backup choices and renewal can exceed €5; approve the actual total before purchase.

## 1. Test it now

From `C:/Users/Admin/Desktop/mint-playground-main/mint-playground-main/experiences/complete-shelf`:

```powershell
node scripts/verify-offline.mjs
node scripts/check-import.mjs
node --require ./scripts/offline-guard.cjs scripts/preview-sandbox.mjs
```

Equivalent package scripts: `pnpm test`, `pnpm content:check-import`, `pnpm preview:sandbox`.

Open **http://127.0.0.1:5210/admin/** and select **Enter simulated administrator**. Do not enter your real password. Then open **http://127.0.0.1:5210/admin/shelf/** to preview the eight original draft volumes using the actual Three.js engine, or manage them through Books. This shelf-preview URL exists only in the loopback sandbox; production retains `/admin/preview/{book-id}/`.

The sandbox is a separate Node test application, bound exclusively to `127.0.0.1`. It imports the real React components and route/service implementations, but substitutes an explicit contract store for Supabase/Auth. A persistent warning identifies it. Its network guard clears credentials before application modules load and rejects external HTTP/fetch requests. It is not a production login bypass, a Next.js feature flag or a deployable CMS backend.

Simulated data persists at `.local/release-sandbox/content.json`; privately served simulated uploads persist in `.local/release-sandbox/objects/`. Restarting the sandbox invalidates its simulated session; re-enter through the button, then saved data is available again. Do not expose this server to the LAN/internet or deploy its scripts. Treat any files you choose locally as sensitive; do not put real credentials into the sandbox.

Initial sandbox contents are copied **locally only** from the review bundle: eight draft books, eight draft archives, 32 draft chapters, 24 existing artwork references and no photos. The acceptance test adds unmistakably labelled synthetic QA images to a separate test volume and leaves the volume as a draft. These are not conference content, not Unsplash photos, and never enter the real database, production fallback or import bundle.

The simulated public `/` shows only explicitly published simulated volumes. An empty simulated public view with drafts present is correct. Use the private shelf preview rather than publishing drafts merely to see the artwork.

## 2. Chosen production architecture

```text
Visitors / administrator
        |
     HTTPS (Caddy, same origin)
        |
Existing Next.js standalone Node app
  |      |                      |
  |      |                      +-- Private R2: originals + two display variants
  |      +-- Supabase Database/Auth/RLS: existing content and administrator
  +-- Existing public assets + approved Three.js renderer
         Private local variant cache, checked only AFTER asset authorization
```

**Decision:** deploy the existing application as one standard Node container, retain the existing Supabase project/account, and use **private R2 Standard storage for new photographs**. Do not introduce a second public build, a new CMS, Drive delivery, Workers/WASM image processing or a new authentication provider.

The release host target is a small EU Node-capable VPS, with **OVH VPS-1's published starting price as the budget reference**. Final checkout/renewal/VAT/commitment terms must be approved before purchase. Existing suitable hosting can run the same image. An already available OCI Free VM can also run it, but is not assumed provisioned or reliable enough to remove the paid-host approval gate.

A VPS is not intrinsically required by Next.js. It is the selected compatibility trade-off here: existing request-time sessions, API routes, 30 MiB uploads, native Sharp and a private disk cache work without rebuilding the upload pipeline around a metered edge/serverless runtime. A sleeping free Node service is not represented as continuously available production hosting. No infrastructure has been created.

### What is implemented

- Pinned AWS S3 SDK/R2 integration; private object writes use **atomic `If-None-Match: *`**, not silent overwrite. Conflicts are reconciled by reading and hashing existing bytes. R2 supports these conditional writes. [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/).
- Existing Supabase references remain readable. New R2 references use the reserved `books/_r2/{bucket}/books/{book-id}/...` namespace in existing asset/variant fields. Actual R2 object keys remain `books/{book-id}/...`. This deliberately satisfies the installed `assets.storage_key` path CHECK; URI-style `r2://` references would fail it and are not generated. The upload default never reinterprets old references. No schema or RLS migration is necessary for this adapter.
- Original JPEG/PNG/WebP bytes are preserved. Display variants remain the established 760px WebP/q80 and 2400px WebP/q88. No paid image transformation service is used.
- Default R2 delivery **streams through the authenticated/publication-aware asset route**, including original byte ranges and safe download filenames. Every request passes current RLS before bytes/cache access. No private bucket URL/token is sent to the browser.
- Optional signed delivery is implemented but **not the recommended setting**: its bearer URLs can remain valid for 30 seconds after withdrawal, need bucket CORS for fetched downloads, and bypass the private server cache. Do not enable it without reviewing those consequences.
- An optional private, immutable display-variant disk cache reduces repeated R2 reads. Default deployment allowance: 8 GB. Originals do not enter it. Eviction affects only generated cache entries, not originals or storage assets. Authorization is never cached. Cache failures fall back to authorized delivery.
- A 35 GB default **application upload admission budget** includes recorded original and derivative bytes, including retained failures/replacements. It samples metadata at most once/minute per configured project/process and reserves accepted local upload sizes. It is conservative when a DB insertion fails, and is **not an atomic multi-server/provider spending cap**. Untracked external bucket objects and requests outside this app are not counted.
- Approved, byte-identical local artwork is reused only after asset authorization/checksum matching. This avoids repeatedly downloading the existing 89 MB of artwork from Supabase. None of the 24 original files is changed.

### Public gallery and management changes

- Shared data-driven galleries retain two phone columns and three/four wider columns, the existing identity/background, chapter navigation and established typography.
- Archive entry loads **12 photo records per chapter**, not thousands. Further pages are at most 48 records. Grid and viewer image requests use variants; a missing variant no longer silently becomes an original-sized gallery request.
- Public galleries intentionally omit search/sort/file-management controls. The former public search route redirects home; compatible internal query helpers remain, and useful search/filter/order tools stay in the private admin. No fabricated edition/tag columns or AI recognition have been added.
- Stable `/?book=...&chapter=...&photo=...` links enter the existing renderer. Sharing uses the stable link, not a temporary object-storage URL. Withdrawn content fails closed. Chapter navigation updates the copyable link without reloading.
- Viewer keyboard, touch navigation, close/focus behavior and download/share remain; explicit Zoom/Fit controls and compact mobile captions are added. Forward navigation at a loaded chapter boundary retrieves the next page. Deep-linked photos and previous-chapter boundaries use a one-record ordered cursor so unseen neighbors are not skipped. The viewer uses a bounded loaded sequence rather than loading all 5,000 records/originals at once; its counter describes that loaded sequence, not a claimed full-archive position.
- Existing admin creation/editing/order/publication controls remain. Bulk assignment now selects a book and chapter, preserves immutable storage references and saves moved photos as drafts. Published photos must first be unpublished. Partial successes/failures are reported, not falsely rolled back.
- Download filename edits change metadata, not object keys or image bytes. Published uses must first be unpublished. Existing caption/credit/alt fields remain.
- Settings offers an authenticated private JSON **content backup manifest**. It includes draft content and file references, **not** files, Auth users, membership, schema or policies. It is not a complete Supabase backup.
- The configured public Supabase credential is rejected if it is a service-role/secret credential. Trusted reverse-proxy deployments can declare their exact public origin while still rejecting foreign Host/Origin combinations.

## 3. Cost and capacity

### Verified published pricing, checked 22 October 2026

- OVH lists VPS-1 **from €3.81 excluding VAT/month**, 2 vCores, 4 GB RAM, 40 GB NVMe and unlimited traffic in the referenced offer. “From” is not a verified month-to-month or renewal quote. [Official offer](https://www.ovhcloud.com/en-ie/vps/).
- R2 Standard includes 10 GB-month storage, 1 million Class A and 10 million Class B operations monthly; direct egress has no transfer charge. Additional storage is $0.015/GB-month and Class B reads $0.36/million, with rounding. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- Supabase Free lists 500 MB database, 1 GB storage, 50,000 Auth MAU and 5 GB uncached plus 5 GB cached egress. Inactivity can pause a project. No upgrade is assumed. [Supabase pricing](https://supabase.com/pricing).

### Storage estimates, not measurements of future photographs

`1 MiB = 1,048,576 bytes; 1 KiB = 1,024 bytes; GB = 10^9 bytes`.

| 5,000-photo profile | Original files | Thumbnails | Viewer variants | Total including existing 0.089 GB artwork |
| --- | ---: | ---: | ---: | ---: |
| 4 MiB + 150 KiB + 800 KiB/photo | 20.972 GB | 0.768 GB | 4.096 GB | **25.925 GB** |
| 8 MiB + 200 KiB + 1,200 KiB/photo | 41.943 GB | 1.024 GB | 6.144 GB | **49.200 GB** |

The 24 artwork files were measured at **89,438,700 bytes**. The initial import can keep its private artwork copies in Supabase; new photographs use R2. Metadata is estimated around 32 MB at 5,000 photos before actual indexes/system overhead—not a live quota measurement. Photo files are not stored in PostgreSQL.

Central R2 storage is approximately **$0.24/month** after included capacity/rounding. A budget example using the advertised €3.81 host, an **assumed 21% VAT** and a deliberately simple **€1 per $1 planning conversion** is approximately **€4.90/month**. This is an estimate, not the owner's tax treatment, actual exchange rate, checkout/renewal price or a guarantee. The heavier storage profile is approximately $0.60/month and can exceed the target; it also exceeds the default application admission budget.

### Traffic assumptions and exposure

| Scenario | Visits/month | Thumbs/viewers/original downloads per visit | Photo delivery | Photo requests |
| --- | ---: | --- | ---: | ---: |
| Light | 500 | 40 / 3 / 2 | 8.495 GB | 22,500 |
| Moderate | 10,000 | 80 / 8 / 5 | 398.131 GB | 930,000 |
| Heavy | 100,000 | 120 / 12 / 10 | 7,020.544 GB | 14,200,000 |

Formula uses 150 KiB thumbnails, 800 KiB viewers and 4 MiB originals. Artwork/background/code are additional. Existing artwork alone can add 89.439 MB per completely cold visit; it now ships from the application/static asset copies rather than repeated Supabase byte downloads.

With a sufficiently warm 8 GB server cache, the central 4.864 GB display set fits; repeated variant requests need not reach R2. Heavy traffic still includes one million original GETs. This is **a cache-based estimate**, not a measured live hit rate or guarantee. Without useful cache hits, approximately five million rounded excess R2 reads add **$1.80/month**, taking the example total to about **€7.08**. Bots, retries, replacements, other account buckets, additional domains/services and backups can add usage.

**Supabase metadata is still a capacity constraint:** publication is rechecked per asset request. Bounded initial pages reduce metadata transfer but do not make Free Database/API egress unlimited. Large/high-traffic events need actual monitoring and possibly a separately approved publication/cache strategy. Do not silently upgrade to the $25 plan. A provider restriction/outage must produce an error, not leak cached drafts or create an automatic upgrade.

**No hard €5 provider spending cap was established.** Upload admission and the private cache are cost controls, not billing guarantees. Approve the actual hosting commitment/renewal, VAT, currency, R2 checkout and usage exposure first. If the confirmed all-in host quote leaves insufficient room, do not buy it. No domain, SMTP subscription, paid Cloudflare plan or managed transformation service is assumed. Use an existing hostname or a separately configured free DNS hostname/TLS solution; account ownership/recovery must remain independent of the school.

## 4. Required production setup — approval gates

### A. Accounts, billing and security review (not performed)

1. Confirm the existing Supabase organization remains on the intended plan and project **`lofuwoctrqjnnovbggxj`**. Anonymous read-only checks in this task returned HTTP 200/zero visible sample rows for books, archives, sections, photos and assets. That proves reachability/table visibility, **not that there are no private rows, that RPCs/RLS are correct, or that login works**.
2. Preserve the existing Auth account and administrator membership. Check ownership, email confirmation/redirect allowlist and provider-supported email delivery. Use the confirmation flow for the same user if needed; do not force-confirm, reset credentials, create another administrator or disable security to make a test pass.
3. Obtain an explicit approved hosting quote with terms/taxes/renewal and R2 billing exposure. Do not purchase or activate services from these instructions without approval. A paid Cloudflare Workers plan is not required for this Node/S3 integration.
4. Once approved, create a **private R2 Standard bucket**, with public `r2.dev`/public domains disabled. Create a server-only API credential limited to this bucket's object read/write. Do not use a global account token, paste credentials in chat or prefix them `NEXT_PUBLIC_`. No CORS is required for the default same-origin proxy.
5. Choose the HTTPS hostname, protect the host, install Docker/Compose and restrict inbound access to HTTPS/HTTP plus controlled administrator SSH. Configure account recovery and backups before storing real photos.

### B. Environment variables

Use the existing `.env.example` names. Put real values only in uncommitted/local hosting-secret configuration, never source control or chat.

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing project HTTPS URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable or legacy **anon** key; never a service-role/secret key. |
| `GSMUN_OBJECT_STORAGE=r2` | Upload destination for **new** assets. Existing references keep their provider. Default remains Supabase until explicitly configured. |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Server-only private object-storage configuration. |
| `GSMUN_R2_DELIVERY=proxy` | Recommended immediate gateway withdrawal checks. |
| `GSMUN_STORAGE_LIMIT_GB=35` | Conservative application upload-admission limit; adjust only after cost/storage review. |
| `GSMUN_MEDIA_CACHE_DIR`, `GSMUN_MEDIA_CACHE_GB=8` | Private derived-file cache; Compose supplies its path/volume. Never a public directory. |
| `GSMUN_PUBLIC_ORIGIN=https://your-hostname` | Exact external origin; Caddy must preserve the Host header. |
| `ARCHIVE_HOST=your-hostname` | Caddy hostname, without scheme. |

`GSMUN_CONTENT_SOURCE=local`, `GSMUN_OFFLINE_VERIFY`, `GSMUN_SANDBOX_*` are **not production settings**. Never deploy an offline fixture build. No service-role credential is needed by the application or these release steps. The retired legacy importer remains disabled.

### C. Build and run after approval

The Docker build context is the **nested repository root**, not the application directory:

```sh
cd /path/to/mint-playground-main
docker build -f experiences/complete-shelf/Dockerfile \
  --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -t gsmun-archive:release .
```

Set those two public variables in the operator's build environment; they are not privileged secrets. R2 credentials are runtime-only and never Docker build arguments. The Dockerfile-specific ignore excludes environment files, local test data, dependencies and previous builds from the context. The runtime is non-root and uses the real Next standalone output; public files/static chunks are copied explicitly.

Put runtime settings in `deploy/.env.production` on the host, permissions restricted to the owner. From the app's `deploy` directory:

```sh
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production exec archive test -w /tmp/gsmun-media-cache
```

Do not print `docker compose config` without `--quiet`: its expanded environment can contain credentials. The Compose image is built/tagged separately, not auto-upgraded. Caddy receives only its hostname, not database/storage credentials, and handles TLS. The health endpoint checks **process liveness only**, not successful login or live RLS/storage.

**Container status here:** the Next standalone server was built and run locally. Docker CLI exists, but Docker's Linux daemon was unavailable, so the Linux Docker image, Compose, Caddy/TLS and native Linux Sharp package are **not yet verified**. These commands were not run to deploy anything.

### D. Initial eight-volume import — still separate approval

1. Back up/export current content, schema, functions, RLS, membership and storage inventory securely through the owner's supported tools. Preserve the existing reviewed bundle and original artwork hashes. Establish restore/rollback procedures first.
2. Reconfirm target identity and actual private records/ID/slug/object conflicts through an authorized owner connection. The anonymous empty sample is not sufficient.
3. Run `node scripts/check-import.mjs` locally. It validates IDs/relations, draft statuses, source/file hashes, 24 artwork sizes and absence of photography/demo URLs. It **does not** check remote conflicts or execute SQL.
4. Separately approve/upload only the 24 unchanged artwork files to the existing private Supabase `archive-assets` bucket with overwrite disabled. Do not upload photos or substitute R2 paths into this bundle. Verify downloaded bytes/checksums, not matching names alone.
5. After review/approval, execute the existing guarded `import-drafts.sql` as its intended transaction. Do not rerun the schema migration. The existing guards preserve matching records, abort conflicting data and require matching Supabase object metadata. Inspect the SQL in the preserved bundle before execution.
6. Run its reviewed verification queries after approval. Expect eight draft books/eight draft archives/32 draft chapters/24 ready artwork assets/zero photographs on an initially empty content store. Existing data must be reconciled, never truncated or overwritten to force those counts.
7. No publication is part of import. Admin preview must work before selecting intended books/chapters/photos to publish.

New photographs subsequently go to R2 through the real admin. Keeping the initial 89 MB of private artwork copies in Supabase preserves the exact reviewed import and the existing schema; delivery reuses checksum-identical shipped files.

## 5. Routine administration after approved live verification

1. Log into `/admin/login/` using the existing account. The discreet route is not the authorization boundary: every management/preview/export/upload endpoint checks verified identity/membership independently.
2. Books → Create draft → save title, short title, committee, description, slug, order, dimensions/presentation and artwork. A new book gets its own archive through the existing RPC. Do not change approved existing geometry values to compensate for UI issues.
3. Add/rename/reorder chapters, keeping drafts private. The original eight books retain their four established categories; other books may have their own sections without source edits.
4. Select a chapter → multiselect/drop JPEG/PNG/WebP originals. Maximum 30 MiB, single-frame, 32–16,000 pixels/side and 50 MP. HEIC/RAW must be exported to supported full-resolution files first. Originals may contain sensitive EXIF/GPS: review consent/privacy before publication.
5. Monitor per-file/overall progress. Two transfers/decodes are bounded per Node process. Retry failed files using the same upload ID; successful files do not restart. Reload receipts retain identities, not file bytes: reselect originals after an interruption. This is **whole-file retry**, not byte-offset resumable upload.
6. Save captions, credits/links, alt text and meaningful download filenames. Use search/status filters and 48-record admin pages. Reorder within the chapter or select visible records and assign them to a chosen book/chapter as drafts. Files retain immutable storage paths while relationships change.
7. Preview privately. Publish intended photographs/chapters/book deliberately. Publishing a book does not change draft descendant statuses. A photo is public only when its entire book/archive/chapter/photo chain is published and its asset is ready.
8. Withdraw by unpublishing/archiving the photo/chapter/book. Default proxy delivery checks current eligibility before reading cache or R2. Previously downloaded/browser-held copies cannot be recalled. Published edits/replacements require unpublishing first; there is no hidden draft revision system.
9. Delete only after the existing deliberate confirmation. Content-row deletion can cascade through children; it does not auto-delete private files. Old/replaced/failed assets remain tracked for recovery and still consume capacity. Cleanup is a separate reviewed maintenance operation.
10. Settings → Download private content manifest periodically, plus independently copy original files and retain a checksum inventory. An administrator must be able to restore content, not merely see a recent container snapshot.

## 6. Backup and rollback

- Before any approved production write, take owner-controlled schema/RLS/RPC/membership and content exports plus a storage-object inventory. Supabase Free is not assumed to provide included automatic recoverable database backups.
- Retain originals independently of the running VM/R2 account where practical: an already owned offline disk can be an independent backup, not an infrastructure dependency for public/admin access. Test recovery. Do not configure destructive synchronization or automatic remote deletion.
- The new admin manifest includes sensitive draft metadata and pointers, not original files or platform security. Never put it in `public/`, a static deployment or a public repository.
- Tag each reviewed container image and retain the preceding tested image/environment configuration. Roll back the image without resetting the database, credentials or bucket. Keep media references/files intact.
- **After R2 uploads exist, do not blindly roll back to the old Supabase-only asset route.** Use an R2-compatible prior release or first arrange an approved recovery. Changing the upload default does not migrate existing files.
- A restored metadata backup may re-expose previously withdrawn photos. Restore/reconcile statuses privately and deliberately before publication.
- Local pre-edit source/artwork backup: `C:/Users/Admin/Desktop/mint-playground-main/.gsmun-backups/release-baseline-20261022/`. It is not a database/Auth backup and does not contain real environment secrets. No Git commit/repository rollback was available in the application directory. Dependency changes include the two pinned SDK packages and the workspace lockfile; do not overwrite unrelated workspace/user changes when reverting.

## 7. Verification and remaining release gates

Executed locally:

- Protected full Next production build and actual standalone-server run; TypeScript and ESLint through `node scripts/verify-offline.mjs`.
- Automated contracts include 5,000 public/admin photo records; explicit statuses/relationships; ordering; partial uploads, duplicate/conflict recovery; filename/reassignment; private cache; trusted origin/public-key validation; unauthorized preview/export; and real S3 SDK requests against **loopback** storage. Download SHA-256/ranges/withdrawal were checked.
- Real Chrome checks preserve the original shelf/archive at 390×844, 393×852, 430×932, 1024×768 and 1440×900. Protected engine/motion/cover-art/global-CSS hashes and all original artwork/catalogue hashes are checked.
- Persisted sandbox Chrome workflow: create new book/three chapters, reorder, mixed multi-upload + simulated interruption/retry, caption/filename save, explicit publication (no child cascade), original download/hash, deep/share link, zoom/keyboard/close, all-volume search, loading beyond the initial 12 records and deep-linked previous/next beyond that window, withdrawal and unauthorized attempts. Responsive photo/viewer checks include 390×844, 393×852, 430×932, 768×1024 and 1440×900. QA content is retained locally as draft-volume content, never production content. A prior saved QA book survived a sandbox process restart; its original eight catalogue IDs remained present.
- `node scripts/check-import.mjs`: existing review bundle passes offline validation unchanged.

At the **October 23** full run: **43 automated tests passed, 0 failed; 1 SQL/RLS integration test intentionally skipped** (44 total). The production build/standalone server and typecheck passed. Lint has **0 errors and 11 image-element warnings**; automatic managed image optimization was not substituted for the approved image architecture. New coverage includes automatic/manual/stable slugs, scoped slug conflicts, authorization of availability checks, artwork/photo separation, and a bounded 300-file queue with failed-file-only retry. The source SQL test was not executed against any database. Browser results are Chrome/simulated sizes, not physical-iPhone Safari or deployed-load results.

The October 23 persisted browser workflow used the new Conference photos → book → chapter selector with labelled synthetic QA files, exercised private previews, captions/filename, photo ordering, explicit statuses, original download hashes, sharing/deep links, next-page navigation and withdrawal. The actual public design URL `http://127.0.0.1:5211/` was checked separately without a session: Three.js ready, DISEC opened, four chapters, zero photos and direct return to the unchanged shelf. The admin simulator on 5210 remains a different, labelled data source.

Still requiring owner action/approval and live testing:

1. Actual host quote/billing/renewal and R2 account/bucket/credential setup; no paid service enabled here.
2. Existing administrator email confirmation/session recovery and login with the **same account**, plus actual membership/RLS/RPC verification. No password or membership reset performed.
3. Approved backup, private-artwork upload and draft-only catalogue import. No SQL or remote upload performed here.
4. Small approved staging CRUD/upload/original-download test, persistence across server restart, policy denial tests and withdrawal of old URLs. No assertion that live R2 or real Supabase persistence works yet.
5. Linux Docker/Caddy/TLS/native Sharp, physical iPhone Safari and realistic Supabase metadata-egress/CPU/memory/cache measurements.
6. A usage/backup operator. There is no hard provider spending cap, automatic provider failover, distributed byte-budget reservation, true chunk-resume protocol or automatic deletion of retained assets. Do not interpret local tests as resolving these operational limits.

Only after these gates pass should publication/deployment be approved. The local release is implemented and testable; production is deliberately not silently activated.

## 8. Files changed

- Public integration: `app/ArchiveRouter.tsx`, `ArchiveSearch.tsx`, `CommitteeArchive.tsx`, `PhotoViewer.tsx`, `gallery-content.ts`, `gallery-controls.css`, `page.tsx`, `layout.tsx`, `search/page.tsx`.
- Routes: `app/api/assets/[id]/route.ts`, `api/content/books/[id]/photos/route.ts`, `api/content/search/route.ts`, `api/admin/gallery/route.ts`, `api/admin/export/route.ts`, `api/health/route.ts` (all under `app/`).
- Admin: `app/admin/AdminDashboard.tsx`, `PhotoManager.tsx`.
- Content/storage: `lib/cms/admin-operations.ts`, `content.ts`, `content-mapper.ts`, `model.ts`, `upload-service.ts`; new `gallery-page.ts`, `public-gallery.ts`, `public-search.ts`, `object-storage.ts`, `media-cache.ts`, `original-artwork.ts`, `storage-budget.ts`; `lib/supabase/config.ts`.
- Tools/tests: `scripts/check-import.mjs`, `preview-sandbox.mjs`, `offline-guard.cjs`, `test.mjs`; `tests/release.test.mjs`, `release-browser-smoke.mjs`, `fixtures/release-sandbox-entry.tsx`, `helpers/fake-database.mjs`, and narrow fixture/assertion updates in `cms.test.mjs` / `rendered-html.test.mjs`.
- Packaging/docs: `package.json`, workspace `pnpm-lock.yaml`, `next.config.ts`, `.env.example`, `eslint.config.mjs`, `Dockerfile`, `Dockerfile.dockerignore`, `deploy/compose.yaml`, `deploy/Caddyfile`, README and this guide; local-repair report addendum and historical-audit cross-links.

**Intentionally unchanged:** `ShelfEngine.ts`, `book-motion.ts`, `cover-art.ts`, `ProgressLibrary.tsx`, existing `globals.css`, source catalogue, source ID helper, all 24 artwork files, existing schema/migrations/RLS/functions, review-only import bundle, `.env.local`, credentials and administrator membership. Generated builds/sandbox data/screenshots are isolated in ignored `.local/` directories.

### October 23 focused follow-up files

- Admin UI: changed `app/admin/AdminDashboard.tsx`, `BookEditor.tsx`, `SectionManager.tsx`, `PhotoManager.tsx`; added `ConferencePhotos.tsx` and `SlugField.tsx` in the same directory.
- Server validation/filtering: changed `app/api/admin/content/route.ts`, `lib/cms/admin-operations.ts`, `lib/cms/listing.ts`; added `lib/cms/slugs.ts` and `lib/cms/slug-service.ts`. No database migration or policy change.
- Local preview: added `scripts/preview-public.mjs` and its package alias in `package.json`; updated only the test sandbox banner in `tests/fixtures/release-sandbox-entry.tsx` to link to the public design preview.
- Tests: added `tests/demo-workflow.test.mjs`; extended `tests/admin-browser-smoke.mjs`, `release-browser-smoke.mjs` and `helpers/fake-database.mjs`.
- Instructions: README and this guide. No public presentation/engine/artwork files were edited during this follow-up. No provider connection, account change, live import/upload/publication or cost activation occurred.
