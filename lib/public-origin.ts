function parseOrigin(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function isBlockedHost(hostname: string) {
  return hostname === "0.0.0.0" || hostname === "[::]" || hostname === "::";
}

export function isUsablePublicOrigin(origin?: string | null) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  try {
    const { hostname } = new URL(parsed);
    return !isBlockedHost(hostname);
  } catch {
    return false;
  }
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

export function resolvePublicOrigin(request: Request, clientOrigin?: string | null) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && isUsablePublicOrigin(configured)) {
    return configured!;
  }

  const candidates = [
    clientOrigin,
    originFromHeaders(request),
    parseOrigin(new URL(request.url).origin),
    configured,
  ];

  for (const candidate of candidates) {
    if (isUsablePublicOrigin(candidate)) return candidate!;
  }

  return configured && isUsablePublicOrigin(configured) ? configured : "http://localhost:3000";
}
