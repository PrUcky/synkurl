// "Four finishes" on the homepage: choose a finish and all six designs switch to it.
// Each design only ever shows a photo of that exact finish. Without this script
// the section shows all six in Dusk Violet, and every design still links to its page.

const section = document.querySelector("[data-finishes]");
const dataEl = document.getElementById("finish-data");
if (section && dataEl) setUpFinishes(section, JSON.parse(dataEl.textContent));

function setUpFinishes(section, data) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const box = section.querySelector("[data-finish-swatches]");
  const current = section.querySelector("[data-finish-current]");
  const ids = Object.keys(data.finishes);
  let selected = data.start;
  let request = 0;

  // Turn the plain labels into a radio group.
  box.setAttribute("role", "radiogroup");
  const swatches = [...box.querySelectorAll("[data-finish]")].map((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.dataset.finish = label.dataset.finish;
    btn.setAttribute("role", "radio");
    btn.innerHTML = label.innerHTML;
    btn.addEventListener("click", () => choose(btn.dataset.finish));
    label.replaceWith(btn);
    return btn;
  });
  box.addEventListener("keydown", (event) => {
    const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = ids[(ids.indexOf(selected) + moves[event.key] + ids.length) % ids.length];
    choose(next);
    swatches.find((s) => s.dataset.finish === next).focus();
  });

  function mark() {
    swatches.forEach((s) => {
      const on = s.dataset.finish === selected;
      s.setAttribute("aria-checked", String(on));
      s.tabIndex = on ? 0 : -1;
    });
    current.textContent = data.finishes[selected];
  }

  async function choose(finish) {
    if (!ids.includes(finish) || finish === selected) return;
    selected = finish;
    const ticket = ++request;
    mark();
    // Load all six new photos first, then switch them together.
    const jobs = data.models.map((m) => {
      const cell = section.querySelector(`[data-finish-cell="${m.id}"]`);
      const shot = m.byFinish[finish];
      const pic = cell.querySelector("picture");
      const fresh = document.createElement("picture");
      fresh.innerHTML = `<source type="image/avif" sizes="${pic.querySelector("source").sizes}"><source type="image/webp" sizes="${pic.querySelector("source").sizes}"><img class="plate-img" decoding="async" loading="eager">`;
      const [avif, webp] = fresh.querySelectorAll("source");
      avif.srcset = shot.avif;
      webp.srcset = shot.webp;
      const img = fresh.querySelector("img");
      img.src = shot.src;
      img.width = shot.width;
      img.height = shot.height;
      img.alt = shot.alt;
      // Preload invisibly inside a hidden holder so the browser picks the right source.
      const holder = document.createElement("div");
      holder.hidden = true;
      holder.append(fresh);
      cell.append(holder);
      const ready = new Promise((resolve) => {
        if (img.complete && img.naturalWidth) resolve();
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      }).then(() => (img.decode ? img.decode().catch(() => {}) : null));
      return { cell, m, shot, pic, fresh, holder, ready };
    });
    await Promise.all(jobs.map((j) => j.ready));
    if (ticket !== request) {
      jobs.forEach((j) => j.holder.remove());
      return;
    }
    for (const j of jobs) {
      const link = j.cell.querySelector("[data-finish-link]");
      link.href = `${j.m.url}?colour=${finish}`;
      const note = j.cell.querySelector("[data-finish-note]");
      note.textContent = j.shot.role === "studio" ? "" : "Close-up shown: no studio photo in this finish yet.";
      const swap = () => {
        j.pic.replaceWith(j.fresh);
        j.holder.remove();
      };
      if (reduce.matches) swap();
      else {
        j.pic.querySelector("img").classList.add("is-swapping");
        setTimeout(() => {
          if (ticket !== request) return j.holder.remove();
          j.fresh.querySelector("img").classList.add("is-swapping");
          swap();
          requestAnimationFrame(() => j.fresh.querySelector("img").classList.remove("is-swapping"));
        }, 200);
      }
    }
  }

  mark();
}
