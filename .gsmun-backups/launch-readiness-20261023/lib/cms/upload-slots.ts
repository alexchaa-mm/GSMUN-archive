// Bound decode memory per Node process as well as per browser. This is not a
// distributed rate limiter; Supabase/provider limits still apply independently.
let active = 0;
export function reserveUploadSlot() {
  if (active >= 2) return null;
  active++;
  let released = false;
  return () => { if (!released) { released = true; active--; } };
}
