// Builds the photo-led pages from data/models.json and data/images.json:
//
//   public/models/manifest.json      the clean public list of product images
//   public/models/index.html         "Six concept designs"
//   public/models/<id>/index.html    one page per design (real static pages)
//   public/index.html                the homepage
//
// It also copies the shared header and footer into every other page in public/,
// so the whole site keeps one header and one footer.
//
//   node scripts/build-pages.mjs           write the files
//   node scripts/build-pages.mjs --check   change nothing; fail if a file is out of date
//                                          or the manifest points at a missing image
//
// No dependencies: plain Node.js.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const SITE = "https://synkurl.com";
const CHECK = process.argv.includes("--check");

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const DATA = JSON.parse(read("data/models.json"));
const IMAGES = JSON.parse(read("data/images.json")).images;
const APP_DEMO = read("scripts/partials/app-demo.html");

const FINISHES = DATA.finishes;
const FINISH = Object.fromEntries(FINISHES.map((f) => [f.id, f]));
const ROLE_NAME = { studio: "Studio view", lifestyle: "In a home", detail: "Close-up" };
const CONCEPT_NOTE = "Concept design. These images are design concepts, not photographs of a finished product. The final Synkurl device will look different.";

// ---------- Small helpers ----------

export const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const indent = (text, n) => text.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");
const srcset = (list) => list.map((x) => `${x.file} ${x.w}w`).join(", ");
const largest = (list) => list[list.length - 1].file;

// ---------- The public image manifest ----------

function imageRecord(model, entry) {
  const key = entry.role === "studio" ? `studio-${entry.finish}` : entry.role;
  const alt = model.images[key];
  if (!alt) throw new Error(`No alt text for ${model.id}/${key} in data/models.json`);
  return {
    id: `${model.id}-${entry.role}-${entry.finish}`,
    model: model.id,
    role: entry.role,
    finish: entry.finish,
    width: entry.width,
    height: entry.height,
    alt,
    src: entry.fallback,
    full: largest(entry.webp),
    avif: srcset(entry.avif),
    webp: srcset(entry.webp),
  };
}

const ROLE_ORDER = ["studio", "lifestyle", "detail"];

function buildModels() {
  return DATA.models.map((m, index) => {
    const records = (IMAGES[m.id] || []).map((e) => imageRecord(m, e));
    const finishes = {};
    for (const f of FINISHES) {
      // A finish's gallery holds ONLY images that really show that finish.
      const gallery = records
        .filter((r) => r.finish === f.id)
        .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
      finishes[f.id] = { name: f.name, gallery };
    }
    const byRole = (role) => records.find((r) => r.role === role);
    const studio = (fid) => finishes[fid].gallery.find((r) => r.role === "studio");
    return { ...m, index, url: `/models/${m.id}/`, finishes, lifestyleImg: byRole("lifestyle"), detailImg: byRole("detail"), studio };
  });
}

const MODELS = buildModels();

function publicManifest() {
  return {
    about: "Synkurl concept designs. Generated design concepts, not photographs of finished products. Each image is listed under the finish it actually shows.",
    finishes: FINISHES.map((f) => ({ id: f.id, name: f.name, swatch: f.swatch })),
    models: Object.fromEntries(
      MODELS.map((m) => [
        m.id,
        {
          name: m.name,
          url: m.url,
          defaultFinish: m.default,
          finishes: Object.fromEntries(
            FINISHES.map((f) => [
              f.id,
              {
                name: f.name,
                gallery: m.finishes[f.id].gallery.map(({ model, ...img }) => img),
              },
            ])
          ),
        },
      ])
    ),
  };
}

// ---------- Picture markup ----------

function picture(img, { sizes, eager = false, priority = false, cls = "", imgCls = "", position, attrs = "" }) {
  const style = position ? ` style="object-position: ${position}"` : "";
  const load = priority ? ` loading="eager" fetchpriority="high"` : eager ? ` loading="eager"` : ` loading="lazy"`;
  return `<picture${cls ? ` class="${cls}"` : ""}${attrs}><source type="image/avif" srcset="${img.avif}" sizes="${sizes}"><source type="image/webp" srcset="${img.webp}" sizes="${sizes}"><img${imgCls ? ` class="${imgCls}"` : ""} src="${img.src}" width="${img.width}" height="${img.height}" alt="${esc(img.alt)}"${load} decoding="async"${style}></picture>`;
}

