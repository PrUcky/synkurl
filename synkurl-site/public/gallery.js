// The photo viewer on each model page.
//
// - Four finishes. Choosing one updates the main photo, the thumbnails, the
//   full-size viewer, the finish name, the selected swatch and the address
//   (/models/arch/?colour=rose-gold) together. Reload and Back/Forward restore it.
// - A finish only ever shows photos that really show that finish.
// - The next photo is loaded and decoded before it fades in, and a newer choice
//   always wins over an older one that is still loading.
// - Swipe, previous/next, thumbnails, arrow keys, and a full-size viewer that
//   closes with Escape and gives focus back.
//
// Without this script the page still works: swatches link to each finish's
// photo further down, and thumbnails open the full-size image.

const dataEl = document.getElementById("model-data");
const viewer = document.querySelector("[data-viewer]");
if (dataEl && viewer) setUpGallery(JSON.parse(dataEl.textContent), viewer);

function setUpGallery(data, viewer) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stage = viewer.querySelector("[data-stage]");
  const stageLink = stage.querySelector("[data-open-full]");
  const swatchBox = viewer.querySelector("[data-swatches]");
  const swatches = [...swatchBox.querySelectorAll("[data-finish]")];
  const thumbBox = viewer.querySelector("[data-thumbs]");
  const finishName = viewer.querySelector("[data-finish-name]");
  const viewLabel = viewer.querySelector("[data-view-label]");
  const live = viewer.querySelector("[data-live]");
  const stepButtons = [...stage.querySelectorAll("[data-step]")];
  const joinLinks = [...document.querySelectorAll("[data-join-link]")];
  const lightbox = document.querySelector("[data-lightbox]");

  const FINISH_IDS = Object.keys(data.finishes);
  const state = { finish: data.default, index: 0 };
  let request = 0; // increases with every change; only the newest may finish

  const stageSizes = stage.querySelector("source")?.sizes || "100vw";
  let lightboxRequest = 0;

  const gallery = (finish = state.finish) => data.finishes[finish].gallery;
  const validFinish = (value) => (FINISH_IDS.includes(value) ? value : null);

  // ---------- Swatches become a radio group ----------
  swatchBox.setAttribute("role", "radiogroup");
  swatches.forEach((sw) => {
    sw.setAttribute("role", "radio");
    sw.removeAttribute("aria-current");
    sw.addEventListener("click", (event) => {
      event.preventDefault();
      choose(sw.dataset.finish, { push: true });
    });
  });
  swatchBox.addEventListener("keydown", (event) => {
    const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const i = FINISH_IDS.indexOf(state.finish);
    const next = FINISH_IDS[(i + moves[event.key] + FINISH_IDS.length) % FINISH_IDS.length];
    choose(next, { push: true });
    swatches.find((s) => s.dataset.finish === next).focus();
  });

  // Links elsewhere on the page ("See Arch in Dusk Violet", the four-finish row).
  document.querySelectorAll("[data-pick-finish]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      choose(link.dataset.pickFinish, { push: true });
      viewer.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
    });
  });

  // ---------- Stage controls ----------
  stepButtons.forEach((btn) => btn.addEventListener("click", () => step(Number(btn.dataset.step))));
  stageLink.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return; // let new-tab clicks through
    event.preventDefault();
    if (swipe.moved) return;
    openLightbox(stageLink);
  });
  stage.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  });
  const swipe = addSwipe(stage, (dir) => step(dir));

  // ---------- Thumbnails ----------
  function renderThumbs() {
    const g = gallery();
    thumbBox.textContent = "";
    g.forEach((img, i) => {
      const a = document.createElement("a");
      a.className = "thumb";
      a.href = img.full;
      a.setAttribute("role", "button");
      a.setAttribute("aria-pressed", String(i === state.index));
      a.setAttribute("aria-label", `${data.roles[img.role]}, ${data.finishes[img.finish].name}`);
      a.append(pictureEl(img, "120px", "", true));
      a.addEventListener("click", (event) => {
        event.preventDefault();
        show(i);
      });
      a.addEventListener("keydown", (event) => {
        if (event.key === " ") { event.preventDefault(); show(i); }
      });
      thumbBox.append(a);
    });
    thumbBox.setAttribute("role", "group");
  }

  function markThumbs() {
    [...thumbBox.children].forEach((t, i) => t.setAttribute("aria-pressed", String(i === state.index)));
  }

  // ---------- Changing finish or view ----------
  function choose(finish, { push = false, announce = true } = {}) {
    finish = validFinish(finish) || data.default;
    if (finish === state.finish && push) return;
    const role = gallery()[state.index]?.role;
    const next = gallery(finish);
    // Keep the same kind of view (studio, in a home, close-up) when this finish has it.
    let index = next.findIndex((img) => img.role === role);
    if (index < 0) index = Math.max(0, next.findIndex((img) => img.role === "studio"));
    state.finish = finish;
    state.index = index;
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set("colour", finish);
      history.pushState({ colour: finish }, "", url);
    }
    updateControls();
    renderThumbs();
    swapStage(announce);
  }

  function show(index) {
    const g = gallery();
    state.index = (index + g.length) % g.length;
    markThumbs();
    updateControls();
    swapStage(true);
  }

  function step(dir) {
    if (gallery().length > 1) show(state.index + dir);
  }

  function updateControls() {
    const g = gallery();
    const img = g[state.index];
    swatches.forEach((sw) => {
      const on = sw.dataset.finish === state.finish;
      sw.setAttribute("aria-checked", String(on));
      sw.tabIndex = on ? 0 : -1;
    });
    finishName.textContent = data.finishes[state.finish].name;
    viewLabel.textContent = `· ${data.roles[img.role]}`;
    stepButtons.forEach((b) => (b.hidden = g.length < 2));
    stageLink.href = img.full;
    stageLink.setAttribute("aria-label", `View full size: ${data.name} in ${data.finishes[state.finish].name}, ${data.roles[img.role].toLowerCase()}`);
    joinLinks.forEach((a) => {
      const url = new URL(a.href, location.href);
      url.searchParams.set("colour", state.finish);
      a.href = url.pathname + url.search;
    });
  }

  async function swapStage(announce) {
    const ticket = ++request;
    const img = gallery()[state.index];
    // The new photo goes into the frame invisibly, so the browser picks the right
    // size and format. It only appears once it has loaded and decoded.
    stageLink.querySelectorAll(".stage-layer.is-incoming").forEach((stale) => stale.remove());
    const layer = document.createElement("span");
    layer.className = "stage-layer is-incoming";
    layer.append(pictureEl(img, stageSizes, "stage-img", true));
    stageLink.append(layer);
    await loadImage(layer.querySelector("img"));
    if (ticket !== request) {
      layer.remove(); // a newer choice arrived while this one loaded
      return;
    }
    const old = [...stageLink.querySelectorAll(".stage-layer:not(.is-incoming)")];
    const finish = () => old.forEach((el) => el.remove());
    if (reduce.matches) {
      layer.classList.remove("is-incoming");
      finish();
    } else {
      requestAnimationFrame(() => {
        layer.classList.remove("is-incoming");
        setTimeout(finish, 260);
      });
    }
    layer.classList.add("is-current");
    if (announce) live.textContent = `${data.finishes[state.finish].name}, ${data.roles[img.role].toLowerCase()}`;
    if (lightbox.open) renderLightbox();
  }

  // ---------- Full-size viewer ----------
  let returnFocus = null;
  const lbStage = lightbox.querySelector("[data-lightbox-stage]");
  const lbCaption = lightbox.querySelector("[data-lightbox-caption]");
  const lbSteps = [...lightbox.querySelectorAll("[data-lightbox-step]")];
  lightbox.querySelector("[data-lightbox-close]").addEventListener("click", () => lightbox.close());
  lbSteps.forEach((b) => b.addEventListener("click", () => step(Number(b.dataset.lightboxStep))));
  lightbox.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  });
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close(); // click on the dark backdrop
  });
  lightbox.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  });
  addSwipe(lbStage, (dir) => step(dir));

  function openLightbox(from) {
    returnFocus = from;
    renderLightbox();
    document.documentElement.style.overflow = "hidden";
    lightbox.showModal();
    lightbox.querySelector("[data-lightbox-close]").focus();
  }

  function renderLightbox() {
    const g = gallery();
    const img = g[state.index];
    lbCaption.textContent = `${data.name} · ${data.finishes[state.finish].name} · ${data.roles[img.role]} · ${state.index + 1} of ${g.length}`;
    lbSteps.forEach((b) => (b.hidden = g.length < 2));
    const ticket = ++lightboxRequest;
    const pic = pictureEl(img, "100vw", "is-incoming", true);
    const el = pic.querySelector("img");
    lbStage.append(pic);
    loadImage(el).then(() => {
      if (ticket !== lightboxRequest) return pic.remove();
      [...lbStage.children].forEach((child) => child !== pic && child.remove());
      requestAnimationFrame(() => el.classList.remove("is-incoming"));
    });
  }

  // ---------- Building and loading images ----------
  function pictureEl(img, sizes, cls, eager = false) {
    const pic = document.createElement("picture");
    for (const [type, set] of [["image/avif", img.avif], ["image/webp", img.webp]]) {
      const s = document.createElement("source");
      s.type = type;
      s.srcset = set;
      s.sizes = sizes;
      pic.append(s);
    }
    const el = document.createElement("img");
    el.src = img.src;
    el.width = img.width;
    el.height = img.height;
    el.alt = img.alt;
    el.decoding = "async";
    el.loading = eager ? "eager" : "lazy";
    if (cls) el.className = cls;
    pic.append(el);
    return pic;
  }

  // Waits until the image the browser chose has loaded and decoded.
  function loadImage(el) {
    return new Promise((resolve) => {
      const done = () => (el.decode ? el.decode().catch(() => {}).then(resolve) : resolve());
      if (el.complete && el.naturalWidth) return done();
      el.addEventListener("load", done, { once: true });
      el.addEventListener("error", () => resolve(), { once: true }); // still swap: never leave the old finish showing
    });
  }

  // ---------- Address bar: ?colour= ----------
  window.addEventListener("popstate", () => {
    const fromUrl = validFinish(new URL(location.href).searchParams.get("colour")) || data.default;
    if (fromUrl !== state.finish) choose(fromUrl, { push: false });
  });

  // ---------- Start ----------
  const requested = new URL(location.href).searchParams.get("colour");
  const initial = validFinish(requested);
  if (requested && !initial) {
    // Unknown colour in the address: fall back to the default, and tidy the address.
    const url = new URL(location.href);
    url.searchParams.delete("colour");
    history.replaceState(null, "", url);
  }
  updateControls();
  renderThumbs();
  stage.tabIndex = 0;
  stage.setAttribute("aria-label", `${data.name} photos. Use the left and right arrow keys to change view.`);
  if (initial && initial !== data.default) {
    state.finish = data.default;
    choose(initial, { push: false, announce: false });
  }
  viewer.classList.add("is-ready");
}

// Horizontal swipe on touch screens (vertical scrolling still works).
function addSwipe(el, onSwipe) {
  const info = { moved: false };
  let startX = 0;
  let startY = 0;
  let active = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    active = true;
    info.moved = false;
    startX = e.clientX;
    startY = e.clientY;
  });
  el.addEventListener("pointerup", (e) => {
    if (!active) return;
    active = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      info.moved = true;
      onSwipe(dx < 0 ? 1 : -1);
      setTimeout(() => (info.moved = false), 350);
    }
  });
  el.addEventListener("pointercancel", () => (active = false));
  return info;
}
