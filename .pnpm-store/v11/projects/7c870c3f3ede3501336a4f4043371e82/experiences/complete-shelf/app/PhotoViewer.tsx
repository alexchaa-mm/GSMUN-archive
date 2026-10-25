"use client";

import { useEffect, useRef, useState } from "react";
import type { ArchivePhoto } from "./catalog";
import { fetchPhotoDownload, photoFilename } from "./gallery-content";
import type { GalleryPhoto } from "../lib/cms/gallery-page";

export type ViewerPhoto = ArchivePhoto & GalleryPhoto & { sectionTitle: string };

type PhotoViewerProps = {
  photos: ViewerPhoto[];
  index: number;
  returnFocus: HTMLElement | null;
  onSelect: (index: number, direction?:"next"|"previous") => void;
  onClose: () => void;
  loadingNext?: boolean;
  navigationError?:string;
};

export function PhotoViewer({ photos, index, returnFocus, onSelect, onClose,loadingNext=false,navigationError="" }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const downloadRequest = useRef<AbortController | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState("");
  const [copyLink, setCopyLink] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const photo = photos[index];

  useEffect(() => {
    closeRef.current?.focus();
    return () => {
      downloadRequest.current?.abort();
      returnFocus?.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  const selectPhoto = (next: number,direction?:"next"|"previous") => {
    if(loadingNext)return;
    downloadRequest.current?.abort();
    setDownloading(false);
    setZoomed(false);
    setNotice("");
    setCopyLink("");
    onSelect(next,direction);
  };
  const showPrevious = () => selectPhoto((index - 1 + photos.length) % photos.length,"previous");
  const showNext = () => selectPhoto((index + 1) % photos.length,"next");

  const handleSwipeStart = (event: React.PointerEvent) => {
    if (zoomed || event.pointerType === "mouse" || (event.target as HTMLElement).closest("button")) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleSwipeEnd = (event: React.PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) showPrevious();
    else showNext();
  };

  const download = async () => {
    setNotice("");
    setDownloading(true);
    const request = new AbortController();
    downloadRequest.current = request;
    try {
      const original = new URL(photo.original ?? photo.src, window.location.href);
      if (original.origin === window.location.origin && original.pathname.startsWith("/api/assets/")) original.searchParams.set("download", "1");
      const blob = await fetchPhotoDownload(original.href, request.signal);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = photoFilename(photo.id, blob.type, photo.filename);
      document.body.append(link);
      link.click();
      link.remove();
      // Safari needs the object URL to survive the click/download dispatch.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice("Download started.");
    } catch (error) {
      if (!request.signal.aborted) {
        setNotice("Download unavailable. Open the original photograph to save it.");
      }
      void error;
    } finally {
      if (!request.signal.aborted) setDownloading(false);
    }
  };

  const share = async () => {
    setNotice("");
    setCopyLink("");
    const url = new URL(photo.permalink ?? window.location.href, window.location.href).href;
    if (navigator.share) {
      try {
        await navigator.share({ title: photo.sectionTitle, text: photo.alt, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setNotice("Photograph link copied.");
    } catch {
      // Also works on HTTP LAN previews, where native share/clipboard may be absent.
      setCopyLink(url);
      setNotice("Copy this photograph link to share it.");
    }
  };

  if (!photo) return null;
  const stripStart = Math.max(0, Math.min(index - 3, photos.length - 7));

  return (
    <div
      ref={dialogRef}
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Photograph ${index + 1} of ${photos.length}`}
      data-testid="photo-viewer"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowLeft") { event.preventDefault(); showPrevious(); }
        if (event.key === "ArrowRight") { event.preventDefault(); showNext(); }
        if (event.key === "Tab") {
          const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input") ?? [])].filter((control) => control.getClientRects().length > 0);
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}
    >
      <div className="photo-viewer__topline">
        <p aria-live="polite">{index + 1} / {photos.length}<span>{photo.sectionTitle}</span></p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photograph">×</button>
      </div>
      <div className={`photo-viewer__stage ${zoomed ? "is-zoomed" : ""}`} onDoubleClick={() => setZoomed(value => !value)} onPointerDown={handleSwipeStart} onPointerUp={handleSwipeEnd} onPointerCancel={() => { swipeStart.current = null; }}>
        {failedImage === photo.src ? (
          <div className="gallery-image-error" role="status">
            <p>This photograph is currently unavailable.</p>
            <button type="button" onClick={() => setFailedImage(null)}>Try again</button>
          </div>
        ) : (
          <img key={photo.src} src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} decoding="async" draggable={false} onError={() => setFailedImage(photo.src)} />
        )}
        <button type="button" className="photo-viewer__zoom" onClick={() => setZoomed(value => !value)} aria-pressed={zoomed}>{zoomed ? "Fit image" : "Zoom"}</button>
        <button type="button" className="photo-viewer__arrow photo-viewer__arrow--previous" onClick={showPrevious} disabled={photos.length < 2} aria-label="Previous photograph">‹</button>
        <button type="button" className="photo-viewer__arrow photo-viewer__arrow--next" onClick={showNext} disabled={photos.length < 2 || loadingNext} aria-label="Next photograph">›</button>
      </div>
      <div className="photo-viewer__bottom">
        <div className="photo-viewer__actions">
          <button type="button" className="photo-viewer__download" onClick={() => void download()} disabled={downloading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
            {downloading ? "Downloading…" : "Download"}
          </button>
          <button type="button" onClick={() => void share()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3" /></svg>Share
          </button>
        </div>
        <div className="photo-viewer__feedback" role="status">{loadingNext ? "Loading photographs…" : notice || navigationError}</div>
        {copyLink ? <input className="photo-viewer__copy-link" aria-label="Photograph link to copy" readOnly value={copyLink} onFocus={(event) => event.currentTarget.select()} /> : null}
        {notice.startsWith("Download unavailable") ? <a className="photo-viewer__original" href={photo.original ?? photo.src} target="_blank" rel="noreferrer">Open original photograph ↗</a> : null}
        <nav className="photo-viewer__thumbnails" aria-label="Nearby photographs">
          {photos.slice(stripStart, stripStart + 7).map((item, offset) => (
            <button key={item.id} type="button" className={stripStart + offset === index ? "is-current" : ""} aria-label={`View photograph ${stripStart + offset + 1}`} aria-current={stripStart + offset === index ? "true" : undefined} onClick={() => selectPhoto(stripStart + offset)}>
              <img src={item.thumbnail} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
            </button>
          ))}
        </nav>
        {(photo.caption || photo.credit) && <div className="photo-viewer__caption">{photo.caption && <p>{photo.caption}</p>}{photo.creditUrl ? <a href={photo.creditUrl} target="_blank" rel="noreferrer">{photo.credit}</a> : <span>{photo.credit}</span>}</div>}
      </div>
    </div>
  );
}
