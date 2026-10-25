import { ArchiveRouter } from "./ArchiveRouter";
import { getPublishedBooks } from "./public-content";
import { databaseContentEnabled } from "../lib/supabase/config";
import { ContentState } from "./ContentState";

export const dynamic = "force-dynamic";

export default async function Home({searchParams}:{searchParams:Promise<Record<string,string | string[] | undefined>>}) {
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
  const query=await searchParams;
  return <ArchiveRouter books={books} remote={database} initialBook={typeof query.book === "string" ? query.book : undefined} />;
}
