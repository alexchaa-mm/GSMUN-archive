# GSMUN Digital Archive — final €0 architecture feasibility audit

**Decision report, checked 18 October 2026.** This replaces the preliminary recommendation in the previous version of this document. Read alongside [ADMIN-LOCAL-REPAIRS.md](C:/Users/Admin/Desktop/mint-playground-main/mint-playground-main/experiences/complete-shelf/docs/ADMIN-LOCAL-REPAIRS.md).

Application root: `C:/Users/Admin/Desktop/mint-playground-main/mint-playground-main/experiences/complete-shelf/`. Paths below are relative to that root.

## 1. Executive recommendation

The confirmed requirements are **5,000 photographs, downloadable originals, remotely hosted public access and administration, no school infrastructure, and €0/month without automatic overage billing**. Local-only administration and substituting smaller web masters for downloadable originals are therefore **rejected**, not unresolved choices.

**Recommend validating—not deploying—the following architecture:**

- **Cloudflare Pages Free:** public HTML/CSS/JavaScript, existing identity/background assets and approved book artwork. Reuse the existing Three.js/archive/gallery components without changing their visual behavior.
- **Oracle Cloud Infrastructure (OCI), unupgraded Always Free account:** a remotely hosted Node/Next.js admin and media/content service, native Sharp image processing, and private persistent block-volume storage for original photographs and display variants.
- **Existing Supabase Free Database/Auth:** retain the current content schema, IDs, administrator account/membership, RLS and explicit publication rules. Do not replace PostgreSQL or migrate authentication first.
- **A publication/storage adapter:** provide published-only normalized content and controlled image delivery. Keep originals outside the web root; ordinary browsing requests thumbnails/viewer files, while Download returns the uploaded original bytes.
- **Independent backups and a tested recovery procedure:** OCI volume backups plus a separately retained metadata/original-file backup. Neither the running VM nor its live filesystem is a backup by itself.

**Why this is worth checking:** the currently documented OCI Always Free allocation can provide persistent storage large enough for approximately 26–49 GB of photographs, unlike Supabase Free or R2's included storage. Oracle explicitly says a Free account's card is not charged unless the account is upgraded. This is a meaningful cost boundary; R2's email budget alerts are not. [OCI Free account billing](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).

**Why this is not a guaranteed production solution:** free VM capacity is not assured, idle instances can be reclaimed, free services have no uptime SLA, Supabase can pause, and this exact hosted combination has not been provisioned or tested. The owner must accept self-managed server maintenance, recovery work and possible downtime. **No fully managed, low-maintenance, uninterrupted, guaranteed-forever-free solution meeting every requirement was established.** If free VM capacity/reliability is unacceptable, do not quietly substitute a paid account or a trial.

An even closer compatibility option is to host the **entire existing Next.js application on the same OCI VM**, adding a private filesystem storage adapter. It avoids a static-public split initially, but puts public UI, media and admin on one failure domain and needs more careful artwork/metadata caching. This is a fallback for a proof of concept, not an instruction to move anything.

**Nothing is approved for implementation by this report.** Only this document changed.

### Evidence labels and scope

- **VERIFIED — source/measurement:** inspected current local code, metadata, file bytes or in-memory image calculations.
- **VERIFIED — provider documentation:** the linked official source was checked on 2026-10-18. It does not verify this person's account, entitlement or regional capacity.
- **ESTIMATED:** an assumption, calculation, proposed design or qualitative ranking—not a deployment result.
- **UNVERIFIED:** needs account evidence, representative conference photographs, an owner decision or an approved test.

No environment-variable values or credentials were printed. No live Supabase API, SQL, importer, upload, account change, subscription, deployment or publication was used. Prices quoted in USD are not converted into euros; any positive charge fails €0.

## 2. Actual application architecture

### Runtime inventory — VERIFIED from current source

| Feature / file | What happens now | Static public hosting consequence |
| --- | --- | --- |
| `app/page.tsx` | Async server entry, `dynamic = "force-dynamic"`, database/local provider selection and error/empty handling. | Not exportable unchanged. A public-only entry must receive a published snapshot or fetch a published-only content feed in the browser. |
| `app/public-content.ts`, `lib/cms/content.ts` | Server-only Supabase reads. Homepage loads book/artwork metadata; archive entry loads that selected book's sections/photos. | These runtime server reads must stay on the backend or become controlled build/publication-time reads. |
| `app/PublicArchive.tsx` | Client fetches `/api/content/books/[id]` when `remote` is enabled; otherwise consumes supplied book content. | Current relative API URL would fail on a static-only host. Adapt the content boundary/loader, not ShelfEngine. |
| `app/ProgressLibrary.tsx` | Client component waits for fonts, constructs ShelfEngine in `useEffect`, passes normalized books and handles opening/return. | Compatible in principle with a static HTML/JS shell. The engine runs in the visitor's browser, not Supabase or Node. |
| `app/ShelfEngine.ts`, `cover-art.ts` | Three.js canvas, image loading, procedural fallback, animation and browser APIs inside runtime functions/constructor. | No database/runtime server is required to animate the books once content/assets arrive. Preserve these files. |
| `CommitteeArchive.tsx`, `PhotoViewer.tsx`, `gallery-content.ts` | Data-driven sections, lazy grid images, viewer/swipe/keyboard, fetched-Blob download and share. | Can run on a static public shell. Cross-origin photograph delivery must supply correct CORS/MIME; an inaccessible download URL would break the existing fetch-based download. |
| `app/admin/layout.tsx`, `page.tsx`, `preview/[id]/page.tsx` | Dynamic protected server pages; verified identity, redirects and draft content reads. | Keep on a separate Node runtime. Never export private preview HTML/data into the public site. |
| `lib/supabase/server.ts`, `proxy.ts` | Next cookies, session refresh, verified `getUser()`, membership RPC, independent endpoint authorization. | Requires runtime execution. Static hosting does not replace these security checks. |
| `/api/auth/login`, `/api/auth/logout`, `/api/admin/content` | Password/session actions and authenticated CRUD/order/status operations. | Stay server-side, on the admin origin. No corresponding public mutation endpoint is needed. |
| `/api/admin/upload`, `lib/cms/images.ts` | Node multipart request handling, decoded-file validation, native Sharp, checksum and two variants. | Not a static-host function; native processing needs an appropriate Node host. |
| `/api/assets/[id]` | RLS-aware asset lookup, Supabase Storage download and fully buffered `private, no-store` response. | Must remain a backend route or be replaced by an equally authorized delivery adapter. Static files alone do not preserve private access rules. |
| `next.config.ts`, `app/layout.tsx` | Normal Next build, no `output: "export"`; images unoptimized; local font packages and global CSS. | Do not change the entire app to export mode. A public-only build boundary is required; the admin remains dynamic. |

