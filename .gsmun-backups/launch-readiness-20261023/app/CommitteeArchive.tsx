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
import { photographLink, type GalleryPage, type GallerySection } from "../lib/cms/gallery-page";

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
  const [extra, setExtra] = useState<Record<string, GalleryPage>>({});
  const [busy, setBusy] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [deepPhoto, setDeepPhoto] = useState<ViewerPhoto | null>(null);
  const requestRevision=useRef(0);
  const sections = useMemo(() => (orderedArchiveSections(book.sections) as GallerySection[]).map(section => ({...section, photos:[...section.photos,...(extra[section.id]?.photos ?? [])], hasMore:extra[section.id]?.hasMore ?? section.hasMore})), [book.sections,extra]);
  const remoteGallery = sections.some(section => !!section.contentId);
  const preview = (book as PublicBook & {preview?:boolean}).preview === true;
  const galleryEndpoint = preview ? `/api/admin/gallery?book=${encodeURIComponent(book.id)}&` : `/api/content/books/${encodeURIComponent(book.id)}/photos?`;
  const [activeSection, setActiveSection] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const viewerPhotos = useMemo<ViewerPhoto[]>(
    () =>
      [...sections.flatMap((section) =>
        section.photos.map((photo) => ({
          ...photo,
          sectionTitle: section.title,
        })),
      ),...(deepPhoto ? [deepPhoto] : [])],
    [sections,deepPhoto],
  );
  const selectedPhoto =
    viewerIndex === null ? null : viewerPhotos[viewerIndex];

  useEffect(() => {
    const params=new URLSearchParams(window.location.search);
    const chapter=params.get("chapter"); const id=params.get("photo");
    if (!preview && !params.has("book")) window.history.replaceState(null,"",photographLink(book.id));
    if (chapter) window.requestAnimationFrame(() => sectionRefs.current[sections.find(section => section.id === chapter || section.contentId === chapter)?.id ?? ""]?.scrollIntoView({block:"start"}));
    if (!id) return;
    const existing=sections.flatMap(section => section.photos).findIndex(photo => photo.id===id);
    if (existing>=0) {const frame=window.requestAnimationFrame(()=>setViewerIndex(existing));return()=>window.cancelAnimationFrame(frame);}
    if (!remoteGallery) return;
    const controller=new AbortController();
    fetch(`${galleryEndpoint}photo=${encodeURIComponent(id)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => {if(!response.ok)throw new Error();return response.json() as Promise<GalleryPage>;})
      .then(page => {if(page.photos[0]) {setDeepPhoto({...page.photos[0],sectionTitle:book.title});setViewerIndex(sections.reduce((n,section)=>n+section.photos.length,0));} else setGalleryError("This photograph is no longer published.");})
      .catch(() => {if(!controller.signal.aborted)setGalleryError("This photograph is unavailable.");});
    return () => controller.abort();
    // Entry-only deep link; loading more must not reopen a dismissed viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[book.id]);

  const exitArchive = () => { if(!preview)window.history.replaceState(null,"",window.location.pathname);onBackToShelf(); };
  async function loadMore(section: GallerySection) {
    if (busy) return;
    const version=requestRevision.current;
    setBusy(true);setGalleryError("");
    try {
      const offset=extra[section.id] ? extra[section.id].offset+48 : section.nextOffset ?? section.photos.length;
      const params=new URLSearchParams({offset:String(offset)});
      if(section.contentId)params.set("section",section.contentId);
      const response=await fetch(`${galleryEndpoint}${params}`,{cache:"no-store"});
      if(!response.ok)throw new Error("Photographs could not be loaded. Please retry.");
      const page=await response.json() as GalleryPage;
      if(version!==requestRevision.current)return false;
      setExtra(value=>({...value,[section.id]:{...page,photos:[...(value[section.id]?.photos ?? []),...page.photos]}}));
      return true;
    }catch(error){if(version===requestRevision.current)setGalleryError(error instanceof Error ? error.message : "Photographs unavailable.");return false;}finally{if(version===requestRevision.current)setBusy(false);}
  }
  async function adjacent(direction:"next"|"previous"){
    if(!selectedPhoto || busy)return;
    const version=requestRevision.current;setBusy(true);setGalleryError("");
    try{
      const response=await fetch(`${galleryEndpoint}${new URLSearchParams({anchor:selectedPhoto.id,direction})}`,{cache:"no-store"});
      if(!response.ok)throw new Error("Adjacent photograph unavailable. Please retry.");
      const page=await response.json() as GalleryPage;const photo=page.photos[0];
      if(version!==requestRevision.current)return;
      if(!photo)throw new Error("This adjacent photograph is no longer available.");
      const loaded=sections.flatMap(section=>section.photos).findIndex(item=>item.id===photo.id);
      if(loaded>=0){setDeepPhoto(null);setViewerIndex(loaded);}
      else{setDeepPhoto({...photo,sectionTitle:photo.sectionTitle ?? book.title});setViewerIndex(sections.reduce((sum,section)=>sum+section.photos.length,0));}
    }catch(error){if(version===requestRevision.current)setGalleryError(error instanceof Error ? error.message : "Photograph unavailable.");}
    finally{if(version===requestRevision.current)setBusy(false);}
  }

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
    const chapter=sections.find(section=>section.id===sectionId);
    if(!preview)window.history.replaceState(null,"",photographLink(book.id,chapter?.contentId ?? sectionId));
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
          onClick={exitArchive}
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
          <p>{String(sections.reduce((n,section)=>n+(section.totalPhotos ?? section.photos.length),0)).padStart(2, "0")} photographs</p>
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
        {galleryError && <p className="archive-empty" role="alert">{galleryError}</p>}
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
                <p>{String(section.totalPhotos ?? section.photos.length).padStart(2, "0")} images</p>
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
              {section.hasMore && <button className="archive-text-button gallery-more" disabled={busy} onClick={()=>void loadMore(section)}>{busy ? "Loading…" : "Load more photographs"}</button>}
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
          onClick={exitArchive}
        >
          <span aria-hidden="true">←</span>
          <span>Back to archive</span>
        </button>
      </footer>
      </div>

      {selectedPhoto && viewerIndex !== null ? (
        <PhotoViewer photos={viewerPhotos} index={viewerIndex} returnFocus={photoTrigger} loadingNext={busy} navigationError={galleryError} onSelect={(next,direction)=>{
          const section=sections.find(section=>section.photos.at(-1)?.id===selectedPhoto.id);
          const currentSection=sections.findIndex(section=>section.photos[0]?.id===selectedPhoto.id);
          const previousSection=currentSection>=0 ? sections[(currentSection-1+sections.length)%sections.length] : undefined;
          if(direction && remoteGallery && (deepPhoto?.id===selectedPhoto.id || (direction==="previous" && previousSection?.hasMore))){void adjacent(direction);}
          else if(direction==="next" && section?.hasMore){void loadMore(section).then(ok=>{if(ok)setViewerIndex(viewerIndex+1);});}
          else setViewerIndex(next);
        }} onClose={() => {requestRevision.current++;setBusy(false);setViewerIndex(null);const url=new URL(window.location.href);url.searchParams.delete("photo");window.history.replaceState(null,"",url.pathname+url.search);}} />
      ) : null}
    </div>
  );
}
