# GSMUN 2026 Digital Archive

The existing floating Three.js committee bookshelf, private content manager and
photographic archive. Start with [the release/operator guide](docs/RELEASE-GUIDE.md).
Do not use the legacy seed importer or publish the catalogue automatically.

## Current local release

From `experiences/complete-shelf`:

```powershell
node scripts/verify-offline.mjs
node scripts/check-import.mjs
node scripts/preview-public.mjs
node --require ./scripts/offline-guard.cjs scripts/preview-sandbox.mjs
```

Run the two preview commands in separate terminals. Open
**http://127.0.0.1:5211/** for the normal public-facing design: original books,
artwork and empty chapters, no login or demo photos. The existing production
public route is `/`. This read-only offline design preview does not publish
drafts or reflect uploads in the separate admin simulation.

Open **http://127.0.0.1:5210/admin/** for the explicitly simulated, persistent
local workflow. After entering the simulated administrator, use
**http://127.0.0.1:5210/admin/shelf/** for a private preview of the original books.
No real password, database, storage account or publication is involved.

The real application still uses its existing `pnpm dev` workflow and configured
Supabase project. Production requires approved private R2/Node hosting setup and
a separately approved draft-only catalogue import. See the guide for costs,
environment variables, security, backups, verification and rollback.

## Original project attribution

<a href="https://play.mint.gg/complete-shelf">
  <img src="https://play.mint.gg/experience-assets/complete-shelf/social-card.webp" alt="A warm editorial 3D bookshelf with colorful procedural hardcovers arranged above a walnut shelf." width="100%">
</a>

Browse nineteen procedural hardcovers on a continuous 3D shelf, then pull any volume forward to orbit, zoom, and inspect its editorial details.

[Live demo](https://play.mint.gg/complete-shelf) · [Source code](https://github.com/mintdotgg/mint-playground/tree/main/experiences/complete-shelf)

Made with [Mint MCP](https://mcp.mint.gg/) as the 3D asset pipeline and
[Mint Three.js Skills](https://github.com/mintdotgg/mint-threejs-skills) as the coding workflow.

## Run locally

From the `mint-playground` repository root:

```bash
pnpm install
pnpm --dir experiences/complete-shelf dev
```
