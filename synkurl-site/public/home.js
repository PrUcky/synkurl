// The app demo on the home page: one phone you can tap, swipe or use with the
// keyboard to move through the four screens. Without this script, the four
// screens simply show side by side.

const demo = document.querySelector("[data-demo]");
if (demo) setUpDemo(demo);

function setUpDemo(demo) {
  const scroller = demo.querySelector(".demo-screens");
  const panels = [...scroller.querySelectorAll(".phone-mock")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;

  // Build the row of tabs under the phone.
  const tablist = document.createElement("div");
  tablist.className = "demo-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "App screens");

  const tabs = panels.map((panel, i) => {
    const name = panel.querySelector("figcaption").textContent;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "demo-tab";
    tab.id = `${panel.id}-tab`;
    tab.textContent = name;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", () => show(i, true));
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.removeAttribute("aria-label");
    tablist.append(tab);
    return tab;
  });

  // Arrow keys move between tabs (the usual pattern for tabs).
  tablist.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return; // Back/Forward and browser shortcuts
    const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next = null;
    if (event.key in moves) next = (current + moves[event.key] + panels.length) % panels.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = panels.length - 1;
    if (next === null) return;
    event.preventDefault();
    show(next, true);
    tabs[next].focus();
  });

  // Tapping the phone moves to the next screen.
  scroller.addEventListener("click", () => show((current + 1) % panels.length, true));

  // Swiping: when a screen snaps into place, mark its tab as selected.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) show(panels.indexOf(entry.target), false);
      }
    },
    { root: scroller, threshold: 0.6 }
  );

  function show(index, scroll) {
    current = index;
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].inert = !on;
    });
    if (scroll) {
      scroller.scrollTo({ left: panels[index].offsetLeft, behavior: reduce.matches ? "auto" : "smooth" });
    }
  }

  demo.append(tablist);
  demo.classList.add("demo-ready");
  panels.forEach((panel) => seen.observe(panel));
  show(0, false);
}
