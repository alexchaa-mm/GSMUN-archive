import { catalog } from "./catalog";
import { createBookContentProvider } from "./content-provider";

// Keep the historical catalogue/import snapshot intact, never its demo photos.
const localBookContent = createBookContentProvider(() => catalog.map(book => ({
  ...book, sections: book.sections.map(section => ({ ...section, photos: [] })),
})));

export function getPublishedBooks() {
  return localBookContent.getPublishedBooks();
}
