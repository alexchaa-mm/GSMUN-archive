# Google Drive as GSMUN photograph storage — feasibility audit

> Historical audit retained for context. See [RELEASE-GUIDE.md](RELEASE-GUIDE.md) for the 22 October 2026 local implementation and approximately €5/month target. Drive is not used as public image delivery; no provider migration was executed.

**Decision: NO-GO as the primary storage/delivery architecture for the stated 5,000-photo, original-download, strict €0/month requirement.**

Checked **18 October 2026**. This is an investigation, not a migration approval. Read alongside `docs/COST-AND-CAPACITY-AUDIT.md` and `docs/ADMIN-LOCAL-REPAIRS.md`.

Application: `C:/Users/Admin/Desktop/mint-playground-main/mint-playground-main/experiences/complete-shelf/`. Repository paths below are relative to this application.

## 1. Executive decision

Both requested Drive architectures are technically conceivable with an authenticated storage adapter. Neither is a reliable, demonstrated fit for the full requirement:

- **Drive originals + display variants:** the central estimate needs **25.925 GB**, including current book artwork. Consumer Google storage includes **up to 15 GB shared with Gmail and Google Photos**, not 15 GB reserved for this archive. [Google account storage](https://support.google.com/googleone/answer/9312312?hl=en).
- **Drive originals + display variants elsewhere:** originals alone need **20.972 GB** at a 4 MiB average. Moving the 4.864 GB of display variants elsewhere does not fix the original-file capacity problem.
- Public links support anonymous access, but are not a dependable substitute for an image delivery service. Google documents temporary high-traffic download restrictions. Its generated thumbnail links expire and are explicitly unsuitable for direct web-app use because of CORS. [Download troubleshooting](https://support.google.com/drive/answer/2423534?hl=en), [Files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
- Drive does not host this application's secure Next.js admin, API routes or native Sharp processing. A remote runtime is still required.
- **Do not rely on older claims that Drive API usage is unconditionally free forever.** Official documentation now describes 2026 quota changes and future billable usage above standard thresholds. Exact account eligibility and rollout remain unverified. [Workspace API transition](https://developers.google.com/workspace/tools-safety).

**Recommendation:** do not replace the existing storage integration with Drive. Retain the prior **conditional feasibility candidate**: existing Supabase Database/Auth/RLS, Cloudflare Pages for the public presentation/artwork, and an **unupgraded OCI Always Free Node/media host with private block storage**. It has capacity advantages but still needs account-capacity, security, backup, deployment and operational verification. It is not a promise of uninterrupted free hosting.

Drive could be considered later for a **limited secondary copy or small collection that demonstrably fits an existing free allowance**. That is not approval, and not a complete backup of an approximately 26 GB archive.

### Evidence labels

- **VERIFIED — local:** inspected source, documentation, manifest or measured local file sizes. Not a live service test.
- **VERIFIED — official documentation:** linked provider documentation checked on the date above; not verification of the owner's account.
- **ESTIMATED / PROPOSED:** assumptions, calculations or an unimplemented design.
- **UNVERIFIED:** requires account-specific evidence or separately approved integration testing.

No accounts were connected, credentials requested, environment values printed, SQL executed, images uploaded, permissions changed, or content published. Only this report was created.

## 2. What the existing application actually supports

**VERIFIED — local.** The architecture remains suitable for preserving the approved presentation while changing storage behind a boundary. Drive support itself does **not** exist.

| Existing area | Finding and consequence |
| --- | --- |
| `app/page.tsx`, `app/public-content.ts`, `lib/cms/content.ts` | Request-time published-content reads; the page is `force-dynamic`. Storage changes do not eliminate the backend. |
| `app/ProgressLibrary.tsx`, `ShelfEngine.ts`, `book-motion.ts`, `cover-art.ts` | Client-side Three.js presentation consumes normalized content/artwork. No reason to change these for Drive. |
| `app/PublicArchive.tsx` | Fetches the selected archive through `/api/content/books/[id]`. A static public split needs the previously proposed loader/origin adaptation; it is not an unchanged static export. |
| `lib/cms/content-mapper.ts` | Produces normalized published content and asset URLs; external HTTPS sources are possible, but a Drive viewer URL is not image bytes. Unsplash sources are rejected. |
| `app/api/assets/[id]/route.ts` | RLS-aware asset lookup, then Supabase Storage download. Currently buffers bytes and returns `private, no-store`. It is neither a Drive adapter nor a shared CDN cache. |
| `app/PhotoViewer.tsx`, `app/gallery-content.ts` | Download fetches the original into an image Blob before creating a download link. A cross-origin Drive UI/confirmation response is not compatible with this contract. |
| `lib/supabase/server.ts`, admin/auth/content/upload routes | Existing verified Supabase identity and administrator-membership checks must stay. Drive permissions would be an additional security boundary, not a replacement for these checks. |
| `lib/cms/upload-service.ts` | Stable upload identities/checksums, tracked partial failures and private Supabase object keys. Actual transfer calls are Supabase-specific. Drive would require new transfer/reconciliation code. |
| `lib/cms/images.ts` | Keeps uploaded original bytes; makes 760-pixel thumbnail and 2400-pixel viewer WebP variants, fit-inside/no upscale, quality 80/88 respectively. No fixed output-byte ceiling. |
| `lib/cms/upload-queue.ts`, `listing.ts`, admin photo manager | Two concurrent uploads by default, per-file retry/progress, 48-record pages, search/status/sort controls and lazy thumbnails. These are reusable workflows, not tested Drive integration. |
| `supabase/migrations/202610090001_archive_cms.sql` | Existing books/archives/sections/photos/assets and administrator membership, publication-aware RLS, private `archive-assets` bucket. PostgreSQL/RLS cannot revoke access to a separately public Drive file. |

The reviewed `.local/catalog-import-v1-no-demo/manifest.json` still specifies **8 books, 8 archives, 32 chapters, 24 artwork assets, zero photographs**. Its import is draft-only. Its SQL requires matching Supabase Storage objects, so it would **not work unchanged for Drive-hosted artwork**. Leave it untouched; do not run it as a storage migration.

Measured again in this audit: `public/books` contains **24 files totaling 89,438,700 bytes**. No artwork was modified. No demo files or photo records are proposed for import. Historical demo definitions are not recovered conference photographs and remain excluded from public content.

## 3. Official Google limits and their meaning

### Storage, sharing and continuity — VERIFIED documentation

| Topic | Finding | GSMUN implication |
| --- | --- | --- |
| Consumer storage | Up to 15 GB across Drive, Gmail and Photos; promotions may add temporary capacity. Drive files consume their owner's allowance. | Free capacity must be checked on the actual account; shared folders do not create extra storage. |
| Full account | New Drive uploads stop when over quota. Trash/background data also occupy space. Long-term over-quota data can be removed after two years, with advance notice. | Upload admission checks and a separate backup are necessary. |
| Paid expansion | More storage is available through Google One. | Not a €0 solution; do not start a trial or subscription. |

Source: [How Google storage works](https://support.google.com/googleone/answer/9312312?hl=en).

Personal accounts can also be deleted after two years of inactivity. Do not assume anonymous public downloads constitute owner-account activity or satisfy retention requirements. [Inactive Google Account policy](https://support.google.com/accounts/answer/12418290?hl=en).

**Anonymous access is possible:** Google's documented “Anyone with the link” setting permits access without Google sign-in; Restricted files do not. Work/school account settings may constrain sharing, so an institutional entitlement is not assumed. [Drive sharing options](https://support.google.com/drive/answer/2494822?hl=en).

**Public accessibility is not publication control:** an unlisted link is not private. Folder permissions propagate; inherited access normally cannot be reduced on the child, and independent child permissions can survive a parent change. Keep drafts out of public ancestors. [Drive permission propagation](https://developers.google.com/workspace/drive/api/guides/manage-sharing).

### API quotas are not storage allowances — VERIFIED documentation

Google's current Drive API page distinguishes newer projects from projects that used the API between November 2025 and April 2026. The documented newer limits are:

| Limit | Published value |
| --- | --- |
| Project/minute | 1,000,000 quota units |
| User/project/minute | 325,000 quota units |
| Project/day egress threshold | 1 TB |
| Project/day billing threshold | 400,000,000 quota units |
| Example method weights | Read 5; list 100; download 200; edit 50 units |

These are **weighted units, not requests**. Standard use has no additional API charge. The page announces future over-quota charges later in 2026 with at least 90 days' notice; no final applicable price schedule was established here. It documents 403/429 responses and backoff. The separately stated 750 GB/day Workspace upload ceiling and 5 TB maximum upload do **not** grant a consumer account additional storage. [Drive API limits/pricing](https://developers.google.com/workspace/drive/api/guides/limits).

The transition announcement says future quota increases require Cloud billing and above-standard daily usage becomes billable. Existing-project transitions and the precise effective billing date must be checked before adoption; do not treat a future plan as an already verified charge on this person's account. [Workspace standardized model](https://developers.google.com/workspace/tools-safety).

### Cloud project, card and billing distinctions

**VERIFIED documentation:** Workspace APIs require a Google Cloud project; Google's project guide describes billing enablement as optional depending on APIs/features. A Cloud project is not the same thing as Google One storage or a paid Workspace subscription. [Cloud project prerequisites](https://developers.google.com/workspace/guides/create-project).

**No billing-enabled project, payment method or paid storage is proposed.** Standard API access should not be confused with needing a paid Cloud runtime. Conversely, enabling a billable service/quota arrangement later can create exposure. The exact behavior when a future daily threshold is reached with billing disabled is **UNVERIFIED** here: require a confirmed fail-closed service limit, not an assumed free unlimited continuation. Do not attach billing merely to make a failed quota request succeed.

## 4. Embedding, originals and reliability

### Generated thumbnails are not durable gallery assets

**VERIFIED documentation:** `thumbnailLink` generally lasts hours; Google explicitly warns that direct web-app use encounters CORS and suggests a proxy. Private thumbnails require credentialed fetching. `webViewLink` opens a Google viewer; `webContentLink` is a browser download link for binary files. Filenames are not unique; durable identity must use file IDs. [Files API fields](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

**Engineering conclusion:** do not persist temporary thumbnail URLs as final asset URLs, guess undocumented size-suffix rewrites, iframe the Drive viewer in place of photographs, or assume a `uc?export=download` rewrite is a supported CDN interface. No contractual pixel size/quality suitable for the existing viewer was established for generated Drive thumbnails. Keep generating the existing application's actual display variants.

### Original-resolution downloads

**VERIFIED documentation:** ordinary uploaded JPEG/PNG/WebP images are binary files. Drive supports byte downloads through `files.get` with `alt=media`, and browser download through `webContentLink` when access permits. Byte ranges are supported for binary downloads. Workspace-document export limits are not photo-file limits. Owner restrictions or abuse flags can prevent downloads. [Drive download methods](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

**PROPOSED choices:**

1. **Public Drive file + external browser download:** no Google login normally required for link-shared content, but Drive's UI/redirect/cookie/error behavior is outside the archive's control. It is not proof the current fetch-to-Blob button will work. Publication must reconcile Drive ACLs and database status.
2. **Private Drive file + authorized application delivery:** backend validates full publication ancestry/asset readiness, fetches using server-held owner authorization and streams bytes to the visitor. Visitors need no Google account. This preserves private storage and the existing URL contract, but consumes both Drive and backend bandwidth; it still needs a remote runtime, Range handling, safe caching and rate controls.

An original can remain **private in Drive while publicly downloadable through the application for a published photo**. It cannot simultaneously be unavailable to public visitors and available to those same visitors as an anonymous original download. Do not expose the owner's access/refresh token to resolve this distinction.

### Public download reliability

**VERIFIED documentation:** Google acknowledges high-view/download restrictions that typically reset within 24 hours, cookie-related failures and owner-disabled downloads. Its help page recommends dedicated hosting/Cloud Storage rather than public Drive links for large media distributions. It does not provide a numeric per-file public traffic allowance in that guidance. [Google download troubleshooting](https://support.google.com/drive/answer/2423534?hl=en).

**Conclusion:** there is no verified public-file CDN/SLA or guaranteed free monthly download allowance for this use. API quotas do not remove independent public-file throttling. A few popular photographs can fail despite ample account storage and a modest monthly total. Requiring visitors to sign in, join a group or copy files is not an acceptable archive fallback. No claim is made that all embedding is prohibited; the NO-GO is a capacity/reliability/security finding, not an invented terms-of-service ban.

## 5. The two architectures

### Option 1 — Drive holds originals and generated variants

```text
Existing authenticated admin -> validation + Sharp -> private Drive files
                            -> existing Supabase metadata/status/order

Public Three.js/gallery -> published-content provider -> authorized media adapter
                                                        -> Drive -> image bytes
```

**PROPOSED, not implemented.** Three files per photograph: original, thumbnail, viewer. Keep Drive ACLs private and use the media adapter for both public delivery and authenticated previews. This is safer than publishing a shared parent folder and attempting to revoke drafts later.

Benefits: one image-file source, recoverable file IDs, no Google visitor accounts, existing UI can remain. Problems: approximately 25.925 GB at 5,000 central-profile photos, added OAuth dependency, double-hop image delivery, API/traffic restrictions, no free remote admin runtime supplied by Drive. A cache would need strict draft isolation and bounded withdrawal freshness. **NO-GO at the target.**

### Option 2 — Drive originals; separate display delivery

```text
Existing admin -> private Drive originals
               -> thumbnail/viewer files on a separate delivery service
               -> existing Supabase metadata/status/order

Public gallery -> optimized display service
Download      -> publication-aware backend -> Drive original
```

**PROPOSED, not implemented.** Display files need about **4.864 GB** for 5,000 central-profile photos, plus artwork if moved there. Private originals still need **20.972 GB** in Drive. A raw public Drive download link is the less-secure withdrawal alternative, not a requirement of this design.

This lowers Drive's normal browsing traffic, but adds cross-provider completion/reconciliation, two sources to back up and withdraw, and the same original-capacity failure. A successful thumbnail upload must not mark an original upload successful. **NO-GO at the target.**

## 6. Storage model — ESTIMATED except measured artwork

Units: **1 GB = 1,000,000,000 bytes; 1 MiB = 1,048,576 bytes; 1 KiB = 1,024 bytes.** No real conference sample was supplied or inspected to verify an average original size.

Central assumptions per photograph:

- Original retained byte-for-byte: **4 MiB**. This is plausible for a JPEG delivery selection, not a guarantee for cameras, PNG or RAW files.
- Generated thumbnail: **150 KiB** average.
- Generated viewer: **800 KiB** average.
- Total: **5,167,104 bytes/photo**. Current variant dimensions/qualities are as described above; actual encoded sizes vary.

| Photos | Originals GB | Thumbnail + viewer GB | Including existing artwork GB |
| ---: | ---: | ---: | ---: |
| 500 | 2.097 | 0.486 | 2.673 |
| 1,000 | 4.194 | 0.973 | 5.257 |
| 3,000 | 12.583 | 2.918 | 15.591 |
| 5,000 | **20.972** | **4.864** | **25.925** |

Formula: `N × (4 × 1,048,576 + 950 × 1,024) + 89,438,700` bytes. At 5,000, thumbnails alone are 0.768 GB; viewers are 4.096 GB. If artwork remains on the existing host, subtract 0.089439 GB from Drive's option-1 requirement; the conclusion is unchanged.

Sensitivity and headroom:

- **8 MiB originals + 200 KiB thumbnails + 1,200 KiB viewers:** **49.200 GB** including artwork at 5,000.
- Even **2 MiB originals** with central variants need **15.439 GB** including artwork in option 1.
- A completely unused 15 GB account supports option 1 at 5,000 only if originals average at most **1.916 MiB** with those variants/artwork. Reserving 20% of the quota lowers that to **1.344 MiB**.
- Originals-only option 2 requires an average at most **2.861 MiB**, or **2.289 MiB** while reserving 20%. Existing Gmail/Photos usage reduces those ceilings further.
- Central-profile working allowance with 20% extra space is **31.110 GB**; heavy-profile allowance is **59.041 GB**. Replaced files, interrupted uploads, trash, backups and retained revisions consume additional space. A full independent backup approximately doubles retained image bytes.
- Database metadata is separate from Drive: estimate about **32 MB** at 5,000 using `1 MiB + N × 6 KiB`; indexes/system overhead and actual caption lengths vary. This is not a measured PostgreSQL size.
- Approximately **15,000 photo files**, plus 24 artwork files, and 5,000 photo/asset pairs are manageable identities, but not a reason to load all metadata or originals into one browser page.

Do not recompress/downscale uploaded originals merely to fit the quota while describing them as preserved originals. Continue normal browsing with variants. Existing validation allows JPEG/PNG/WebP, 30 MiB/file, a 50 MP decode ceiling and 32–16,000 pixels per side. HEIC/RAW are not supported by this pipeline. A future quota admission check must account for originals **and** variants, not just `assets.byte_size`.

## 7. Monthly bandwidth — ESTIMATED, no cache hits assumed

These are browsing sessions, not unique people. Each session loads the indicated number of thumbnails, large viewer images and original downloads. Original downloads are additional transfers, not already included in viewer bytes.

| Scenario | Sessions/month | Thumbnails/session | Viewer images/session | Original downloads/session |
| --- | ---: | ---: | ---: | ---: |
| Light | 500 | 40 | 3 | 2 |
| Moderate conference use | 10,000 | 80 | 8 | 5 |
| Heavy/repeat use | 100,000 | 120 | 12 | 10 |

Using 150 KiB / 800 KiB / 4 MiB:

| Scenario | Thumbnail GB | Viewer GB | Original GB | All photo GB | Display requests | Original downloads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Light | 3.072 | 1.229 | 4.194 | **8.495** | 21,500 | 1,000 |
| Moderate | 122.880 | 65.536 | 209.715 | **398.131** | 880,000 | 50,000 |
| Heavy | 1,843.200 | 983.040 | 4,194.304 | **7,020.544** | 13,200,000 | 1,000,000 |

Formula: `sessions × (thumb_count × 153,600 + viewer_count × 819,200 + download_count × 4,194,304)` bytes. Option 1 delivers all photo bytes from Drive; option 2 delivers only the original column from Drive. A private-file proxy sends the same bytes onward from its own host. Neither provider's transfer allowance is replaced by the other's.

The heavy option-2 case averages about 140 GB/day of Drive originals over 30 days, but concentrating 60% on conference day means **2.517 TB that day**, exceeding the documented 1 TB/day newer-project API threshold. Option 1 under the same burst is **4.212 TB/day**. Per-file sharing restrictions can trigger independently at much lower aggregate usage. API quota units must be calculated for the actual chosen methods; browser share-link visits are not automatically interchangeable with API calls. Extra metadata, polling, retries and bots are not included.

With **8 MiB originals** but the same display sizes, photo delivery becomes **12.689 / 607.846 / 11,214.848 GB** respectively. One full download of all 5,000 central-profile originals is **20.972 GB**; 100 full-collection downloads add **2.097 TB**.

Existing artwork is material: all 24 files total 89.439 MB. Loading every artwork once per session adds **44.719 / 894.387 / 8,943.870 GB** in these scenarios. At a hypothetical 30% cold-session rate, add **13.416 / 268.316 / 2,683.161 GB**. Keep approved artwork on the public static host where appropriate; do not route all of it through uncached Drive or Supabase. These are sensitivity calculations, not measured current cache-hit rates or permission to optimize the artwork.

## 8. How administration/publication would work if separately approved

**PROPOSED workflow; none of this has been built or live-tested for Drive.**

1. **Keep the existing administrator login.** Preserve Supabase Auth/membership, same-origin mutation checks, RLS and endpoint authorization. Separately connect the owner's Drive to the server through OAuth, not by accepting arbitrary visitor tokens or exposing credentials.
2. Prefer narrowly scoped `drive.file` access to files created/explicitly selected for this app. Full-Drive scopes are restricted and can introduce verification/security-assessment requirements. The permission choice and any exemption need review. [Drive OAuth scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
3. Store refresh tokens encrypted in a server-only secret store, never public tables, client bundles, URLs or logs. External OAuth apps left in Testing can receive refresh tokens expiring after seven days for Drive access; revocation/expiry must produce a useful admin reconnect state, not silent broken images. [OAuth refresh-token lifecycle](https://developers.google.com/identity/protocols/oauth2).
4. A service account is **not** a free 15 GB owner account: Google states service accounts have no storage quota and cannot own files. Human-owner OAuth or an appropriate shared drive is needed; paid/institutional shared-drive capacity is not assumed. [Drive storage error guidance](https://developers.google.com/workspace/drive/api/guides/handle-errors).
5. In the existing **book → chapter → upload** screen, validate/decode each original and generate variants with bounded concurrency. Suggested logical organization: `GSMUN/books/{book-id}/sections/{section-id}/{asset-id}/`. Drive IDs, not duplicate filenames or folder paths, identify each actual file. Retain checksums and variant dimensions/byte counts in the existing asset relationship, through a reviewed adapter mapping.
6. Use tracked upload IDs and Drive resumable transfers where worthwhile. Drive supports resumable uploads, but the repaired Supabase queue does not automatically become resumable merely by changing a URL. Verify uploaded bytes/IDs before `ready`; attach only completed assets to a **draft** photo. Recover partial transfers instead of auto-deleting files. [Drive upload methods](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
7. Captions, credits, alt text, chapter assignment, ordering, status and publication ancestry stay in **Supabase**, not folder names/Drive descriptions. Reuse pagination, search, filtering and private preview. Upload/edit does not publish. Explicitly publish intended photo/chapter/book states without cascading drafts.
8. **Preferred delivery model:** all Drive files remain private. Public endpoints exercise published-only RLS and enforce the complete parent chain before serving bytes; previews independently require admin authorization. Do not issue a reusable owner credential to visitors. Constrain IDs/ranges and destinations so the proxy is not an open URL-fetch service.
9. **Withdraw first through authorization, then invalidate controlled caches.** Stop new reads/downloads when photo or ancestor is unpublished/archived. If any files were made link-public, revoke every direct/inherited relevant permission too and verify access fails. Database unpublishing alone cannot withdraw those links. Never treat moving to trash as a security boundary. Previously downloaded files cannot be recalled.
10. Replacements use new tracked file identities/checksums and an explicit pointer change after success. Keep originals/old references for reviewed recovery; destructive cleanup needs separate approval. Back up metadata, file-ID/checksum mappings and original bytes independently. A synchronized Drive folder is not an independent immutable backup.

This is a meaningful storage/publication integration, **not a configuration-only change**. Existing RLS must not be weakened to accommodate it. Public download throttling, remote runtime availability and secure owner-token management remain necessary even with a static public shell.

## 9. Comparison with Supabase / Cloudflare / Oracle

### Verified provider facts relevant to the comparison

- **Supabase Free:** 1 GB file storage, 500 MB database, 50,000 Auth monthly active users, 5 GB uncached plus 5 GB cached egress; projects can pause after a week of inactivity. Useful for the existing metadata/Auth, not 5,000 originals or 4.864 GB of display variants. Public visitors need not be Auth users. [Supabase pricing](https://supabase.com/pricing).
- **R2 Standard:** 10 GB-month, 1 million Class A and 10 million Class B operations included monthly; direct egress has no transfer fee. Overage prices are $0.015/GB-month and $0.36/million Class B reads, with billing-unit rounding. A free allowance is not an unlimited free plan. [R2 pricing](https://developers.cloudflare.com/r2/pricing/). Activation includes a subscription checkout and monthly usage billing; no hard zero-spend limit was verified. [R2 setup](https://developers.cloudflare.com/r2/get-started/).
- **Pages Free:** 20,000 files/site, 25 MiB/file, 500 builds/month. Functions consume Workers quotas. A display-only set of 10,000 generated files fits the count before growth/site assets, but drafts must not enter deployments and withdrawal must cover historical deployment URLs. The existing dynamic app cannot simply be exported unchanged. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).
- **OCI Always Free:** 200 GB combined boot/block storage, five volume backups and 10 TB/month outbound. Its smaller 20 GB Object Storage allowance is not the proposed photo store. Idle compute can be reclaimed. [OCI resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm). Card/phone verification is generally required, but Oracle states the card is not charged unless the account is upgraded. Trial credits are temporary, not part of the operating plan. [OCI account boundary](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).

### Architecture decision table — ESTIMATED evaluation

All options below retain existing Supabase metadata/Auth and the approved public renderer unless stated otherwise.

| Option | Capacity at 5,000 central-profile photos | Cost certainty / operations | Decision |
| --- | --- | --- | --- |
| Existing Supabase Storage | 25.925 GB needed vs 1 GB Free | Closest integration, but free capacity fails | NO-GO for photo storage at target |
| Drive originals + variants | 25.925 GB vs up to 15 GB shared | €0 within actual free quota, but insufficient here; delivery/OAuth/runtime work remains | NO-GO |
| Drive originals + Supabase displays | Drive 20.972 GB; displays 4.864 GB | Both free storage allowances fail | NO-GO |
| Drive originals + R2 displays | Displays fit 10 GB centrally; Drive originals still exceed 15 GB | R2 is metered, not a hard €0 boundary; additional provider/ACL reconciliation | NO-GO |
| Drive originals + Pages display assets | Drive originals still exceed allowance; 10,000 display files initially fit Pages count | Publishing builds, historical URLs and draft/withdrawal safety need engineering | NO-GO as full solution |
| Drive originals + OCI displays/admin | Display disk plausible; Drive originals still fail | Adds owner OAuth and Drive throttling where OCI could hold originals too | Not justified |
| Prior Pages + unupgraded OCI private originals/variants/admin + Supabase metadata/Auth | Approximately 26–49 GB fits documented block allowance with OS/temp/backups budgeted | Stronger no-upgrade billing boundary, but self-managed maintenance, VM capacity/reclamation and Auth pause risks | **Best conditional candidate to validate; not implemented** |

R2 display-only cost illustration: 4.864 GB and the light/moderate display request counts are inside included allowances, assuming no other account usage. Heavy uncached display traffic is 13.2 million GETs; rounded excess four million × $0.36 is about **$1.44/month**, before other operations/services. Caching can reduce reads, not guarantee zero cost. All-original R2 storage at 25.925 GB is approximately **$0.24/month** after included allowance/rounding even with no visitors. These are rejected positive costs, not spending approvals.

For Drive, no valid €0 cost can be quoted for storing the central 5,000-photo collection because it does not fit the consumer free allowance. Buying Google One violates the requirement; exact regional prices are unnecessary to that decision. Free use at smaller sizes is conditional on account space, quotas and a separately free remote backend. Unknown future API overage tariffs must not be represented as €0.

The prior OCI candidate may have **€0 provider fees within eligible allowances on an unupgraded account**, but is not unlimited. Heavy central photo transfer is 7.021 TB plus non-photo traffic; heavy 8 MiB-original transfer is 11.215 TB before artwork and exceeds the cited allowance. Capacity, a service-limiting policy, TLS, backups and restore testing must precede approval. Do not upgrade automatically to preserve availability.

## 10. Principal failure modes and unresolved evidence

| Risk | Required protection / remaining uncertainty |
| --- | --- |
| Free Drive account fills | Actual owner quota/usage and representative original sizes are unknown. Failed uploads must remain retryable/tracked. No promotional or school allocation is assumed. |
| Popular originals stop downloading | Official high-traffic restrictions have no published numeric per-file threshold suitable for capacity planning. A proxy is not proof these disappear. |
| Expiring or non-image URL | Do not store `thumbnailLink` as permanent data or treat HTML share/view URLs as image bytes. Real Safari/CORS/download testing remains unperformed. |
| Owner OAuth revoked/expired | Server-side protected token lifecycle, reconnect handling, alerting and recovery. No Google account/OAuth project was inspected. |
| Draft becomes public through Drive ACL | Keep storage private; never rely on obscure links, public parent folders or database status alone. |
| Partial multi-provider publish | Reconcile statuses, file IDs, hashes, ACLs and cache state; never report success before completion. Fail closed. |
| Withdrawal leaves old links working | Verify direct media access as anonymous after withdrawal, including old IDs, public copies and deployment URLs. Set an explicit freshness deadline. Existing copies cannot be recalled. |
| Hidden bill | Google API rollout/billing state and any R2 subscription/payment settings are unknown. No budget-alert-as-hard-cap assumption. |
| Admin/public availability | Drive supplies neither the Node admin host nor Supabase availability; preserve authentication and plan for pause/outage recovery. |
| Account loss or accidental deletion | Recovery ownership, retention/consent, independent verified backups and periodic restore exercises. Downloadable originals can retain EXIF/GPS; disclosure policy needs an owner decision. |

### Evidence that would be needed before reconsidering Drive

Only after separate approval, and without sending secrets in chat:

1. Owner-confirmed consumer account allowance and used space, independent of school infrastructure or temporary promotions.
2. Representative **real** original size/format distribution, keeping original-resolution downloads intact.
3. Actual Cloud project quota generation, billing-disabled state and applicable 2026 transition notices; no project was created here.
4. OAuth consent scope/publishing requirements and stable server authorization, including reauthorization and account recovery ownership.
5. Approved small-file end-to-end tests: anonymous display/download, mobile Safari, CORS, permission revocation, parent unpublishing, expired auth, partial upload recovery and file integrity.
6. A remotely hosted admin/media runtime with a verified zero-charge boundary and adequate bandwidth, plus an independent backup plan.

## 11. Stop point and next decision

**NO-GO for both requested Drive architectures under the full stated requirement.** Recommend retaining the previous conditional OCI/Pages/Supabase feasibility direction rather than adding Drive as a new primary dependency. Do not change providers, the reviewed import bundle, authentication, schema or the approved public experience on the strength of this report alone.

If the owner wants to investigate further, first approve an account-specific/read-only capacity check or an offline adapter design. Any later account connection, test upload, permission change, migration, import, deployment or publication requires a separate explicit approval and rollback/backup plan.

### Work actually performed

- Read the prior cost/capacity and local admin repair reports; inspected the relevant current renderer/provider, download, asset, upload, image-processing, auth, schema and import-manifest code/data.
- Measured the 24 local artwork files without transforming them; calculated the storage and traffic scenarios arithmetically.
- Browsed the linked **official** provider documentation, not account dashboards or live content APIs.
- Created only `docs/GOOGLE-DRIVE-STORAGE-AUDIT.md`.
- **No build, lint, automated application test, live login, transfer, publication or integration load test was run.** This documentation-only audit does not validate a functioning Drive backend. No live project capacity, policies, credentials or administrative account were inspected or changed.

**Stopped for approval.**
