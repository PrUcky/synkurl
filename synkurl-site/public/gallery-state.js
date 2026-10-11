// The gallery's small decisions, kept separate so they can be tested on their own.

// The finish asked for in the address (?colour=…), or null if it's missing or unknown.
export function colourFromSearch(search, finishIds) {
  const value = new URLSearchParams(search).get("colour");
  return finishIds.includes(value) ? value : null;
}

// After switching finish: keep the same kind of view (studio, in a home, close-up)
// if the new finish has it; otherwise go back to the studio view, or the first view.
export function indexAfterSwitch(nextGallery, currentRole) {
  const same = nextGallery.findIndex((img) => img.role === currentRole);
  if (same >= 0) return same;
  const studio = nextGallery.findIndex((img) => img.role === "studio");
  return studio >= 0 ? studio : 0;
}

// Previous/next, wrapping around at the ends.
export function stepIndex(index, dir, length) {
  return length ? (index + dir + length) % length : 0;
}

// ---------- Zoom in the full-size viewer ----------

// The size the photo is shown at before zooming: as large as the space allows,
// but never larger than its real pixels (one photo pixel per screen point).
export function fitSize(natural, space) {
  const scale = Math.min(space.w / natural.w, space.h / natural.h, 1);
  return { w: Math.max(1, natural.w * scale), h: Math.max(1, natural.h * scale) };
}

// How far the viewer may zoom before the photo would start to blur. A sharp photo
// needs one photo pixel per screen point on standard screens, and two on
// high-density screens (the same detail phones and laptops use for "@2x" pictures).
// 1 means no zoom at all.
export function zoomLimit(naturalWidth, shownWidth, dpr) {
  const need = Math.min(Math.max(dpr || 1, 1), 2);
  return Math.max(1, naturalWidth / (shownWidth * need));
}

// Keep the zoomed photo covering the space: it can't be dragged off screen.
// offset is measured from the centre; size is the photo's size before zooming.
export function clampOffset(offset, scale, size, space) {
  const maxX = Math.max(0, (size.w * scale - space.w) / 2);
  const maxY = Math.max(0, (size.h * scale - space.h) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}

// Zoom from one scale to another while the photo point under `point` stays put
// (point and offsets are measured from the centre of the space).
export function zoomAround(point, offset, fromScale, toScale) {
  const k = toScale / fromScale;
  return { x: point.x - (point.x - offset.x) * k, y: point.y - (point.y - offset.y) * k };
}

// The real pixel width of a photo file, read from its name: "studio-rose-gold-960.avif"
// is 960 wide; a "-full.webp" file has every pixel of the original (fullWidth).
// Returns 0 when it can't tell.
export function fileWidth(url, fullWidth) {
  if (/-full\.webp$/.test(url || "")) return fullWidth;
  const m = /-(\d+)\.(avif|webp|jpe?g)$/.exec(url || "");
  return m ? Number(m[1]) : 0;
}
