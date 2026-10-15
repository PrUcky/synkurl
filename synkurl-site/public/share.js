// The second share button. The WhatsApp button is a plain link and needs no script.
// Phones with a share menu get "Share another way". Others get "Copy link".
// No tracking: the link is always just https://synkurl.com

const LINK = "https://synkurl.com";
const TEXT =
  "I've joined the waitlist for Synkurl. They're building a small home device and phone app to save an extra copy of family photos and videos.";

for (const button of document.querySelectorAll("[data-share]")) {
  const status = button.closest(".share")?.querySelector(".share-status");
  const canShare = typeof navigator.share === "function";
  const canCopy = Boolean(navigator.clipboard?.writeText);
  if (!canShare && !canCopy) continue; // stays hidden; the WhatsApp link still works

  button.textContent = canShare ? "Share another way" : "Copy link";
  button.hidden = false;
  button.addEventListener("click", async () => {
    if (canShare) {
      try {
        await navigator.share({ title: "Synkurl", text: TEXT, url: LINK });
      } catch {
        // closed the share menu: nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(LINK);
      if (status) status.textContent = "Link copied. Paste it anywhere.";
    } catch {
      if (status) status.textContent = "Couldn't copy. The link is synkurl.com";
    }
  });
}
