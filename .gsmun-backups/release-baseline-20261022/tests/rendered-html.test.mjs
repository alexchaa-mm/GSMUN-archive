import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const response = await fetch(process.env.TEST_SITE_URL ?? "http://127.0.0.1:5203/");
  assert.equal(response.status, 200);
  return response.text();
}

test("exports the GSMUN committee bookshelf shell", async () => {
  const html = await render();
  const { catalog } = await import(
    new URL("../app/catalog.ts", import.meta.url)
  );
  const { createBookContentProvider } = await import(
    new URL("../app/content-provider.ts", import.meta.url)
  );
  const publishedBooks = await createBookContentProvider(
    () => catalog,
  ).getPublishedBooks();
  assert.match(
    html,
    /<title>GSMUN 2026 Digital Archive<\/title>/i,
  );
  assert.match(html, /NICOSIA, CYPRUS/);
  assert.match(html, /OCTOBER 2026/);
  assert.doesNotMatch(html, /8 volumes ready/i);
  assert.match(html, /data-testid="shelf-canvas"/);
  assert.match(html, /data-testid="inspect-active"/);
  assert.match(html, /Disarmament and International Security Committee/);
  assert.match(html, /Browse to CRISIS COMMITTEE/);
  const shelfOrder = publishedBooks.map((book) => book.title);
  const renderedPositions = shelfOrder.map((title) =>
    html.indexOf(`Browse to ${title}`),
  );
  assert.ok(renderedPositions.every((position) => position >= 0));
  assert.deepEqual(renderedPositions, [...renderedPositions].sort((a, b) => a - b));
  assert.match(html, /og:image/);
  assert.match(html, /\/social-card\.webp/);
  assert.match(html, /summary_large_image/);
  assert.match(html, /1200/);
  assert.match(html, /630/);
  assert.doesNotMatch(
    html,
    /View (?:local|all) assets|open-asset-library|asset-library/i,
  );
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("models normalized, explicitly ordered committee content", async () => {
  const { catalog } = await import(
    new URL("../app/catalog.ts", import.meta.url)
  );
  const { createBookContentProvider } = await import(
    new URL("../app/content-provider.ts", import.meta.url)
  );
  const publishedBooks = await createBookContentProvider(
    () => catalog,
  ).getPublishedBooks();

  assert.ok(catalog.length > 0);
  assert.equal(new Set(catalog.map((book) => book.id)).size, catalog.length);
  assert.equal(new Set(catalog.map((book) => book.slug)).size, catalog.length);
  assert.equal(
    new Set(catalog.map((book) => book.sortOrder)).size,
    catalog.length,
  );
  assert.deepEqual(
    publishedBooks.map((book) => book.id),
    [...catalog]
      .filter((book) => book.status === "published")
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((book) => book.id),
  );
  for (const book of catalog) {
    assert.ok(book.id);
    assert.ok(book.slug);
    assert.ok(book.committeeName);
    assert.ok(Number.isFinite(book.sortOrder));
    assert.ok(["draft", "published", "archived"].includes(book.status));
    assert.ok(Number.isInteger(book.presentationVariant));
    assert.equal(book.coverImage, `/books/${book.id}/cover.webp`);
    assert.equal(book.spineImage, `/books/${book.id}/spine.webp`);
    assert.equal(book.backImage, `/books/${book.id}/back.webp`);
    assert.ok(book.sections.length > 0);
    for (const section of book.sections) {
      assert.ok(section.photos.length > 0);
      assert.deepEqual(Object.keys(section).sort(), ["id", "photos", "sortOrder", "title"]);
      for (const photo of section.photos) {
        assert.ok(photo.id.startsWith(`${book.id}-${section.id}-`));
        assert.match(photo.thumbnail, /w=760/);
        assert.match(photo.src, /w=1800/);
        assert.ok(photo.alt);
        assert.ok(photo.width > 0 && photo.height > 0);
      }
    }
  }

  const crisis = catalog.at(-1);
  assert.equal(crisis.title, "CRISIS COMMITTEE");
  assert.equal(crisis.committeeName, "Weimar Republic, 1929");
});

test("content provider accepts variable book and section counts", async () => {
  const { catalog } = await import(
    new URL("../app/catalog.ts", import.meta.url)
  );
  const { createBookContentProvider } = await import(
    new URL("../app/content-provider.ts", import.meta.url)
  );
  const fixtureBooks = [
    { ...catalog[2], sortOrder: 30, sections: catalog[2].sections.slice(0, 3) },
    { ...catalog[0], sortOrder: 10, sections: catalog[0].sections.slice(0, 1) },
    { ...catalog[1], sortOrder: 20, sections: catalog[1].sections.slice(0, 2) },
    { ...catalog[3], sortOrder: 5, status: "draft" },
  ];
  const provider = createBookContentProvider(() => fixtureBooks);
  const publishedBooks = await provider.getPublishedBooks();

  assert.equal(publishedBooks.length, 3);
  assert.deepEqual(
    publishedBooks.map((book) => book.id),
    [catalog[0].id, catalog[1].id, catalog[2].id],
  );
  assert.deepEqual(
    publishedBooks.map((book) => book.sections.length),
    [1, 2, 3],
  );
});

test("routes a selected book directly through its archive and back to the shelf", async () => {
  const [
    interfaceSource,
    archiveSource,
    styles,
    archiveBackground,
    archiveIdentity,
  ] = await Promise.all([
    readFile(new URL("../app/ProgressLibrary.tsx", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../app/CommitteeArchive.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/PhotoViewer.tsx", import.meta.url), "utf8"),
    ]).then((sources) => sources.join("\n")),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/archive/gsmun-medium-bg.png", import.meta.url)),
    readFile(
      new URL("../public/archive/gsmun-archive-identity.png", import.meta.url),
    ),
  ]);

  assert.match(interfaceSource, /nextMode === "inspect"/);
  assert.match(interfaceSource, /setArchiveBookId\(books\[index\]\?\.id \?\? null\)/);
  assert.match(interfaceSource, /<PublicArchive/);
  assert.match(await readFile(new URL("../app/PublicArchive.tsx", import.meta.url), "utf8"), /<CommitteeArchive/);
  assert.match(
    interfaceSource,
    /onBackToShelf=\{\(\) => \{\s*setArchiveBookId\(null\);\s*engineRef\.current\?\.returnToShelf\(\);/s,
  );
  assert.doesNotMatch(interfaceSource, /book-details|selectedBook|open-committee-archive/);
  assert.doesNotMatch(interfaceSource, /Inspect volume/);
  assert.match(archiveSource, /scrollIntoView\(\{\s*behavior: "smooth"/s);
  assert.match(archiveSource, /new IntersectionObserver/);
  assert.match(archiveSource, /loading="lazy"/);
  assert.match(archiveSource, /decoding="async"/);
  assert.match(archiveSource, /role="dialog"/);
  assert.match(archiveSource, /aria-modal="true"/);
  assert.match(archiveSource, /event\.key === "ArrowLeft"/);
  assert.match(archiveSource, /event\.key === "ArrowRight"/);
  assert.match(archiveSource, /event\.key === "Escape"/);
  assert.match(archiveSource, /handleSwipeStart/);
  assert.match(archiveSource, /handleSwipeEnd/);
  assert.match(archiveSource, /download/);
  assert.match(archiveSource, /data-testid="archive-exit"/);
  assert.match(archiveSource, /data-testid="back-to-archive"/);
  assert.match(archiveSource, /src="\/archive\/gsmun-archive-identity\.png"/);
  assert.doesNotMatch(archiveSource, />Index</);
  assert.equal(
    archiveSource.match(/onClick=\{onBackToShelf\}/g)?.length,
    2,
  );
  assert.ok(archiveBackground.length > 0);
  assert.ok(archiveIdentity.length > 0);
  assert.doesNotMatch(
    archiveSource,
    /Back to volume|back-to-volume|onBackToVolume/i,
  );
  assert.match(
    styles,
    /\.committee-archive\s*{[^}]*position: fixed;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/s,
  );
  assert.match(styles, /\.committee-archive\.is-viewing-photo\s*{[^}]*overflow: hidden;/s);
  assert.match(styles, /--archive-yellow: #ffa800/);
  assert.match(styles, /--archive-header-solid: #032713/);
  assert.match(styles, /background-image: url\("\/archive\/gsmun-medium-bg\.png"\)/);
  assert.match(
    styles,
    /\.archive-masthead\s*{[^}]*position: sticky;[^}]*top: 0;[^}]*background: var\(--archive-header-solid\);/s,
  );
  assert.doesNotMatch(
    styles.match(/\.archive-masthead\s*{[^}]*}/s)?.[0] ?? "",
    /background:\s*(?:linear-gradient|rgba\()/,
  );
  assert.match(
    styles,
    /\.archive-chapters\s*{[^}]*position: sticky;[^}]*top: var\(--archive-masthead-height\);[^}]*background: var\(--archive-header-solid\);/s,
  );
  assert.match(
    styles,
    /\.browse-caption__author\s*{[^}]*color: #ffa800;/s,
  );
  assert.match(
    styles,
    /\.archive-hero__title > p:last-child\s*{[^}]*color: var\(--archive-yellow\);/s,
  );
  assert.match(
    styles,
    /\.archive-section__heading\s*{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/s,
  );
  assert.match(
    styles,
    /\.archive-section__heading h2\s*{[^}]*font-family: "Futura URW Extra Bold", var\(--sans\);[^}]*font-weight: 800;[^}]*text-align: center;/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 780px\)[\s\S]*?\.archive-chapters__links\s*{[^}]*--archive-chapter-gap: clamp\(11px, 3vw, 18px\);[^}]*justify-content: safe center;/,
  );
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 780px\)/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(
    styles,
    /@media \(max-width: 480px\)[\s\S]*?\.archive-photo-grid\s*{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
});

test("keeps third-party editions optional and supports owned book artwork", async () => {
  const [
    engine,
    styles,
    catalogSource,
    coverArt,
    siteConfig,
    addingBooks,
    gitignore,
  ] =
    await Promise.all([
      readFile(new URL("../app/ShelfEngine.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../app/catalog.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/cover-art.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/site-config.ts", import.meta.url), "utf8"),
      readFile(new URL("../docs/adding-books.md", import.meta.url), "utf8"),
      readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    ]);

  assert.match(catalogSource, /coverImage\?: string/);
  assert.match(catalogSource, /spineImage\?: string/);
  assert.match(catalogSource, /backImage\?: string/);
  assert.match(engine, /loadCustomCover\(runtime, book\.coverImage\)/);
  assert.match(engine, /loadCustomSpine\(runtime, book\.spineImage\)/);
  assert.match(engine, /loadCustomBack\(runtime, book\.backImage\)/);
  assert.match(engine, /const customArtworkReady = this\.createBooks\(\)/);
  assert.match(
    engine,
    /customArtworkReady\.then\(\(\) => \{[\s\S]*?this\.callbacks\.onReady\(\)/,
  );
  assert.match(
    engine,
    /return Promise\.all\(customArtworkLoads\)\.then\(\(\) => undefined\)/,
  );
  assert.match(engine, /customCover:\$\{runtime\.data\.id\}/);
  assert.match(engine, /customSpine:\$\{runtime\.data\.id\}/);
  assert.match(engine, /customBack:\$\{runtime\.data\.id\}/);
  assert.match(engine, /const material = runtime\.spineSurface\.material/);
  const customSpineLoader = engine.match(
    /private async loadCustomSpine[\s\S]*?(?=\s+private async loadStripeBook)/,
  )?.[0];
  assert.ok(customSpineLoader);
  assert.match(customSpineLoader, /texture\.colorSpace = THREE\.SRGBColorSpace/);
  assert.match(customSpineLoader, /renderer\.capabilities\.getMaxAnisotropy\(\)/);
  assert.match(customSpineLoader, /matchSpineTextureOrientation\(/);
  assert.doesNotMatch(customSpineLoader, /repeat|offset|flipY/);
  assert.match(engine, /const surfaceAspect = surfaceWidth \/ surfaceHeight/);
  assert.match(engine, /const rotatedImageAspect = imageHeight \/ imageWidth/);
  assert.match(engine, /if \(rotatedError < directError\)/);
  assert.match(engine, /texture\.center\.set\(0\.5, 0\.5\)/);
  assert.match(engine, /texture\.rotation = Math\.PI \/ 2/);
  assert.match(engine, /Keep the generated procedural cover/);
  assert.match(engine, /Keep the generated procedural spine/);
  assert.match(engine, /Keep the generated procedural back cover/);
  const customBackLoader = engine.match(
    /private async loadCustomBack[\s\S]*?(?=\s+private async loadStripeBook)/,
  )?.[0];
  assert.ok(customBackLoader);
  assert.match(customBackLoader, /texture\.colorSpace = THREE\.SRGBColorSpace/);
  assert.match(customBackLoader, /renderer\.capabilities\.getMaxAnisotropy\(\)/);
  assert.match(customBackLoader, /const material = runtime\.backSurface\.material/);
  assert.doesNotMatch(customBackLoader, /rotation|repeat|offset|flipY/);
  assert.match(engine, /\$\{this\.booksData\.length\} volumes ready/);
  assert.match(
    engine,
    /this\.callbacks\.onReady\(\);\s+this\.callbacks\.onStatus\(\s*`\$\{this\.booksData\.length\} volumes ready`,?\s*\);/s,
  );
  assert.match(coverArt, /siteConfig\.coverImprint/);
  assert.match(siteConfig, /enableOptionalStripeArchive: false/);
  assert.doesNotMatch(coverArt, /STRIPE PRESS/);
  assert.match(addingBooks, /public\/books\/my-book\/cover\.webp/);
  assert.match(addingBooks, /public\/books\/my-book\/spine\.webp/);
  assert.match(addingBooks, /If the image is missing.*procedural cover/s);
  assert.match(addingBooks, /generated procedural spine remains\s+visible/);
  assert.match(addingBooks, /Do not mirror or pre-rotate the file/);
  assert.match(gitignore, /\/public\/assets\/stripe-press\//);

  // A separately licensed local archive can still activate the specialized
  // edition adapter, but no archive is required by this test or a clean clone.
  assert.match(engine, /OBJLoader/);
  assert.match(engine, /loadStripeAssets/);
  assert.match(engine, /MeshPhysicalMaterial/);
  assert.match(engine, /addStripeFoilBlend/);
  assert.match(engine, /stripeBookCoverFacingRotationY = -Math\.PI \/ 2/);
  assert.match(
    engine,
    /runtime\.data\.thickness \/ this\.stripeGeometrySize\.x/,
  );
  assert.match(
    engine,
    /runtime\.data\.height \/ this\.stripeGeometrySize\.y/,
  );
  assert.match(engine, /targetWidth \/ this\.stripeGeometrySize\.z/);
  const focusDuration = Number(
    engine.match(/const focusInDuration = ([0-9.]+);/)?.[1],
  );
  const returnDuration = Number(
    engine.match(/const focusOutDuration = ([0-9.]+);/)?.[1],
  );
  assert.ok(focusDuration >= 0.35 && focusDuration <= 0.55);
  assert.ok(returnDuration >= 0.25 && returnDuration <= 0.45);
  assert.match(engine, /easeOutCubic\(this\.focusProgress\)/);
  assert.match(engine, /updateBrowseMotion\(delta\)/);
  assert.match(engine, /commitBookPose\(/);
  assert.match(engine, /bookFootprintsOverlap\(/);
  assert.match(engine, /private motionBookIndex: number \| null/);
  assert.doesNotMatch(engine, /const reveal = ease/);
  assert.match(engine, /frameFocusedBook\(worldPosition\)/);
  assert.match(engine, /this\.camera\.setViewOffset/);
  assert.match(engine, /this\.focusCameraTarget\.copy\(worldPosition\)/);
  assert.doesNotMatch(engine, /worldPosition\.x \+ stageCenterOffset/);
  assert.match(engine, /this\.controls\.target\.copy\(this\.focusCameraTarget\)/);
  assert.match(engine, /bookInspectionIdle:/);
  assert.match(engine, /this\.mode === "inspect" && !this\.reducedMotion/);
  assert.match(styles, /\.browse-caption::before/);
  assert.match(styles, /rgba\(2, 23, 12, 0\.94\)/);
  assert.doesNotMatch(
    engine,
    /focusProgress = damp\(\s*this\.focusProgress,\s*1/s,
  );
  assert.doesNotMatch(engine, /sourceBounds.*setFromObject\(root\)/s);
  assert.doesNotMatch(engine, /GLTFLoader|loadMintAssets/);
});

test("uses the responsive GSMUN environment without altering the book lights", async () => {
  const [engine, styles, environmentAsset] = await Promise.all([
    readFile(new URL("../app/ShelfEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../public/environment/gsmun-dark-bg.webp", import.meta.url),
    ),
  ]);

  assert.ok(environmentAsset.length > 0);
  assert.match(styles, /url\("\/environment\/gsmun-dark-bg\.webp"\)/);
  assert.match(styles, /background-size: cover/);
  assert.match(engine, /alpha: true/);
  assert.match(engine, /this\.scene\.background = null/);
  assert.equal(engine.match(/new THREE\.ShadowMaterial/g)?.length, 2);
  assert.match(engine, /new THREE\.Fog\("#031b0e", 10, 26\)/);

  // Preserve the approved exhibition-light rig and its shadow-casting key.
  assert.match(engine, /HemisphereLight\("#fff8ea", "#6e5848", 2\.4\)/);
  assert.match(engine, /DirectionalLight\("#fff6e7", 4\.6\)/);
  assert.match(engine, /DirectionalLight\("#c8d5e5", 2\.1\)/);
  assert.match(engine, /PointLight\("#d79b72", 1\.2, 10, 2\)/);
  assert.match(engine, /key\.castShadow = true/);
});

test("restores colored foil artwork from edition coverage maps", async () => {
  const { addStripeFoilBlend, stripeFoilSettings } = await import(
    "../app/stripe-foil.ts"
  );
  const shader = addStripeFoilBlend(`
    #include <map_pars_fragment>
    void main() {
      vec4 diffuseColor = vec4(1.0);
      vec3 normal = vec3(0.0, 0.0, 1.0);
      #include <normal_fragment_maps>
    }
  `);

  assert.match(shader, /uniform sampler2D stripeFoilMap/);
  assert.match(shader, /texture2D\(stripeFoilMap, vMapUv\)/);
  assert.match(shader, /texture2D\(map, stripeFoilIndex\)/);
  assert.match(shader, /diffuseColor\.rgb = mix/);
  const normalMapsIndex = shader.indexOf("#include <normal_fragment_maps>");
  const foilCoverageIndex = shader.indexOf("float stripeFoilCoverage");
  assert.ok(normalMapsIndex >= 0);
  assert.ok(foilCoverageIndex > normalMapsIndex);

  assert.deepEqual(
    stripeFoilSettings({ foilOpacity: 1.5, foilDetail: 3 }),
    { enabled: true, opacity: 1.5, detail: 3 },
  );
  assert.deepEqual(
    stripeFoilSettings({ foilOpacity: -1, foilDetail: 0 }),
    { enabled: false, opacity: 0, detail: 0.1 },
  );
});

test("builds a vertical floating archive without parenting the floor to it", async () => {
  const [engine, motion, interfaceSource, styles] = await Promise.all([
    readFile(new URL("../app/ShelfEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/book-motion.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ProgressLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(engine, /private yAtIndex\(index: number\)/);
  assert.match(engine, /slot\.position\.set\(0, y, 0\.04\)/);
  assert.match(
    engine,
    /this\.shelfGroup\.position\.y = browseTarget\.y - this\.yAtIndex\(this\.scrollIndex\)/,
  );
  assert.doesNotMatch(engine, /private xAtIndex\(/);
  assert.doesNotMatch(engine, /shelfGroup\.position\.x = -/);
  assert.doesNotMatch(engine, /createShelfFurniture\(\)/);
  assert.doesNotMatch(engine, /shelfBoard:/);
  assert.doesNotMatch(engine, /shelfUpright:/);
  assert.doesNotMatch(engine, /shelfFurniture/);
  assert.match(engine, /this\.scene\.add\(ground\)/);
  assert.doesNotMatch(engine, /this\.shelfGroup\.add\(ground\)/);
  assert.match(engine, /this\.scene\.add\(this\.shelfGroup\)/);
  assert.match(engine, /const gsmunBookBodyColor = "#084818"/);
  assert.match(
    engine,
    /const boardMaterial = new THREE\.MeshPhysicalMaterial\(\{\s*color: gsmunBookBodyColor,/s,
  );
  assert.doesNotMatch(
    engine,
    /const boardMaterial = new THREE\.MeshPhysicalMaterial\(\{\s*color: book\.cover,/s,
  );
  assert.match(engine, /applyBookOrientation\(content, pose\.turn, pose\.roll\)/);
  assert.match(
    engine,
    /new THREE\.PlaneGeometry\(depth - 0\.02, book\.height - 0\.04\)/,
  );
  assert.equal(
    engine.match(/const backSurface = new THREE\.Mesh\(/g)?.length,
    1,
  );
  assert.match(engine, /backSurface\.rotation\.y = Math\.PI/);
  assert.match(engine, /spineSurface\.rotation\.y = -Math\.PI \/ 2/);
  assert.match(
    engine,
    /spineSurface\.position\.x = -width \* 0\.5 - 0\.019/,
  );
  assert.match(motion, /horizontalBookRoll = -Math\.PI \/ 2/);
  assert.match(motion, /uprightCoverRoll = 0/);
  assert.match(interfaceSource, /className="press-scroll-track"/);
  assert.match(styles, /\.press-scroll-track/);
  assert.match(styles, /\.press-scroll-track\s*{[^}]*position: fixed;[^}]*height: 100dvh;[^}]*overflow: hidden;/s);
  assert.match(styles, /html,\s*body\s*{[^}]*height: 100%;[^}]*overflow: hidden;/s);
  assert.match(styles, /touch-action: none/);
  assert.match(engine, /addEventListener\("wheel", this\.handleWheel, \{ passive: false \}\)/);
  assert.match(engine, /private handleWheel[\s\S]*?event\.preventDefault\(\)/);
  assert.doesNotMatch(engine, /handlePageScroll|maxPageScroll|scrollPageToIndex|window\.scrollTo/);
  assert.doesNotMatch(interfaceSource, /scrollTrackHeight/);
  assert.match(interfaceSource, /engineRef\.current\?\.focusBook\(activeIndex\)/);
  assert.match(interfaceSource, /engineRef\.current\?\.returnToShelf\(\)/);
  assert.match(engine, /this\.controls\.enabled = true/);
});

test("keeps every book footprint separated throughout browse and focus routes", async () => {
  const [
    { catalog },
    {
      bookFootprintsOverlap,
      bookWorldHalfExtents,
      browseMotionPose,
      browsePhaseDuration,
      createMotionLayout,
      createVerticalSlotPositions,
      focusedBookPose,
      horizontalBookRoll,
      presentedBookPose,
      shelvedBookPose,
      uprightCoverRoll,
    },
  ] = await Promise.all([
    import(new URL("../app/catalog.ts", import.meta.url)),
    import(new URL("../app/book-motion.ts", import.meta.url)),
  ]);
  const sizes = catalog.map((book) => ({
    width: 1.31 + book.presentationVariant * 0.018,
    height: book.height,
    thickness: book.thickness,
  }));
  const slotYs = createVerticalSlotPositions(sizes);
  const books = catalog.map((book, index) => {
    return {
      id: book.id,
      x: 0,
      y: slotYs[index],
      width: sizes[index].width,
      height: book.height,
      thickness: book.thickness,
    };
  });
  const layout = createMotionLayout(sizes);
  assert.equal(slotYs[0], 0);
  assert.ok(slotYs.every((y, index) => index === 0 || y < slotYs[index - 1]));
  assert.ok(books.every((book) => book.x === 0));
  assert.ok(-slotYs.at(-1) > -slotYs[0]);
  assert.ok(layout.rotationLaneZ > layout.presentedZ);
  assert.ok(layout.rotationLaneZ < 1.4);
  assert.equal(horizontalBookRoll, -Math.PI / 2);
  assert.equal(uprightCoverRoll, 0);

  function footprint(book, pose) {
    return {
      id: book.id,
      x: book.x + pose.x,
      y: book.y,
      z: 0.04 + pose.z,
      turn: pose.turn,
      roll: pose.roll,
      scale: pose.scale,
      width: book.width,
      height: book.height,
      thickness: book.thickness,
    };
  }

  for (const book of books) {
    const shelved = bookWorldHalfExtents(
      footprint(book, shelvedBookPose(layout)),
    );
    assert.ok(shelved.x > shelved.y, `${book.id} long edge must remain horizontal`);
    assert.ok(
      Math.abs(shelved.x - book.height * 0.5) < 1e-9,
      `${book.id} local height must map to world X`,
    );
    assert.ok(
      Math.abs(shelved.y - book.thickness * 0.5) < 1e-9,
      `${book.id} thickness must map to world Y while shelved`,
    );

    const presented = bookWorldHalfExtents(
      footprint(book, presentedBookPose(layout)),
    );
    assert.ok(
      presented.y > presented.x,
      `${book.id} selected cover must finish upright`,
    );
    assert.ok(
      Math.abs(presented.y - book.height * layout.presentedScale * 0.5) < 1e-9,
      `${book.id} local height must map to screen Y when presented`,
    );
  }

  function assertSeparated(poses, context) {
    for (let left = 0; left < books.length; left += 1) {
      for (let right = left + 1; right < books.length; right += 1) {
        assert.equal(
          bookFootprintsOverlap(
            footprint(books[left], poses[left]),
            footprint(books[right], poses[right]),
            layout.collisionMargin,
          ),
          false,
          `${context}: ${books[left].id} overlaps ${books[right].id}`,
        );
      }
    }
  }

  const outgoingPhases = [
    "retreat-current",
    "turn-current",
    "shelve-current",
  ];
  const incomingPhases = ["extract-next", "turn-next", "settle-next"];

  for (let from = 0; from < books.length; from += 1) {
    for (let to = 0; to < books.length; to += 1) {
      if (from === to) continue;
      const poses = books.map(() => shelvedBookPose(layout));
      poses[from] = presentedBookPose(layout);

      for (const phase of outgoingPhases) {
        const steps = Math.ceil(browsePhaseDuration[phase] * 240);
        for (let step = 0; step <= steps; step += 1) {
          poses[from] = browseMotionPose(phase, step / steps, layout);
          assertSeparated(poses, `${from}->${to} ${phase} ${step}/${steps}`);
        }
      }

      for (const phase of incomingPhases) {
        const steps = Math.ceil(browsePhaseDuration[phase] * 240);
        for (let step = 0; step <= steps; step += 1) {
          poses[to] = browseMotionPose(phase, step / steps, layout);
          assertSeparated(poses, `${from}->${to} ${phase} ${step}/${steps}`);
        }
      }
    }
  }

  for (let active = 0; active < books.length; active += 1) {
    for (const focus of [
      { x: -0.58, z: 1.66, scale: 1.08, viewport: "desktop" },
      { x: 0, z: 1.4, scale: 0.92, viewport: "mobile" },
    ]) {
      const poses = books.map(() => shelvedBookPose(layout));
      poses[active] = presentedBookPose(layout);
      for (let step = 0; step <= 120; step += 1) {
        poses[active] = focusedBookPose(
          step / 120,
          layout,
          focus.x,
          focus.z,
          focus.scale,
        );
        assertSeparated(
          poses,
          `${focus.viewport} focus ${active} ${step}/120`,
        );
      }
      for (let step = 120; step >= 0; step -= 1) {
        poses[active] = focusedBookPose(
          step / 120,
          layout,
          focus.x,
          focus.z,
          focus.scale,
        );
        assertSeparated(
          poses,
          `${focus.viewport} return ${active} ${step}/120`,
        );
      }
    }
  }
});

test("keeps the selected cover front-facing and scales the reference composition smoothly", async () => {
  const [engine, styles] = await Promise.all([
    readFile(new URL("../app/ShelfEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(engine, /const referenceAspect = 1271 \/ 702/);
  assert.match(engine, /const tabletAspect = 1024 \/ 768/);
  assert.match(engine, /const referenceCameraZ = 10\.8/);
  assert.match(engine, /const tabletCameraZ = 8\.2/);
  assert.match(engine, /const mobileCameraPullIn = width < 600 \? 1\.5 : 0/);
  assert.match(
    engine,
    /responsiveBrowseCameraZ\(width, height\)/,
  );
  assert.match(engine, /const desktopFocusFacingYaw = Math\.atan2\(0\.58, 5\.4\)/);
  assert.match(
    engine,
    /applyBookOrientation\(\s*selected\.content,\s*selected\.pose\.turn,\s*selected\.pose\.roll,\s*facingYaw/s,
  );
  assert.match(
    engine,
    /\.copy\(this\.bookFacingQuaternion\)\s*\.multiply\(this\.bookTurnQuaternion\)\s*\.multiply\(this\.bookRollQuaternion\)/s,
  );
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(
    styles,
    /\.edition-mark\s*{[^}]*margin-top: clamp\(41px, 3\.9vw, 60px\);[^}]*font-weight: 350;[^}]*text-align: right;/,
  );
  assert.match(engine, /width < 600 \? browseTarget\.y - 0\.16 : browseTarget\.y/);
  assert.match(engine, /return height < 880 \? 6\.7 : 6\.2/);
  assert.match(
    engine,
    /width < 600 \? \(height < 880 \? 0\.32 : 0\.23\) : 0\.28/,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.browse-caption\s*{[^}]*bottom: 0;[^}]*padding: 26px 20px\s+max\(42px, calc\(28px \+ env\(safe-area-inset-bottom, 0px\)\)\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.shelf-index\s*{[^}]*bottom: max\(14px, env\(safe-area-inset-bottom, 0px\)\);/,
  );
});
