# Google Drive imports and public navigation — operator guide

Updated **23 October 2026**. Implemented locally; **Google, R2 and the restored database have not been connected or changed by this work**. Do not execute the proposed SQL or activate a worker without owner approval. Existing accounts, membership, RLS, content, catalogue import bundle and 24 artwork files are preserved.

## 1. What changed locally

- The public gallery has no search/sort toolbar or global-search link. `/search/` redirects home. Existing chapters, pagination, viewer, sharing and original downloads remain. Admin search/filter/order controls remain. Caption-less images do not display filenames as captions.
- The bookshelf header retains the supplied identity; its small right-side menu opens a native modal drawer. It supports keyboard focus containment, Escape, outside click, visible focus, touch targets and reduced motion.
- Book links default to the existing `ShelfEngine.browseTo` presentation. They do **not** open the archive until the visitor uses the existing Open archive interaction. Direct chapter links use `/?book=ID&chapter=ID`. Browser back/return to shelf remain supported. No engine, geometry, motion, camera, lighting, artwork or catalogue changes.
- The existing yellow italic description uses **Inter**, not Futura/serif. Its colour/spacing/position and title typography are unchanged.
- A small initial hint observes existing canvas wheel/touch input passively and fades with exploration. The canvas consumes the scrolling, so listening only to document scroll would not work. No new scroll handler cancels input or changes book motion.

## 2. Navigation & ceremonies

Admin → **Public Navigation**:

1. Create/rename groups; use ↑/↓ to order them.
2. Add an existing **published** book or chapter. Change the visitor-facing label independently of its ID/slug. Select Focus book or Open directly; chapters open directly.
3. Show/hide/reorder entries without modifying any underlying content. Removing an entry/group removes navigation configuration only.
4. Use the small menu icon to preview **unsaved** navigation. Preview activation describes the destination and does not publish/navigate.
5. **Save navigation draft** persists privately. **Publish navigation** explicitly updates the public settings row only. Version checks reject stale concurrent saves.

With automatic inclusion enabled, unassigned published books enter Committees (the original eight), Ceremonies & Events (titles mentioning ceremonies/opening/closing), or Archive. Manual hidden entries suppress automatic reappearance. Invalid/deleted/unpublished destinations are filtered on every public request and flagged in admin. No fake Opening/Closing Ceremony destinations are inserted.

**No new event model is necessary:** create Opening Ceremony or Closing Ceremony as an ordinary book using existing admin tools, add its chapters/photos, preview, and explicitly publish the intended content. Then add a direct whole-book/chapter navigation entry. This does not duplicate committee content. A future collection spanning unrelated books would require a separately approved model; it is not invented here.

## 3. Approval gates and proposed schema

Review-only SQL: **`docs/sql/NAVIGATION-DRIVE-PROPOSAL.sql`**. Not a migration already applied; no SQL was executed. Before approving it:

1. Verify the project is `lofuwoctrqjnnovbggxj`, inspect actual schema/functions/grants and check that the proposed names do not conflict.
2. Back up content, schema/functions/RLS/membership and private storage inventory. Settings → content export now also includes optional navigation/import metadata when installed. It is **not** a backup of files/Auth/policies or worker credentials.
3. Review the four new tables: `archive_navigation`, `drive_folder_mappings`, `drive_import_jobs`, `drive_sync_state`. They reference existing content and reuse the existing `is_archive_admin`/`touch_updated_at` functions. Only the published navigation settings row is public-readable; all Drive state requires administrator membership. No existing policies/functions/Auth users/storage configuration are replaced.
4. After explicit approval, create a CLI-generated migration from this reviewed proposal and apply it once transactionally. It deliberately fails on unexpected existing table names. Verify anonymous/non-admin denials against real PostgreSQL before enabling import.

No rows are seeded and no content is published by the proposal. Missing tables produce an actionable admin setup error; the public drawer can use safe default published-book navigation meanwhile. The original reviewed catalogue import is a **separate** approval and remains draft-only, with **zero photos/demo assets**.

## 4. Google setup — owner actions after approval

The integration uses a dedicated **read-only service account**, not visitors' Google logins, public Drive links, Drive thumbnails, or a client-side credential. It uses the official `google-auth-library`.

