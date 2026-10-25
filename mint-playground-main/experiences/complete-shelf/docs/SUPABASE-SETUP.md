# GSMUN content management — setup and handoff

## Current state

**Restored-project notice — 18 October 2026:** the confirmed project is
`lofuwoctrqjnnovbggxj`. Its schema, private bucket and existing administrator
membership were already installed. Do NOT run the fresh-project migration,
provision another account, reset credentials, or use the retired seed importer.
The existing no-demo draft import bundle requires separate approval. Follow
`ADMIN-LOCAL-REPAIRS.md` for current local work and remaining live release gates.
No live account/login/upload/persistence verification is claimed for this phase.

The numbered setup instructions below are historical **fresh-project** guidance,
not operations authorized for the restored project.

Without Supabase environment variables, the public site continues to use the
approved local catalogue. /admin/login/ explains the missing setup and disables
login. With both project variables configured, the public provider switches to
the database. A database failure never silently falls back to local published
content (which would incorrectly resurrect unpublished volumes).

## 1. Create your Supabase project

1. In the Supabase dashboard, create a new project for GSMUN. Choose an EU region
   appropriate to your hosting and data-protection requirements. Keep the database
   password private.
2. Open **SQL Editor** and run the complete file
   supabase/migrations/202610090001_archive_cms.sql once. Alternatively use
   Supabase CLI migrations against your linked project.
3. Verify these tables exist: books, archives, sections, photos, assets,
   and archive_admins. Verify RLS is enabled on every table.
4. In **Storage**, verify archive-assets exists and is **private**, not public.
   The migration creates the bucket with JPEG/PNG/WebP MIME restrictions.
5. Review existing policies if using a previously configured project. This
   migration is intended for a fresh archive project; permissive older policies
   on the same bucket/tables must not remain in effect.

## 2. Provision the administrator privately

1. Under **Authentication → Providers / Email**, disable public user sign-ups.
   Do not disable email/password sign-in.
2. Under **Authentication → Users**, create the administrator account privately,
   using a strong password and your real email. Ensure the account is confirmed.
3. Copy that user's UUID. In SQL Editor, run the following, substituting YOUR
   real UUID (the placeholder is not executable):

       insert into public.archive_admins(user_id)
       values ('YOUR-AUTH-USER-UUID');

4. Configure Auth site URL and permitted redirect URLs for your deployed HTTPS
   origin and local development origin. There is no public registration page.
5. Review Supabase Auth rate limits and brute-force protection. Configure secure
   SMTP/password recovery before production. Current login uses the provider's
   rate-limit protection; no process-local limiter pretends to protect a
   multi-instance deployment. Add edge/network limits where needed.
6. Supabase Auth supports future MFA. MFA enrollment and AAL2 enforcement are
   **not implemented in this stage**; add both application and database checks
   before claiming MFA protection.

An authenticated user without an archive_admins membership cannot manage
content. Membership cannot be self-granted through the application or database
API. Removing membership immediately removes management rights.

## 3. Configure these environment variables

Copy .env.example to a private .env.local in this experience directory and set:

| Variable | Where to find it | Used by |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Project Settings / Connect: project URL | Public read client and server session client |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Project API Keys: publishable key; legacy anon key also supported | Anonymous reads and authenticated session client |
| SUPABASE_SERVICE_ROLE_KEY | Project API Keys: legacy service-role key | **One-time migration script only** |

Only the first two are required for running the app. The service-role credential
is never imported by the application and must never have a NEXT_PUBLIC_ prefix.
Do not put any secret in chat, source control, screenshots or browser code.
You can configure the secrets locally yourself. We only need the project URL
and confirmation that the local variables have been set before proceeding.

Optional: GSMUN_CONTENT_SOURCE=local explicitly keeps the local seed public site
while you provision the database. Remove that override when testing live content.
Restart Next.js after environment changes; rebuild production for changed public
environment variables.

## 4. Migrate the existing content

Run commands inside experiences/complete-shelf:

    pnpm content:migrate --dry-run
    pnpm content:migrate --apply

The dry-run validates all current artwork files and prints content counts without
credentials or database access. The real apply requires the script-only
service-role variable and the schema from step 1.

The migration preserves the eight book IDs, explicit order, all dimensions,
presentation variants, rendering colours/metadata, artwork bytes, four current
chapters and current photo ordering/URLs. Every original artwork file is uploaded
unchanged with a checksum. Existing demo photographs remain external references;
they are not silently replaced or downloaded. They are not real conference photos.

Books remain draft until each volume's migration finishes. A non-empty target is
rejected by default. After a failed initial migration, review the database, then
use pnpm content:migrate --apply --resume to continue. The retry uses stable IDs,
does not overwrite existing rows and skips already published seed books. Do not
use the seed migration as an ongoing sync: it is not a way to overwrite admin
edits or restore deliberately deleted content. A project containing non-seed
books is rejected. Back up the database before migration.

Verify the public result after migration. Remove SUPABASE_SERVICE_ROLE_KEY
from the runtime environment when finished; the application does not need it.

## 5. Use the admin

Start the existing script with pnpm dev. Current script URL:
http://127.0.0.1:5203/admin/ (use the actual configured host/port if changed).

1. Log in with the account provisioned in step 2.
2. **Books → Create book**: enter title, short title, slug, committee subtitle,
   description, explicit order and dimensions. Save creates a draft book and
   corresponding draft archive atomically.
