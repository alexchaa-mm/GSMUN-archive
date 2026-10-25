# Implementation record

Current local repairs and approval boundaries (18 October 2026) are recorded in
`ADMIN-LOCAL-REPAIRS.md`. The original implementation/setup results below are
historical: do not use the retired importer or rerun schema setup on the restored
project. No live database/auth/storage operation was performed in the repair pass.

## Added

- supabase/migrations/202610090001_archive_cms.sql — six normalized tables,
  indexes, status lifecycle, timestamp triggers, private bucket, table/Storage
  RLS, atomic create/publish/reorder/photo-attach functions.
- lib/cms/{model,content-mapper,content,http,images}.ts — validated content DTO
  boundary, anonymous published queries, normalization, upload validation and
  thumbnail/viewer processing.
- lib/supabase/{config,server}.ts and proxy.ts — project configuration, verified
  admin sessions, cookie refresh and separate anonymous public reads.
- app/admin/ — practical Books/Sections/Photos/Media management, login, logout,
  private renderer preview, own scoped CSS and paginated data access.
- app/api/admin/ — protected content and upload operations.
- app/api/auth/ — login/logout with origin checks; no signup endpoint.
- app/api/content/books/[id]/ — selected archive's published content.
- app/api/assets/[id]/ — current-RLS-authorized private asset delivery.
- app/public-content.ts, app/PublicArchive.tsx, app/ContentState.tsx —
  source boundary, on-demand archive fetch, empty/error states.
- scripts/{seed-plan,migrate-content,test}.mjs — migration dry-run/apply and
  runtime production test harness replacing static-export HTML checks.
- tests/cms.test.mjs and tests/browser-smoke.mjs — PostgreSQL/RLS, input, image,
  provider, frozen-file checks, optional Chrome public regression smoke test.
- .env.example and docs/SUPABASE-SETUP.md — blank configuration template and
  project/account/migration/deployment/live-test instructions.

## Modified

- app/catalog.ts — optional archive heading/caption/original asset DTO fields;
  all eight seed records and their artwork/dimensions/order are preserved.
- app/content-provider.ts — accepts normalized public DTOs, not legacy seed type.
- app/page.tsx — runtime content boundary with safe empty/failure behavior.
- app/ProgressLibrary.tsx — archive wrapper prop for on-demand database content.
  Existing ShelfEngine calls and interaction state machine are unchanged.
- app/CommitteeArchive.tsx — optional archive-specific heading/description.
- app/PhotoViewer.tsx — optional caption/credit and original download/share source.
  No viewer layout or interaction redesign.
- next.config.ts — remove static export; allow 32 MB Proxy bodies for uploads.
- package.json and workspace pnpm-lock.yaml — Supabase SSR/client, sharp, zod,
  PGlite tests; migration/test commands.
- .gitignore — allow committing the blank .env.example, not actual credentials.
- eslint.config.mjs — ignore the generated dist directory.
- tests/rendered-html.test.mjs — read live production HTTP instead of export HTML;
  recognize the content-loading wrapper while retaining public/geometry assertions.
- docs/adding-books.md — direct CMS users to admin; retain local seed guidance.

## Intentionally unchanged

ShelfEngine.ts, book-motion.ts, cover-art.ts, globals.css, local-content.ts,
gallery-content.ts, all public artwork/logo/background/font assets, and existing
geometry, camera, lighting, choreography and responsive presentation. Frozen
source hashes are asserted by automated tests.

## Pending external setup

No production database or bucket has been created, no real migration has been
applied, and no real administrator has logged in. The Supabase project must be
created and configured using SUPABASE-SETUP.md before those steps can be verified.
The private admin is implemented, not yet live-verified.

## Known limits

- Normal Next.js Node hosting is now required; static-only hosting cannot run
  these private server endpoints.
- Password recovery/SMTP and optional MFA enforcement need deployment setup;
  there is no public registration.
- HEIC and video are unsupported; export HEIC as JPEG.
- Originals are buffered for current-authorized delivery, bounded by 30 MB.
- Selected archive photo metadata loads as a whole DTO; image bytes lazy-load.
  Chapter-level metadata pagination and background processing are future work.
- Existing open browser tabs do not subscribe to live database changes; refresh
  the shelf or re-enter the archive to fetch current published content.
- Participant consent/retention requirements must be established before uploading
  and publishing real conference photos.

The mandatory real new-book → sections → upload → preview → publish → public
shelf/gallery → unpublish workflow remains a release gate, not an assumed success.

## Local validation — 9 October 2026

- pnpm content:migrate --dry-run: 8 books, 32 sections, 192 photo records and
  24 existing artwork files validated; no remote changes.
- pnpm test: production build succeeded; 18 tests passed, zero failures.
- pnpm type-check: passed.
- pnpm lint: passed with zero errors and nine no-img-element warnings. Existing
  public image rendering was not replaced to suppress warnings.
- Chrome browser smoke: 390×844, 393×852, 430×932, 1024×768 and 1440×900;
  persistent archive header, expected photo columns, no horizontal overflow,
  image viewer navigation/keyboard/close, real download, a second book opening,
  return to bookshelf and setup-disabled admin login verified. No page runtime
  errors observed.
- SQL/RLS tests ran against local PostgreSQL via PGlite with platform-role
  contracts, not a live Supabase Auth/Storage service.
- Development server restored using the existing pnpm dev script at
  http://127.0.0.1:5203/.

Dependencies were installed using the workspace pnpm filter. Browser smoke used
the locally bundled Playwright runtime and Chrome, configured through
GSMUN_PLAYWRIGHT_MODULE and GSMUN_CHROME_PATH; no browser-testing dependency was
added to the production application.