1. Create/select the approved Google Cloud project and enable the **Google Drive API**. Review its actual quotas/billing eligibility first; do not enable a paid upgrade automatically.
2. Create a dedicated service account. No project Owner/Editor role or domain-wide delegation is needed to read explicitly shared Drive files. Generate a private JSON key only if organization policy permits; keep it outside this repository, build context and public directories.
3. Create a separate **Final archive selections** Drive folder. Share **only this folder** with the service-account email as **Viewer** with download access. Keep general/team working folders unshared. Organizational external-sharing restrictions may prevent this; that must be tested with the owner, not bypassed.
4. Use ordinary binary JPEG, PNG or WebP photographs. No Drive shortcuts, Google document exports, RAW, HEIC, animation, covers/spines/backs or unfinished uploads. Existing limits: **30 MiB/original, 50 megapixels, 32–16000px per side**, validated from decoded bytes. Originals are not recompressed. Two generated WebPs: thumbnail up to760px/q80 and viewer up to2400px/q88, with EXIF orientation handled by the existing processor.
5. Organize `Final archive selections / DISEC / THE ROOM / photograph.jpg` (and equivalent existing books/chapters). Matching uses existing IDs/slugs/titles/short titles and exact normalized chapter titles, not fuzzy guesses. Unknown/ambiguous folders wait for an explicit admin assignment. Names such as `artwork`, `covers`, `spines`, `backs` are excluded even with a manual mapping. Folder depth is bounded at6, parent verification at8, and the selected tree at1000 folders.
6. Configure private R2 using the existing server-only adapter if desired. **Drive writes to the currently configured object-storage provider**; it does not silently switch from Supabase to R2. Confirm capacity/credentials/private bucket before the first import. Keep R2 public access disabled and use the publication-aware proxy.
7. Set server environment (names only, never send values in chat):

   ```dotenv
   GSMUN_DRIVE_ENABLED=1
   GSMUN_DRIVE_ROOT_FOLDER_ID=<dedicated shared folder ID>
   GSMUN_DRIVE_KEY_FILE=/run/secrets/gsmun-drive-service-account.json
   GSMUN_DRIVE_DAILY_GB=25
   ```

   Existing Supabase URL/publishable key, R2 private credentials, exact HTTPS origin and storage settings remain required by the existing release guide. **No service-role key is used.** Google scopes: `https://www.googleapis.com/auth/drive.readonly`.

8. Restart the approved Node application. Log in with the **existing** administrator. Open Drive imports → **Sync now**. Initial scans include already present files. Check folder assignments/errors and inspect resulting drafts under **Conference photos → Book → Chapter**. No real account setup or import was performed during local implementation.

