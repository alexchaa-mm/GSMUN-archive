export const dynamic="force-dynamic";
export default function AdminLayout({children}:{children:React.ReactNode}) {
  // Preview deliberately sits outside the admin styles so it uses the exact
  // public renderer and typography.
  return <>{children}</>;
}
