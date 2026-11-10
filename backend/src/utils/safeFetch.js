/**
 * Guards for fetching a URL that came from outside (a feed item, a redirect).
 *
 * The server must only ever fetch public web pages. Without these checks a
 * link pointing at localhost, a private network address or the cloud metadata
 * service (169.254.169.254) would be fetched from inside the host's network
 * and its contents summarised back to the reader.
 *
 * Two layers, because a hostname can be an address or resolve to one:
 *  - isPublicHttpUrl / assertPublicRedirect reject bad schemes and private
 *    address literals, for the first URL and for every redirect.
 *  - publicOnlyAgents resolve names through guardedLookup, which refuses a
 *    name that resolves to a private address. The check runs on the address
 *    the socket actually connects to, so a DNS answer cannot change between
 *    check and use.
 */

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const privateRanges = new net.BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  privateRanges.addSubnet(prefix, bits, "ipv4");
}
for (const [prefix, bits] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  privateRanges.addSubnet(prefix, bits, "ipv6");
}

/** True for loopback, private, link-local and other non-public addresses. */
export const isPrivateAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) return privateRanges.check(address, "ipv4");
  if (family === 6) {
    // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as IPv4.
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return privateRanges.check(mapped[1], "ipv4");
    return privateRanges.check(address, "ipv6") || address.toLowerCase().startsWith("::ffff:");
  }
  return true;
};

const isBlockedHostname = (hostname) => {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  return net.isIP(host) ? isPrivateAddress(host) : false;
};

/** True for an http(s) URL whose host is not obviously private. */
export const isPublicHttpUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  return !isBlockedHostname(url.hostname);
};

/** axios `beforeRedirect` hook: stop a redirect that leaves the public web. */
export const assertPublicRedirect = (options) => {
  if (!/^https?:$/.test(options.protocol || "") || isBlockedHostname(options.hostname)) {
    throw new Error("Redirect to a non-public address was blocked");
  }
};

/** dns.lookup that fails when the name resolves to a private address. */
const guardedLookup = (hostname, options, callback) => {
  const done = typeof options === "function" ? options : callback;
  const lookupOptions = typeof options === "function" ? {} : options;
  dns.lookup(hostname, lookupOptions, (error, address, family) => {
    if (error) return done(error);
    const addresses = Array.isArray(address) ? address.map((entry) => entry.address) : [address];
    if (!addresses.length || addresses.some(isPrivateAddress)) {
      return done(new Error(`${hostname} resolves to a non-public address`));
    }
    return done(null, address, family);
  });
};

/** Agents for axios (`httpAgent` / `httpsAgent`) that only reach public hosts. */
export const publicOnlyAgents = {
  httpAgent: new http.Agent({ lookup: guardedLookup }),
  httpsAgent: new https.Agent({ lookup: guardedLookup }),
};
