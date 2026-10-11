// The six concept-design pages, their photos and the gallery's rules.
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { clampOffset, colourFromSearch, fileWidth, fitSize, indexAfterSwitch, stepIndex, zoomAround, zoomLimit } from "../public/gallery-state.js";
import { MODEL_IDS, visibleText } from "./pages.js";

const FINISHES = ["blush-pink", "matte-black", "dusk-violet", "rose-gold"];
const FINISH_NAMES = ["Blush Pink", "Matte Black", "Dusk Violet / Purple", "Rose Gold"];

const get = (path) => exports.default.fetch(`https://synkurl.com${path}`, { redirect: "manual" });
const html = async (path) => (await get(path)).text();
const manifest = async () => (await get("/models/manifest.json")).json();
const modelData = (page) => JSON.parse(page.match(/<script type="application\/json" id="model-data">([\s\S]*?)<\/script>/)[1]);

describe("model pages are real pages", () => {
  it.each(MODEL_IDS)("/models/%s/ loads fresh, and the address without the last slash leads to it", async (id) => {
    const res = await get(`/models/${id}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const bare = await get(`/models/${id}`);
    expect([301, 302, 307, 308]).toContain(bare.status);
    expect(new URL(bare.headers.get("location"), "https://synkurl.com").pathname).toBe(`/models/${id}/`);
  });

  it("a colour in the address still loads the same page (the gallery reads it)", async () => {
    for (const f of [...FINISHES, "not-a-colour"]) {
      expect((await get(`/models/arch/?colour=${f}`)).status).toBe(200);
    }
  });

  it("an unknown model is a normal 'not found' page", async () => {
    const res = await get("/models/tower/");
    expect(res.status).toBe(404);
  });

  it("the models index links to all six", async () => {
    const page = await html("/models/");
    for (const id of MODEL_IDS) expect(page).toContain(`href="/models/${id}/"`);
  });
});

describe("each model page", () => {
  it.each(MODEL_IDS)("%s: four named finishes, the selected name, thumbnails, full-size viewer, rooms, close-up, other designs and the waitlist", async (id) => {
    const page = await html(`/models/${id}/`);
    for (const name of FINISH_NAMES) expect(page).toContain(`<span class="swatch-name">${name}</span>`);
    expect(page).toContain("data-finish-name");
    expect(page).toMatch(/class="thumb" href="\/media\//);
    expect(page).toContain("<dialog class=\"lightbox\"");
    expect(page).toContain("editorial-lifestyle");
    expect(page).toContain("editorial-detail");
    for (const other of MODEL_IDS.filter((o) => o !== id)) expect(page).toContain(`href="/models/${other}/"`);
    expect(page).toContain(`href="/join?model=${id}&amp;colour=`);
    expect(page).toContain("The final Synkurl device will look different.");
  });

  it.each(MODEL_IDS)("%s: works without JavaScript (swatches link to each finish, thumbnails open the full image)", async (id) => {
    const page = await html(`/models/${id}/`);
    for (const f of FINISHES) {
      expect(page).toContain(`href="#finish-${f}"`);
      expect(page).toContain(`id="finish-${f}"`);
    }
    expect(page).toMatch(/<a class="stage-link" href="\/media\/[^"]+\.webp"/);
  });

  it.each(MODEL_IDS)("%s: a link to another finish hides the built-in photo before the first paint", async (id) => {
    const page = await html(`/models/${id}/`);
    const head = page.slice(0, page.indexOf("</head>"));
    const tag = head.match(/<script src="\/colour-first\.js"([^>]*)><\/script>/);
    expect(tag, "colour-first.js in <head>").not.toBeNull();
    const attr = (name) => tag[1].match(new RegExp(`data-${name}="([^"]*)"`))?.[1];
    expect(attr("default")).toBe(modelData(page).default);
    expect(attr("finishes")).toBe(FINISHES.join(" "));
    expect(attr("sizes")).toBeTruthy();
    for (const f of FINISHES) {
      // Each finish's first photo, to start loading early: only files of that finish.
      const set = attr(`hero-${f}`);
      expect(set, f).toBeTruthy();
      expect(set.split(", ").every((entry) => entry.includes(`-${f}-`) && entry.endsWith("w")), f).toBe(true);
    }
    expect(page).toContain('<span class="stage-layer is-current" data-built>');
  });

  it.each(MODEL_IDS)("%s: lifestyle and close-up captions name the finish the photo really shows", async (id) => {
    const page = await html(`/models/${id}/`);
    const data = modelData(page);
    for (const role of ["lifestyle", "detail"]) {
      const section = page.slice(page.indexOf(`editorial-${role}`));
      const finish = section.match(new RegExp(`/media/${id}/${role}-([a-z-]+)-\\d+\\.`))[1];
      expect(FINISHES).toContain(finish);
      expect(section.slice(0, section.indexOf("</figure>"))).toContain(`Shown in ${data.finishes[finish].name}`);
    }
  });
});

describe("photos and the public manifest", () => {
  it("every finish of every model has at least one photo, and only photos of that finish", async () => {
    const m = await manifest();
    expect(Object.keys(m.models)).toEqual(MODEL_IDS);
    for (const [id, model] of Object.entries(m.models)) {
      expect(Object.keys(model.finishes)).toEqual(FINISHES);
      for (const [fid, f] of Object.entries(model.finishes)) {
        expect(f.gallery.length, `${id}/${fid}`).toBeGreaterThan(0);
        for (const img of f.gallery) {
          expect(img.finish).toBe(fid);
          expect(img.src).toContain(`-${fid}-`);
          expect(img.avif.split(", ").every((s) => s.includes(`-${fid}-`))).toBe(true);
          expect(img.webp.split(", ").every((s) => s.includes(`-${fid}-`))).toBe(true);
          expect(img.alt.length).toBeGreaterThan(40);
          expect(img.width).toBeGreaterThan(0);
          expect(img.height).toBeGreaterThan(0);
        }
      }
    }
  });

  it("each model has a lifestyle and a close-up photo, each listed only under its real finish", async () => {
    const m = await manifest();
    for (const [id, model] of Object.entries(m.models)) {
      for (const role of ["lifestyle", "detail"]) {
        const holders = FINISHES.filter((f) => model.finishes[f].gallery.some((img) => img.role === role));
        expect(holders.length, `${id} ${role}`).toBeGreaterThanOrEqual(1);
        for (const f of holders) {
          const imgs = model.finishes[f].gallery.filter((img) => img.role === role);
          expect(imgs, `${id} ${role} ${f}`).toHaveLength(1);
          expect(imgs[0].src).toContain(`/${role}-${f}-`);
        }
      }
    }
  });

  it("Dome Rose Gold has no studio photo yet, so its gallery shows only the real Rose Gold room and close-up", async () => {
    const m = await manifest();
    const roles = m.models.dome.finishes["rose-gold"].gallery.map((img) => img.role);
    expect(roles).toEqual(["lifestyle", "detail"]);
  });

  it("keeps internal production notes out of the public manifest", async () => {
    const text = await (await get("/models/manifest.json")).text();
    for (const word of ["prompt", "sha256", "qa_notes", "proposed_dimensions", "source_generated", "/workspace", "mm"]) {
      expect(text, word).not.toContain(word);
    }
  });

  it("every image file the manifest names is published", async () => {
    const m = await manifest();
    const files = new Set();
    for (const model of Object.values(m.models)) {
      for (const f of Object.values(model.finishes)) {
        for (const img of f.gallery) {
          files.add(img.src);
          files.add(img.full);
          for (const set of [img.avif, img.webp]) set.split(", ").forEach((s) => files.add(s.split(" ")[0]));
        }
      }
    }
    expect(files.size).toBeGreaterThan(300);
    const list = [...files];
    const hidden = ["c2pa", "jumb", "Exif", "<x:xmpmeta", "OpenAI"];
    for (let i = 0; i < list.length; i += 25) {
      await Promise.all(list.slice(i, i + 25).map(async (file) => {
        const res = await get(file);
        expect(res.status, file).toBe(200);
        // No hidden data inside the photos (the originals carry the image
        // generator's content credentials; the web copies must not).
        const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
        for (const word of hidden) expect(text.includes(word), `${file} contains ${word}`).toBe(false);
      }));
    }
  }, 90000);

  it("every photo has a lossless full-size copy at its real size, for zooming", async () => {
    const m = await manifest();
    for (const model of Object.values(m.models)) {
      for (const [fid, f] of Object.entries(model.finishes)) {
        for (const img of f.gallery) {
          expect(img.full).toMatch(new RegExp(`^/media/[a-z-]+/(studio|lifestyle|detail)-${fid}-full\\.webp$`));
          const bytes = new Uint8Array(await (await get(img.full)).arrayBuffer());
          const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
          expect(ascii(0, 4) + ascii(8, 12), img.full).toBe("RIFFWEBP");
          // Lossless WebP ("VP8L") with nothing else in it, and the photo's real pixel size.
          expect(ascii(12, 16), img.full).toBe("VP8L");
          const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
          expect((bits & 0x3fff) + 1, img.full).toBe(img.width);
          expect(((bits >> 14) & 0x3fff) + 1, img.full).toBe(img.height);
          const chunkEnd = 20 + (bytes[16] | (bytes[17] << 8) | (bytes[18] << 16) | (bytes[19] << 24));
          expect(chunkEnd + (chunkEnd % 2), img.full).toBe(bytes.length);
        }
      }
    }
  }, 60000);

  it("the original PNG masters are not published", async () => {
    expect((await get("/media/arch/studio-rose-gold.png")).status).toBe(404);
    expect((await get("/design-masters/models/arch/studio-rose-gold.png")).status).toBe(404);
  });
});

describe("product copy on the new pages", () => {
  it("never mentions prices, sizes, storage, dates or buying", async () => {
    for (const path of ["/", "/models/", ...MODEL_IDS.map((id) => `/models/${id}/`)]) {
      const text = visibleText(await html(path)).toLowerCase();
      const banned = [/₹/, /\brs\.?\s?\d/, /\bprice/, /\d\s?(mm|cm|tb|gb)\b/, /\bcapacity\b/, /terabyte/, /buy now/, /order now/, /pre-order/, /in stock/, /available now/, /launch date/, /\bships\b/];
      for (const pattern of banned) expect(text, `${path}: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("says plainly that these are concept designs", async () => {
    for (const path of ["/", "/models/", ...MODEL_IDS.map((id) => `/models/${id}/`)]) {
      expect(visibleText(await html(path)), path).toMatch(/concept design/i);
    }
  });
});

describe("the homepage", () => {
  it("introduces all six designs, links each one, and offers every finish", async () => {
    const page = await html("/");
    const chapter = page.slice(page.indexOf('id="forms"'), page.indexOf('id="finishes"'));
    for (const id of MODEL_IDS) expect(chapter).toContain(`href="/models/${id}/"`);
    expect(chapter).toContain('href="#finishes"'); // a way to skip the chapter
    const finishes = page.slice(page.indexOf('id="finishes"'));
    for (const name of FINISH_NAMES) expect(finishes).toContain(name);
    for (const id of MODEL_IDS) expect(finishes).toContain(`href="/models/${id}/?colour=`);
  });

  it("only the hero photo is fetched early; the rest load lazily", async () => {
    const page = await html("/");
    expect(page.match(/fetchpriority="high"/g)).toHaveLength(2); // the preload and the hero <img>
    expect((page.match(/loading="lazy"/g) || []).length).toBeGreaterThan(15);
  });
});

describe("zoom rules (gallery-state.js)", () => {
  it("shows the photo as large as the space allows, never larger than its real pixels", () => {
    expect(fitSize({ w: 1536, h: 1024 }, { w: 390, h: 700 })).toEqual({ w: 390, h: 260 });
    expect(fitSize({ w: 1536, h: 1024 }, { w: 1400, h: 600 })).toEqual({ w: 900, h: 600 });
    expect(fitSize({ w: 1536, h: 1024 }, { w: 2400, h: 1300 })).toEqual({ w: 1536, h: 1024 });
  });

  it("zooms only while the photo stays sharp: 1 photo pixel per point, 2 on dense screens", () => {
    expect(zoomLimit(1536, 390, 3)).toBeCloseTo(1536 / 780); // phone: about 2x
    expect(zoomLimit(1536, 768, 1)).toBe(2); // standard screen
    expect(zoomLimit(1536, 1229, 1)).toBeCloseTo(1.25);
    expect(zoomLimit(1536, 1229, 2)).toBe(1); // a dense laptop screen already shows every pixel
    expect(zoomLimit(1536, 1536, 1)).toBe(1);
    expect(zoomLimit(3072, 390, 3)).toBeCloseTo(3.94); // bigger originals zoom further
  });

  it("never lets the zoomed photo be dragged off screen", () => {
    const size = { w: 400, h: 300 };
    const space = { w: 400, h: 500 };
    expect(clampOffset({ x: 999, y: 999 }, 2, size, space)).toEqual({ x: 200, y: 50 });
    expect(clampOffset({ x: -999, y: -999 }, 2, size, space)).toEqual({ x: -200, y: -50 });
    expect(clampOffset({ x: 30, y: 30 }, 1, size, space)).toEqual({ x: 0, y: 0 });
  });

  it("knows the real width of the copy on screen, so zoom never outruns it", () => {
    expect(fileWidth("https://synkurl.com/media/arch/studio-rose-gold-960.avif", 1536)).toBe(960);
    expect(fileWidth("/media/spine/lifestyle-blush-pink-768.webp", 1024)).toBe(768);
    expect(fileWidth("/media/arch/studio-rose-gold-960.jpg", 1536)).toBe(960);
    expect(fileWidth("/media/arch/studio-rose-gold-full.webp", 1536)).toBe(1536);
    expect(fileWidth("", 1536)).toBe(0);
    // A 960-wide copy shown 390 points wide on a 3x phone: only 1.23x until the lossless copy arrives.
    expect(zoomLimit(fileWidth("/m/a-960.avif", 1536), 390, 3)).toBeCloseTo(1.23);
  });

  it("keeps the point under the fingers in place while zooming", () => {
    const point = { x: 100, y: -40 };
    const offset = zoomAround(point, { x: 0, y: 0 }, 1, 2);
    // The photo point that was under `point` at scale 1 is still there at scale 2.
    expect({ x: offset.x + 2 * point.x, y: offset.y + 2 * point.y }).toEqual(point);
    expect(zoomAround({ x: 0, y: 0 }, { x: 0, y: 0 }, 1, 3)).toEqual({ x: 0, y: 0 });
  });
});

describe("gallery rules (gallery-state.js)", () => {
  const g = (...roles) => roles.map((role) => ({ role }));

  it("reads a known colour from the address and ignores anything else", () => {
    expect(colourFromSearch("?colour=rose-gold", FINISHES)).toBe("rose-gold");
    expect(colourFromSearch("?colour=Rose-Gold", FINISHES)).toBeNull();
    expect(colourFromSearch("?colour=", FINISHES)).toBeNull();
    expect(colourFromSearch("?colour=%3Cscript%3E", FINISHES)).toBeNull();
    expect(colourFromSearch("", FINISHES)).toBeNull();
    expect(colourFromSearch("?color=rose-gold", FINISHES)).toBeNull();
  });

  it("keeps the same kind of view when the new finish has it", () => {
    expect(indexAfterSwitch(g("studio", "lifestyle", "detail"), "detail")).toBe(2);
    expect(indexAfterSwitch(g("studio", "lifestyle", "detail"), "lifestyle")).toBe(1);
  });

  it("goes back to the studio view when it doesn't, or to the first view if there's no studio", () => {
    expect(indexAfterSwitch(g("studio"), "lifestyle")).toBe(0);
    expect(indexAfterSwitch(g("lifestyle", "detail"), "studio")).toBe(0);
    expect(indexAfterSwitch(g("lifestyle", "detail"), "detail")).toBe(1);
    expect(indexAfterSwitch(g("studio"), undefined)).toBe(0);
  });

  it("previous and next wrap around", () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
