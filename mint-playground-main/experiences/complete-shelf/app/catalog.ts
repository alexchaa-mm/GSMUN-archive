export type BookMotif =
  | "lattice"
  | "corrosion"
  | "efficiency"
  | "network"
  | "boom"
  | "organization"
  | "schematic"
  | "flight"
  | "circuit"
  | "orbit"
  | "branches"
  | "wave"
  | "runner"
  | "gather"
  | "maze"
  | "fracture"
  | "continuum"
  | "windows"
  | "steps";

export type ArchivePhoto = {
  id: string;
  thumbnail: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  credit: string;
  creditUrl: string;
  caption?: string;
  original?: string;
};

export type ArchiveSection = {
  id: string;
  title: string;
  sortOrder: number;
  photos: ArchivePhoto[];
};

export type BookStatus = "draft" | "published" | "archived";

export type BookPresentationVariant = -2 | -1 | 0 | 1 | 2;

export type PublicBook = {
  id: string;
  slug: string;
  title: string;
  committeeName: string;
  shortTitle: string;
  description: string;
  quote: string;
  quoteBy: string;
  cover: string;
  accent: string;
  ink: string;
  motif: BookMotif;
  sortOrder: number;
  status: BookStatus;
  height: number;
  thickness: number;
  presentationVariant: BookPresentationVariant;
  sections: ArchiveSection[];
  archiveTitle?: string;
  archiveDescription?: string;
  /**
   * Optional browser URL for contributor-owned front-cover art. Put local
   * images under `public/books/<id>/` and use a URL such as
   * `/books/<id>/cover.webp`.
   */
  coverImage?: string;
  /**
   * Optional browser URL for contributor-owned spine art. Put local images
   * under `public/books/<id>/` and use a URL such as
   * `/books/<id>/spine.webp`.
   */
  spineImage?: string;
  /**
   * Optional browser URL for contributor-owned back-cover art. Put local
   * images under `public/books/<id>/` and use a URL such as
   * `/books/<id>/back.webp`.
   */
  backImage?: string;
  living?: boolean;
};

/**
 * Local seed compatibility metadata. These fields are intentionally excluded
 * from the public provider contract because the approved UI no longer consumes
 * them.
 */
export type CatalogBook = PublicBook & {
  fullTitle: string;
  spine: string;
  author: string;
  format: string;
  availability: string;
  url: string;
  linkLabel?: string;
};

type DemoPhoto = {
  imageId: string;
  width: number;
  height: number;
};

const demoPhotos: DemoPhoto[] = [
  { imageId: "photo-1517457373958-b7bdd4587205", width: 1800, height: 1200 },
  { imageId: "photo-1540575467063-178a50c2df87", width: 1800, height: 1200 },
  { imageId: "photo-1505373877841-8d25f7d46678", width: 1800, height: 1198 },
  { imageId: "photo-1521737604893-d14cc237f11d", width: 1800, height: 1200 },
  { imageId: "photo-1517245386807-bb43f82c33c4", width: 1800, height: 1200 },
  { imageId: "photo-1556761175-b413da4baf72", width: 1800, height: 1200 },
  { imageId: "photo-1475721027785-f74eccf877e2", width: 1800, height: 1200 },
  { imageId: "photo-1531482615713-2afd69097998", width: 1800, height: 1200 },
  { imageId: "photo-1524178232363-1fb2b075b655", width: 1800, height: 1200 },
  { imageId: "photo-1531497865144-0464ef8fb9a9", width: 1800, height: 1200 },
  { imageId: "photo-1529390079861-591de354faf5", width: 1800, height: 1200 },
  { imageId: "photo-1522071820081-009f0129c71c", width: 1800, height: 1200 },
];

const sectionDefinitions: Pick<ArchiveSection, "id" | "title" | "sortOrder">[] = [
  { id: "the-room", title: "THE ROOM", sortOrder: 10 },
  { id: "the-debate", title: "THE DEBATE", sortOrder: 20 },
  { id: "the-people", title: "THE PEOPLE", sortOrder: 30 },
  { id: "the-moments", title: "THE MOMENTS", sortOrder: 40 },
];

