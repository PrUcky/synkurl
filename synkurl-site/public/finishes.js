// "Four finishes" on the homepage: choose a finish and all six designs switch to it.
// Each design only ever shows a photo of that exact finish. The six new photos load
// first, then cross-fade in together with the "Showing" name and the links.
// Without this script the swatches stay hidden; the section shows all six in one
// finish, and every design still links to its page.

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
  box.hidden = false;
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
    if (event.altKey || event.ctrlKey || event.metaKey) return; // Back/Forward and browser shortcuts
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
  }

  async function choose(finish) {
    if (!ids.includes(finish) || finish === selected) return;
    selected = finish;
    const ticket = ++request;
    mark();
    // Load all six new photos invisibly, on top of the current ones.
    const jobs = data.models.map((m) => {
      const cell = section.querySelector(`[data-finish-cell="${m.id}"]`);
      const plate = cell.querySelector(".finish-plate");
      // Photos still loading for an older choice are dropped (never ones already shown).
      plate.querySelectorAll(".plate-layer.is-incoming").forEach((stale) => stale.remove());
      const shot = m.byFinish[finish];
      const sizes = plate.querySelector("source").sizes;
      const fresh = document.createElement("picture");
      fresh.className = "plate-layer is-incoming";
      fresh.innerHTML = `<source type="image/avif" sizes="${sizes}"><source type="image/webp" sizes="${sizes}"><img class="plate-img" decoding="async" loading="eager">`;
      const [avif, webp] = fresh.querySelectorAll("source");
      avif.srcset = shot.avif;
      webp.srcset = shot.webp;
      const img = fresh.querySelector("img");
      img.src = shot.src;
      img.width = shot.width;
      img.height = shot.height;
      img.alt = shot.alt;
      plate.append(fresh);
      const ready = new Promise((resolve) => {
        if (img.complete && img.naturalWidth) resolve();
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      }).then(() => (img.decode ? img.decode().catch(() => {}) : null));
      return { cell, m, shot, plate, fresh, ready };
    });
    await Promise.all(jobs.map((j) => j.ready));
    if (ticket !== request) {
      jobs.forEach((j) => j.fresh.classList.contains("is-incoming") && j.fresh.remove());
      return;
    }
    // Everything is ready: switch the name, links, notes and photos together.
    current.textContent = data.finishes[finish];
    for (const j of jobs) {
      j.cell.querySelector("[data-finish-link]").href = `${j.m.url}?colour=${finish}`;
      j.cell.querySelector("[data-finish-note]").textContent =
        j.shot.role === "studio" ? "" : "Close-up shown"; // no studio photo in this finish yet
      const old = [...j.plate.children].filter((el) => el !== j.fresh);
      const done = () => old.forEach((el) => el.remove());
      if (reduce.matches) {
        j.fresh.classList.remove("is-incoming");
        done();
      } else {
        requestAnimationFrame(() => {
          j.fresh.classList.remove("is-incoming");
          setTimeout(done, 260);
        });
      }
    }
  }

  mark();
}