// ---------- Shared head, header and footer ----------

const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7.1 8.4 12 12.4l4.9-4M7.1 8.4l-.6 6.6h11l-.6-6.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.1" cy="8.2" r=".9" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="16.9" cy="8.2" r=".9" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;

const NAV = [
  ["/models/", "Models"],
  ["/for-families", "For families"],
  ["/faq", "Questions"],
];

export function header(currentPath) {
  const items = NAV.map(([href, label]) => {
    const here = href === currentPath ? ' aria-current="page"' : currentPath.startsWith(href) && href !== "/" ? ' aria-current="true"' : "";
    return `<a href="${href}"${here}>${label}</a>`;
  }).join("");
  const join = currentPath === "/join" ? "" : `\n      <a class="btn btn-small" href="/join">Join the waitlist</a>`;
  return `  <header class="site-head" data-site-head>
    <div class="site-head-inner wrap">
      <a class="brand" href="/" aria-label="Synkurl home">
        ${BRAND_MARK}
        <span>Synkurl</span>
      </a>
      <nav class="site-nav" aria-label="Main">${items}</nav>${join}
    </div>
  </header>`;
}

export const FOOTER = `  <footer class="site-foot">
    <div class="site-foot-inner wrap">
      <p>© 2026 Synkurl</p>
      <nav aria-label="Footer">
        <a class="text-link" href="/models/">Models</a>
        <a class="text-link" href="/for-families">For families</a>
        <a class="text-link" href="/faq">Questions</a>
        <a class="text-link" href="/privacy">Privacy</a>
        <a class="text-link" href="/investors">Investors</a>
        <a class="text-link" href="mailto:synkurl@synkurl.com">synkurl@synkurl.com</a>
      </nav>
    </div>
  </footer>`;

