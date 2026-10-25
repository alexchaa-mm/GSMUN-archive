"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ArchivePhoto, PublicBook } from "./catalog";
import { orderedArchiveSections } from "./gallery-content";
import { PhotoViewer, type ViewerPhoto } from "./PhotoViewer";

type CommitteeArchiveProps = {
  book: PublicBook;
  onBackToShelf: () => void;
};

function GalleryPhoto({ photo }: { photo: ArchivePhoto }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="gallery-image-error">Photograph unavailable</span> : (
    <img src={photo.thumbnail} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" onError={() => setFailed(true)} />
  );
}

export function CommitteeArchive({
  book,
  onBackToShelf,
}: CommitteeArchiveProps) {
  const archiveRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [photoTrigger, setPhotoTrigger] = useState<HTMLButtonElement | null>(null);
  const sections = useMemo(() => orderedArchiveSections(book.sections), [book.sections]);
  const [activeSection, setActiveSection] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const viewerPhotos = useMemo<ViewerPhoto[]>(
    () =>
      sections.flatMap((section) =>
        section.photos.map((photo) => ({
          ...photo,
          sectionTitle: section.title,
        })),
      ),
    [sections],
  );
  const selectedPhoto =
    viewerIndex === null ? null : viewerPhotos[viewerIndex];

  useEffect(() => {
    const archive = archiveRef.current;
    if (!archive) return;

    archive.scrollTo({ top: 0 });
    window.requestAnimationFrame(() => archive.focus({ preventScroll: true }));
  }, [book]);

  useEffect(() => {
    const archive = archiveRef.current;
    if (!archive) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top) -
              Math.abs(right.boundingClientRect.top),
          );
        const id = visible[0]?.target.getAttribute("data-section-id");
        if (id) setActiveSection(id);
      },
      {
        root: archive,
        rootMargin: "-18% 0px -68% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => {
      const element = sectionRefs.current[section.id];
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  const goToSection = (sectionId: string) => {
    sectionRefs.current[sectionId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div
      ref={archiveRef}
      id={`${book.id}-archive`}
      className={`committee-archive ${selectedPhoto ? "is-viewing-photo" : ""}`}
      data-testid="committee-archive"
      tabIndex={-1}
      aria-label={`${book.title} photographic archive`}
    >
      <div className="archive-volume" inert={selectedPhoto ? true : undefined} aria-hidden={selectedPhoto ? true : undefined}>
      <div className="archive-masthead">
        <button
          type="button"
          className="archive-text-button archive-masthead__back"
          data-testid="archive-exit"
          onClick={onBackToShelf}
        >
          <span aria-hidden="true">←</span>
          <span>Back to archive</span>
        </button>

        <div className="archive-masthead__identity">
          <img
            src="/archive/gsmun-archive-identity.png"
            alt="GSMUN 2026 · Digital Archive"
            width="3240"
            height="1500"
          />
        </div>
      </div>

      <header className="archive-hero">
        <div className="archive-hero__title">
          <h1>{book.archiveTitle ?? book.title}</h1>
          <p>{book.archiveDescription ?? book.committeeName}</p>
        </div>

        <div className="archive-hero__foot">
          <p>
            {sections.length} sections
          </p>
          <p>{String(viewerPhotos.length).padStart(2, "0")} photographs</p>
        </div>
      </header>

      <nav className="archive-chapters" aria-label={`${book.title} chapters`}>
        <div className="archive-chapters__links">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? "is-active" : ""}
              aria-current={
                activeSection === section.id ? "location" : undefined
              }
              onClick={() => goToSection(section.id)}
            >
              <span>{section.title}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="archive-contents">
        {sections.length === 0 ? <p className="archive-empty" role="status">Photographs for this archive have not been published yet.</p> : null}
        {sections.map((section, sectionIndex) => {
          const viewerOffset = sections
            .slice(0, sectionIndex)
            .reduce((total, item) => total + item.photos.length, 0);

          return (
            <section
              key={section.id}
              ref={(element) => {
                sectionRefs.current[section.id] = element;
              }}
              className="archive-section"
              data-section-id={section.id}
              id={`${book.id}-${section.id}`}
              aria-labelledby={`${book.id}-${section.id}-title`}
            >
              <header className="archive-section__heading">
                <p>Chapter {String(sectionIndex + 1).padStart(2, "0")}</p>
                <h2 id={`${book.id}-${section.id}-title`}>
                  {section.title}
                </h2>
                <p>{String(section.photos.length).padStart(2, "0")} images</p>
              </header>

              {section.photos.length === 0 ? <p className="archive-empty" role="status">No photographs have been published in this section yet.</p> : null}
              <div className="archive-photo-grid">
                {section.photos.map((photo, photoIndex) => (
                  <button
                    key={photo.id}
                    type="button"
                    className="archive-photo"
                    onClick={(event) => {
                      setPhotoTrigger(event.currentTarget);
                      setViewerIndex(viewerOffset + photoIndex);
                    }}
                    aria-label={`Open photograph ${photoIndex + 1} from ${section.title}`}
                  >
                    <GalleryPhoto photo={photo} />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="archive-footer">
        <p>End of volume · {book.title}</p>
        <button
          type="button"
          className="archive-text-button archive-text-button--footer"
          data-testid="back-to-archive"
          onClick={onBackToShelf}
        >
          <span aria-hidden="true">←</span>
          <span>Back to archive</span>
        </button>
      </footer>
      </div>

      {selectedPhoto && viewerIndex !== null ? (
        <PhotoViewer photos={viewerPhotos} index={viewerIndex} returnFocus={photoTrigger} onSelect={setViewerIndex} onClose={() => setViewerIndex(null)} />
      ) : null}
    </div>
  );
}