3. Edit the book to upload front/spine/back artwork or select stored assets.
   Artwork remains unmodified. Missing artwork retains the existing procedural
   fallback. Dimension limits stay inside the existing engine's supported
   collision-safe range.
4. Add any number of sections. Titles are content, not mandatory committee names.
   Reorder by dragging a row before another row or use the keyboard-accessible
   up/down buttons. Each reorder is atomic and restricted to its parent volume.
5. Select a section, then drop or choose multiple photographs. Uploads go directly
   to that section. The progress display distinguishes file transfer from
   server-side image processing. New photos start as drafts.
6. Edit alt text, captions, credits and publication state. Replace keeps the photo
   identity/order/details while changing its asset. Reorder by drag or buttons.
7. **Preview volume** opens the existing public renderer with authenticated draft
   content. Preview is private and uses the same bookshelf/gallery, not a mockup.
8. Return to the Books list and **Publish**. Confirming publishes the book/archive
   and their draft sections/photos; archived descendants stay hidden. Individual
   sections/photos can also be published/unpublished in their editors.
9. Refresh the public website to see content changes immediately without a build.
   Already open tabs do not live-subscribe; re-entering an archive fetches its
   current published content. Public reads never use admin cookies.
10. **Unpublish** hides the whole volume publicly while preserving it in admin.
    **Archive** is another non-destructive hidden state. Permanent deletion
    requires explicit confirmation and cascades contained content records.

Deleting a book, section or photo intentionally retains its media asset records
to avoid deleting reusable files. **Media / Photos → Delete unused asset** removes
unreferenced assets; database foreign keys reject deletion while any content
references them. A storage cleanup failure is reported for manual cleanup.

## Storage, privacy and image handling

- Private paths: books/{book-id}/artwork/{asset-id}/… and
  books/{book-id}/sections/{section-id}/{asset-id}/….
- Asset metadata lives in PostgreSQL, never the image binary.
- Upload types: actual single-frame JPEG, PNG or WebP; 30 MB maximum and 50
  megapixels maximum; each side must be 32–16000 pixels. HEIC is clearly rejected.
- Photo originals are retained. Grid derivatives fit inside 760px; viewer
  derivatives fit inside 2400px, WebP, no enlargement, EXIF orientation corrected.
  Artwork has **no derivatives or transforms**.
- RLS requires all parents and the photo itself to be published. Unpublishing a
  book also hides private Storage objects and asset metadata from public readers.
- /api/assets/{id}?variant=thumbnail|viewer|original checks current RLS and then
  reads private Storage using the same anonymous or verified admin identity.
  No service-role proxy, public bucket or durable signed URL bypasses publication.
  Original download uses the existing viewer's browser download behavior.
- Asset responses are private/no-store. This prioritizes unpublish semantics.
  The app server currently buffers each authorized image (bounded at 30 MB).
  For much larger traffic, evaluate streaming/caching with revocation semantics.
- Homepage requests book/artwork metadata only. Photos are queried only for the
  selected archive, with paginated/chunked database reads. Image bytes lazy-load
  in the existing gallery. The selected archive's photo metadata is currently
  returned as one DTO; chapter-level metadata pagination is a later optimization.
- Admin lists are paginated in 100-record pages.
- Admin sessions use HTTP-only cookies, SameSite=Lax, verified users, session
  refresh via Next.js Proxy and CSRF origin checks on every write. Cookies are
  Secure in production: deploy over HTTPS.
- Read-only public data means published participant photographs are public.
  This system cannot recall files already downloaded. Obtain consent and apply
  the conference's retention/child-safeguarding rules before publishing.

## Deployment change

Static export cannot host authenticated server endpoints, cookies or server-side
image processing. Only output: export was removed from Next config; the public
renderer, visuals and assets are retained. Deploy as a normal Next.js Node app:

    pnpm build
    pnpm start --hostname 0.0.0.0 --port 5203

Keep Supabase URL/publishable key in your deployment environment. Do **not**
deploy a service-role key for runtime. Static-only hosting is no longer sufficient.
Next's Proxy body limit is 32 MB to accommodate the 30 MB upload plus multipart
overhead. Your host/reverse proxy must also allow that size and image-processing
time. Some serverless hosts impose smaller request limits: choose a Node host
with suitable limits or implement signed direct uploads as a later change.

## Verification before production

Run pnpm test, pnpm type-check, pnpm lint and pnpm build.
Tests use real local PostgreSQL (PGlite) to exercise the actual schema/RLS:
non-admin writes, self-grant prevention, draft/public visibility, parent gating,
Storage policies, atomic creation/reordering, FK protections and unpublishing.
That is **not** a substitute for Supabase Auth/Storage integration testing.

Once the project is configured, perform this mandatory live test:

1. Log in; create a new TEST BOOK (not one of the eight seed books).
2. Give it three custom sections; reorder them.
3. Upload multiple photos into one section; reorder; add caption/credit/alt.
4. Preview the private draft using the existing renderer.
5. Publish; in an anonymous browser refresh the public shelf, open the new book,
   verify sections/gallery/viewer/download, and verify other books are unchanged.
6. Unpublish; verify anonymous metadata and image requests no longer expose it.
7. Verify it remains manageable in admin, then archive or delete test content.
8. Test logout, expired session and a signed-in account without admin membership.

Real Supabase migration and this end-to-end workflow are pending project setup.
Local tests must never be described as successful live Supabase verification.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Storage authorization](https://supabase.com/docs/guides/storage/security/access-control).
