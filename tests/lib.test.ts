import { describe, expect, it } from "vitest";
import { base64url, challengeFor, safeReturnTo } from "../src/lib/auth";
import { readConfig } from "../src/lib/config";
import { bidsText, formatMoney, formatRemaining, isEndingSoon } from "../src/lib/format";
import { createEventParser } from "../src/lib/live";
import { newId } from "../src/lib/api";

describe("format", () => {
  it("shows whole amounts without decimals and others with two, in the house's currency", () => {
    const plain = (text: string) => text.replace(/\s/g, " ");
    expect(plain(formatMoney(18500, "SEK", "en-GB"))).toBe("SEK 18,500");
    expect(plain(formatMoney(1250.5, "EUR", "en-GB"))).toBe("EUR 1,250.50");
    expect(formatMoney(null, "SEK")).toBe("—");
  });

  it("counts down in days, hours, minutes, then minutes and seconds", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
    expect(formatRemaining(at(2 * 86400 + 4 * 3600), now)).toBe("2 d 4 h");
    expect(formatRemaining(at(3 * 3600 + 12 * 60), now)).toBe("3 h 12 min");
    expect(formatRemaining(at(11 * 60), now)).toBe("11 min");
    expect(formatRemaining(at(118), now)).toBe("1:58");
    expect(formatRemaining(at(-1), now)).toBe("Ended");
    expect(isEndingSoon(at(59 * 60), now)).toBe(true);
    expect(isEndingSoon(at(61 * 60), now)).toBe(false);
  });

  it("says how many bids", () => {
    expect(bidsText(0)).toBe("No bids yet");
    expect(bidsText(1)).toBe("1 bid");
    expect(bidsText(21)).toBe("21 bids");
  });
});

describe("live events", () => {
  it("parses events split across chunks and skips comments", () => {
    const parse = createEventParser();
    expect(parse("retry: 3000\n: connected\n\n")).toEqual([{ event: "message", data: "", retry: 3000 }]);
    expect(parse(": keep-alive\n\nid: 1\nevent: lot\ndata: {\"lotId\":")).toEqual([]);
    expect(parse("\"a\"}\n\n")).toEqual([{ event: "lot", data: "{\"lotId\":\"a\"}", id: "1" }]);
    expect(parse("event: lot\r\ndata: x\r\n\r\n")).toEqual([{ event: "lot", data: "x" }]);
  });
});

describe("sign-in helpers", () => {
  it("returns only to paths on this site", () => {
    expect(safeReturnTo("/lots/1?x=2")).toBe("/lots/1?x=2");
    expect(safeReturnTo("//evil.example/")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example/")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
  });

  it("makes the PKCE challenge of RFC 7636's example", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(base64url(new Uint8Array([251, 255]))).toBe("-_8");
  });
});

describe("config", () => {
  it("needs the four settings and trims trailing slashes", () => {
    expect(readConfig({ authority: "https://id.example/realms/acme/", clientId: "headless", api: "https://api.example/api/v1/", tenant: "acme" })).toEqual({
      authority: "https://id.example/realms/acme",
      clientId: "headless",
      api: "https://api.example/api/v1",
      tenant: "acme",
      termsUrl: null,
    });
    expect(() => readConfig({ authority: "x", clientId: "headless" })).toThrow(/api, tenant/);
    expect(() => readConfig(undefined)).toThrow(/missing/);
  });

  it("can take the house from the host name, for one configuration serving many houses", () => {
    const shared = { authority: "https://id.example/realms/{tenant}", clientId: "headless", api: "https://api.example/api/v1", tenantFromHost: "auction.example" };
    expect(readConfig(shared, "acme.auction.example")).toMatchObject({ tenant: "acme", authority: "https://id.example/realms/acme" });
    expect(() => readConfig(shared, "auction.example")).toThrow(/tenant/);
    expect(() => readConfig(shared, "x.y.auction.example")).toThrow(/tenant/);
  });
});

describe("ids", () => {
  it("makes version 7 UUIDs that sort by time", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
