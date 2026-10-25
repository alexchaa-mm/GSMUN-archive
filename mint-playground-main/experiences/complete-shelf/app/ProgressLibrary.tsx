"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBook } from "./catalog";
import { PublicArchive } from "./PublicArchive";
import { ShelfEngine, type ShelfMode } from "./ShelfEngine";
import { siteConfig } from "./site-config";
import {NavigationDrawer} from "./NavigationDrawer";
import {ShelfGuidance} from "./ShelfGuidance";
import {buildNavigation,defaultNavigation,type PublicNavigation,type NavigationEntry} from "../lib/cms/navigation";

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <span aria-hidden="true" className={`arrow-icon arrow-icon--${direction}`}>
      <span />
    </span>
  );
}

type ProgressLibraryProps = {
  books: PublicBook[];
  loadArchivesOnDemand?: boolean;
  navigation?:PublicNavigation;
  initialFocus?:string;
  onNavigate?:(entry:NavigationEntry)=>void;
};

export function ProgressLibrary({ books, loadArchivesOnDemand = false,navigation,initialFocus,onNavigate }: ProgressLibraryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShelfEngine | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [archiveBookId, setArchiveBookId] = useState<string | null>(null);
  const [mode, setMode] = useState<ShelfMode>("browse");
  const [ready, setReady] = useState(false);

  const activeBook = books[activeIndex];
  const archiveBook = useMemo(
    () => books.find((book) => book.id === archiveBookId) ?? null,
    [archiveBookId, books],
  );
  const isFocused = mode !== "browse";
  useEffect(() => {
    let cancelled = false;
    let engine: ShelfEngine | null = null;

    async function start() {
      if (!canvasRef.current) return;
      await document.fonts.ready;
      if (cancelled || !canvasRef.current) return;

      engine = new ShelfEngine(canvasRef.current, books, {
        onActiveIndex: setActiveIndex,
        onMode: (nextMode, index) => {
          setMode(nextMode);
          if (nextMode === "inspect" && index !== null) {
            setArchiveBookId(books[index]?.id ?? null);
          }
          if (nextMode === "browse") {
            setArchiveBookId(null);
          }
        },
        onStatus: () => undefined,
        onReady: () => setReady(true),
      });
      engineRef.current = engine;
    }

    void start();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [books]);
  useEffect(()=>{if(ready && initialFocus){const index=books.findIndex(book=>book.id===initialFocus || book.slug===initialFocus);if(index>=0)engineRef.current?.browseTo(index);}},[ready,initialFocus,books]);

  return (
    <div className="press-scroll-track">
      <main
        className={`press-experience ${ready ? "is-ready" : ""} ${
          isFocused ? "is-focused" : "is-browsing"
        }`}
      >
      <canvas
        ref={canvasRef}
        className="shelf-canvas"
        data-testid="shelf-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Interactive three-dimensional shelf of ${books.length} books. Drag or use the arrow keys to browse. Press Enter to open the selected committee archive.`}
      />

      <header className="site-header">
        <div className="archive-identity">
          <img
            src="/identity/gsmun-2026-digital-archive.png"
            width="3240"
            height="1500"
            alt="GSMUN 2026 Digital Archive"
          />
        </div>
        <div className="shelf-guidance-region"><ShelfGuidance canvas={canvasRef} index={activeIndex}/></div>
        <div className="header-actions">
          <div className="edition-mark">
            <span>NICOSIA, CYPRUS</span>
            <span>OCTOBER 2026</span>
          </div>
          <NavigationDrawer navigation={navigation ?? buildNavigation(defaultNavigation(),books)} onActivate={entry=>{if(entry.behavior==="focus" && !entry.chapterId){const index=books.findIndex(book=>book.id===entry.bookId);if(index>=0){window.history.replaceState(null,"",entry.href);engineRef.current?.browseTo(index);}}else if(onNavigate)onNavigate(entry);else window.location.assign(entry.href);}}/>
        </div>
      </header>

      <section
        className="browse-caption"
        aria-hidden={isFocused}
        data-testid="browse-caption"
      >
        <p className="eyebrow">
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <span className="eyebrow__line" />
          <span>{String(books.length).padStart(2, "0")}</span>
        </p>
        <h1>{activeBook.shortTitle}</h1>
        <p className="browse-caption__author">{activeBook.committeeName}</p>
        <button
          type="button"
          className="inspect-button"
          data-testid="inspect-active"
          disabled={isFocused}
          onClick={() => engineRef.current?.focusBook(activeIndex)}
          aria-label={`Open the ${activeBook.title} archive`}
        >
          <span>Open archive</span>
          <span aria-hidden="true">↗</span>
        </button>
      </section>

      <button
        type="button"
        className="shelf-arrow shelf-arrow--up"
        data-testid="browse-previous"
        aria-label="Previous book"
        disabled={isFocused || activeIndex === 0}
        onClick={() => engineRef.current?.browseBy(-1)}
      >
        <ArrowIcon direction="up" />
      </button>
      <button
        type="button"
        className="shelf-arrow shelf-arrow--down"
        data-testid="browse-next"
        aria-label="Next book"
        disabled={isFocused || activeIndex === books.length - 1}
        onClick={() => engineRef.current?.browseBy(1)}
      >
        <ArrowIcon direction="down" />
      </button>

      <nav className="shelf-index" aria-label="Catalog position">
        <div className="shelf-index__ticks">
          {books.map((book, index) => (
            <button
              key={book.id}
              type="button"
              className={index === activeIndex ? "is-active" : ""}
              aria-label={`Browse to ${book.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              disabled={isFocused}
              onClick={() => engineRef.current?.browseTo(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="input-hint" aria-hidden="true">
          <span>DRAG</span>
          <i />
          <span>SCROLL</span>
          <i />
          <span>ARROW KEYS</span>
        </div>
      </nav>

      <div className="loading-screen" aria-hidden={ready}>
        <div className="loading-screen__mark">
          <span />
          <span />
          <span />
        </div>
        <p>Assembling {books.length} volumes</p>
      </div>

      <p className="independent-note">{siteConfig.independentNote}</p>

      <div className="sr-only" aria-live="polite">
        {isFocused
          ? `Opening the ${activeBook.title} archive.`
          : `Selected ${activeBook.title}: ${activeBook.committeeName}.`}
      </div>
      </main>
      {archiveBook ? (
        <PublicArchive
          key={archiveBook.id}
          book={archiveBook}
          remote={loadArchivesOnDemand}
          onBackToShelf={() => {
            setArchiveBookId(null);
            engineRef.current?.returnToShelf();
          }}
        />
      ) : null}
    </div>
  );
}
