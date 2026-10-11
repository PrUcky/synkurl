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

import { clampOffset, colourFromSearch, fileWidth, fitSize, indexAfterSwitch, stepIndex, zoomAround, zoomLimit } from "/gallery-state.js";

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
    if (event.altKey || event.ctrlKey || event.metaKey) return; // Back/Forward and browser shortcuts
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
    if (event.ctrlKey || event.metaKey || event.altKey) return; // Alt+Arrow is Back/Forward
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
    if (lightbox.open) renderLightbox(); // the viewer doesn't wait for the page photo
  }

  function show(index) {
    const g = gallery();
    state.index = stepIndex(index, 0, g.length);
    if (shownFinish === state.finish) markThumbs();
    swapStage(true);
    if (lightbox.open) renderLightbox(); // the viewer doesn't wait for the page photo
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
  // pixels. Zoom (pinch, double-tap, click, the Zoom button, + and -, or a
  // trackpad pinch) only goes as far as the photo ON SCREEN stays sharp: one
  // photo pixel per screen point, two on dense screens (zoomLimit). Until the
  // lossless copy (every pixel of the original) has arrived, that limit comes from
  // the smaller copy being shown; once it arrives, the zoom carries on to where
  // the customer asked. A photo too small to zoom sharply has no zoom at all.
  let returnFocus = null;
  const lbInner = lightbox.querySelector(".lightbox-inner");
  const lbStage = lightbox.querySelector("[data-lightbox-stage]");
  const lbCaption = lightbox.querySelector("[data-lightbox-caption]");
  const lbSteps = [...lightbox.querySelectorAll("[data-lightbox-step]")];
  const lbZoom = lightbox.querySelector("[data-lightbox-zoom]");
  const lbClose = lightbox.querySelector("[data-lightbox-close]");
  const blank = () => ({ img: null, el: null, ticket: 0, fit: { w: 1, h: 1 }, scale: 1, x: 0, y: 0, max: 1, fullMax: 1, full: false, pending: null, wanted: null });
  let lb = blank();
  let loadingImg = null; // the photo the viewer is fetching to show next
  let closeTimer = 0;
  let downTarget = null;
  let lastToggle = 0; // when a click or double-tap last zoomed in or out
  const dpr = () => window.devicePixelRatio || 1;
  const vv = window.visualViewport;
  const pageZoomed = () => Boolean(vv && vv.scale > 1.01);

  // When to fetch the lossless copy before any zoom: right away on a fast link,
  // after a short look where the browser can't tell, and only on zoom on slow
  // links or with Data Saver.
  const preloadDelay = () => {
    const c = navigator.connection;
    if (!c) return 700;
    return !c.saveData && c.effectiveType === "4g" ? 0 : null;
  };

  lbClose.addEventListener("click", () => closeLightbox());
  lbSteps.forEach((b) => b.addEventListener("click", () => step(Number(b.dataset.lightboxStep))));
  lbZoom.addEventListener("click", () => (lb.scale > 1.001 || lb.wanted ? zoomTo(1) : zoomTo(lb.fullMax)));
  // If the customer had already pinch-zoomed the page itself, let them pinch it back
  // out inside the viewer (otherwise the viewer would stay magnified).
  vv?.addEventListener("resize", () => lightbox.classList.toggle("page-zoomed", pageZoomed()));
  lightbox.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return; // browser zoom, Back/Forward
    const pan = (dx, dy) => { event.preventDefault(); setZoom(lb.scale, { x: lb.x + dx, y: lb.y + dy }, { pan: true }); };
    const zoomed = lb.scale > 1.001;
    if (event.key === "ArrowRight") zoomed ? pan(-80, 0) : (event.preventDefault(), step(1));
    else if (event.key === "ArrowLeft") zoomed ? pan(80, 0) : (event.preventDefault(), step(-1));
    else if (event.key === "ArrowUp" && zoomed) pan(0, 80);
    else if (event.key === "ArrowDown" && zoomed) pan(0, -80);
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(lb.fullMax); }
    else if (event.key === "-" || event.key === "0") { event.preventDefault(); zoomTo(1); }
  });
  // A click on the dark space around the photo closes the viewer, only when the
  // press started there too (sliding off a button must not close it).
  const bare = (t) => t === lightbox || t === lbInner;
  lightbox.addEventListener("pointerdown", (event) => (downTarget = event.target), true);
  lightbox.addEventListener("click", (event) => {
    if (bare(event.target) && bare(downTarget)) closeLightbox();
  });
  // A trackpad pinch (a wheel event with ctrlKey) zooms the photo, within the same
  // sharp limit, instead of zooming the whole page into blur. Plain scrolling is
  // left alone.
  lightbox.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    if (!lb.el || !canZoom()) return;
    const r = lbStage.getBoundingClientRect();
    const point = { x: event.clientX - r.left - r.width / 2, y: event.clientY - r.top - r.height / 2 };
    // Build on the zoom already asked for, even if it is still waiting for detail.
    const base = lb.wanted ? lb.wanted.scale : lb.scale;
    const baseOffset = lb.wanted ? lb.wanted.offset : { x: lb.x, y: lb.y };
    const scale = Math.min(Math.max(base * Math.exp(-event.deltaY * 0.01), 1), lb.fullMax);
    lb.el.classList.remove("is-animating");
    setZoom(scale, zoomAround(point, baseOffset, base, scale), { point });
  }, { passive: false });
  lightbox.addEventListener("cancel", (event) => {
    event.preventDefault(); // Escape: close with the same short fade
    closeLightbox();
  });
  lightbox.addEventListener("close", () => {
    clearTimeout(closeTimer);
    loadingImg = null;
    lightbox.classList.remove("is-closing", "page-zoomed");
    lightboxRequest++; // ignore photos still loading
    cancel(lb.pending);
    lbStage.querySelectorAll("img").forEach(cancel); // only ones still loading
    lbStage.textContent = ""; // next time it opens with the current photo only
    lb = blank();
    applyZoom();
    document.documentElement.style.overflow = "";
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  });
  new ResizeObserver(() => lightbox.open && refit()).observe(lbStage);
  // Moving the window to a screen with another pixel density changes the limit too.
  (function watchDensity() {
    const mq = window.matchMedia(`(resolution: ${dpr()}dppx)`);
    mq.addEventListener("change", () => { if (lightbox.open) refit(); watchDensity(); }, { once: true });
  })();

  function openLightbox(from) {
    clearTimeout(closeTimer);
    returnFocus = from;
    lightbox.classList.toggle("page-zoomed", pageZoomed());
    document.documentElement.style.overflow = "hidden";
    lightbox.showModal();
    renderLightbox(); // after showModal, so the space for the photo can be measured
    lbClose.focus();
  }

  function closeLightbox() {
    if (!lightbox.open || lightbox.classList.contains("is-closing")) return;
    if (reduce.matches) return lightbox.close();
    lightbox.classList.add("is-closing"); // fades out (styles.css), then closes
    closeTimer = setTimeout(() => lightbox.close(), 200);
  }

  // Stop downloading a photo nobody will see (a <picture> also loads from its sources).
  function cancel(el) {
    if (!el || el.complete) return;
    el.parentElement?.querySelectorAll("source").forEach((source) => source.removeAttribute("srcset"));
    el.removeAttribute("srcset");
    el.removeAttribute("src");
  }

  const space = () => ({ w: lbStage.clientWidth, h: lbStage.clientHeight });

  // The caption changes with the photo, so it always describes what is on screen.
  function renderLightbox() {
    const g = gallery();
    const img = g[state.index];
    // Already showing or fetching this photo (the page's own photo can finish later
    // and ask again): keep what's on screen, zoom included.
    if (img === loadingImg || (img === lb.img && !loadingImg)) return;
    loadingImg = img;
    cancel(lb.pending); // stepping away: stop fetching detail for the photo being left
    lb.pending = null;
    lb.wanted = null;
    const caption = `${data.name} · ${data.finishes[state.finish].name} · ${data.roles[img.role]} · ${state.index + 1} of ${g.length}`;
    lbSteps.forEach((b) => (b.hidden = g.length < 2));
    const ticket = ++lightboxRequest;
    lbStage.querySelectorAll(".is-loading").forEach((stale) => { stale.querySelectorAll("img").forEach(cancel); stale.remove(); });
    const fit = fitSize({ w: img.width, h: img.height }, space());
    const pic = pictureEl(img, `${Math.ceil(fit.w)}px`, "is-incoming", true);
    pic.className = "is-loading";
    const el = pic.querySelector("img");
    el.draggable = false;
    sizeTo(el, fit);
    lbStage.append(pic);
    if (!lb.el) lbCaption.textContent = caption; // nothing else on screen yet
    // If the frame grows later, the browser may pick a bigger copy: re-read the limit.
    el.addEventListener("load", () => {
      if (lb.el === el) {
        limits();
        zoomControls();
      }
    });
    loadImage(el).then(() => {
      if (ticket !== lightboxRequest) return pic.remove();
      loadingImg = null;
      // The space may have changed while it loaded.
      const now = fitSize({ w: img.width, h: img.height }, space());
      sizeTo(el, now);
      pic.className = "";
      lbCaption.textContent = caption;
      cancel(lb.pending);
      [...lbStage.children].forEach((child) => child !== pic && child.remove());
      lb = { ...blank(), img, el, ticket, fit: now };
      limits();
      applyZoom();
      requestAnimationFrame(() => el.classList.remove("is-incoming"));
      const delay = preloadDelay();
      if (delay !== null) setTimeout(() => lb.ticket === ticket && loadFull(), delay);
    });
  }

  function sizeTo(el, fit) {
    el.style.width = `${fit.w}px`;
    el.style.height = `${fit.h}px`;
  }

  // max: how far the photo on screen can zoom and stay sharp right now.
  // fullMax: how far it can once the lossless copy is there.
  function limits() {
    if (!lb.img) return;
    const shown = lb.full ? lb.img.width : fileWidth(lb.el.currentSrc || lb.el.src, lb.img.width) || lb.fit.w;
    lb.max = zoomLimit(shown, lb.fit.w, dpr());
    lb.fullMax = zoomLimit(lb.img.width, lb.fit.w, dpr());
  }

  const canZoom = () => lb.fullMax >= 1.15;

  // Fetch the lossless copy and put it in place of the copy on screen: same photo,
  // same size, same zoom, so it's swapped in one frame with nothing moving or fading.
  function loadFull() {
    if (lb.full || lb.pending || !lb.img) return;
    const { img, ticket } = lb;
    const el = document.createElement("img");
    el.alt = img.alt;
    el.width = img.width;
    el.height = img.height;
    el.decoding = "async";
    el.draggable = false;
    el.src = img.full;
    lb.pending = el;
    zoomControls();
    loadImage(el).then(() => {
      if (lb.ticket !== ticket || lb.img !== img || !lb.el?.isConnected || !el.naturalWidth) {
        if (lb.pending === el) {
          lb.pending = null;
          lb.wanted = null;
        }
        zoomControls();
        return;
      }
      const old = lb.el.closest("picture") || lb.el;
      const animating = lb.el.classList.contains("is-animating");
      sizeTo(el, lb.fit);
      // Start exactly where the copy on screen is now, even mid-animation.
      el.style.transform = animating ? getComputedStyle(lb.el).transform : lb.el.style.transform;
      old.before(el); // underneath the old copy, already decoded
      lb.el = el;
      lb.pending = null;
      lb.full = true;
      limits();
      requestAnimationFrame(() => old.remove());
      void el.offsetWidth; // so any animation below starts from that point
      // Carry on to the zoom the customer asked for while it loaded.
      const wanted = lb.wanted;
      lb.wanted = null;
      if (wanted) setZoom(wanted.scale, wanted.offset, { animate: !reduce.matches, point: wanted.point });
      else applyZoom(animating);
    });
  }

  function refit() {
    if (!lb.el || !lb.img) return;
    const fit = fitSize({ w: lb.img.width, h: lb.img.height }, space());
    const k = fit.w / lb.fit.w;
    lb.fit = fit;
    sizeTo(lb.el, fit);
    if (lb.pending) sizeTo(lb.pending, fit);
    if (!lb.full) lb.el.closest("picture")?.querySelectorAll("source").forEach((source) => (source.sizes = `${Math.ceil(fit.w)}px`));
    limits();
    const wanted = lb.wanted;
    if (wanted) setZoom(wanted.scale, { x: wanted.offset.x * k, y: wanted.offset.y * k }, { point: wanted.point });
    else setZoom(lb.scale, { x: lb.x * k, y: lb.y * k }, { pan: true });
  }

  // Applies a zoom, never past the sharp limit of the photo on screen. Asking for
  // more than that fetches the lossless copy and remembers the request (with the
  // point it was centred on), which carries on once the copy arrives.
  function setZoom(scale, offset, { animate = false, point = { x: 0, y: 0 }, pan = false } = {}) {
    if (!lb.el) return;
    const top = canZoom() ? Math.max(lb.fullMax, 1) : 1; // "no zoom" means no zoom, for every input
    const asked = Math.min(Math.max(scale, 1), top);
    // A newer photo is on its way: don't start zooming into the one being left.
    if (loadingImg && asked > lb.scale + 0.001) return;
    if (asked > lb.max + 0.001 && !lb.full) {
      lb.wanted = { scale: asked, offset, point };
      loadFull();
    } else if (!pan) {
      lb.wanted = null;
    } else if (lb.wanted) {
      // Looking around while the detail loads: the waiting view moves along too.
      const k = lb.wanted.scale / Math.max(lb.scale, 1);
      lb.wanted = { ...lb.wanted, offset: { x: offset.x * k, y: offset.y * k } };
    }
    const shown = Math.min(asked, Math.max(lb.max, 1));
    const o = clampOffset(shown === asked ? offset : zoomAround(point, offset, asked, shown), shown, lb.fit, space());
    lb.scale = shown;
    lb.x = o.x;
    lb.y = o.y;
    applyZoom(animate);
  }

  // Zoom with the Zoom button, a click, a double-tap or the keyboard.
  function zoomTo(scale, point = { x: 0, y: 0 }) {
    if (!canZoom() && scale > 1) return;
    const target = scale > 1 ? zoomAround(point, { x: lb.x, y: lb.y }, lb.scale, scale) : { x: 0, y: 0 };
    setZoom(scale, target, { animate: !reduce.matches, point });
  }

  function applyZoom(animate = false) {
    const el = lb.el;
    if (el) {
      el.classList.toggle("is-animating", animate);
      el.style.transform = lb.scale > 1 ? `translate(${lb.x.toFixed(1)}px, ${lb.y.toFixed(1)}px) scale(${lb.scale.toFixed(4)})` : "";
    }
    zoomControls();
  }

  function zoomControls() {
    const zoomed = lb.scale > 1.001;
    const waiting = Boolean(lb.wanted && lb.pending);
    lbStage.classList.toggle("can-zoom", canZoom());
    lbStage.classList.toggle("is-zoomed", zoomed);
    if (!canZoom() && document.activeElement === lbZoom) lbClose.focus(); // don't lose keyboard focus
    lbZoom.hidden = !canZoom();
    lbZoom.setAttribute("aria-pressed", String(zoomed || waiting));
    lbZoom.setAttribute("aria-busy", String(waiting));
    lbZoom.textContent = waiting ? "Loading detail…" : zoomed ? "Zoom out" : "Zoom in";
  }

  // Touch and mouse on the full-size photo: pinch to zoom, drag to look around,
  // double-tap or click to zoom in and out, swipe for the next photo, and a tap
  // or click beside the photo closes the viewer.
  {
    const points = new Map();
    let gesture = null;
    let multi = false; // this touch sequence had two fingers: it is not a tap or a swipe
    let lastTap = { t: 0, x: 0, y: 0 };
    const centre = (e) => {
      const r = lbStage.getBoundingClientRect();
      return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    };
    const startGesture = (onPhoto) => {
      const [a, b] = [...points.values()];
      // A new pinch builds on the zoom already asked for, even if it is still waiting for detail.
      const scale = lb.wanted ? lb.wanted.scale : lb.scale;
      const offset = lb.wanted ? lb.wanted.offset : { x: lb.x, y: lb.y };
      gesture = b
        ? { kind: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale, offset }
        : { kind: "drag", start: { ...a }, offset: { x: lb.x, y: lb.y }, moved: 0, onPhoto };
    };
    lbStage.addEventListener("pointerdown", (e) => {
      if (!lb.el || (e.pointerType === "mouse" && e.button !== 0)) return;
      lbStage.setPointerCapture(e.pointerId);
      points.set(e.pointerId, centre(e));
      if (points.size >= 2) multi = true;
      if (points.size > 2) return;
      lb.el.classList.remove("is-animating");
      startGesture(e.target.tagName === "IMG");
    });
    lbStage.addEventListener("pointermove", (e) => {
      if (!points.has(e.pointerId) || !gesture) return;
      points.set(e.pointerId, centre(e));
      const [a, b] = [...points.values()];
      if (gesture.kind === "pinch" && b) {
        const scale = Math.max(gesture.scale * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.d), 1);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const o = zoomAround(gesture.mid, gesture.offset, gesture.scale, scale);
        setZoom(scale, { x: o.x + mid.x - gesture.mid.x, y: o.y + mid.y - gesture.mid.y }, { point: mid });
      } else if (gesture.kind === "drag") {
        const dx = a.x - gesture.start.x;
        const dy = a.y - gesture.start.y;
        gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
        if (lb.scale > 1.001) {
          lbStage.classList.add("is-dragging");
          setZoom(lb.scale, { x: gesture.offset.x + dx, y: gesture.offset.y + dy }, { pan: true });
        }
      }
    });
    const end = (e) => {
      if (!points.has(e.pointerId)) return;
      const p = points.get(e.pointerId);
      points.delete(e.pointerId);
      lbStage.classList.remove("is-dragging");
      if (gesture?.kind === "drag" && e.type === "pointerup" && !multi) {
        const dx = p.x - gesture.start.x;
        const dy = p.y - gesture.start.y;
        const zoomed = lb.scale > 1.001;
        if (!zoomed && e.pointerType !== "mouse" && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          step(dx < 0 ? 1 : -1); // swipe to the next photo (only when not zoomed)
        } else if (gesture.moved < 8 && !gesture.onPhoto && !zoomed && performance.now() - lastToggle > 500) {
          closeLightbox(); // a tap or click beside the photo (not the second half of a double-click)
        } else if (gesture.moved < 8 && gesture.onPhoto) {
          const now = performance.now();
          if (e.pointerType === "mouse") {
            // One click zooms in or out; the second click of a double-click is ignored.
            if (now - lastToggle > 350) {
              zoomed || lb.wanted ? zoomTo(1) : zoomTo(lb.fullMax, p);
              lastToggle = now;
            }
          } else if (now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
            zoomed || lb.wanted ? zoomTo(1) : zoomTo(lb.fullMax, p); // double-tap
            lastTap = { t: 0, x: 0, y: 0 };
            lastToggle = now;
          } else {
            lastTap = { t: now, x: p.x, y: p.y };
          }
        }
      }
      if (points.size === 0) {
        if (lb.scale < 1.03 && lb.scale !== 1 && !lb.wanted) setZoom(1, { x: 0, y: 0 }, { animate: !reduce.matches });
        multi = false;
      }
      gesture = null;
      if (points.size) startGesture(false); // one finger left after a pinch: carry on dragging
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

  // Open a photo of this design full size, in its real finish.
  function openPhoto(finish, role, from) {
    if (state.finish !== finish) choose(finish, { push: true });
    const i = gallery().findIndex((img) => img.role === role);
    if (i >= 0 && i !== state.index) show(i);
    openLightbox(from);
  }

  // The room photo and the close-up open full size on click or pinch.
  document.querySelectorAll("[data-open-photo]").forEach((link) => {
    const [finish, role] = link.dataset.openPhoto.split(":");
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return; // new tab: the full photo itself
      event.preventDefault();
      openPhoto(finish, role, link);
    });
    pinchOpens(link, () => openPhoto(finish, role, link));
  });

  // The four-finish row: a pinch opens that finish's photo full size.
  document.querySelectorAll(".all-finishes [data-pick-finish]").forEach((link) => {
    pinchOpens(link, () => openPhoto(link.dataset.pickFinish, "studio", link));
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
