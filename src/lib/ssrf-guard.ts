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
