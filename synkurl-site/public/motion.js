// Shared motion for every page. Everything here is an extra: without it
// (old browser, JavaScript off, or "reduce motion" switched on) the page is
// complete and every picture shows its still, finished state.

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const canWatch = "IntersectionObserver" in window;

// 1. "motion-ready" lets the CSS hide story pieces until they scroll into view.
//    Only set when the visitor hasn't asked for reduced motion.
if (!reduce.matches && canWatch) document.documentElement.classList.add("motion-ready");

// 2. Endless animations (the hero tiles, the device's glow) pause while off screen.
if (canWatch) {
  const loops = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.toggleAttribute("data-offscreen", !entry.isIntersecting);
  });
  document.querySelectorAll("[data-loop]").forEach((el) => loops.observe(el));
}

// 3. Story scenes play once, when they're mostly on screen.
if (canWatch) {
  const scenes = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        scenes.unobserve(entry.target);
      }
    },
    { threshold: 0.35 }
  );
  document.querySelectorAll(".story-scene").forEach((el) => scenes.observe(el));
}

// 4. Hero: on a computer with a mouse (not phones), the art shifts slightly with the pointer.
const hero = document.querySelector(".hero");
const heroArt = document.querySelector(".hero-art svg");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 861px)");
if (hero && heroArt && finePointer.matches && !reduce.matches) {
  let frame = 0;
  let x = 0;
  let y = 0;
  hero.addEventListener("pointermove", (event) => {
    x = event.clientX / window.innerWidth - 0.5;
    y = event.clientY / window.innerHeight - 0.5;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      heroArt.style.transform = `translate(${(x * 14).toFixed(1)}px, ${(y * 10).toFixed(1)}px)`;
    });
  });
  hero.addEventListener("pointerleave", () => {
    heroArt.style.transform = "";
  });
}
