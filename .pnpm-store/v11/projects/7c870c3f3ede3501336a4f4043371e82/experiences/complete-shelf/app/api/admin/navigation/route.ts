import {NextResponse} from "next/server";
import {z} from "zod";
import {requireAdmin} from "../../../../lib/supabase/server";
import {assertSameOrigin} from "../../../../lib/cms/model";
import {readJson,adminError} from "../../../../lib/cms/http";
import {adminNavigation,saveNavigation} from "../../../../lib/cms/navigation-service";
const headers={"Cache-Control":"private, no-store"};
export async function GET(){try{const {db}=await requireAdmin();return NextResponse.json(await adminNavigation(db),{headers});}catch(error){return adminError(error);}}
export async function POST(request:Request){try{assertSameOrigin(request);const {db}=await requireAdmin();const input=z.object({action:z.enum(["draft","publish"]),version:z.number().int().min(0),config:z.unknown()}).parse(await readJson(request,262144));return NextResponse.json(await saveNavigation(db,input),{headers});}catch(error){return adminError(error);}}
