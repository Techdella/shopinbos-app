// Server-side fetches of URLs a seller, partner or shopper typed (product photo URLs, partner webhooks) must
// never reach our own network or the cloud metadata service. These checks run on the *resolved* addresses,
// so a public-looking hostname that points at 127.0.0.1 or 169.254.169.254 is refused too. Pure (node:net
// only) so tests can import it; the DNS lookup lives in safe-fetch.server.ts.
import { isIP } from "node:net";

function ipv4Parts(ip: string) {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function privateIpv4(ip: string) {
  const p = ipv4Parts(ip);
  if (!p) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) || // IETF protocol assignments (192.0.0.0/24) and TEST-NET-1 (192.0.2.0/24)
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51) || (a === 203 && b === 0) || // TEST-NET-2/3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** True for loopback, private, link-local, metadata, multicast and other non-public addresses (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.trim().replace(/^\[|\]$/g, "").split("%")[0]!.toLowerCase();
  const family = isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family !== 6) return true;
  if (address === "::" || address === "::1") return true;
  // IPv4-mapped / translated forms (::ffff:127.0.0.1, ::ffff:7f00:1, 64:ff9b::a.b.c.d).
  const mapped = /^(?:::ffff:(?:0:)?|64:ff9b::)(.+)$/.exec(address);
  if (mapped) {
    const tail = mapped[1]!;
    if (isIP(tail) === 4) return privateIpv4(tail);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
    if (hex) {
      const high = parseInt(hex[1]!, 16);
      const low = parseInt(hex[2]!, 16);
      return privateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return true;
  }
  const first = parseInt(address.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x2001 && parseInt(address.split(":")[1] || "0", 16) === 0xdb8 // documentation
  );
}

/** The parts of a URL check that need no DNS: http(s) only, no credentials, no internal-looking names. */
export function urlShapeProblem(value: string, opts: { httpsOnly?: boolean } = {}): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "not a URL";
  }
  if (url.protocol !== "https:" && (opts.httpsOnly || url.protocol !== "http:")) return "scheme not allowed";
  if (url.username || url.password) return "credentials in URL";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return "no host";
  if (isIP(host)) return isPrivateAddress(host) ? "private address" : null;
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host) || !host.includes(".")) return "internal host name";
  return null;
}