function unsplashUrl(imageId: string, width: number, quality: number) {
  return `https://images.unsplash.com/${imageId}?auto=format&fit=crop&w=${width}&q=${quality}`;
}

function createSections(
  committeeId: string,
  committeeTitle: string,
  photoOffset: number,
): ArchiveSection[] {
  return sectionDefinitions.map((section, sectionIndex) => ({
    ...section,
    photos: Array.from({ length: 6 }, (_, photoIndex) => {
      const demo =
        demoPhotos[
          (photoOffset + sectionIndex * 3 + photoIndex) % demoPhotos.length
        ];
      const number = photoIndex + 1;

      return {
        id: `${committeeId}-${section.id}-${number}`,
        thumbnail: unsplashUrl(demo.imageId, 760, 78),
        src: unsplashUrl(demo.imageId, 1800, 90),
        alt: `${committeeTitle}, ${section.title.toLowerCase()}, archival photograph ${number}`,
        width: demo.width,
        height: demo.height,
        credit: "Demo photograph · Unsplash",
        creditUrl: "https://unsplash.com/",
      };
    }),
  }));
}

export const catalog: CatalogBook[] = [
  {
    id: "disec",
    slug: "disec",
    title: "DISEC",
    committeeName: "Disarmament and International Security Committee",
    fullTitle: "Disarmament and International Security Committee",
    shortTitle: "DISEC",
    spine: "DISEC",
    author: "Disarmament and International Security Committee",
    description:
      "The photographic record of the Disarmament and International Security Committee at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#disec-archive",
    cover: "#103d32",
    accent: "#f0cd36",
    ink: "#f5f1e7",
    motif: "lattice",
    sortOrder: 10,
    status: "published",
    height: 2.27,
    thickness: 0.28,
    presentationVariant: -2,
    coverImage: "/books/disec/cover.webp",
    spineImage: "/books/disec/spine.webp",
    backImage: "/books/disec/back.webp",
    sections: createSections(
      "disec",
      "Disarmament and International Security Committee",
      0,
    ),
  },
  {
    id: "sochum",
    slug: "sochum",
    title: "SOCHUM",
    committeeName: "Social, Humanitarian and Cultural Committee",
    fullTitle: "Social, Humanitarian and Cultural Committee",
    shortTitle: "SOCHUM",
    spine: "SOCHUM",
    author: "Social, Humanitarian and Cultural Committee",
    description:
      "The photographic record of the Social, Humanitarian and Cultural Committee at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#sochum-archive",
    cover: "#8b382e",
    accent: "#edca3b",
    ink: "#fff6df",
    motif: "wave",
    sortOrder: 20,
    status: "published",
    height: 2.24,
    thickness: 0.27,
    presentationVariant: -1,
    coverImage: "/books/sochum/cover.webp",
    spineImage: "/books/sochum/spine.webp",
    backImage: "/books/sochum/back.webp",
    sections: createSections(
      "sochum",
      "Social, Humanitarian and Cultural Committee",
      2,
    ),
  },
  {
    id: "specpol",
    slug: "specpol",
    title: "SPECPOL",
    committeeName: "Special Political and Decolonization Committee",
    fullTitle: "Special Political and Decolonization Committee",
    shortTitle: "SPECPOL",
    spine: "SPECPOL",
    author: "Special Political and Decolonization Committee",
    description:
      "The photographic record of the Special Political and Decolonization Committee at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#specpol-archive",
    cover: "#243c64",
    accent: "#e0bb37",
    ink: "#f6f0df",
    motif: "network",
    sortOrder: 30,
    status: "published",
    height: 2.21,
    thickness: 0.26,
    presentationVariant: 0,
    coverImage: "/books/specpol/cover.webp",
    spineImage: "/books/specpol/spine.webp",
    backImage: "/books/specpol/back.webp",
    sections: createSections(
      "specpol",
      "Special Political and Decolonization Committee",
      4,
    ),
  },
  {
    id: "csw",
    slug: "csw",
    title: "CSW",
    committeeName: "Commission on the Status of Women",
    fullTitle: "Commission on the Status of Women",
    shortTitle: "CSW",
    spine: "CSW",
    author: "Commission on the Status of Women",
    description:
      "The photographic record of the Commission on the Status of Women at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#csw-archive",
    cover: "#7e284e",
    accent: "#f0cd36",
    ink: "#f9ecf1",
    motif: "branches",
    sortOrder: 40,
    status: "published",
    height: 2.18,
    thickness: 0.25,
    presentationVariant: 1,
    coverImage: "/books/csw/cover.webp",
    spineImage: "/books/csw/spine.webp",
    backImage: "/books/csw/back.webp",
    sections: createSections("csw", "Commission on the Status of Women", 6),
  },
  {
    id: "icj",
    slug: "icj",
    title: "ICJ",
    committeeName: "International Court of Justice",
    fullTitle: "International Court of Justice",
    shortTitle: "ICJ",
    spine: "ICJ",
    author: "International Court of Justice",
    description:
      "The photographic record of the International Court of Justice at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#icj-archive",
    cover: "#dfd7bd",
    accent: "#b33e32",
    ink: "#17372f",
    motif: "steps",
    sortOrder: 50,
    status: "published",
    height: 2.15,
    thickness: 0.24,
    presentationVariant: 2,
    coverImage: "/books/icj/cover.webp",
    spineImage: "/books/icj/spine.webp",
    backImage: "/books/icj/back.webp",
    sections: createSections("icj", "International Court of Justice", 8),
  },
  {
    id: "unsc",
    slug: "unsc",
    title: "UNSC",
    committeeName: "United Nations Security Council",
    fullTitle: "United Nations Security Council",
    shortTitle: "UNSC",
    spine: "UNSC",
    author: "United Nations Security Council",
    description:
      "The photographic record of the United Nations Security Council at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#unsc-archive",
    cover: "#102f28",
    accent: "#eabf2d",
    ink: "#f1eadb",
    motif: "orbit",
    sortOrder: 60,
    status: "published",
    height: 2.12,
    thickness: 0.23,
    presentationVariant: -2,
    coverImage: "/books/unsc/cover.webp",
    spineImage: "/books/unsc/spine.webp",
    backImage: "/books/unsc/back.webp",
    sections: createSections("unsc", "United Nations Security Council", 10),
  },
  {
    id: "hsc",
    slug: "hsc",
    title: "HSC",
    committeeName: "Historical Security Council",
    fullTitle: "Historical Security Council",
    shortTitle: "HSC",
    spine: "HSC",
    author: "Historical Security Council",
    description:
      "The photographic record of the Historical Security Council at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#hsc-archive",
    cover: "#61342d",
    accent: "#e5c44a",
    ink: "#f5e9d9",
    motif: "continuum",
    sortOrder: 70,
    status: "published",
    height: 2.09,
    thickness: 0.22,
    presentationVariant: -1,
    coverImage: "/books/hsc/cover.webp",
    spineImage: "/books/hsc/spine.webp",
    backImage: "/books/hsc/back.webp",
    sections: createSections("hsc", "Historical Security Council", 1),
  },
  {
    id: "crisis",
    slug: "crisis",
    title: "CRISIS COMMITTEE",
    committeeName: "Weimar Republic, 1929",
    fullTitle: "Weimar Republic, 1929",
    shortTitle: "CRISIS COMMITTEE",
    spine: "CRISIS COMMITTEE",
    author: "Weimar Republic, 1929",
    description:
      "The photographic record of the Crisis Committee: Weimar Republic, 1929 at GSMUN 2026.",
    quote: "The Room · The Debate · The People · The Moments",
    quoteBy: "Four photographic chapters",
    format: "Committee photo archive",
    availability: "GSMUN 2026",
    url: "#crisis-archive",
    cover: "#252623",
    accent: "#d6aa32",
    ink: "#f0e8d6",
    motif: "fracture",
    sortOrder: 80,
    status: "published",
    height: 2.06,
    thickness: 0.21,
    presentationVariant: 0,
    coverImage: "/books/crisis/cover.webp",
    spineImage: "/books/crisis/spine.webp",
    backImage: "/books/crisis/back.webp",
    sections: createSections("crisis", "Crisis Committee", 3),
  },
] satisfies CatalogBook[];
