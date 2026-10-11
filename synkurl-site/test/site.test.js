// Checks on the pages themselves: same header and footer everywhere, titles,
// the privacy version, and words that must never appear.
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CONSENT_VERSION } from "../src/waitlist.js";

import { INDEXED, PAGES, UTILITY } from "./pages.js";

async function html(path) {
  const res = await exports.default.fetch(`https://synkurl.com${path}`);
  return res.text();
}
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)) + end.length);

describe("every page", () => {
  it("has the same header and footer", async () => {
    const footers = new Set();
    for (const path of PAGES) {
      const page = await html(path);
      const header = between(page, '<header class="site-head', "</header>");
      expect(header, path).toContain('href="/for-families"');
      expect(header, path).toContain('href="/faq"');
      expect(header, path).not.toContain('href="/investors"');
      const footer = between(page, '<footer class="site-foot', "</footer>");
      expect(footer, path).toContain('href="/privacy"');
      expect(footer, path).toContain('href="/faq"');
      expect(footer, path).toContain('>Investors</a>');
      expect(footer, path).toContain('href="mailto:synkurl@synkurl.com"');
      footers.add(footer);
    }
    expect(footers.size).toBe(1);
  });

  it("has its own title and description", async () => {
    const titles = new Set();
    const descriptions = new Set();
    for (const path of PAGES) {
      const page = await html(path);
      titles.add(page.match(/<title>(.*?)<\/title>/)[1]);
      descriptions.add(page.match(/<meta name="description" content="(.*?)">/)[1]);
      expect(page, path).toMatch(/property="og:image" content="https:\/\/synkurl\.com\/[^"]+\.(png|jpg)"/);
      expect(page, path).toContain('name="twitter:card"');
    }
    expect(titles.size).toBe(PAGES.length);
    expect(descriptions.size).toBe(PAGES.length);
  });

  it("search pages have a canonical URL and are in the sitemap; utility pages are noindex", async () => {
    const sitemap = await html("/sitemap.xml");
    for (const path of INDEXED) {
      const url = `https://synkurl.com${path}`;
      expect(await html(path)).toContain(`<link rel="canonical" href="${url}">`);
      expect(sitemap).toContain(`<loc>${url}</loc>`);
    }
    for (const path of UTILITY) expect(await html(path), path).toContain('<meta name="robots" content="noindex">');
  });

  it("never uses the old hello@ address", async () => {
    for (const path of PAGES) expect(await html(path), path).not.toContain("hello@synkurl.com");
  });
});

describe("the privacy notice", () => {
  it("shows the same version as CONSENT_VERSION in the code", async () => {
    expect(await html("/privacy")).toContain(`<span id="consent-version">${CONSENT_VERSION}</span>`);
  });
});

describe("the waitlist page", () => {
  it("has the 18+ box, the consent box and a message for when JavaScript is off", async () => {
    const page = await html("/join");
    expect(page).toContain('name="is_adult"');
    expect(page).toContain('name="consent"');
    expect(page).toContain("<noscript>");
    expect(page).toContain('name="lang" value="en"');
  });

  it("keeps every question the privacy notice lists, with the answers the waitlist accepts", async () => {
    const page = await html("/join");
    for (const name of ["email", "phone_type", "city", "family_size", "device_pick"]) expect(page, name).toContain(`name="${name}"`);
    for (const pick of ["arch", "album", "pebble", "not-sure"]) expect(page).toContain(`name="device_pick" value="${pick}"`);
  });
});

describe("the investors page", () => {
  it("is a contact page, not an offer", async () => {
    // The whole page, meta descriptions and alt text included. Only the drawings are
    // left out: their SVG code says stroke-linecap="round".
    const page = (await html("/investors")).replace(/<svg[\s\S]*?<\/svg>/g, " ").toLowerCase();
    expect(page).toContain("get in touch");
    expect(page).toContain("we'd love to talk");
    for (const word of ["share", "round", "valuation", "returns", "invest now", "opportunit"]) {
      expect(page, word).not.toContain(word);
    }
  });
});

describe("the confirm and remove pages", () => {
  it("use a POST button, so opening the link alone does nothing", async () => {
    for (const path of ["/confirm", "/remove"]) {
      const page = await html(path);
      expect(page).toContain('<form method="post">');
      expect(page).toContain('type="submit"');
    }
  });
});
