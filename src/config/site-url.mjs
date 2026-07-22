export function normalizeSiteUrl(
  rawValue,
  { production = false, allowLoopback = false } = {},
) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a non-empty absolute URL.");
  }

  let parsed;
  try {
    parsed = new URL(rawValue.trim());
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("NEXT_PUBLIC_SITE_URL must not contain credentials.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must contain only an origin.");
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const isLoopback =
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost");
  if (production && isLoopback && !allowLoopback) {
    throw new Error("NEXT_PUBLIC_SITE_URL must not use loopback in production.");
  }
  if (
    production &&
    parsed.protocol !== "https:" &&
    !(allowLoopback && isLoopback)
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production.");
  }

  return parsed.origin;
}