function head({ path: pagePath, title, description, image, preload = "", scripts = [], jsonLd }) {
  const url = SITE + pagePath;
  const og = image || { url: `${SITE}/og-image.png`, width: 1200, height: 630, alt: "Synkurl: your family's photos, kept at home." };
  const lines = [
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:site_name" content="Synkurl">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${og.url}">`,
    `<meta property="og:image:width" content="${og.width}">`,
    `<meta property="og:image:height" content="${og.height}">`,
    `<meta property="og:image:alt" content="${esc(og.alt)}">`,
    '<meta property="og:locale" content="en_IN">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${og.url}">`,
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ];
  if (jsonLd) lines.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
  const scriptTags = [...scripts, "/motion.js"].map((s) => `\n  <script type="module" src="${s}"></script>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#f2eee8">
  ${lines.join("\n  ")}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/unbounded-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>${preload}
  <link rel="stylesheet" href="/styles.css">${scriptTags}
</head>`;
}

function page({ path: pagePath, title, description, image, preload, scripts, jsonLd, mainClass = "", body }) {
  return `${head({ path: pagePath, title, description, image, preload, scripts, jsonLd })}
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
${header(pagePath)}

  <main id="main"${mainClass ? ` class="${mainClass}"` : ""}>
${body}
  </main>

${FOOTER}
</body>
</html>
`;
}

// Preload the one hero image, in the format the browser will pick.
function preloadHero(img, sizes) {
  return `\n  <link rel="preload" as="image" type="image/avif" imagesrcset="${img.avif}" imagesizes="${sizes}" fetchpriority="high">`;
}

const ogFor = (img, label) => ({ url: SITE + img.src, width: 960, height: Math.round((img.height * 960) / img.width), alt: label });

// ---------- Swatches ----------

// Without JavaScript the swatches are links to each finish's photo further down.
// gallery.js turns them into a radio group that changes the photos in place.
function swatchList(model, selected) {
  return FINISHES.map((f) => {
    const on = f.id === selected;
    return `<a class="swatch" href="#finish-${f.id}" data-finish="${f.id}"${on ? ' aria-current="true"' : ""}><span class="swatch-dot" style="--swatch: ${f.swatch}"></span><span class="swatch-name">${f.name}</span></a>`;
  }).join("\n");
}

// ---------- Model page ----------

function thumbs(gallery, current) {
  return gallery
    .map(
      (img, i) =>
        `<a class="thumb" href="${img.full}" data-index="${i}"${i === current ? ' aria-current="true"' : ""}>${picture(img, { sizes: "120px", eager: true }).replace(
          `alt="${esc(img.alt)}"`,
          `alt="${ROLE_NAME[img.role]}, ${FINISH[img.finish].name}"`
        )}</a>`
    )
    .join("\n");
}

function modelPageData(m) {
  return {
    model: m.id,
    name: m.name,
    default: m.default,
    roles: ROLE_NAME,
    finishes: Object.fromEntries(
      FINISHES.map((f) => [
        f.id,
        { name: f.name, gallery: m.finishes[f.id].gallery.map(({ model, id, ...img }) => img) },
      ])
    ),
  };
}

function editorial(m, kind) {
  const img = kind === "lifestyle" ? m.lifestyleImg : m.detailImg;
  if (!img) return "";
  const copy = m[kind];
  const layout = m.layout[kind];
  const position = m.layout[`${kind}Position`];
  const finishName = FINISH[img.finish].name;
  const wide = layout === "full-bleed" || layout === "wide-band";
  const sizes = wide ? "100vw" : layout === "portrait-split" ? "(min-width: 900px) 40vw, 100vw" : "(min-width: 900px) 62vw, 100vw";
  return `<section class="editorial editorial-${kind} layout-${layout}" aria-labelledby="${kind}-title">
  <figure class="editorial-figure" data-reveal="${kind === "lifestyle" ? "rise" : "scale"}">
    <div class="editorial-frame"${kind === "lifestyle" ? " data-parallax" : ""}>
      ${picture(img, { sizes, position, imgCls: "editorial-img" })}
    </div>
    <figcaption class="finish-caption"><span class="swatch-dot" style="--swatch: ${FINISH[img.finish].swatch}"></span>Shown in ${finishName}</figcaption>
  </figure>
  <div class="editorial-text">
    <p class="eyebrow">${kind === "lifestyle" ? m.setting : "Detail"}</p>
    <h2 id="${kind}-title">${esc(copy.title)}</h2>
    <p>${esc(copy.text)}</p>
    <p><a class="text-link" href="?colour=${img.finish}" data-pick-finish="${img.finish}">See ${m.name} in ${finishName}</a></p>
  </div>
</section>`;
}

function allFinishes(m) {
  const cells = FINISHES.map((f) => {
    const g = m.finishes[f.id].gallery;
    const img = g.find((x) => x.role === "studio") || g[0];
    const note = g.find((x) => x.role === "studio") ? "" : `<span class="cell-note">Studio view not available yet. Shown: ${ROLE_NAME[img.role].toLowerCase()}.</span>`;
    return `<li id="finish-${f.id}" class="finish-cell">
  <a href="?colour=${f.id}" data-pick-finish="${f.id}">
    <span class="finish-plate">${picture(img, { sizes: "(min-width: 900px) 22vw, 45vw", imgCls: "plate-img" })}</span>
    <span class="finish-name"><span class="swatch-dot" style="--swatch: ${f.swatch}"></span>${f.name}</span>${note}
  </a>
</li>`;
  }).join("\n");
  return `<section class="section wrap all-finishes" aria-labelledby="finishes-title">
  <div class="section-head">
    <p class="eyebrow">Four finishes</p>
    <h2 id="finishes-title">${m.name} in every finish.</h2>
  </div>
  <ul class="finish-row">
${indent(cells, 4)}
  </ul>
</section>`;
}

function otherModels(m) {
  const others = MODELS.filter((o) => o.id !== m.id);
  const items = others
    .map((o) => {
      const img = o.studio(o.default);
      return `<li><a class="model-link" href="${o.url}">
  <span class="model-link-plate">${picture(img, { sizes: "(min-width: 900px) 18vw, 60vw", imgCls: "plate-img" })}</span>
  <span class="model-link-name">${o.name}</span>
  <span class="model-link-tag">${esc(o.tagline)}</span>
</a></li>`;
    })
    .join("\n");
  return `<section class="section wrap other-models" aria-labelledby="others-title">
  <div class="section-head row-head">
    <h2 id="others-title">The other five designs</h2>
    <a class="text-link" href="/models/">See all six</a>
  </div>
  <ul class="model-rail">
${indent(items, 4)}
  </ul>
</section>`;
}

function modelPage(m) {
  const g = m.finishes[m.default].gallery;
  const hero = g[0];
  const sizes = "(min-width: 1100px) 1000px, 94vw";
  const data = JSON.stringify(modelPageData(m)).replaceAll("</", "<\\/");
  const body = `    <section class="model-hero wrap" aria-labelledby="model-title">
      <div class="model-hero-text" data-hero-in>
        <p class="eyebrow">Concept design ${m.index + 1} of ${MODELS.length}</p>
        <h1 id="model-title">${m.name}</h1>
        <p class="lede">${esc(m.tagline)}</p>
      </div>

      <div class="viewer" data-viewer data-model="${m.id}">
        <div class="viewer-stage" data-stage data-hero-in>
          <a class="stage-link" href="${hero.full}" data-open-full aria-label="View ${esc(m.name)} full size">
            <span class="stage-layer is-current">${picture(hero, { sizes, priority: true, imgCls: "stage-img" })}</span>
          </a>
          <button class="stage-step stage-prev" type="button" data-step="-1" aria-label="Previous view" hidden>‹</button>
          <button class="stage-step stage-next" type="button" data-step="1" aria-label="Next view" hidden>›</button>
        </div>

        <div class="viewer-bar">
          <p class="finish-label"><span class="finish-label-key">Finish</span> <strong data-finish-name>${FINISH[m.default].name}</strong> <span class="view-label" data-view-label>· ${ROLE_NAME[hero.role]}</span></p>
          <div class="swatches" data-swatches aria-label="Choose a finish">
${indent(swatchList(m, m.default), 12)}
          </div>
        </div>

        <div class="thumbs" data-thumbs aria-label="Views in this finish">
${indent(thumbs(g, 0), 10)}
        </div>
        <p class="viewer-status visually-hidden" data-live aria-live="polite"></p>
      </div>

      <div class="model-intro">
        <p>${esc(m.intro)}</p>
        <p class="concept-note">${CONCEPT_NOTE}</p>
        <p><a class="btn" href="/join?model=${m.id}&amp;colour=${m.default}" data-join-link>Join the waitlist</a></p>
      </div>
    </section>

${indent(editorial(m, "lifestyle"), 4)}

${indent(editorial(m, "detail"), 4)}

${indent(allFinishes(m), 4)}

${indent(otherModels(m), 4)}

    <section class="section wrap closing-quiet">
      <h2>Be one of the first families to try it.</h2>
      <p class="muted">Join the waitlist and hear about early access first. No newsletters.</p>
      <p><a class="btn" href="/join?model=${m.id}&amp;colour=${m.default}" data-join-link>Join the waitlist</a></p>
    </section>

    <dialog class="lightbox" data-lightbox aria-label="${esc(m.name)} full size">
      <div class="lightbox-inner">
        <p class="lightbox-caption" data-lightbox-caption></p>
        <div class="lightbox-stage" data-lightbox-stage></div>
        <button class="lightbox-btn lightbox-prev" type="button" data-lightbox-step="-1" aria-label="Previous view">‹</button>
        <button class="lightbox-btn lightbox-next" type="button" data-lightbox-step="1" aria-label="Next view">›</button>
        <button class="lightbox-close" type="button" data-lightbox-close aria-label="Close full size view">Close</button>
      </div>
    </dialog>

    <script type="application/json" id="model-data">${data}</script>`;
  return page({
    path: m.url,
    title: `${m.name} · Synkurl concept design`,
    description: `${m.tagline} ${m.intro} Shown in Blush Pink, Matte Black, Dusk Violet and Rose Gold.`,
    image: ogFor(hero, `The ${m.name} concept in ${FINISH[m.default].name}`),
    preload: preloadHero(hero, sizes),
    scripts: ["/gallery.js"],
    mainClass: `model-page model-${m.id}`,
    body,
  });
}

// ---------- Models index ----------

function modelsIndex() {
  const rows = MODELS.map((m, i) => {
    const img = m.studio(m.default);
    const dots = FINISHES.map((f) => `<a class="mini-swatch" href="${m.url}?colour=${f.id}" title="${f.name}"><span class="swatch-dot" style="--swatch: ${f.swatch}"></span><span class="visually-hidden">${m.name} in ${f.name}</span></a>`).join("");
    return `<li class="index-row${i % 2 ? " is-flipped" : ""}" data-reveal="rise">
  <a class="index-plate" href="${m.url}" aria-label="${esc(m.name)}">${picture(img, { sizes: "(min-width: 900px) 58vw, 100vw", imgCls: "plate-img", priority: i === 0 })}</a>
  <div class="index-text">
    <p class="eyebrow">${String(i + 1).padStart(2, "0")} · ${esc(m.setting)}</p>
    <h2><a href="${m.url}">${m.name}</a></h2>
    <p>${esc(m.intro)}</p>
    <div class="mini-swatches" aria-label="Finishes">${dots}</div>
    <p><a class="text-link" href="${m.url}">Explore ${m.name}</a></p>
  </div>
</li>`;
  }).join("\n");
  const first = MODELS[0].studio(MODELS[0].default);
  return page({
    path: "/models/",
    title: "Six concept designs · Synkurl",
    description: "Arch, Dome, Spine, Stack, Box and Box Plus: six concept designs for keeping your family's photos at home, each shown in four finishes.",
    preload: preloadHero(first, "(min-width: 900px) 58vw, 100vw"),
    mainClass: "models-index",
    body: `    <section class="page-intro wrap" data-hero-in>
      <p class="eyebrow">Concept designs</p>
      <h1>Six forms for six corners of the home.</h1>
      <p class="lede">One quiet job, six shapes. Every design is shown in Blush Pink, Matte Black, Dusk Violet and Rose Gold.</p>
      <p class="concept-note">${CONCEPT_NOTE}</p>
    </section>
    <ol class="index-list wrap">
${indent(rows, 6)}
    </ol>
    <section class="section wrap closing-quiet">
      <h2>Tell us which one you'd keep at home.</h2>
      <p class="muted">Join the waitlist and hear about early access first.</p>
      <p><a class="btn" href="/join">Join the waitlist</a></p>
    </section>`,
  });
}

// ---------- Homepage ----------

function homepage() {
  const arch = MODELS.find((m) => m.id === "arch");
  const heroImg = arch.studio("dusk-violet");
  const heroSizes = "(min-width: 900px) 56vw, 100vw";

  const chapterCards = MODELS.map((m, i) => {
    const img = m.studio(m.default);
    return `<li class="form-card" data-card>
  <a href="${m.url}">
    <span class="form-plate">${picture(img, { sizes: "(min-width: 900px) 42vw, 78vw", imgCls: "plate-img" })}</span>
    <span class="form-meta"><span class="form-index">${String(i + 1).padStart(2, "0")}</span><span class="form-name">${m.name}</span></span>
    <span class="form-tag">${esc(m.tagline)}</span>
  </a>
</li>`;
  }).join("\n");

  const startFinish = "dusk-violet";
  const finishData = {
    start: startFinish,
    finishes: Object.fromEntries(FINISHES.map((f) => [f.id, f.name])),
    models: MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      url: m.url,
      byFinish: Object.fromEntries(
        FINISHES.map((f) => {
          const gal = m.finishes[f.id].gallery;
          const img = gal.find((x) => x.role === "studio") || gal.find((x) => x.role === "detail") || gal[0];
          return [f.id, { role: img.role, alt: img.alt, src: img.src, avif: img.avif, webp: img.webp, width: img.width, height: img.height }];
        })
      ),
    })),
  };
  const finishCells = MODELS.map((m) => {
    const img = m.studio(startFinish);
    return `<li data-finish-cell="${m.id}"><a href="${m.url}?colour=${startFinish}" data-finish-link>
  <span class="finish-plate">${picture(img, { sizes: "(min-width: 900px) 30vw, 46vw", imgCls: "plate-img" })}</span>
  <span class="finish-cell-name">${m.name}</span><span class="finish-cell-note" data-finish-note></span>
</a></li>`;
  }).join("\n");
  const finishButtons = FINISHES.map((f) => `<span class="swatch" data-finish="${f.id}"${f.id === startFinish ? ' aria-current="true"' : ""}><span class="swatch-dot" style="--swatch: ${f.swatch}"></span><span class="swatch-name">${f.name}</span></span>`).join("\n");

  const life = (id, cls, sizes, reveal) => {
    const m = MODELS.find((x) => x.id === id);
    const img = m.lifestyleImg;
    return `<figure class="life ${cls}" data-reveal="${reveal}">
  <a href="${m.url}?colour=${img.finish}" class="life-frame" data-parallax>${picture(img, { sizes, imgCls: "editorial-img", position: m.layout.lifestylePosition })}</a>
  <figcaption><span class="life-name">${m.name}</span> · ${esc(m.setting)} · <span class="finish-inline"><span class="swatch-dot" style="--swatch: ${FINISH[img.finish].swatch}"></span>${FINISH[img.finish].name}</span></figcaption>
</figure>`;
  };
  const detail = (id, cls, sizes, reveal) => {
    const m = MODELS.find((x) => x.id === id);
    const img = m.detailImg;
    return `<figure class="detail ${cls}" data-reveal="${reveal}">
  <a href="${m.url}?colour=${img.finish}" class="detail-frame">${picture(img, { sizes, imgCls: "editorial-img", position: m.layout.detailPosition })}</a>
  <figcaption><span class="life-name">${m.name}</span> · ${esc(m.detail.title.replace(/\.$/, ""))} · ${FINISH[img.finish].name}</figcaption>
</figure>`;
  };

  const body = `    <section class="home-hero wrap" aria-labelledby="hero-title">
      <div class="home-hero-text">
        <p class="eyebrow hero-in" style="--i: 0">Six concept designs · Starting with Android</p>
        <h1 id="hero-title" class="hero-in" style="--i: 1">Your family's photos, kept at home.</h1>
        <p class="lede hero-in" style="--i: 2">Synkurl backs up every photo and video your family takes to a small device in your home. Then it puts them on your phone, wherever you are.</p>
        <div class="actions hero-in" style="--i: 3">
          <a class="btn" href="/join">Join the waitlist</a>
          <a class="text-link" href="#forms">Explore the six designs</a>
        </div>
      </div>
      <figure class="home-hero-figure hero-in" style="--i: 1">
        <a class="hero-plate" href="${arch.url}?colour=dusk-violet">${picture(heroImg, { sizes: heroSizes, priority: true, imgCls: "plate-img" })}</a>
        <figcaption class="concept-note">The Arch concept in Dusk Violet. Concept design: the final Synkurl device will look different.</figcaption>
      </figure>
    </section>

    <section class="section wrap what" aria-labelledby="what-title">
      <div class="what-grid">
        <div class="what-text">
          <p class="eyebrow">What it does</p>
          <h2 id="what-title">One small device. Every family photo, safe at home.</h2>
          <ul class="promise-list">
            <li data-reveal="fade">
              <h3>Backs up by itself</h3>
              <p>New photos and videos leave your phone for home without anyone having to remember.</p>
            </li>
            <li data-reveal="fade">
              <h3>Lives in your home</h3>
              <p>Your memories sit on a small device in your own home, not in a stranger's data centre.</p>
            </li>
            <li data-reveal="fade">
              <h3>Opens from anywhere</h3>
              <p>On Wi-Fi or mobile data, at home or travelling, the whole family album is a tap away.</p>
            </li>
          </ul>
          <ol class="steps" aria-label="How it will work">
            <li><h3>Plug it in at home</h3><p>Connect the Synkurl device to power and your home internet.</p></li>
            <li><h3>Pair your family's phones</h3><p>Install the app and pair each phone with the device once.</p></li>
            <li><h3>Let it run</h3><p>New photos go home on their own. Get a new phone, and everything comes back to it.</p></li>
          </ol>
        </div>
${indent(APP_DEMO.trim().replace('<section class="section wrap lazy-section" id="app"', '<section class="app-panel" id="app"'), 8)}
      </div>
    </section>

    <section class="chapter tone-dark" id="forms" aria-labelledby="forms-title" data-chapter>
      <div class="chapter-pin" data-chapter-pin>
        <div class="chapter-head wrap">
          <div>
            <p class="eyebrow">Six forms</p>
            <h2 id="forms-title">One quiet job. Six ways to fit your home.</h2>
          </div>
          <div class="chapter-side">
            <p class="muted">Each design is a concept for a different corner of the house. Open one to see it in every finish.</p>
            <div class="chapter-controls">
              <button class="round-btn" type="button" data-chapter-step="-1" aria-label="Previous design">‹</button>
              <span class="chapter-progress" aria-hidden="true"><span data-chapter-bar></span></span>
              <button class="round-btn" type="button" data-chapter-step="1" aria-label="Next design">›</button>
            </div>
            <a class="text-link skip-chapter" href="#finishes">Skip to the finishes</a>
          </div>
        </div>
        <div class="chapter-viewport" data-chapter-viewport>
          <ol class="chapter-track" data-chapter-track>
${indent(chapterCards, 12)}
          </ol>
        </div>
      </div>
    </section>

    <section class="section wrap finishes" id="finishes" aria-labelledby="finishes-title" data-finishes>
      <div class="section-head">
        <p class="eyebrow">Four finishes</p>
        <h2 id="finishes-title">Blush Pink, Matte Black, Dusk Violet and Rose Gold.</h2>
        <p class="muted">Every design is shown in all four. Choose a finish to see the whole family in it.</p>
      </div>
      <div class="finish-picker">
        <div class="swatches" data-finish-swatches aria-label="Choose a finish">
${indent(finishButtons, 10)}
        </div>
        <p class="finish-label"><span class="finish-label-key">Showing</span> <strong data-finish-current>${FINISH[startFinish].name}</strong></p>
      </div>
      <ul class="finish-grid" data-finish-grid>
${indent(finishCells, 8)}
      </ul>
      <script type="application/json" id="finish-data">${JSON.stringify(finishData).replaceAll("</", "<\\/")}</script>
    </section>

    <section class="section lifestyle tone-dark" aria-labelledby="rooms-title">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">In real rooms</p>
          <h2 id="rooms-title">Made to live where your family does.</h2>
          <p class="muted">Below the TV, among the books, beside your favourite chair. Each design is pictured where a family might keep it, in the finish it was photographed in.</p>
        </div>
      </div>
      <div class="life-grid wrap">
${indent(life("box", "life-wide", "(min-width: 1100px) 1100px, 100vw", "rise"), 8)}
${indent(life("spine", "life-portrait", "(min-width: 900px) 34vw, 100vw", "rise"), 8)}
${indent(life("arch", "life-side", "(min-width: 900px) 58vw, 100vw", "slide"), 8)}
${indent(life("box-plus", "life-band", "(min-width: 900px) 70vw, 100vw", "rise"), 8)}
${indent(life("dome", "life-half", "(min-width: 900px) 48vw, 100vw", "rise"), 8)}
${indent(life("stack", "life-half life-offset", "(min-width: 900px) 48vw, 100vw", "slide"), 8)}
      </div>
    </section>

    <section class="section wrap details" aria-labelledby="details-title">
      <div class="section-head">
        <p class="eyebrow">Up close</p>
        <h2 id="details-title">Fine vents. Soft seams. A quiet mark.</h2>
      </div>
      <div class="detail-grid">
${indent(detail("dome", "detail-large", "(min-width: 900px) 62vw, 100vw", "scale"), 8)}
${indent(detail("stack", "detail-small", "(min-width: 900px) 34vw, 100vw", "rise"), 8)}
${indent(detail("box-plus", "detail-small detail-low", "(min-width: 900px) 34vw, 100vw", "rise"), 8)}
      </div>
    </section>

    <section class="section wrap closing-quiet home-closing">
      <h2>Be one of the first families to try it.</h2>
      <p class="muted">Join the waitlist and hear about early access before anyone else. No newsletters.</p>
      <p><a class="btn" href="/join">Join the waitlist</a></p>
      <p class="concept-note">All six are concept designs. These images are design concepts, not photographs of finished products. The final Synkurl device will look different.</p>
    </section>`;

  return page({
    path: "/",
    title: "Synkurl: your family's photos, kept at home",
    description: "Synkurl backs up your family's photos and videos to a small device in your home, and puts them back on your phone wherever you are. Join the waitlist.",
    preload: preloadHero(heroImg, heroSizes),
    scripts: ["/home.js", "/chapter.js", "/finishes.js"],
    jsonLd: { "@context": "https://schema.org", "@type": "Organization", name: "Synkurl", url: `${SITE}/`, logo: `${SITE}/icon-512.png`, email: "synkurl@synkurl.com" },
    mainClass: "home",
    body,
  });
}

