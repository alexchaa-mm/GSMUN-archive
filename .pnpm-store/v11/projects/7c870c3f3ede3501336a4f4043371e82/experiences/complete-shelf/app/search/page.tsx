import {redirect} from "next/navigation";
// Old search links return to the archive; management search stays in admin.
export default function SearchPage(){redirect("/");}
