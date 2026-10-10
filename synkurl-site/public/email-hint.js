// Spots common email typos, like "gmial.com" or "gmail.con", and suggests a fix.
// It's only a hint: the person can ignore it and send the address as typed.

const POPULAR = [
  "gmail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "hotmail.com", "outlook.com",
  "rediffmail.com", "icloud.com", "live.com", "protonmail.com", "proton.me", "zoho.com",
];

// Real domains that look like typos of the popular ones. Never "correct" these.
const ALSO_REAL = new Set([
  "mail.com", "ymail.com", "gmx.com", "me.com", "mac.com", "msn.com", "live.in",
  "outlook.in", "hotmail.co.uk", "yahoo.co.uk", "aol.com", "zohomail.in",
]);

export function suggestEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain.length < 3 || POPULAR.includes(domain) || ALSO_REAL.has(domain)) return null;

  let best = null;
  let bestDistance = Infinity;
  for (const candidate of POPULAR) {
    const d = distance(domain, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  const allowed = domain.length >= 8 ? 2 : 1;
  return bestDistance <= allowed ? `${local}@${best}` : null;
}

// How many single-letter changes turn one word into the other
// (adding, removing, changing, or swapping two neighbouring letters).
function distance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}
