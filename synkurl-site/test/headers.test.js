// Tests for the security headers on every kind of response.
import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CSP, HSTS, SECURITY_HEADERS } from "../src/http.js";
import { call } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

const site = (path, host = "synkurl.com") => exports.default.fetch(`https://${host}${path}`, { redirect: "manual" });

function expectSecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(res.headers.get(name), name).toBe(value);
  }
}

describe("security headers", () => {
  it.each(["/", "/faq", "/for-families", "/join", "/privacy", "/styles.css", "/join.js", "/art/family-full-phone.svg", "/no-such-page"])(
    "static file %s has every header (from public/_headers)",
    async (path) => {
      const res = await site(path);
      expectSecurityHeaders(res);
    }
  );

  it("answers made by the Worker have the same headers", async () => {
    expectSecurityHeaders(await call("/api/join"));
    expectSecurityHeaders(await call("/confirm?token=x", { method: "POST" }));
    expectSecurityHeaders(await site("/confirm?token=x"));
  });

  it("the page only allows scripts from the site, Turnstile and Cloudflare Web Analytics", () => {
    const scriptSrc = CSP.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBe("script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).not.toContain("unsafe-eval");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("HSTS is sent on synkurl.com and www, without preload", async () => {
    for (const host of ["synkurl.com", "www.synkurl.com"]) {
      expect((await site("/", host)).headers.get("Strict-Transport-Security")).toBe(HSTS);
      expect((await call("/api/join", { host })).headers.get("Strict-Transport-Security")).toBe(HSTS);
    }
    expect(HSTS).not.toContain("preload");
  });

  it("HSTS is not sent on the workers.dev address or localhost", async () => {
    for (const host of ["synkurl-site.example.workers.dev", "localhost"]) {
      expect((await site("/", host)).headers.get("Strict-Transport-Security")).toBeNull();
      expect((await call("/api/join", { host })).headers.get("Strict-Transport-Security")).toBeNull();
    }
  });

  it("the _headers file itself is not published", async () => {
    expect((await site("/_headers")).status).toBe(404);
  });
});
