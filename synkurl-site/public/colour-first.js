// Runs on model pages before anything is drawn. If the address asks for a finish
// other than the page's default (/models/arch/?colour=rose-gold), the photo built
// into the page is the wrong colour: hide it until gallery.js has the right one,
// so a wrong-colour photo never shows, even for a moment.
(function () {
  var script = document.currentScript;
  var finishes = (script.getAttribute("data-finishes") || "").split(" ");
  var colour = new URLSearchParams(location.search).get("colour");
  if (finishes.indexOf(colour) < 0 || colour === script.getAttribute("data-default")) return;
  var root = document.documentElement;
  root.setAttribute("data-colour-pending", "");
  // Safety net: if gallery.js never takes over, show the page as it was built.
  setTimeout(function () {
    if (root.getAttribute("data-colour-pending") === "") root.removeAttribute("data-colour-pending");
  }, 5000);
})();
