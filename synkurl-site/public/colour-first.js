// Runs on model pages before anything is drawn. If the address asks for a finish
// other than the page's default (/models/arch/?colour=rose-gold), the photo built
// into the page is the wrong colour: hide it until gallery.js has the right one,
// so a wrong-colour photo never shows, even for a moment. It also starts loading
// the right photo now, instead of waiting for gallery.js.
(function () {
  var script = document.currentScript;
  var data = function (name) { return script.getAttribute("data-" + name) || ""; };
  var colour = new URLSearchParams(location.search).get("colour");
  if (data("finishes").split(" ").indexOf(colour) < 0 || colour === data("default")) return;
  var root = document.documentElement;
  root.setAttribute("data-colour-pending", "");
  var preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "image";
  preload.type = "image/avif";
  preload.setAttribute("imagesrcset", data("hero-" + colour));
  preload.setAttribute("imagesizes", data("sizes"));
  preload.setAttribute("fetchpriority", "high");
  document.head.appendChild(preload);
  // Safety net: if gallery.js never takes over, show the page as it was built.
  setTimeout(function () {
    if (root.getAttribute("data-colour-pending") === "") root.removeAttribute("data-colour-pending");
  }, 5000);
})();
