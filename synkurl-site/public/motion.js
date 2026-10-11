// Shared motion for every page. Everything here is an extra: without it
// (old browser, JavaScript off, or "reduce motion" switched on) every page is
// complete and nothing stays hidden.
//
// 1. .motion-ready on <html> lets the CSS give [data-reveal] elements a starting
//    state. It's added only when motion is allowed, and removed again if the
//    visitor switches "reduce motion" on during their visit.
// 2. [data-reveal] elements settle in once, when they scroll into view.
// 3. [data-parallax] frames drift a few pixels as they pass (bounded to the
//    frames on screen, at most once per animation frame).
// 4. The header gets a hairline once the page has scrolled.

const root = document.documentElement;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const canWatch = "IntersectionObserver" in window;

// ---------- 1 and 2: reveals ----------
let revealer = null;
function startReveals() {
  if (!canWatch || reduce.matches) return;
  root.classList.add("motion-ready");
  revealer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        revealer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => {
    // Anything already on screen at load shows straight away.
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) el.classList.add("is-in");
    else revealer.observe(el);
  });
}
function stopReveals() {
  revealer?.disconnect();
  revealer = null;
  root.classList.remove("motion-ready");
  document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-in"));
}

// ---------- 3: gentle parallax inside photo frames ----------
const onScreen = new Set();
let frame = 0;
let watcher = null;
function drift() {
  frame = 0;
  const vh = window.innerHeight;
  for (const el of onScreen) {
    const box = el.getBoundingClientRect();
    // -1 when the frame enters at the bottom, +1 when it leaves at the top.
    const t = (vh - box.top) / (vh + box.height) * 2 - 1;
    // The photo is scaled up 8%, so it can move up to 3.5% of the frame height
    // each way without ever showing the frame's edge (and never more than 18px).
    const room = Math.min(18, box.height * 0.035);
    el.style.setProperty("--shift", `${(-Math.max(-1, Math.min(1, t)) * room).toFixed(1)}px`);
  }
}
const onScroll = () => {
  if (!frame && onScreen.size) frame = requestAnimationFrame(drift);
};
function startParallax() {
  if (!canWatch || reduce.matches) return;
  watcher = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target);
    onScroll();
  });
  document.querySelectorAll("[data-parallax]").forEach((el) => watcher.observe(el));
  window.addEventListener("scroll", onScroll, { passive: true });
}
function stopParallax() {
  watcher?.disconnect();
  watcher = null;
  onScreen.clear();
  window.removeEventListener("scroll", onScroll);
  document.querySelectorAll("[data-parallax]").forEach((el) => el.style.removeProperty("--shift"));
}

// "Reduce motion" can be switched on or off while the page is open.
function applyPreference() {
  if (reduce.matches) {
    stopReveals();
    stopParallax();
  } else {
    startReveals();
    startParallax();
  }
}
reduce.addEventListener("change", applyPreference);
applyPreference();

// ---------- 4: header hairline ----------
const head = document.querySelector("[data-site-head]");
if (head) {
  let scrolled = null;
  const check = () => {
    const now = window.scrollY > 8;
    if (now !== scrolled) head.classList.toggle("is-scrolled", (scrolled = now));
  };
  window.addEventListener("scroll", check, { passive: true });
  check();
}
