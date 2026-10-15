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
const OVERVIEW = JSON.parse(read("data/product-overview.json"));

const FINISHES = DATA.finishes;
const FINISH = Object.fromEntries(FINISHES.map((f) => [f.id, f]));
// "Blush Pink, Matte Black, Dusk Violet / Purple and Rose Gold"
const FINISH_LIST = `${FINISHES.slice(0, -1).map((f) => f.name).join(", ")} and ${FINISHES[FINISHES.length - 1].name}`;
const ROLE_NAME = { studio: "Studio view", lifestyle: "In a home", detail: "Close-up" };
const CONCEPT_NOTE = "Concept design. These images are design concepts, not photographs of a finished product. The final Synkurl device will look different.";

// ---------- Small helpers ----------

export const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const indent = (text, n) => text.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");
const srcset = (list) => list.map((x) => `${x.file} ${x.w}w`).join(", ");

// ---------- The public image manifest ----------

function imageRecord(model, entry) {
  // Alt text keys in data/models.json: studio-<finish>; lifestyle / detail for the main
  // room and close-up photos; lifestyle-<finish> / detail-<finish> for extra finishes.
  const key = entry.role === "studio" ? `studio-${entry.finish}` : entry.finish === model[entry.role].finish ? entry.role : `${entry.role}-${entry.finish}`;
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
    full: entry.full, // lossless: every pixel of the original
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
    // The editorial room and close-up sections use the main photo for each.
    const byRole = (role) => records.find((r) => r.role === role && r.finish === m[role].finish);
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

function head({ path: pagePath, title, description, image, preload = "", scripts = [], jsonLd, early: earlyAttrs }) {
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
  // Model pages: a tiny script that runs before the first paint (see colour-first.js).
  const early = earlyAttrs
    ? `\n  <script src="/colour-first.js" ${Object.entries(earlyAttrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}></script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#f2eee8">
  ${lines.join("\n  ")}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">${early}
  <link rel="preload" href="/fonts/unbounded-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>${preload}
  <link rel="stylesheet" href="/styles.css">${scriptTags}
</head>`;
}

function page({ path: pagePath, title, description, image, preload, scripts, jsonLd, early, mainClass = "", body }) {
  return `${head({ path: pagePath, title, description, image, preload, scripts, jsonLd, early })}
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
        `<a class="thumb" href="${img.full}" data-index="${i}"${i === current ? ' aria-current="true"' : ""}>${picture(img, { sizes: "88px", eager: true }).replace(
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
    <a class="editorial-frame" href="${img.full}" data-open-photo="${img.finish}:${img.role}" aria-label="View full size: ${esc(m.name)} in ${finishName}, ${ROLE_NAME[img.role].toLowerCase()}"${kind === "lifestyle" ? " data-parallax" : ""}>
      ${picture(img, { sizes, position, imgCls: "editorial-img" })}
    </a>
    <figcaption class="finish-caption"><span class="swatch-dot" style="--swatch: ${FINISH[img.finish].swatch}"></span>Shown in ${finishName}</figcaption>
  </figure>
  <div class="editorial-text">
    <p class="eyebrow">${kind === "lifestyle" ? m.setting : "Detail"}</p>
    <h2 id="${kind}-title">${esc(copy.title)}</h2>
    <p>${esc(copy.text)}</p>
    <p><a class="text-link" href="#finish-${img.finish}" data-pick-finish="${img.finish}">See ${m.name} in ${finishName}</a></p>
  </div>
</section>`;
}

function allFinishes(m) {
  const cells = FINISHES.map((f) => {
    const g = m.finishes[f.id].gallery;
    const img = g.find((x) => x.role === "studio") || g[0];
    const note = g.find((x) => x.role === "studio") ? "" : `<span class="cell-note">Studio view not available yet. Shown: ${ROLE_NAME[img.role].toLowerCase()}.</span>`;
    return `<li id="finish-${f.id}" class="finish-cell">
  <a href="${img.full}" data-pick-finish="${f.id}">
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
  <span class="model-link-plate">${picture(img, { sizes: "(min-width: 900px) 18vw, 200px", imgCls: "plate-img" })}</span>
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

// One source for the customer-facing information shared by all six concepts.
function productOverview(modelName) {
  const table = (rows, caption) => `<table class="overview-table">
  <caption>${esc(caption)}</caption>
  <tbody>${rows.map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join("\n")}</tbody>
</table>`;
  return `<section class="section wrap product-overview" id="overview" aria-labelledby="overview-title">
  <h2 id="overview-title">${modelName ? `${esc(modelName)} at a glance` : "At a glance"}</h2>
  <p class="lede">${esc(OVERVIEW.status)}</p>
  <p>Choose the look you prefer. These names describe appearance, not different feature levels.</p>
  ${table(OVERVIEW.items, modelName ? `${modelName} concept — product overview` : "Product overview — all six designs")}
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
        <p><a class="text-link" href="#overview">At a glance</a></p>
      </div>

      <div class="viewer" data-viewer data-model="${m.id}">
        <div class="viewer-stage" data-stage data-hero-in>
          <a class="stage-link" href="${hero.full}" data-open-full aria-label="View ${esc(m.name)} full size">
            <span class="stage-layer is-current" data-built>${picture(hero, { sizes, priority: true, imgCls: "stage-img" })}</span>
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

${indent(productOverview(m.name), 4)}

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
        <div class="lightbox-tools">
          <button class="lightbox-tool" type="button" data-lightbox-zoom aria-pressed="false" hidden>Zoom in</button>
          <button class="lightbox-tool" type="button" data-lightbox-close aria-label="Close full size view">Close</button>
        </div>
      </div>
    </dialog>

    <script type="application/json" id="model-data">${data}</script>`;
  return page({
    path: m.url,
    title: `${m.name} · Synkurl concept design`,
    description: `${m.tagline} ${m.intro} Shown in ${FINISH_LIST}.`,
    image: ogFor(hero, `The ${m.name} concept in ${FINISH[m.default].name}`),
    preload: preloadHero(hero, sizes),
    scripts: ["/gallery.js"],
    // colour-first.js: the default finish, and each finish's first photo so a
    // shared ?colour= link can start loading the right one straight away.
    early: {
      default: m.default,
      finishes: FINISHES.map((f) => f.id).join(" "),
      sizes,
      ...Object.fromEntries(FINISHES.map((f) => {
        const fg = m.finishes[f.id].gallery;
        // The photo gallery.js opens a finish on: its studio view, or its first photo.
        return [`hero-${f.id}`, (fg.find((img) => img.role === "studio") || fg[0]).avif];
      })),
    },
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
      <h1>Which design would fit your home?</h1>
      <p class="lede">Six design ideas for the same purpose: keeping a copy of your family's photos at home. Choose a shape to see its colours and pictures.</p>
      <p>These pictures explore how the device could look. The final product may change.</p>
      <p><a class="text-link" href="#overview">At a glance</a></p>
      <p class="concept-note">${CONCEPT_NOTE}</p>
    </section>
    <ol class="index-list wrap">
${indent(rows, 6)}
    </ol>
${indent(productOverview(), 4)}
    <section class="section wrap closing-quiet">
      <h2>Hear first when early access opens.</h2>
      <p class="muted">Join the waitlist. We'll email you when it opens, and nothing else.</p>
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
  const body = `    <section class="home-hero wrap" aria-labelledby="hero-title">
      <div class="home-hero-text">
        <p class="eyebrow hero-in" style="--i: 0">In development · Android first</p>
        <h1 id="hero-title" class="hero-in" style="--i: 1">Your family's photos, kept at home.</h1>
        <p class="lede hero-in" style="--i: 2">Synkurl is building a small home device and a phone app. The aim is simple: automatically save a copy of your photos and videos at home, and let you view them on your phone when you're away.</p>
        <div class="actions hero-in" style="--i: 3">
          <a class="btn" href="/join">Join the waitlist</a>
          <a class="text-link" href="#what-title">See how it will work</a>
        </div>
      </div>
      <figure class="home-hero-figure hero-in" style="--i: 1">
        <a class="hero-plate" href="${arch.url}?colour=dusk-violet">${picture(heroImg, { sizes: heroSizes, priority: true, imgCls: "plate-img" })}</a>
        <figcaption class="concept-note">The Arch concept in ${FINISH[heroImg.finish].name}. Concept design: the final Synkurl device will look different.</figcaption>
      </figure>
    </section>

    <section class="section wrap what" aria-labelledby="what-title">
      <div class="what-grid">
        <div class="what-text">
          <p class="eyebrow">What we are building</p>
          <h2 id="what-title">A copy at home. Easy to find on your phone.</h2>
          <ul class="promise-list">
            <li data-reveal="fade">
              <h3>Save a copy automatically</h3>
              <p>We are working on copying new photos and videos to your home device. A backup means an extra copy, not moving the only copy off your phone.</p>
            </li>
            <li data-reveal="fade">
              <h3>Keep that copy at home</h3>
              <p>The device is designed to store your photos and videos in your home.</p>
            </li>
            <li data-reveal="fade">
              <h3>View photos when you are away</h3>
              <p>We are building access through the phone app. Your home device and phone will need an internet connection for this.</p>
            </li>
          </ul>
          <ol class="steps" aria-label="How it will work">
            <li><h3>Connect the device</h3><p>Give it power and a connection to your home internet.</p></li>
            <li><h3>Connect your phone</h3><p>Install the app and follow the setup steps. We are starting with Android.</p></li>
            <li><h3>Check your saved copies</h3><p>See which photos have finished copying. Getting saved photos back onto a new phone is also part of the plan.</p></li>
          </ol>
        </div>
${indent(APP_DEMO.trim().replace('<section class="section wrap lazy-section" id="app"', '<section class="app-panel" id="app"'), 8)}
      </div>
    </section>

    <section class="chapter tone-dark" id="forms" aria-labelledby="forms-title" data-chapter>
      <div class="chapter-pin" data-chapter-pin>
        <div class="chapter-head wrap">
          <div>
            <p class="eyebrow">Six design ideas</p>
            <h2 id="forms-title">Choose a shape you like.</h2>
          </div>
          <div class="chapter-side">
            <p class="muted">Explore different shapes and colours for your home. Open a design to see more pictures.</p>
            <div class="chapter-controls" hidden>
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
        <h2 id="finishes-title">Four colours to explore.</h2>
        <p class="muted">Choose a colour to see all six designs in it. Colours shown: ${FINISH_LIST}.</p>
      </div>
      <div class="finish-picker">
        <div class="swatches" data-finish-swatches aria-label="Choose a finish" hidden>
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
          <p class="eyebrow">At home</p>
          <h2 id="rooms-title">Picture it in your home.</h2>
          <p class="muted">By the TV, on a bookshelf or beside the sofa. These images explore how the designs could look in a room.</p>
        </div>
      </div>
      <div class="life-grid wrap">
${indent(life("box", "life-wide", "(min-width: 1100px) 1100px, 100vw", "rise"), 8)}
${indent(life("spine", "life-portrait", "(min-width: 900px) 34vw, 100vw", "rise"), 8)}
${indent(life("arch", "life-side", "(min-width: 900px) 58vw, 100vw", "slide"), 8)}
      </div>
    </section>

    <section class="section wrap home-answers" aria-labelledby="answers-title">
      <h2 id="answers-title">A few things to know.</h2>
      <h3>Can I get one now?</h3>
      <p>We are building and testing the first version. You can join the waitlist to hear when early access opens.</p>
      <h3>Does a backup free space on my phone?</h3>
      <p>Making a copy does not free space by itself. We have not confirmed how removing photos from a phone will work.</p>
      <h3>How much will it store or cost?</h3>
      <p>Storage options and price have not been announced. We will share more before early access.</p>
      <p><a class="text-link" href="/faq">Read all questions and answers</a></p>
    </section>

    <section class="section wrap closing-quiet home-closing">
      <h2>Hear when it is ready to try.</h2>
      <p class="muted">Join the waitlist for an email when early access opens. No newsletters.</p>
      <p><a class="btn" href="/join">Join the waitlist</a></p>
      <p class="concept-note">All six are concept designs. These images are design concepts, not photographs of finished products. The final Synkurl device will look different.</p>
    </section>`;

  return page({
    path: "/",
    title: "Synkurl: your family's photos, kept at home",
    description: "Synkurl is building a home device and app for family photo and video backup. Explore six concept designs and join the waitlist. Android first.",
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
  const listed = new Set();
  for (const [mid, m] of Object.entries(manifest.models)) {
    if (Object.keys(m.finishes).length !== 4) problems.push(`${mid}: should list four finishes`);
    for (const [fid, f] of Object.entries(m.finishes)) {
      if (!f.gallery.length) problems.push(`${mid}/${fid}: no images at all`);
      for (const img of f.gallery) {
        if (img.finish !== fid) problems.push(`${mid}/${fid}: holds an image of ${img.finish}`);
        const files = [img.src, img.full, ...img.avif.split(", ").map((s) => s.split(" ")[0]), ...img.webp.split(", ").map((s) => s.split(" ")[0])];
        for (const f2 of files) {
          listed.add(f2);
          if (!fs.existsSync(path.join(PUB, f2))) problems.push(`missing file ${f2}`);
        }
        if (!img.alt || img.alt.length < 20) problems.push(`${img.id}: alt text too short`);
      }
    }
  }
  // Every published photo is one the manifest lists: nothing old or stray goes out.
  const MEDIA = path.join(PUB, "media");
  for (const dir of fs.existsSync(MEDIA) ? fs.readdirSync(MEDIA) : []) {
    if (!fs.statSync(path.join(MEDIA, dir)).isDirectory()) {
      problems.push(`unexpected file /media/${dir}`);
      continue;
    }
    for (const name of fs.readdirSync(path.join(MEDIA, dir))) {
      if (!listed.has(`/media/${dir}/${name}`)) problems.push(`/media/${dir}/${name} is published but not in the manifest`);
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
