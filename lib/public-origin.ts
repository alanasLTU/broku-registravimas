function parseOrigin(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function hostnameOf(origin: string) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isBlockedHost(hostname: string) {
  return hostname === "0.0.0.0" || hostname === "[::]" || hostname === "::";
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export function isUsablePublicOrigin(origin?: string | null) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  return !isBlockedHost(hostnameOf(parsed));
}

export function isShareablePublicOrigin(origin?: string | null) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  const hostname = hostnameOf(parsed);
  return Boolean(hostname) && !isBlockedHost(hostname) && !isLoopbackHost(hostname);
}

function originFromHeaders(request: Request) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")?.trim();
  if (!host) return null;

  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (isBlockedHost(hostname)) return null;

  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return parseOrigin(`${proto}://${host}`);
}

function vercelPlatformOrigin() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const deployment = process.env.VERCEL_URL?.trim();
  const host = (production || deployment)?.replace(/^https?:\/\//, "");
  return host ? parseOrigin(`https://${host}`) : null;
}

function configuredOrigin() {
  return parseOrigin(process.env.NEXT_PUBLIC_APP_URL);
}

export function resolvePublicOrigin(request: Request, clientOrigin?: string | null) {
  const candidates = [
    configuredOrigin(),
    parseOrigin(clientOrigin),
    originFromHeaders(request),
    parseOrigin(new URL(request.url).origin),
    vercelPlatformOrigin(),
  ];

  const shareable = candidates.find((candidate) => isShareablePublicOrigin(candidate));
  if (shareable) return shareable;

  const local = candidates.find((candidate) => isUsablePublicOrigin(candidate));
  return local ?? "http://localhost:3000";
}