Google service-account guidance: [server-to-server authentication](https://developers.google.com/identity/protocols/oauth2/service-account), [download originals](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

## 5. Automatic polling, authorization and private state

Manual Sync now and an opt-in panel-open one-minute sync are available. For unattended imports on the existing **single long-lived Node host**:

1. Owner provisions a private random **256-bit** worker secret file (not a password or admin API key) mounted read-only. Configure `GSMUN_DRIVE_WORKER_SECRET_FILE` to its absolute path.
2. Set `GSMUN_DRIVE_WORKER_SESSION_FILE=/var/lib/gsmun-worker/session.json`. The container has a private node-owned directory and a persistent worker-state volume. Mount the approved Google key/worker secret read-only using a private compose override; no credentials are baked into the image. Restrict parent directory0700/files0600 (or equivalent Windows ACLs).
3. Using a fresh login with the **same existing administrator account**, explicitly click **Authorize unattended imports**. This delegates that Supabase session's refresh credential to the server file; it is never returned to the client/export or stored in content tables. Prefer a dedicated login session for this authorization, not another administrator account. Session rotation, expiry, logout and provider policy must be tested live before relying on continuous polling.
4. Node instrumentation polls the Drive **change feed every minute**, with a full reconciliation every6hours. Initial scans, page cursors and per-file jobs persist in PostgreSQL. Each authenticated internal tick refreshes/verifies the existing user and membership using the public Supabase key and existing RLS. A private bearer secret also protects the worker endpoint. No service-role bypass.
5. Disable unattended imports to stop future automatic ticks. An already-running tick may finish its current file; it still only creates drafts. Revoking the session/admin membership fails closed; reauthorization may be needed after logout/expiry. Status reports last tick/success and safe errors; refresh the panel to view them.

Private delegated-session files are **administrator credentials**. Protect the host/volume; never copy them into a public backup, repository, browser response or diagnostic logs. Existing content backup excludes them. No existing account credentials were read, reset or changed by this implementation.

**Polling is implemented; Google push channels are not enabled.** They require a public HTTPS callback, channel authentication/renewal and live setup. The durable change feed plus bounded reconciliation is the smaller reliable release workflow; no internet webhook endpoint is left open. [Google change feed](https://developers.google.com/workspace/drive/api/guides/manage-changes), [push requirements](https://developers.google.com/workspace/drive/api/guides/push).

This worker is not a serverless cron guarantee or a multi-replica scheduler. Run one application replica. A sleeping/stopped host cannot import until restarted. Five files per tick gives an ideal upper bound of about300/hour (5000files ≈17hours); CPU/network time can reduce this. Tick admission stops after45seconds between files, not during an in-flight transfer. Actual throughput and continuous-session behavior remain unverified.

## 6. Safety, duplicates and recovery

- New imported photos are always **draft**, even in published chapters/books. Existing preview/review/selection/publication controls remain the only approval system. All parent/child publication checks still apply to direct image/download requests.
- Drive IDs produce stable upload UUIDs. Repeat scans/change notifications/retries do not create duplicate records. Exact original SHA256 is also checked for copies under different Drive IDs. Duplicate jobs are retained for review, not automatically reimported to another chapter.
- Stable binary MD5/version/size are checked before/after download. Unreadable/oversized/unsupported files fail safely. Unknown folders require explicit mapping. New mappings do not silently move existing imported photos.
- The existing bounded decode slots and image/storage pipeline are reused. Jobs have compare-and-set leases, backoff, statuses and per-file retry. Queues/listing are paginated; no5000 originals are held in browser memory. A batch uses at most100 discovered metadata entries/page and up to5 processed files/tick.
- Partial storage/database failures retain tracked upload IDs and verified bytes. Retry reconciles the **same asset/photo identity**, including a ready original whose photo-row insert failed. Do not delete failed assets/objects as generic cleanup. Transfers restart whole files; byte-offset resume is not implemented.
- Moving/deleting a Drive source **does not** delete/unpublish an archive photo. Changed source bytes are marked for review, never silently overwritten. Use the existing deliberate unpublish/replace flow. Removing an archive photo also does not silently reimport it from Drive; the source job remains tracked.
- The25GB/day Drive admission budget and existing35GB storage admission limit are **application controls, not provider spending caps**. Transfer retries, other applications, races or untracked objects are not guaranteed covered. Keep provider usage/billing under review.
- Private originals may contain EXIF/GPS. Review consent/retention and original-download policy; preserving bytes also preserves that metadata. Do not upload media without permission.

## 7. Expected costs and quota exposure

Official documentation checked **23 October 2026**:

- Drive's post-May1 quota model lists1,000,000units/min/project,325,000/user/min,400,000,000units/day billing threshold and1TB/day egress threshold. Read5/list100/download200 units are indicative; confirm this project's actual quotas and download-method classification. Google states full billing details will be announced later2026 with90days notice. This is **not an unconditional forever-free promise**. [Drive limits](https://developers.google.com/workspace/drive/api/guides/limits).
- At5000×4MiB originals, an initial copy is approximately**20.972GB** from Drive. Roughly1million download units plus metadata/listing are far below those published thresholds, absent other application activity. Polling and retries add requests. Current account/rollout/billing settings are **unverified**. Existing Drive storage still needs enough room; API quotas do not grant more Drive disk capacity.
- R2 Standard includes10GB-month,1million ClassA and10million ClassB operations. Additional storage$0.015/GB-month; ClassA$4.50/million and ClassB$0.36/million, with rounding; no direct egress transfer fee. Initial5000photos×3objects ≈15000writes before retries, within that included operation allowance. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- Existing central storage estimate:5000×(4MiBoriginal +150KiBthumbnail +800KiBviewer) +89,438,700 artwork bytes ≈**25.925GB**, about**$0.24/month R2 storage** after allowance/rounding. Drive import does not create another permanent set of variants beyond that model. Replacements/retained failures increase space.
- Existing whole-system planning estimate remains approximately**€4.90/month** using the published€3.81exVAT host starting offer, assumed21%VAT and illustrative€1/$1 conversion. **Not a verified quote, renewal price or hard€5cap.** Heavy traffic/requests, hosting terms, tax/FX, Google quota changes or originals averaging8MiB can exceed budget. No billing, subscription or deployment was enabled.

## 8. Release verification and rollback

Local tests cover draft import, exact original bytes/variants, duplicate IDs/copies, mapping, unsupported/unreadable files, incomplete transfers/source changes, partial storage/database failures, cursor/lease recovery,2000 delayed-job pagination and new endpoint denial. Browser tests exercise navigation and existing gallery/admin workflows. These are **simulations, not proof of live Google/R2/Supabase RLS**.

After separate approval: back up → apply reviewed new tables → configure private source/storage → authorize existing admin → import a few approved test images as drafts → verify links/original hashes/private anonymous denial → explicitly approve a small test publication → verify viewing/download/withdrawal → test process restart/session expiry/retry → review and import larger batches. No public launch until actual cloud tests pass.

Rollback: disable worker; stop current import tick safely; restore previous application image/config. Keep existing assets, job tracking, navigation rows and backups. If previous application doesn't read the new tables it ignores them; no table drop is needed. Never replay old statuses that republish withdrawn photos. Any removal of test content, new tables, objects or Google permissions is a separate owner-approved action.
