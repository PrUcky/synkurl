// The photo viewer on each model page.
//
// - Four finishes. Choosing one marks the swatch and updates the address
//   (/models/arch/?colour=rose-gold) at once. The main photo, finish name,
//   thumbnails and full-size viewer change together, once the new photo is ready,
//   so a name never sits over a photo of another finish. Reload and Back/Forward
//   restore the finish.
// - A finish only ever shows photos that really show that finish.
// - The next photo is loaded and decoded before it fades in, and a newer choice
//   always wins over an older one that is still loading.
// - Swipe, previous/next, thumbnails, arrow keys, and a full-size viewer that
//   closes with Escape and gives focus back.
//
// Without this script the page still works: swatches and "See Arch in …" links
// jump to each finish further down, whose photos open full size, and thumbnails
// open the full-size image.

import { clampOffset, colourFromSearch, fitSize, indexAfterSwitch, stepIndex, zoomAround, zoomLimit } from "/gallery-state.js";

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
  const state = { finish: data.default, index: 0 }; // what was asked for
  let shownFinish = data.default; // what the photo, name and thumbnails show now
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
  const swipe = addSwipe(stage, (dir) => !lightbox.open && step(dir));

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
      a.append(pictureEl(img, "88px", "", true));
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
    state.index = indexAfterSwitch(gallery(finish), role);
    state.finish = finish;
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set("colour", finish);
      history.pushState({ colour: finish }, "", url);
    }
    markSwatches();
    swapStage(announce);
  }

  function show(index) {
    const g = gallery();
    state.index = stepIndex(index, 0, g.length);
    if (shownFinish === state.finish) markThumbs();
    swapStage(true);
  }

  function step(dir) {
    if (gallery().length > 1) show(state.index + dir);
  }

  function markSwatches() {
    swatches.forEach((sw) => {
      const on = sw.dataset.finish === state.finish;
      sw.setAttribute("aria-checked", String(on));
      sw.tabIndex = on ? 0 : -1;
    });
  }

  // Name, view, thumbnails and links: changed together with the photo.
  function updateControls() {
    const g = gallery();
    const img = g[state.index];
    if (shownFinish !== state.finish) {
      shownFinish = state.finish;
      renderThumbs();
    } else {
      markThumbs();
    }
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
    // Drop photos that were still loading for an older choice (never ones already shown).
    stageLink.querySelectorAll(".stage-layer.is-incoming:not(.is-current)").forEach((stale) => stale.remove());
    const layer = document.createElement("span");
    layer.className = "stage-layer is-incoming";
    layer.append(pictureEl(img, stageSizes, "stage-img", true));
    stageLink.append(layer);
    await loadImage(layer.querySelector("img"));
    if (ticket !== request) {
      layer.remove(); // a newer choice arrived while this one loaded
      return;
    }
    const old = [...stageLink.querySelectorAll(".stage-layer")].filter((el) => el !== layer);
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
    updateControls();
    document.documentElement.removeAttribute("data-colour-pending");
    if (announce) live.textContent = `${data.finishes[state.finish].name}, ${data.roles[img.role].toLowerCase()}`;
    if (lightbox.open) renderLightbox();
  }

  // ---------- Full-size viewer, with zoom ----------
  //
  // The photo opens as large as the screen allows, never larger than its real
  // pixels. Zoom (pinch, double-tap, click, the Zoom button, or + and -) goes
  // only as far as the photo stays sharp (zoomLimit), and while zoomed the photo
  // shown is the lossless copy with every pixel of the original. A photo too
  // small to zoom sharply on this screen simply has no zoom.
  let returnFocus = null;
  const lbStage = lightbox.querySelector("[data-lightbox-stage]");
  const lbCaption = lightbox.querySelector("[data-lightbox-caption]");
  const lbSteps = [...lightbox.querySelectorAll("[data-lightbox-step]")];
  const lbZoom = lightbox.querySelector("[data-lightbox-zoom]");
  const lb = { img: null, el: null, fit: { w: 1, h: 1 }, scale: 1, x: 0, y: 0, max: 1, full: false, fullRequested: false };
  const fastNetwork = () => {
    const c = navigator.connection;
    return !(c && (c.saveData || /2g/.test(c.effectiveType || "")));
  };

  lightbox.querySelector("[data-lightbox-close]").addEventListener("click", () => closeLightbox());
  lbSteps.forEach((b) => b.addEventListener("click", () => step(Number(b.dataset.lightboxStep))));
  lbZoom.addEventListener("click", () => (lb.scale > 1 ? zoomTo(1) : zoomTo(lb.max)));
  lightbox.addEventListener("keydown", (event) => {
    const pan = (dx, dy) => { event.preventDefault(); setZoom(lb.scale, { x: lb.x + dx, y: lb.y + dy }); };
    const zoomed = lb.scale > 1.001;
    if (event.key === "ArrowRight") zoomed ? pan(-80, 0) : (event.preventDefault(), step(1));
    else if (event.key === "ArrowLeft") zoomed ? pan(80, 0) : (event.preventDefault(), step(-1));
    else if (event.key === "ArrowUp" && zoomed) pan(0, 80);
    else if (event.key === "ArrowDown" && zoomed) pan(0, -80);
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(lb.max); }
    else if (event.key === "-" || event.key === "0") { event.preventDefault(); zoomTo(1); }
  });
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox(); // click on the dark backdrop
  });
  lightbox.addEventListener("cancel", (event) => {
    event.preventDefault(); // Escape: close with the same short fade
    closeLightbox();
  });
  lightbox.addEventListener("close", () => {
    lightbox.classList.remove("is-closing");
    lightboxRequest++; // ignore photos still loading
    lbStage.textContent = ""; // next time it opens with the current photo only
    lb.el = null;
    document.documentElement.style.overflow = "";
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  });
  new ResizeObserver(() => lightbox.open && refit()).observe(lbStage);

  function openLightbox(from) {
    returnFocus = from;
    document.documentElement.style.overflow = "hidden";
    lightbox.showModal();
    renderLightbox(); // after showModal, so the space for the photo can be measured
    lightbox.querySelector("[data-lightbox-close]").focus();
  }

  function closeLightbox() {
    if (!lightbox.open || lightbox.classList.contains("is-closing")) return;
    if (reduce.matches) return lightbox.close();
    lightbox.classList.add("is-closing"); // fades out (styles.css), then closes
    setTimeout(() => lightbox.close(), 200);
  }

  const space = () => ({ w: lbStage.clientWidth, h: lbStage.clientHeight });

  // The caption changes with the photo, so it always describes what is on screen.
  function renderLightbox() {
    const g = gallery();
    const img = g[state.index];
    const caption = `${data.name} · ${data.finishes[state.finish].name} · ${data.roles[img.role]} · ${state.index + 1} of ${g.length}`;
    lbSteps.forEach((b) => (b.hidden = g.length < 2));
    const ticket = ++lightboxRequest;
    lbStage.querySelectorAll(".is-loading").forEach((stale) => stale.remove());
    const fit = fitSize({ w: img.width, h: img.height }, space());
    const pic = pictureEl(img, `${Math.ceil(fit.w)}px`, "is-incoming", true);
    pic.className = "is-loading";
    const el = pic.querySelector("img");
    sizeTo(el, fit);
    lbStage.append(pic);
    if (!lb.el) lbCaption.textContent = caption; // nothing else on screen yet
    loadImage(el).then(() => {
      if (ticket !== lightboxRequest) return pic.remove();
      pic.className = "";
      lbCaption.textContent = caption;
      [...lbStage.children].forEach((child) => child !== pic && child.remove());
      Object.assign(lb, { img, el, fit, scale: 1, x: 0, y: 0, full: false, fullRequested: false });
      lb.max = zoomLimit(img.width, fit.w, window.devicePixelRatio);
      applyZoom();
      requestAnimationFrame(() => el.classList.remove("is-incoming"));
      // The lossless copy, ready before the first zoom; also when the screen already
      // shows the photo at its full detail (dense laptop screens).
      const atLimit = img.width < fit.w * Math.min(window.devicePixelRatio || 1, 2);
      if ((canZoom() || atLimit) && fastNetwork()) loadFull(ticket);
    });
  }

  function sizeTo(el, fit) {
    el.style.width = `${fit.w}px`;
    el.style.height = `${fit.h}px`;
  }

  const canZoom = () => lb.max >= 1.15;

  // Swap in the lossless copy (same size on screen, so nothing moves).
  function loadFull(ticket) {
    if (lb.fullRequested || !lb.img) return;
    lb.fullRequested = true;
    const el = document.createElement("img");
    el.src = lb.img.full;
    el.alt = lb.img.alt;
    el.width = lb.img.width;
    el.height = lb.img.height;
    el.className = "is-incoming";
    el.decoding = "async";
    el.draggable = false;
    sizeTo(el, lb.fit);
    lbStage.append(el);
    loadImage(el).then(() => {
      if (ticket !== lightboxRequest || !el.naturalWidth) return el.remove();
      const old = lb.el.closest("picture") || lb.el;
      lb.el = el;
      lb.full = true;
      applyZoom();
      el.classList.remove("is-incoming");
      old.remove();
    });
  }

  function refit() {
    if (!lb.el || !lb.img) return;
    const fit = fitSize({ w: lb.img.width, h: lb.img.height }, space());
    const k = fit.w / lb.fit.w;
    lb.fit = fit;
    lb.max = zoomLimit(lb.img.width, fit.w, window.devicePixelRatio);
    lbStage.querySelectorAll("img").forEach((el) => sizeTo(el, fit));
    setZoom(Math.min(lb.scale, lb.max), { x: lb.x * k, y: lb.y * k });
  }

  function setZoom(scale, offset, animate = false) {
    if (!lb.el) return;
    lb.scale = Math.min(Math.max(scale, 1), Math.max(lb.max, 1));
    const o = clampOffset(offset, lb.scale, lb.fit, space());
    lb.x = o.x;
    lb.y = o.y;
    if (lb.scale > 1 && !lb.full) loadFull(lightboxRequest);
    applyZoom(animate);
  }

  // Zoom with the Zoom button, a click, a double-tap or the keyboard.
  function zoomTo(scale, point = { x: 0, y: 0 }) {
    if (!canZoom() && scale > 1) return;
    const target = scale > 1 ? zoomAround(point, { x: lb.x, y: lb.y }, lb.scale, scale) : { x: 0, y: 0 };
    setZoom(scale, target, !reduce.matches);
  }

  function applyZoom(animate = false) {
    const el = lb.el;
    if (!el) return;
    el.classList.toggle("is-animating", animate);
    el.style.transform = lb.scale > 1 ? `translate(${lb.x.toFixed(1)}px, ${lb.y.toFixed(1)}px) scale(${lb.scale.toFixed(4)})` : "";
    lbStage.classList.toggle("can-zoom", canZoom());
    lbStage.classList.toggle("is-zoomed", lb.scale > 1);
    lbZoom.hidden = !canZoom();
    lbZoom.setAttribute("aria-pressed", String(lb.scale > 1));
    lbZoom.textContent = lb.scale > 1 ? "Zoom out" : "Zoom in";
  }

  // Touch and mouse on the full-size photo: pinch to zoom, drag to look around,
  // double-tap or click to zoom in and out, swipe for the next photo.
  {
    const points = new Map();
    let gesture = null;
    let lastTap = { t: 0, x: 0, y: 0 };
    const centre = (e) => {
      const r = lbStage.getBoundingClientRect();
      return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    };
    const startGesture = () => {
      const [a, b] = [...points.values()];
      gesture = b
        ? { kind: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale: lb.scale, offset: { x: lb.x, y: lb.y } }
        : { kind: "drag", start: { ...a }, offset: { x: lb.x, y: lb.y }, moved: 0 };
    };
    lbStage.addEventListener("pointerdown", (e) => {
      if (!lb.el || (e.pointerType === "mouse" && e.button !== 0)) return;
      lbStage.setPointerCapture(e.pointerId);
      points.set(e.pointerId, centre(e));
      if (points.size > 2) return;
      lb.el.classList.remove("is-animating");
      startGesture();
    });
    lbStage.addEventListener("pointermove", (e) => {
      if (!points.has(e.pointerId) || !gesture) return;
      points.set(e.pointerId, centre(e));
      const [a, b] = [...points.values()];
      if (gesture.kind === "pinch" && b) {
        const scale = Math.min(Math.max(gesture.scale * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.d), 1), Math.max(lb.max, 1));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const o = zoomAround(gesture.mid, gesture.offset, gesture.scale, scale);
        setZoom(scale, { x: o.x + mid.x - gesture.mid.x, y: o.y + mid.y - gesture.mid.y });
      } else if (gesture.kind === "drag") {
        const dx = a.x - gesture.start.x;
        const dy = a.y - gesture.start.y;
        gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
        if (lb.scale > 1) {
          lbStage.classList.add("is-dragging");
          setZoom(lb.scale, { x: gesture.offset.x + dx, y: gesture.offset.y + dy });
        }
      }
    });
    const end = (e) => {
      if (!points.has(e.pointerId)) return;
      const p = points.get(e.pointerId);
      points.delete(e.pointerId);
      lbStage.classList.remove("is-dragging");
      if (gesture?.kind === "drag" && e.type === "pointerup") {
        const dx = p.x - gesture.start.x;
        const dy = p.y - gesture.start.y;
        if (lb.scale <= 1.001 && e.pointerType !== "mouse" && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          step(dx < 0 ? 1 : -1); // swipe to the next photo (only when not zoomed)
        } else if (gesture.moved < 8) {
          const now = performance.now();
          const doubleTap = now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30;
          if (e.pointerType === "mouse" || doubleTap) {
            lb.scale > 1.001 ? zoomTo(1) : zoomTo(lb.max, p);
            lastTap = { t: 0, x: 0, y: 0 };
          } else {
            lastTap = { t: now, x: p.x, y: p.y };
          }
        }
      }
      if (lb.scale < 1.03 && lb.scale !== 1 && points.size === 0) setZoom(1, { x: 0, y: 0 }, !reduce.matches);
      gesture = null;
      if (points.size) startGesture(); // one finger left after a pinch: carry on dragging
    };
    lbStage.addEventListener("pointerup", end);
    lbStage.addEventListener("pointercancel", end);
    lbStage.addEventListener("dragstart", (e) => e.preventDefault());
  }

  // A pinch on a product photo on the page opens it here, sharp, instead of
  // stretching the small copy on the page.
  function pinchOpens(el, open) {
    const touches = new Set();
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      touches.add(e.pointerId);
      if (touches.size === 2 && !lightbox.open) open();
    });
    const lift = (e) => touches.delete(e.pointerId);
    el.addEventListener("pointerup", lift);
    el.addEventListener("pointercancel", lift);
  }
  pinchOpens(stage, () => openLightbox(stageLink));

  // The room photo and the close-up open full size too (in their real finish).
  document.querySelectorAll("[data-open-photo]").forEach((link) => {
    const [finish, role] = link.dataset.openPhoto.split(":");
    const open = () => {
      if (state.finish !== finish) choose(finish, { push: true });
      const i = gallery().findIndex((img) => img.role === role);
      if (i >= 0 && i !== state.index) show(i);
      openLightbox(link);
    };
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return; // new tab: the full photo itself
      event.preventDefault();
      open();
    });
    pinchOpens(link, open);
  });

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
    const fromUrl = colourFromSearch(location.search, FINISH_IDS) || data.default;
    if (fromUrl !== state.finish) choose(fromUrl, { push: false });
  });

  // ---------- Start ----------
  const requested = new URLSearchParams(location.search).get("colour");
  const initial = colourFromSearch(location.search, FINISH_IDS);
  if (requested && !initial) {
    // Unknown colour in the address: fall back to the default, and tidy the address.
    const url = new URL(location.href);
    url.searchParams.delete("colour");
    history.replaceState(null, "", url);
  }
  const otherFinish = initial && initial !== data.default;
  markSwatches();
  if (!otherFinish) renderThumbs(); // otherwise the requested finish's thumbnails come with its photo
  updateControls();
  stage.tabIndex = 0;
  stage.setAttribute("aria-label", `${data.name} photos. Use the left and right arrow keys to change view.`);
  if (otherFinish) {
    // The photo built into the page is the default finish. colour-first.js has
    // hidden it; take it out and load the requested finish instead.
    document.documentElement.setAttribute("data-colour-pending", "gallery");
    stageLink.querySelector(".stage-layer[data-built]")?.remove();
    choose(initial, { push: false, announce: false });
  } else {
    document.documentElement.removeAttribute("data-colour-pending");
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
