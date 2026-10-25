# Adding books

For the database-backed CMS, use the private Books admin rather than editing
source code. See [Supabase setup](SUPABASE-SETUP.md). The instructions below
describe the local seed catalogue, retained for unconfigured development.

Each shelf volume starts as one object in `app/catalog.ts`. The renderer uses
that object for layout, cover generation, accessible labels, and the details
panel. You do not need to model a book or create an image.

## 1. Add a catalog entry

Copy this object into the `catalog` array:

```ts
{
  id: "my-book",
  slug: "my-book",
  title: "My Book",
  shortTitle: "My Book",
  committeeName: "My Committee",
  author: "Your Name",
  description:
    "A short description shown when the reader inspects the volume.",
  quote: "A short line you wrote or have permission to reproduce.",
  quoteBy: "Your Name",
  format: "Hardcover · 240 pages",
  availability: "Available now",
  url: "https://example.com/my-book",
  linkLabel: "Learn more",
  cover: "#203a5f",
  accent: "#e7b55f",
  ink: "#f5efe2",
  motif: "lattice",
  sortOrder: 90,
  status: "published",
  height: 2.05,
  thickness: 0.22,
  presentationVariant: 0,
  coverImage: "/books/my-book/cover.webp",
  spineImage: "/books/my-book/spine.webp",
}
```

`id` is the stable content identity and must be unique. `slug` must also be
unique, lowercase, and URL-safe. The slug is intended for future public URLs,
while the ID must not change when a book is reordered.

`sortOrder` controls the visible shelf order. `presentationVariant` preserves a
book's subtle physical width variation independently of its current position.
Use `status: "published"` for books that should be returned by the public
content provider.

`shortTitle` appears in the browse view and on the generated spine. Keep it
compact. `committeeName` is the committee subtitle shown on the shelf and in
the archive. The remaining procedural metadata is retained for generated
front, spine, and back artwork when custom assets are unavailable.

`cover`, `accent`, and `ink` accept CSS colors:

- `cover` is the board and generated-cover background.
- `accent` drives the motif and physical details.
- `ink` is the primary generated-cover text color.

`motif` selects one deterministic procedural design. Available values are:

```text
lattice, corrosion, efficiency, network, boom, organization, schematic,
flight, circuit, orbit, branches, wave, runner, gather, maze, fracture,
continuum, windows, steps
```

`height` and `thickness` are scene units, not inches or centimeters. Existing
books use heights around `1.9`–`2.2` and thicknesses around `0.16`–`0.30`.
Staying near those ranges keeps the shelf composition balanced.

Set `living: true` to add the subtle animated sheen used by selected demo
volumes.

## 2. Choose the cover treatment

### Procedural cover

Omit `coverImage` and `spineImage`. The app creates the cover, spine, and back
from the catalog entry. This is the simplest, fastest, and safest option for a
public fork.

### Your own front-cover image

Place an image you have the right to distribute at:

```text
public/books/my-book/cover.webp
```

Then add:

```ts
coverImage: "/books/my-book/cover.webp",
```

Use a portrait image close to a 2:3 aspect ratio. WebP or AVIF around
1200 × 1800 pixels and below 500 KB is a practical target. The image replaces
only the front face; the generated palette still controls the boards, spine,
back, and physical details.

If the image is missing or cannot load, the procedural cover remains visible.
Local files are recommended. Remote images need permissive CORS headers.

The book title and author remain exposed through the surrounding interface, so
decorative cover images should not repeat essential information solely for
accessibility.

### Your own spine image

Place the spine image at:

```text
public/books/my-book/spine.webp
```

Then add:

```ts
spineImage: "/books/my-book/spine.webp",
```

The custom image replaces only the existing spine artwork texture. The spine
plane dimensions, UVs, material, and `-Math.PI / 2` mesh rotation remain
unchanged. Supply the artwork upright: image top is the physical top of the
book, image bottom is the physical bottom, image left meets the back cover, and
image right meets the front cover. Do not mirror or pre-rotate the file.

If the image is missing or cannot load, the generated procedural spine remains
visible. The exact spine aspect ratio is `(thickness - 0.02) / (height - 0.04)`;
the image is mapped across the complete plane without cropping or repetition.

## 3. Understand shelf order

The public content provider orders published books by their explicit
`sortOrder`:

```ts
sort((left, right) => left.sortOrder - right.sortOrder)
```

Changing a book's height no longer moves it. Reordering also does not change
its stable ID or `presentationVariant`.

## 4. Rename the collection

Edit `app/site-config.ts` when turning the demo into your own library. That one
file controls the document title, description, wordmark, collection name,
edition eyebrow, generated-cover imprint and tagline, spine mark, default
external-link label, social-image alternative text, and independence note.

Individual books can override the default external-link copy with `linkLabel`.

Replace the Playground social card with artwork you own if you change the
collection.

## 5. Validate the result

```bash
pnpm lint
pnpm type-check
pnpm test
```

These commands lint, type-check, build, statically render the page, and verify
the shelf’s collision-free motion paths.

## Optional edition archives and 3D models

The demo contains an adapter for a local, separately licensed Stripe Press
edition archive. That archive is intentionally excluded from source control and
is not needed for user books.

For an ordinary personal shelf, use the procedural book plus an optional
contributor-owned `coverImage`. A custom GLB or OBJ requires a loader and
orientation contract specific to that model; do not assume that dropping a
model into `public/` will wire it automatically. If you add a Mint-generated
model, follow the Mint Three.js Skills asset registry and Draco-loader
guidance.

## Content checklist

Before committing a book, confirm that:

- the ID is unique;
- the external URL is intentional and uses HTTPS;
- the description and quote are yours or licensed for redistribution;
- any cover image is yours, licensed, or in the public domain;
- the cover remains recognizable at shelf size;
- `pnpm lint`, `pnpm type-check`, and `pnpm test` pass.
