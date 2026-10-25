/** Safe, deliberately authored messages only. Never serialize a provider error. */
export class CmsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function loginFailure(error: { code?: string; status?: number }) {
  if (error.code === "email_not_confirmed") return new CmsError(
    "This account's email is not confirmed. Complete the existing Supabase email-confirmation flow. Your account and administrator membership have not been changed.", 401);
  if (error.status === 429) return new CmsError("Too many login attempts. Wait before trying again.", 429);
  if (error.status === 0 || (error.status ?? 0) >= 500 || error.code === "unexpected_failure") return new CmsError("Authentication is temporarily unavailable. Try again shortly.", 503);
  return new CmsError("Login failed. Check your details and try again.", 401);
}
