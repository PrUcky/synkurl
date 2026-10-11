// The six-form chapter on the homepage.
//
// Phones, small windows, "reduce motion", or no JavaScript: a sideways row you
// swipe (CSS scroll snap), with previous/next buttons and a progress bar.
// Large screens: the chapter stays in place (position: sticky) while normal
// vertical scrolling moves the row sideways. The page never hijacks the wheel:
// the distance travelled is simply the row's extra width, measured from the
// real sizes and measured again when the window or images change.

const chapter = document.querySelector("[data-chapter]");
if (chapter) setUpChapter(chapter);

function setUpChapter(chapter) {
  const pin = chapter.querySelector("[data-chapter-pin]");
  const viewport = chapter.querySelector("[data-chapter-viewport]");
  const track = chapter.querySelector("[data-chapter-track]");
  const cards = [...track.querySelectorAll("[data-card]")];
  const bar = chapter.querySelector("[data-chapter-bar]");
  const [prevBtn, nextBtn] = chapter.querySelectorAll("[data-chapter-step]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const large = window.matchMedia("(min-width: 1000px) and (min-height: 620px)");

  let pinned = false;
  let travel = 0; // how far the row moves sideways, in px
  let start = 0; // page offset where pinning starts
  let frame = 0;

  const setProgress = (p) => {
    p = Math.min(1, Math.max(0, p));
    bar.parentElement.style.setProperty("--progress", String(0.17 + p * 0.83));
    prevBtn.disabled = p <= 0.001;
    nextBtn.disabled = p >= 0.999;
    return p;
  };

  // ---------- Native (swipe) mode ----------
  const nativeProgress = () => {
    const max = viewport.scrollWidth - viewport.clientWidth;
    setProgress(max > 0 ? viewport.scrollLeft / max : 0);
  };
  viewport.addEventListener("scroll", () => {
    if (pinned) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(nativeProgress);
  }, { passive: true });

  // ---------- Pinned mode ----------
  function measure() {
    const shouldPin = large.matches && !reduce.matches;
    if (shouldPin !== pinned) {
      pinned = shouldPin;
      chapter.classList.toggle("is-pinned", pinned);
      if (!pinned) {
        chapter.style.height = "";
        track.style.transform = "";
      }
    }
    if (!pinned) return nativeProgress();
    // Row overflow = how far it has to travel; the section grows by that much.
    travel = Math.max(0, track.scrollWidth - viewport.clientWidth);
    chapter.style.height = `${pin.offsetHeight + travel}px`;
    // The row starts moving once the pinned part reaches its sticky position (below the header).
    const pinTop = parseFloat(getComputedStyle(pin).top) || 0;
    start = chapter.getBoundingClientRect().top + window.scrollY - pinTop;
    update();
  }

  function update() {
    frame = 0;
    if (!pinned) return;
    const p = setProgress(travel ? (window.scrollY - start) / travel : 0);
    track.style.transform = `translate3d(${(-p * travel).toFixed(1)}px, 0, 0)`;
  }

  const onScroll = () => {
    if (pinned && !frame) frame = requestAnimationFrame(update);
  };

  // Only listen to scrolling while the chapter is near the screen.
  let listening = false;
  const near = new IntersectionObserver((entries) => {
    const visible = entries.some((e) => e.isIntersecting);
    if (visible && !listening) window.addEventListener("scroll", onScroll, { passive: true });
    if (!visible && listening) window.removeEventListener("scroll", onScroll);
    listening = visible;
    if (visible) update();
  }, { rootMargin: "200px 0px" });
  near.observe(chapter);

  // ---------- Buttons ----------
  function cardStep(dir) {
    const width = cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || "0");
    if (pinned) {
      const p = travel ? (window.scrollY - start) / travel : 0;
      const target = Math.round(p * travel / width + dir) * width;
      window.scrollTo({ top: start + Math.min(travel, Math.max(0, target)), behavior: reduce.matches ? "auto" : "smooth" });
    } else {
      viewport.scrollBy({ left: dir * width, behavior: reduce.matches ? "auto" : "smooth" });
    }
  }
  prevBtn.addEventListener("click", () => cardStep(-1));
  nextBtn.addEventListener("click", () => cardStep(1));

  // Keyboard users tabbing through the cards: keep the focused card in view.
  track.addEventListener("focusin", (event) => {
    if (!pinned) return;
    const card = event.target.closest("[data-card]");
    if (!card) return;
    const i = cards.indexOf(card);
    const width = card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || "0");
    window.scrollTo({ top: start + Math.min(travel, i * width), behavior: "auto" });
  });

  // ---------- Re-measure when things change ----------
  const ro = new ResizeObserver(() => measure());
  ro.observe(track);
  ro.observe(document.documentElement);
  track.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", measure, { once: true });
  });
  large.addEventListener("change", measure);
  reduce.addEventListener("change", measure);
  window.addEventListener("load", measure, { once: true });
  measure();
}
