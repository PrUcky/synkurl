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
