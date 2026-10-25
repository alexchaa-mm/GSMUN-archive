import {getPublishedBooks} from "../public-content";
import {ArchiveSearch} from "../ArchiveSearch";
import {ContentState} from "../ContentState";
import Link from "next/link";
export const dynamic="force-dynamic";
export default async function SearchPage(){let books;try{books=await getPublishedBooks();}catch{books=null;}return books ? <ArchiveSearch books={books}/> : <ContentState><p>Archive search is temporarily unavailable.</p><Link href="/">Back to archive</Link></ContentState>;}