Server Components are not inherently incompatible with static export: **request-time cookies, force-dynamic data and request-dependent handlers are the blockers here**. Next's official static-export guide excludes those runtime features, Proxy and default runtime image optimization. No Server Actions or ISR are currently required by this implementation merely because the framework supports them. [Next.js static export support and exclusions](https://nextjs.org/docs/app/guides/static-exports).

### Can the public archive become static without losing Three.js?

**Yes at the presentation layer; no as an unchanged export of the complete application.** Keep the same source components and engine, not a recreated shelf or a forked gallery. A small public entry/loader can fetch normalized published content before mounting the existing `ProgressLibrary`. Alternatively, a published snapshot can be bundled at publication time. Fonts, image URLs, base paths, responsive behavior, loading/reveal and download/share must be regression-tested.

A **static shell using a runtime content/media service is not a completely backend-independent static archive**. In the recommended split, the shell/artwork can load from Pages during an OCI outage, but live metadata and photographs may not. Do not promise full offline availability.

There is no installed Pages/Workers deployment adapter or verified static public build. No export/build experiment was run here. Cloudflare's current guidance separates static Pages exports from full-stack Workers hosting; its recommended vinext path is a beta reimplementation, not proof that this exact Next.js/Sharp application works unchanged. [Cloudflare Next.js guidance](https://developers.cloudflare.com/pages/framework-guides/nextjs/).

### Supabase runtime dependencies — VERIFIED

Currently both public and admin use Supabase Database, and every database-backed stored-image request goes through Supabase Storage. Admin login, session refresh, membership, protected preview and CRUD use Supabase Auth/Database. Public visitors do **not** create Auth accounts.

The schema has `books`, `archives`, `sections`, `photos`, `assets`, `archive_admins`; FK relationships, explicit ordering, RLS and atomic book/reorder/status RPCs already exist. Public eligibility includes the published book/archive/section/photo chain and a ready readable asset. Publishing a parent does not automatically publish draft descendants.

In a future split, **admin remains a Supabase runtime client**. Public read traffic can use a carefully maintained published-only manifest/cache on the media service, avoiding a database call for every thumbnail. That cache is a new authorization/publication responsibility, not an excuse to bypass RLS or cache administrator query results globally. Without a cache/publication adapter, millions of per-image metadata reads could exceed Supabase's bandwidth/compute limits even if photograph bytes are elsewhere.

### Existing repairs, catalogue and import compatibility — VERIFIED locally

The reviewed bundle `.local/catalog-import-v1-no-demo/` remains **8 books, 8 archives, 32 chapters, 24 artwork asset records, 0 photos**. Every book/archive/chapter is draft; source/thumbnail external URLs are null. IDs, ordering, dimensions and presentation variants remain intact.

The repaired admin already provides verified-user/membership authorization, preserved forms on errors, guarded saves, explicit non-cascading publication, 48-row pages/search/status filters, ordering, lazy previews, two concurrent photo transfers, progress, retry/cancel and tracked partial-failure recovery. Keep these components.

Compatibility is **partial, not automatic**:

- Database models/IDs and the admin's metadata workflow fit the proposed architecture.
- The upload and image-serving helpers explicitly call Supabase Storage today. A new private-disk adapter must preserve existing UUID/checksum/idempotency, parent relationships and authorization.
- The import SQL verifies Supabase `storage.objects` metadata before inserting artwork records. It cannot simply validate local-disk files instead.
- The least disruptive future import is to keep the existing 24 approved artwork copies/records in Supabase, within about 89 MB, **only after separate approval**. The media/public boundary may use the unchanged local artwork bytes for delivery. New photographs can use the separately reviewed storage adapter.
- If artwork is moved instead, a new reviewed storage mapping/import proposal is required. Do not run the existing bundle unchanged against a different storage backend.
- No RLS/security/schema migration is authorized. A provider discriminator or durable publication/outbox state may eventually require schema changes; propose those separately before implementation.

Current fallback code empties the historic photo arrays; the mapper/asset route reject Unsplash sources, and the retired importer refuses live apply/resume. Historical demo definitions are not recovered conference content. **No demo images or references belong in public feeds, previews for public visitors, uploads or the import.**

## 3. Photograph storage and original-quality pipeline

### Meaning of original and units

**Proposed conservative interpretation:** retain the exact uploaded JPEG/PNG/WebP file, including its original pixel dimensions and checksum, for downloads. Do not reduce resolution or recompress it to make a quota fit. If GPS/other sensitive EXIF metadata needs removal, decide that explicitly before publication rather than silently modifying the original. RAW/HEIC are not currently supported; HEIC must be exported to a full-resolution supported format before upload.

All totals below are **ESTIMATED except existing artwork bytes**. `MiB = 1,048,576 bytes`; `KiB = 1,024 bytes`; table `GB = 1,000,000,000 bytes`. Provider meter units must be confirmed in the account.

Current generated images: fit-inside **760px WebP q80** thumbnail and **2400px WebP q88** viewer, no enlargement. Original bytes are retained. Encoding settings do not guarantee a byte size.

### Capacity model

Central assumption per photograph: **4 MiB original + 150 KiB thumbnail + 800 KiB viewer = 5,167,104 bytes**.

