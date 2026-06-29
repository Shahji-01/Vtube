/**
 * Feature: phase-2-quality-hardening, Property 10
 *
 * Property 10: DNS parser only ever applies syntactically valid IPs.
 * Validates: Requirements 1.1, 1.4
 *
 * For arbitrary comma-separated strings mixing valid IPv4/IPv6 addresses,
 * invalid tokens, and whitespace, `parseDnsServers`:
 *   - returns only entries for which net.isIP !== 0,
 *   - returns them trimmed,
 *   - preserves their original relative order,
 *   - caps the result at 10 entries,
 *   - reports `ignored` equal to the count of non-empty invalid entries.
 * Pure function — no real network/DNS I/O.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import net from "net";

import { parseDnsServers } from "../../config/dns.js";

// Valid IP tokens.
const validIpArb = fc.oneof(fc.ipV4(), fc.ipV6());

// Non-empty tokens that are NOT valid IPs.
const invalidTokenArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => s.replace(/,/g, "")) // commas would split into separate tokens
  .filter((s) => s.trim() !== "" && net.isIP(s.trim()) === 0);

// Pad a token with arbitrary surrounding whitespace (still the same logical entry).
const padded = (tokenArb) =>
  fc.tuple(fc.stringMatching(/^[ \t]*$/), tokenArb, fc.stringMatching(/^[ \t]*$/)).map(
    ([l, t, r]) => `${l}${t}${r}`,
  );

// Tokens that collapse to empty after trimming (extra commas / whitespace).
const emptyTokenArb = fc.stringMatching(/^[ \t]*$/);

const tokenArb = fc.oneof(
  { weight: 4, arbitrary: padded(validIpArb) },
  { weight: 3, arbitrary: padded(invalidTokenArb) },
  { weight: 1, arbitrary: emptyTokenArb },
);

describe("Property 10: DNS parser only ever applies syntactically valid IPs", () => {
  it("returns trimmed, order-preserving, valid-only IPs capped at 10 with correct ignored count", () => {
    fc.assert(
      fc.property(fc.array(tokenArb, { maxLength: 25 }), (tokens) => {
        const raw = tokens.join(",");
        const { valid, ignored } = parseDnsServers(raw);

        // Independently derive the expected non-empty trimmed parts.
        const parts = raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const validParts = parts.filter((p) => net.isIP(p) !== 0);

        // Cap at 10.
        expect(valid.length).toBeLessThanOrEqual(10);

        // Every returned entry is a syntactically valid, already-trimmed IP.
        for (const v of valid) {
          expect(net.isIP(v)).not.toBe(0);
          expect(v).toBe(v.trim());
        }

        // Valid-only and order-preserving: result equals the first 10 valid parts.
        expect(valid).toEqual(validParts.slice(0, 10));

        // ignored counts every non-empty entry that is not a valid IP.
        expect(ignored).toBe(parts.length - validParts.length);
      }),
      { numRuns: 200 },
    );
  });

  it("blank / non-string input yields empty result with zero ignored", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.stringMatching(/^[ \t]*$/), fc.constant(undefined), fc.constant(null), fc.integer()),
        (raw) => {
          const { valid, ignored } = parseDnsServers(raw);
          expect(valid).toEqual([]);
          expect(ignored).toBe(0);
        },
      ),
      { numRuns: 150 },
    );
  });
});
