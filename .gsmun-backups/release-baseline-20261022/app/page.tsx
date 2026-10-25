import { ProgressLibrary } from "./ProgressLibrary";
import { getPublishedBooks } from "./public-content";
import { databaseContentEnabled } from "../lib/supabase/config";
import { ContentState } from "./ContentState";

export const dynamic = "force-dynamic";

export default async function Home() {
  let books;
  let database = false;
  try {
    books = await getPublishedBooks();
    database = databaseContentEnabled();
  } catch {
    books = null;
  }
  if (!books) return <ContentState><p>The archive is temporarily unavailable. Please try again shortly.</p></ContentState>;
  if (!books.length) return <ContentState><p>No volumes have been published yet.</p></ContentState>;
  return <ProgressLibrary books={books} loadArchivesOnDemand={database} />;
}