| Photos | Originals GB | Thumbnails GB | Viewers GB | Existing artwork GB | Media total GB | Estimated application DB MB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 2.097 | 0.077 | 0.410 | 0.089 | **2.673** | 4.121 |
| 1,000 | 4.194 | 0.154 | 0.819 | 0.089 | **5.257** | 7.193 |
| 3,000 | 12.583 | 0.461 | 2.458 | 0.089 | **15.591** | 19.481 |
| 5,000 | **20.972** | **0.768** | **4.096** | **0.089** | **25.925** | **31.769** |

Larger-original model: **8 MiB original + 200 KiB thumbnail + 1,200 KiB viewer** gives **49.200 GB** at 5,000. A 20% retained-version/interrupted-upload/growth allowance raises the central/larger media budgets to **31.110 / 59.041 GB**. Independent backups are additional copies, not included in these totals.

DB model: `1 MiB fixed catalogue allowance + N × 6 KiB` for photo/asset metadata, variant JSON, indexes and row overhead. At 5,000, a 3–12 KiB per-photo sensitivity range is **16.4–62.5 MB**, excluding the actual project's system/Auth/log/bloat footprint. A serialized public photo manifest might add roughly **2.5–5 MB** at 0.5–1 KB/photo, plus indexes/manifests for books/chapters; measure it later.

Other existing public files add **22,881,387 bytes** beyond book artwork; all 29 public files total **112,320,087 bytes**. JS/CSS/font build output is not measured here and must be included in deployment totals. Typical 5,000-photo content creates **15,000 photo files + 24 artwork files**, 5,000 photo rows and 5,024 asset rows, about 10,072 content rows including books/archives/chapters.

**Per-file caps are not aggregate budgets:** the existing 30 MiB original limit allows **157.286 GB of originals alone** at 5,000, before variants/OS/backups. That would not fit the proposed conservative disk allocation. Real file-size distribution must be measured. R2 would fit 5,000 central display variants plus originals only if originals averaged roughly **1,009,312 bytes or less**, before headroom; no such sample has been supplied, and metered request exposure remains even then.

For an OCI feasibility test, a **50 GB boot + 100 GB private data volume** leaves unallocated room within the published combined 200 GB allowance. Budget at most **80 GB live media**, reserving the rest of the data volume for temporary processing/filesystem space. This is a proposed allocation, not a created volume or a proven capacity guarantee. Failed/replaced files and draft assets count. Stop uploads before exhaustion rather than delete records/files automatically.

### Practical pipeline — proposed, not implemented

1. Admin chooses the target book/chapter and selects multiple files. Keep bounded concurrency; do not decode thousands of originals at once.
2. A protected Node endpoint verifies session, admin membership, target relationship, type/size/readability and total available byte budget. Original bytes stream to a private temporary location outside the web root, identified by the existing upload UUID.
3. Compute SHA-256, preserve original bytes/dimensions, create the existing two derivatives once, and record exact sizes/checksums. Atomic temporary-file rename plus the current processing/ready/failed lifecycle must support retry and interrupted transfer recovery.
4. Attach a draft photo only after its required files are verified. If DB attachment fails, retain a tracked recoverable asset; do not silently publish or lose it. Avoid symlink/path traversal and user-supplied filesystem paths.
5. Normal public browsing loads only a thumbnail. Opening the viewer loads its viewer image. **Download loads the original file**, streamed with correct MIME, filename, length and, where practical, byte-range support. Never use the original as an invisible fallback for a missing thumbnail.
6. Preserve current native share/clipboard behavior. For Pages → media-host fetch downloads, set appropriate public-image CORS; admin endpoints/private previews must not gain wildcard credential access.
7. Validate every photo's original/variants before publishing. At 5,000, add chapter-level metadata pagination/windowing behind the existing gallery layout if profiling justifies it.

For later derivative tuning only, test approximately 640–760px thumbnails around 80–150 KiB and 2048–2400px viewers around 400–800 KiB against representative images. Do not change the originals or assume every noisy conference photograph compresses similarly. No paid on-demand image transformation service is required.

## 4. Book artwork: measured optimization investigation

**VERIFIED now, with no files written:** all 24 assets are WebP, not misnamed PNGs. Covers and backs are **1209 × 2205px**; existing spines are **4460 × 520px**, in the already-working source orientation. Do not rotate them or alter the mapping.

| Existing group | Files | Exact bytes |
| --- | ---: | ---: |
| Front covers | 8 | 34,851,900 |
| Spines | 8 | 18,658,336 |
| Back covers | 8 | 35,928,464 |
| **Total** | **24** | **89,438,700** |

All eight backs have the same SHA-256, each **4,491,058 bytes**. There are **17 unique images, 58,001,294 bytes**. Delivery-level reuse of one identical back URL could avoid **31,437,406 bytes (35.15%)** of redundant cold-load transfer while preserving **all 24 original files and asset identities**. Browser cache/coalescing must be verified; merely leaving eight different URLs does not produce that saving automatically.

In-memory trials used bundled **Sharp 0.35.5 / libvips 8.18.7**, processed 17 unique images sequentially, and multiplied results back across 24 references. No derivative, script or temporary image was saved.

| Trial | Total for 24 references | Result |
| --- | ---: | --- |
| Existing artwork | 89,438,700 bytes | Baseline |
| Same-resolution WebP lossless, effort 6 | 89,438,700 bytes | **No saving**; all decoded RGB pixels matched exactly |
| Same-resolution WebP quality 90, effort 6 | 11,346,230 bytes | 87.31% smaller, **lossy** |
| Half-width/height WebP quality 90 | 981,802 bytes | Removes source detail; **not approved** |

Same-resolution q90 PSNR ranged **31.70–32.62 dB**; maximum individual channel error ranged **92–116 / 255**. These numerical results do not establish visual equivalence. Fine gold lettering, texture/grain and mobile/high-DPI presentation require side-by-side rendered approval. Resizing also changes detail even when aspect ratios are preserved.

