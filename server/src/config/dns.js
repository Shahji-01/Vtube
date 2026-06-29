import net from "net";
import dns from "dns";

/**
 * Parse a raw `DNS_SERVERS` string into a list of syntactically valid IP
 * addresses. Pure function: no side effects, safe to test in isolation.
 *
 * Rules:
 * - If `raw` is not a non-empty string, returns `{ valid: [], ignored: 0 }`.
 * - Splits on commas, trims each entry, drops empty entries.
 * - Keeps only entries where Node's `net.isIP(entry) !== 0` (IPv4 or IPv6).
 * - Preserves the original relative order and caps `valid` at 10 entries.
 * - `ignored` is the count of non-empty entries that are not valid IPs.
 *
 * @param {string} raw - The raw comma-separated DNS servers string.
 * @returns {{ valid: string[], ignored: number }}
 */
export function parseDnsServers(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { valid: [], ignored: 0 };
  }

  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const validParts = parts.filter((p) => net.isIP(p) !== 0);
  const ignored = parts.length - validParts.length;
  const valid = validParts.slice(0, 10);

  return { valid, ignored };
}

/**
 * Configure Node's DNS resolver from a raw `DNS_SERVERS` string.
 *
 * - When there are no valid IPs, leaves the default resolver unchanged. A
 *   warning is logged only when `raw` was a non-empty value (the warning never
 *   includes the raw value itself).
 * - When some entries were ignored, logs a warning reporting the ignored count.
 * - Otherwise applies the valid IPs via `dnsModule.setServers(valid)`.
 *
 * The `dnsModule` and `logger` are injectable for testability.
 *
 * @param {string} raw - The raw comma-separated DNS servers string.
 * @param {{ setServers: (servers: string[]) => void }} [dnsModule=dns]
 * @param {{ warn: (msg: string) => void }} [logger=console]
 */
export function configureDns(raw, dnsModule = dns, logger = console) {
  const { valid, ignored } = parseDnsServers(raw);

  if (valid.length === 0) {
    if (typeof raw === "string" && raw.trim() !== "") {
      logger.warn("DNS_SERVERS contained no valid IPs; using defaults");
    }
    return;
  }

  if (ignored > 0) {
    logger.warn(
      `DNS_SERVERS: ignored ${ignored} invalid entr${ignored === 1 ? "y" : "ies"}`
    );
  }

  dnsModule.setServers(valid);
}
