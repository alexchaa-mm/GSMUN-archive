import type { PublicBook } from "./catalog";

export type BookContentSource = () =>
  | readonly PublicBook[]
  | Promise<readonly PublicBook[]>;

export function createBookContentProvider(loadBooks: BookContentSource) {
  return {
    async getPublishedBooks(): Promise<PublicBook[]> {
      const books = await loadBooks();

      return books
        .filter((book) => book.status === "published")
        .sort((left, right) => left.sortOrder - right.sortOrder);
    },
  };
}
