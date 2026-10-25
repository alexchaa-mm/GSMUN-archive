import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "../../../../lib/supabase/server";
import { getDatabaseBook } from "../../../../lib/cms/content";
import { contentId } from "../../../../lib/cms/model";
import { ProgressLibrary } from "../../../ProgressLibrary";
import styles from "../../admin.module.css";
export default async function Preview({params}:{params:Promise<{id:string}>}) {
  const context=await requireAdmin().catch(()=>null);
  if(!context) redirect("/admin/login/");
  const parsed=contentId.safeParse((await params).id);if(!parsed.success) notFound();
  const book=await getDatabaseBook(parsed.data,context.db,true);if(!book) notFound();
  return <><ProgressLibrary books={[book]} /><div className={styles.previewBar}>Private preview · {book.status} · <a href="/admin/">Back to admin</a></div></>;
}