// ---------- Header and footer for the other pages ----------

function syncChrome(file, html) {
  const rel = "/" + path.relative(PUB, file).replace(/\.html$/, "").replace(/(^|\/)index$/, "$1");
  const pagePath = rel === "/404" ? "/404" : rel;
  return html
    .replace(/  <header class="site-head[\s\S]*?<\/header>/, header(pagePath))
    .replace(/  <footer class="site-foot[\s\S]*?<\/footer>/, FOOTER);
}

// ---------- Checks on the manifest ----------

function checkManifest(manifest) {
  const problems = [];
  const json = JSON.stringify(manifest);
  for (const banned of ["prompt", "sha256", "source_generated", "proposed_dimensions", "qa_notes", "/workspace", "_mm"]) {
    if (json.includes(banned)) problems.push(`public manifest contains "${banned}"`);
  }
  for (const [mid, m] of Object.entries(manifest.models)) {
    if (Object.keys(m.finishes).length !== 4) problems.push(`${mid}: should list four finishes`);
    for (const [fid, f] of Object.entries(m.finishes)) {
      if (!f.gallery.length) problems.push(`${mid}/${fid}: no images at all`);
      for (const img of f.gallery) {
        if (img.finish !== fid) problems.push(`${mid}/${fid}: holds an image of ${img.finish}`);
        const files = [img.src, img.full, ...img.avif.split(", ").map((s) => s.split(" ")[0]), ...img.webp.split(", ").map((s) => s.split(" ")[0])];
        for (const f2 of files) if (!fs.existsSync(path.join(PUB, f2))) problems.push(`missing file ${f2}`);
        if (!img.alt || img.alt.length < 20) problems.push(`${img.id}: alt text too short`);
      }
    }
  }
  return problems;
}

// ---------- Write (or check) everything ----------

const outputs = new Map();
const manifest = publicManifest();
outputs.set(path.join(PUB, "models", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
outputs.set(path.join(PUB, "models", "index.html"), modelsIndex());
for (const m of MODELS) outputs.set(path.join(PUB, "models", m.id, "index.html"), modelPage(m));
outputs.set(path.join(PUB, "index.html"), homepage());
const SITEMAP_PATHS = ["/", "/models/", ...MODELS.map((m) => m.url), "/for-families", "/faq", "/join", "/investors", "/privacy"];
outputs.set(
  path.join(PUB, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP_PATHS.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}\n</urlset>\n`
);

for (const name of fs.readdirSync(PUB)) {
  const file = path.join(PUB, name);
  if (!name.endsWith(".html") || outputs.has(file)) continue;
  outputs.set(file, syncChrome(file, fs.readFileSync(file, "utf8")));
}

const problems = checkManifest(manifest);
let stale = 0;
for (const [file, text] of outputs) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (current === text) continue;
  if (CHECK) {
    stale += 1;
    problems.push(`out of date: ${path.relative(ROOT, file)} (run: node scripts/build-pages.mjs)`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    console.log("wrote", path.relative(ROOT, file));
  }
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(CHECK ? "✓ pages and manifest are up to date" : `✓ built ${outputs.size} pages and the manifest`);
