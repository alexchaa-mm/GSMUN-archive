import "server-only";
import { databaseContentEnabled } from "../lib/supabase/config";
import { getDatabasePublishedBooks } from "../lib/cms/content";
import { getPublishedBooks as getLocalBooks } from "./local-content";
import { createBookContentProvider } from "./content-provider";

export async function getPublishedBooks() {
  return createBookContentProvider(databaseContentEnabled() ? getDatabasePublishedBooks : getLocalBooks).getPublishedBooks();
}
