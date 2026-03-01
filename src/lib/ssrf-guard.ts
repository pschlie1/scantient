import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * SSRF guard utilities.
 *
 * isPrivateUrl resolves a URL's hostname and returns true if any resolved
 * address is private, loopback, or link-local. Use this before any outbound
 * fetch that accepts user-supplied URLs.
 */

export function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  // IPv4-mapped IPv6
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = v4mapped ? v4mapped[1] : ip;
  const parts = v4.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 127 || // 127.0.0.0/8
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) // 169.254.0.0/16 (link-local)
  );
}

/**
 * Returns true if the URL resolves to a private or internal IP address.
 * Invalid URLs and DNS failures are treated as private for safety.
 */
export async function isPrivateUrl(url: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true; // invalid URL treated as private
  }

  // Block localhost by name
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;

  // If it is already an IP literal, check directly
  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    return isPrivateIp(hostname);
  }

  // Resolve hostname and check all addresses
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.some((a) => isPrivateIp(a.address));
  } catch {
    return true; // DNS failure treated as private for safety
  }
}

/**
 * A fetch wrapper that follows HTTP redirects manually, re-running the SSRF
 * guard at every hop.  This closes the redirect-chain bypass where an initial
 * public URL could chain through an open redirect to reach a private/internal
 * address (e.g. 169.254.169.254 cloud metadata endpoints).
 *
 * Drop-in replacement for `fetch(url, { redirect: "follow", ... })`.
 * Throws an Error (not a Response) if:
 *   - any hop resolves to a private/internal address
 *   - the redirect chain exceeds maxRedirects hops
 */
export async function ssrfSafeFetch(
  url: string,
  options: Omit<RequestInit, "redirect"> & { signal?: AbortSignal },
  maxRedirects = 5,
): Promise<Response> {
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // SSRF check at EVERY hop — catches open-redirect chains
    if (await isPrivateUrl(current)) {
      throw new Error(`SSRF: blocked request to private/internal address at hop ${hop}: ${current}`);
    }

    const res = await fetch(current, {
      ...options,
      redirect: "manual", // never auto-follow; we control each step
    });

    // Not a redirect — return the real response
    if (res.status < 300 || res.status >= 400) {
      return res;
    }

    const location = res.headers.get("location");
    if (!location) {
      // Redirect with no Location header — return as-is
      return res;
    }

    // Resolve relative redirects against current URL
    try {
      current = new URL(location, current).toString();
    } catch {
      throw new Error(`SSRF: malformed redirect Location header: ${location}`);
    }
  }

  throw new Error(`SSRF: too many redirects (max ${maxRedirects}) for URL: ${url}`);
}
