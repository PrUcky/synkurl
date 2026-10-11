// The six concept-design pages, their photos and the gallery's rules.
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { colourFromSearch, indexAfterSwitch, stepIndex } from "../public/gallery-state.js";
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
    for (let i = 0; i < list.length; i += 25) {
      await Promise.all(list.slice(i, i + 25).map(async (file) => {
        const res = await get(file);
        expect(res.status, file).toBe(200);
        await res.arrayBuffer();
      }));
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