**Safest recommendation:** preserve artwork unchanged; first test byte-identical back reuse and sensible caching. There is no demonstrated additional lossless compression saving. Lossy delivery copies may be explored only under separate approval, never overwrite originals, and are **not assumed in storage or bandwidth feasibility**.

The production project's normal `import "sharp"` could not be resolved during this read-only measurement attempt; a later `rg` access through that junction was also denied. The separately bundled matching version worked. This is a local dependency/access readiness issue to recheck—not a demonstrated deployed application failure and not a repaired issue. No dependencies were installed or changed.

## 5. Verified provider limits, terms and cost boundaries

All linked official sources below were checked **2026-10-18**. Recurring free allowances are distinguished from trials. No account-specific quota was inspected.

| Product | VERIFIED published allowance / terms | Assessment for this archive |
| --- | --- | --- |
| **Cloudflare Pages Free** | 500 builds/month, 20,000 files/site, 25 MiB/file; direct-upload CLI supports 20,000 files, dashboard drag/drop 1,000. [Limits](https://developers.cloudflare.com/pages/platform/limits/), [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) | Good static application/artwork host. A complete 5,000-photo × 3-file edition could fit the file count but not every currently permitted 30 MiB original. It is not a private draft store. |
| **Pages static delivery** | Static requests without Functions have no request charge; Pages advertises unmetered static bandwidth. Functions count against Workers. [Pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Pages](https://pages.cloudflare.com/) | Do not run Node/Sharp/session APIs here unchanged or infer an unlimited free general backup service. Exact acceptance/performance of a 26–49 GB photo deployment is untested. |
| **Cloudflare content-hosting terms** | Developer Platform explicitly allows hosted content but reserves resource limitation for network/service burden. Generic CDN terms separately restrict disproportionate large-file/image serving without appropriate services. [Developer Platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/), [Application CDN terms](https://www.cloudflare.com/service-specific-terms-application-services/) | Pages-hosted website assets are not the same proposition as proxying a large off-platform photo store through generic Free CDN. Neither document proves a guaranteed unlimited archive. Provider clarification is needed for any unusually large static edition. This is an operational reading, not legal advice. |
| **R2 Standard** | 10 GB-month storage, 1 million Class A and 10 million Class B operations/month; egress free. Overages $0.015/GB-month, $4.50/million A, $0.36/million B; billing-unit rounding; free allowance not for Infrequent Access. [Pricing](https://developers.cloudflare.com/r2/pricing/) | **Fails hard €0** for ordinary 5,000 originals. Account-wide allowance is not 10 GB per bucket; no quota-sharding workaround is proposed. |
| **R2 billing / delivery** | Subscription checkout and monthly usage billing; alerts do not cap spend. Production public caching requires a proper delivery setup, not rate-limited development `r2.dev`. [Enrollment](https://developers.cloudflare.com/r2/get-started/), [Alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) | No verified hard zero-spend cap. Do not enable it. Marketing's no-card-start wording does not establish this account's checkout or billing boundary. |
| **Supabase Free** | 500 MB DB, 50,000 Auth MAU, 1 GB files, 5 GB uncached + 5 GB cached egress, two active projects; pause after a week of inactivity; no included automatic backups. [Pricing](https://supabase.com/pricing) | Keep metadata/Auth if the organization really is Free. Exclude photo bytes. Public visitors are not Auth MAU. Managed admin login can still be unavailable after a pause. |
| **Supabase organization / email** | Plan applies at organization level. Default SMTP is restricted and currently two messages/hour; not production-grade delivery. [Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) | Preserve the restored project/account. Confirmation/recovery and SMTP must be checked without resetting credentials. No school-provided mail is assumed; any third-party free SMTP is a separate unresolved dependency. |
| **OCI Always Free resources** | In the home region: A1 allocation currently **1,500 OCPU-hours / 9,000 GB-hours per month**, equivalent to **2 OCPUs / 12 GB RAM**; **200 GB combined boot/block storage**, five included volume backups; **10 TB/month outbound transfer**. Object Storage is separately only **20 GB / 50,000 requests/month** for an unupgraded post-trial account. [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) | Private block storage, not the smaller Object Storage allowance, makes the capacity proposal plausible. Do not use outdated 4-OCPU/24-GB examples or trial-sized resources. |
| **OCI account / billing boundary** | Card/phone generally required for verification; card is not charged unless upgraded. Always Free is distinct from the $300/30-day trial; over-provisioned trial resources can be reclaimed. [Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm), [FAQ](https://www.oracle.com/cloud/free/faq/) | Use an **unupgraded Free-only account**, never PAYG, paid marketplace images, paid support or a larger resource justified by trial credit. Temporary card authorizations are possible. No signup was attempted. |
| **OCI reliability** | Free capacity may be unavailable. Idle VMs may be reclaimed; Free has no SLA/support entitlement; accounts idle ≥30 days may be suspended/terminated. [Resource conditions](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Account FAQ](https://www.oracle.com/cloud/free/faq/) | Primary weakness. Accept possible downtime/reprovisioning and independent recovery, or reject this option. No fake workload/keep-alive scheme is proposed. |
| **Netlify credit-based Free** | 300-credit hard cap; 20 credits/GB bandwidth, 2/10,000 web requests, 10/GB-hour compute, 15/production deploy. Free cannot incur usage overages. Modern Next uses its adapter. [Rates](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [Hard cap](https://www.netlify.com/pricing/), [Next support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) | Possible low-traffic admin host, **not** an original-photo CDN. No included large persistent filesystem. Upload/download payload restrictions require a different image transport, and 15 GB is the theoretical bandwidth-only maximum before other credits. |
| **Render Free** | 750 instance-hours/workspace/month; idle sleep after 15 minutes; ephemeral disk; Hobby transfer 5 GB/month, then $0.15/GB if a payment method is attached, otherwise service suspension. [Free](https://render.com/docs/free), [Transfer](https://render.com/docs/outbound-bandwidth) | Native Node fits in principle, but no persistent photo disk. Forwarding the initial 26–49 GB collection alone exceeds free transfer. A free Render PostgreSQL database expires after 30 days and is not permanent storage. |
| **Vercel Hobby** | Personal/non-commercial restrictions, 100 GB Fast Data Transfer and 10 GB Fast Origin Transfer, plus runtime limits. Function request/response payload cap 4.5 MB. [Hobby](https://vercel.com/docs/plans/hobby), [Payloads](https://vercel.com/docs/functions/limitations) | Eligibility is unverified, and the current 30 MiB multipart path cannot be assumed compatible. Not an answer to persistent original storage. No Pro trial is counted. |
| **Workers / D1 Free** | Workers: 100,000 dynamic requests/day, 10 ms CPU/request, 128 MB memory. D1: 5 GB aggregate, 500 MB/Free DB, 5 million rows read/day and 100,000 writes/day. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | Does not make native Sharp or PostgreSQL RLS/RPCs portable. A 50 MP RGBA buffer alone is ~200 MB. Replacing Database/Auth is a larger migration without solving original-file storage. |
| **Backblaze B2** | First 10 GB storage free; included download allowance up to 3× average storage, then metered delivery except eligible partner paths. [Pricing](https://www.backblaze.com/cloud-storage/pricing), [Caps](https://www.backblaze.com/docs/en/cloud-storage-data-caps-and-alerts) | Another metered object-storage option, not enough free storage for central/larger profiles. Caps can stop work, not make >10 GB free. Not recommended as an extra provider here. |

**OCI caveats in plain language:** the resource document's idle criteria cover a seven-day period of low CPU/network use and, for A1, low memory use; capacity can be reclaimed even when the website is a legitimate small archive. A stopped/unavailable VM means the proposed media/admin service is unavailable. If capacity cannot be provisioned, **do not upgrade to paid to get around it**. After upgrading, spending beyond included amounts can create charges and Oracle does not offer a simple return to the unupgraded Free state. Free is a cost boundary, not an availability guarantee.

For a free HTTPS admin address, a free DNS hostname such as Duck DNS and automated TLS are a possible operational dependency, not school infrastructure. Alternatively, Let's Encrypt now offers short-lived IP certificates; frequent automatic renewal must work. No domain, DNS service or certificate was configured. Free DNS/TLS availability and the VM's public-IP entitlement still require checking. [Duck DNS](https://www.duckdns.org/), [IP certificates](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability).

Card requirements/current billing for the existing accounts remain **UNVERIFIED**. Cloudflare/Netlify/Supabase Free should not be confused with paid accounts that happen to have an included allowance. Domain renewals, email, managed image transformations, extra backups and paid support can create separate bills. No such service is assumed or enabled.

## 6. Download and browsing bandwidth

These **ESTIMATED** scenarios deliberately give originals more weight than the preliminary audit. They describe 5,000 stored photos, not every photo loaded on every visit. A visit is a browsing session, including repeats; thumbnail counts include filmstrip requests. Originals are 4 MiB, thumbnails 150 KiB and viewer images 800 KiB.

| Scenario | Visits/month | Thumbs/visit | Viewers/visit | Originals downloaded/visit | Original downloads/month |
| --- | ---: | ---: | ---: | ---: | ---: |
| Light | 500 | 40 | 3 | 2 | 1,000 |
| Moderate | 10,000 | 80 | 8 | 5 | 50,000 |
| Heavy | 100,000 | 120 | 12 | 10 | 1,000,000 |

Formula: `visits × (thumb count × 150 KiB + viewer count × 800 KiB + download count × 4 MiB)`.

| Scenario | Thumbnail GB | Viewer GB | Original download GB | Total photo GB | Photo requests/month |
| --- | ---: | ---: | ---: | ---: | ---: |
| Light | 3.072 | 1.229 | **4.194** | **8.495** | 22,500 |
| Moderate | 122.880 | 65.536 | **209.715** | **398.131** | 930,000 |
| Heavy | 1,843.200 | 983.040 | **4,194.304** | **7,020.544** | 14,200,000 |

Sensitivity: with **8 MiB originals**, the same browsing assumptions produce **12.689 / 607.846 / 11,214.848 GB**. Heavy use then exceeds OCI's cited 10 TB allowance before other traffic. Even the 4 MiB heavy case needs explicit headroom, rate controls and a safe service-limiting policy. Unlimited free downloads are not promised. At 4 MiB, 100 full-collection downloads add about **2.097 TB**.

The existing 24 artwork references add **44.719 / 894.387 / 8,943.870 GB** if every session fetches all bytes cold. With future browser caching and an assumed 30% cold-session fraction, this becomes **13.416 / 268.316 / 2,683.161 GB**. These are assumptions, not measured hit rates. Existing asset responses are `private, no-store`; uploads set stored-object cache control to zero. **Current central combined image traffic** can therefore be roughly **53.214 / 1,292.518 / 15,964.414 GB** before backgrounds/code/admin traffic.

The proposed split keeps approved artwork/code on Pages so that traffic does not consume the VM's photo transfer allowance. No artwork recompression is assumed. CDN caching changes origin reads, not the bytes delivered to visitors by a metered frontend host.

Do not proxy OCI's photo traffic through Netlify/Render/Vercel and assume that direct-storage savings survive: their outbound allowance would also be consumed. Likewise, do not automatically place an off-platform photo origin behind generic Cloudflare Free CDN given the distinct application-service terms.

### Cost outcomes under these scenarios

| Approach | Light | Moderate | Heavy | Precise failure/charge condition |
| --- | --- | --- | --- | --- |
| **Recommended feasibility candidate:** Pages public shell/art + OCI Free-only remote admin/private photo disk + Supabase Free metadata/Auth | Expected **€0 provider fees** | Expected **€0 provider fees** | Expected **€0 fees at 4 MiB assumptions**, not an uptime guarantee | Requires Free-only eligible account/resources and working capacity. Exceeding free resources/transfer is an availability problem, not a reason to upgrade. At 8 MiB heavy assumptions the transfer budget fails. Upgrading OCI or other services destroys the hard-cost premise. |
| Existing Supabase Free Storage + free serverless admin/public | **Not viable at 5,000 photos** | Not viable | Not viable | 1 GB storage is insufficient regardless of visit count; serverless image delivery/payload quotas add restrictions. €0 while blocked is not a functional archive. |
| Pages + hosted admin + R2 central-profile originals | **At least about $0.24 storage** | At least about $0.24 storage | About $0.24 with strong CDN hits; about **$2.04** storage/reads in the no-hit example below | Positive storage bill at 25.925 GB even with no visitors. Host/domain/backup bills are additional; no hard zero-spend cap verified. |
| Pages including every published original/variant + OCI remote admin/private drafts | Expected €0 fees **if** deployment accepted and quota/withdrawal rules pass | Same | Same under static-hosting terms, not a guaranteed SLA | Needs ≤25 MiB/file and about 15,000 media files, safe removal from historic deployment URLs, and provider acceptance. Otherwise reject; do not convert it into an R2 subscription silently. |
| Entire Next app + private photo disk on OCI Free-only | Expected €0 fees within limits | Same | Current uncached combined transfer exceeds 10 TB | Closest to code today, but public availability is tied to VM; artwork/metadata delivery improvements and free resource availability must be proven. |
| Pages + separate B2/R2 object storage with Netlify Free admin | Not hard-€0 for normal originals | Same | Same, with request/delivery exposure | Free object allowances remain too small; adding another hard-capped admin host does not erase storage charges. |

R2 arithmetic is an illustration, **not an approved spend**: 25.925 GB for a full month minus 10 GB included, rounded to 16 billable GB-month units × $0.015 ≈ **$0.24**. At heavy traffic, 14.2 million photo GETs plus 720,000 artwork GETs under the 30%-cold assumption give 14.92 million reads; rounded excess is five million × $0.36 = **$1.80**. Strong caching could reduce read charges, not storage charges. Extra HEADs, multipart operations, retries, bots and backups are additional. At 49.200 GB, the corresponding rounded storage illustration is **$0.60/month**. Any positive amount fails the brief.

Popular traffic averaging approximately 473,000 photo requests/day already exceeds Workers Free's 100,000 dynamic requests/day if every image goes through a Worker. Averages also hide conference-day spikes. Hosting static assets without a Worker invocation is a different quota path.

## 7. Comparison and ranking

**ESTIMATED qualitative ranking, not a benchmark or provider SLA.** Order prioritizes cost certainty, preserved authorization and compatibility with the existing project. All options require separately approved implementation/testing.

| Rank / option | Reliability | Cost certainty | Maintenance | Existing-app compatibility | Decision |
| --- | --- | --- | --- | --- | --- |
| **1. Pages shell + OCI Free Node/media + existing Supabase DB/Auth** | Static UI strong; media/admin vulnerable to VM reclamation and Auth pause | High only while truly unupgraded/within eligible products; no hidden metered storage proposed | **Medium/high operational work:** OS, TLS, backups, storage adapter, publication cache | High for admin/engine; public entry/content URLs need adaptation | **Best candidate to validate under confirmed constraints**, not yet a proven release. |
| **2. Entire Next app on OCI Free + private disk + Supabase** | One VM failure affects public and admin | Same Free-only boundary | Fewer build/deployment pieces; still server maintenance | **Closest to existing code** except storage/cache | Useful first compatibility experiment; heavy uncached transfer does not fit. |
| **3. Fully static published photo edition on Pages + remote OCI editorial system** | Public can survive OCI outage; admin still vulnerable | High for non-metered static deployment if terms/limits satisfied | Higher publishing/retraction complexity | Reuses renderers, but requires a publication builder and original-file deployment | Consider only after deployment-size and withdrawal proof; not a simple export switch. |
| **4. Supabase DB/Auth + static public + Netlify Free admin + Supabase Storage** | Managed components but pauses/hard caps | Good no-overage plan boundary if verified Free | Relatively easy | Admin mostly reusable; upload limits still need work | **Capacity fail:** not a 5,000-original solution. |
| **5. Supabase DB/Auth + static public + R2 + cloud admin** | Generally simpler managed media than a self-managed VM | **Fails hard €0** with normal originals and metered overages | Easier ongoing object storage, more providers | Storage adapter and upload transport required | Reject under current cost constraint despite low estimated dollar amounts. |
| **6. Replace everything with Workers/D1/R2 or a new Git-based CMS** | Not established | Does not solve original capacity automatically | Largest migration/security burden | Would require replacing useful PostgreSQL/Auth/admin integration | Not justified; do not rebuild approved systems. |

A pure static site with a hosted content-management workflow **still needs private draft storage and a trusted publishing service**. Public Git commits, public preview deployments and embedding a deployment token in the admin browser are not acceptable substitutes. New books, chapters and captions can remain data-driven; no engine rewrite or routine source-code edits should be required.

## 8. Proposed components and publication security

### Recommended candidate data flow — NOT implemented

```text
VISITOR
  │
  ├── HTTPS → Cloudflare Pages Free
  │             existing public presentation / Three.js / fonts / approved artwork
  │             public-only entry, no admin cookies or deployment secrets
  │
  └── HTTPS → OCI Free-only VM: PUBLIC READ SERVICE
                published normalized catalogue / per-book chapter feeds
                controlled thumbnails, viewer images, original downloads
                accepts reads only; never exposes arbitrary disk paths
                            ▲
                            │ atomic published manifest + asset allowlist
                            │ (derived from verified publication rules)
ADMINISTRATOR               │
  └── HTTPS → SAME VM: PRIVATE NEXT.JS ADMIN / API
                existing login + membership checks + CRUD + previews
                upload validation / queue / Sharp / recovery receipts
                  │                          │
                  ▼                          ▼
          Supabase Free                 PRIVATE BLOCK VOLUME
          Auth + PostgreSQL/RLS         original bytes + variants
          original account/IDs          drafts never in a public web root
                  │                          │
                  └──── approved backup / recovery inventory ────┘
```

Public and administration are remotely hosted without school/local runtime infrastructure. They are separate application/security surfaces, but the diagram **does not pretend they have independent media/admin fault domains**: both backend surfaces share the VM. If “independently hosted” additionally means different backend machines/accounts, that stricter requirement needs explicit clarification; no second reliable free server is assumed.

### Authentication / authorization

Keep existing Supabase verified-user and membership checks on **every** privileged endpoint. Same-origin mutation validation stays on the admin origin; use HttpOnly/Secure/SameSite cookies, correct forwarded-origin handling and HTTPS. Do not expose filesystem, OCI, Supabase privileged or deployment credentials to the browser. A publishable Supabase key is not a privileged credential, but RLS must still enforce all access.

A static public site cannot execute admin operations merely because it knows API URLs. It should not load administrator cookies or request credentials for public photos. Private previews stay on the authenticated admin origin with `private, no-store` responses. A hidden route is not protection.

### Uploading and persistence

Preserve current book → archive → chapter → photo → asset relationships, UUIDs, checksum checks, no-overwrite behavior and explicit sort order. The new private-disk adapter must validate keys against known metadata and protect paths/symlinks. Incomplete files remain private and tracked. Start with the existing bounded queue, retaining retryable IDs; add resumable transfers only after an actual need and an authorized design. No giant all-photo request or all-original browser decode.

Assets need durable file reconciliation and backups; an ephemeral serverless filesystem cannot replace this disk. Avoid transient server memory as the only recovery journal.

### Publication, captions, new books and chapters

Saving/uploading remains draft. Publishing photographs/chapters/book is still deliberate and non-cascading. A server-side publisher produces the same normalized DTOs the renderers already consume, plus a published-only asset allowlist. It checks the complete parent/status chain and file readiness/checksums. Do not serialize an administrator's all-content query into the public feed.

**Publication coordination is missing today.** A DB save and a filesystem manifest update are not one transaction. A future design needs a durable/retryable publication job or equivalent recovery journal, atomic release/pointer replacement, and separate UI acknowledgment for “saved” versus “public release active.” Do not announce publication success after only saving metadata. Reorder/caption/new-book changes should refresh the feed, not require editing frontend code or deploying once per photo.

Since an authorized administrator can also mutate rows directly through Supabase, a cache must not assume the UI is the sole writer. A database outbox/change trigger would need separate schema approval. An alternative bounded revalidation strategy must define a short freshness/withdrawal limit and **fail closed** when that limit cannot be enforced. Cache invalidation is a security requirement, not just a performance improvement.

### Withdrawal and deletion

Withdraw/unpublish should first make the item unavailable at the serving origin/allowlist and purge or expire relevant cached bytes, then coordinate metadata/feed changes with retries. A failed partial operation should leave content hidden where possible, not falsely report complete success. Check old original, thumbnail, viewer and shared-photo URLs, not just the gallery tile.

Keeping conference photographs on the controlled media origin rather than every historic Pages deployment makes origin revocation simpler. Set a deliberate cache/revalidation policy; do not use year-long immutable public caching for photographs that must be withdrawable. Existing fixed book artwork can have a different policy. Previously downloaded or independently copied photos cannot be recalled.

Delete only after unpublishing, confirmation, relationship/reference checks and approved retention/backup handling. A database row deletion must not orphan private files invisibly. No automatic irreversible cleanup is proposed.

For the fully static alternative, every original/variant and caption can survive in old deployment URLs. Pages previews are public by default, and protecting previews does not automatically protect production domains. **Do not publish draft snapshots to previews** or call static withdrawal complete until old deployment URLs and CDN behavior are tested. [Pages deployment visibility](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

### Backups, recovery and zero-cost compromises

Use approved volume snapshots within the included limit plus a separately retained original/metadata backup with checksum inventory. Local backup copies are acceptable as backups, not as a dependency for normal public/admin access. A second folder on the same VM is not independent backup; a second cloud provider with 26–49 GB genuinely free backup capacity was not established. Free OCI Object Storage is too small for the larger collection and is not the same as 200 GB block storage.

The owner must accept either manual/offsite backup responsibility using already available storage or separately identify a no-cost independent backup destination. Do not claim perfect disaster recovery from the five same-account snapshots alone. Account termination, region failure, lost credentials and ransomware need recovery consideration. Never reset the existing admin account to make a restore easier.

## 9. Current implementation readiness

**VERIFIED code strengths:** bounded two-transfer upload queue and per-process decode slots; per-file progress/retry/cancel; UUID receipts; draft-only new photos/chapters; server file validation; no silent overwrite; 48-row admin pagination/search/status/order; lazy grid/preview images; parent-aware RLS; protected preview; explicit publication controls.

**Remaining issues to solve before a 5,000-photo release:**

- Private filesystem storage and publication/delivery adapter are not implemented. All production upload/download paths still use Supabase Storage.
- Multipart body and image bytes are buffered more than once; whole-file retry is not byte-offset resume. Per-process concurrency is not an account-wide limit.
- 50 MP inputs plus concurrent decoding can exceed small-host memory. Limit processing concurrency by measured RAM/CPU; leave originals intact.
- Failed/replaced/unlinked assets intentionally remain for recovery and consume quota. Current duplicate warnings are advisory under simultaneous distinct upload IDs; sort-order ties are possible until explicit reorder.
- Public archive loading fetches all metadata for a selected book, even though image bytes lazy-load. Related asset IDs are queried in chunks of 100; a 5,000-photo single book can produce roughly 60–65 REST reads and many mounted tiles. Add backend/feed pagination behind the approved UI only if profiling requires it.
- A missing thumbnail/viewer currently falls back to original; this can produce accidental multi-megabyte grid requests.
- Asset delivery is fully buffered and uncached, with database authorization traffic per image. Public and private delivery must remain correctly separated when optimizing it.
- No aggregate original + variant + retained-version byte quota exists. No 10 TB transfer stop/rate policy or 5,000-record performance test was run here.
- HTTPS hostname/renewal, allowed origins, database plan and live account confirmation are unresolved deployment prerequisites.
- Source review found stable reusable models, not a reason to change the shelf, artwork mapping, motion, lighting, typography or public layout.

The earlier local repair report records **32 passed tests, one intentionally skipped SQL/RLS test, successful build/type-check and zero lint errors with nine existing image warnings**, including a 2,002-record in-memory admin harness. Those are **prior results**, not tests rerun here, not 5,000-photo evidence and not real Auth/RLS/persistence verification.

This audit performed local source reads, manifest counts, file-size/hash/image-header checks, **in-memory** compression/pixel comparisons and arithmetic. No build, SQL, importer, application test, live login/upload, provider load test or deployment was run.

## 10. Approval-gated validation / migration plan

1. **Approve only an account-feasibility check first.** Confirm willingness to provide Oracle verification details and operate a self-managed Free-only VM, or reject it. Check region capacity, exact entitlement, existing account eligibility and that it is not PAYG. Do not upgrade or provision trial-only resources to evade capacity limits.
2. **Preserve the current baseline.** Inventory and, after separate approval, export database/schema/RLS/RPC/admin membership and current storage metadata; retain the draft import bundle and all 24 artwork originals with hashes. Protect backups as sensitive. No table reset, credential replacement or import execution.
3. **Local proof only, under separate implementation approval.** Build a private storage adapter against disposable offline fixtures, a public-only entry consuming normalized content, a publication/withdrawal coordinator and a 5,000-record metadata fixture. Do not alter engine/artwork/CSS. Confirm original download hashes and compare public screenshots/interactions.
4. **Review security changes explicitly.** Preserve existing admin authentication/authorization. Separately approve any durable outbox/schema changes, public allowlist freshness policy, storage-provider metadata or origin configuration. Do not weaken RLS because files move off Supabase.
5. **Test the chosen hosting envelope.** Linux ARM/native Sharp resolution, HTTPS renewal, upload sizes, memory, cancellation/retry, private previews, DB outages, disk exhaustion, per-book pagination, cache withdrawal and unauthorized/direct URLs. Use a small approved test set, never 5,000 live fixture rows.
6. **Provision/upload only after specific approval.** Free-only eligible resources and image destinations must be enumerated. Keep media private. Verify every original/artwork checksum and persistent reference. A provider account or VM must not be created by merely approving this written report.
7. **Review initial catalogue import separately.** Keep the existing eight/32/24 no-demo bundle draft-only. Either retain its original Supabase artwork prerequisites or review a new mapping before any execution. Import, asset upload and publication remain different approval steps.
8. **Publish deliberately.** An approved staging run must demonstrate create/edit/order/save, real admin login, original upload/download, previews, explicit publish/unpublish, old-URL withdrawal, persistence after restart and recovery after a failed publication. Then request separate public-release/deployment approval.
9. **Rollback without data loss.** Keep the previous deployment/content-source configuration and verified files; change only a release pointer/provider configuration after checks. Preserve new data for reconciliation, do not delete it as automatic cleanup. Never roll back to a snapshot that re-exposes withdrawn photographs.
10. **Operate within the cost boundary.** Monitor disk/transfer/backup counts and Auth availability, limit downloads before exhaustion and accept suspension/throttling over payment. Account upgrades, paid support, domains, SMTP subscriptions or object-storage billing require a new decision—not automatic remediation.

## 11. Account-specific questions — cannot be resolved from source

1. Is the restored Supabase organization actually **Free**, and what are its current database, egress, Auth, storage and backup states? Does the configured project still match `lofuwoctrqjnnovbggxj`? No environment value was printed or connection made here.
2. Can the existing administrator complete confirmation/login through the configured email/redirect/SMTP settings, preserving that same account and membership? Is only the designated person currently a member?
3. Does the owner qualify for a single unupgraded OCI Free account, accept card/phone verification and any temporary authorization hold, and have Free compute capacity in a suitable home region?
4. What do that tenancy's actual compute, volume, public-IP, backup and outbound-transfer entitlements show? Is it already a paid account that cannot supply the intended hard Free-only boundary?
5. Which free hostname/TLS route is available, and are outbound mail/account recovery and renewal automation dependable without buying a domain or SMTP subscription?
6. Are Cloudflare Pages/other existing accounts on non-metered Free plans without paid add-ons? Would Cloudflare accept the fully static 26–49 GB photo-edition alternative under its actual account/usage terms?
7. What export/restore options and backup retention are available in these specific accounts? Which independent backup destination is available without another recurring bill?

## 12. Non-account evidence / decisions still needed

- Representative real image file sizes/dimensions, pixel quality, supported formats, privacy/EXIF review and actual download frequency/peaks. Original resolution remains required; it is not an open question.
- Acceptance of possible free VM reclamation/Auth pauses and the operator time needed for OS/TLS/backups. There is no school/local runtime fallback in the recommendation.
- The exact withdrawal freshness deadline and whether already-public historic captions/deployment URLs need deletion/protection.
- Whether “independently hosted” means hosted away from school/local machines (met by the proposed component locations) or additionally independent public/backend/admin fault domains (not fully met by a single media/admin VM).
- Working Linux/native-module install and real publication, withdrawal, upload, original-download and 5,000-record tests. These have not been executed.
- Any future lossy artwork delivery-copy approval. No compression result above proves invisible degradation, and no optimized artwork is assumed.

**Stop condition reached.** Only `docs/COST-AND-CAPACITY-AUDIT.md` was updated. No application code, schema, security policy, credentials, artwork, import bundle, live data or service configuration changed. No SQL/importer, upload, migration, account signup, paid subscription, deployment or publication was performed. Await explicit approval or rejection of the proposed next feasibility step.
