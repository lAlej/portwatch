// Decides whether a browser request's `Origin` may talk to this backend.
// Browsers always attach `Origin` to WebSocket handshakes and cross-site
// requests; non-browser clients (curl, health probes) omit it and still have
// to present the auth cookie, so a missing Origin is let through.
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
