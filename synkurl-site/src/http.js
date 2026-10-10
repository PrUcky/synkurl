// Small helpers for building responses.
//
// Static pages get their security headers from public/_headers.
// Responses made here in the Worker (API answers, redirects, message pages)
// get the same headers from SECURITY_HEADERS below. A test checks the two match.

// Content-Security-Policy: the list of places the browser may load things from.
// 'self' is synkurl.com itself. Turnstile is the bot check. The two
// cloudflareinsights hosts are Cloudflare Web Analytics (cookieless visit counts).
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com",
  "frame-src https://challenges.cloudflare.com",
  "manifest-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()",
};

// HSTS tells browsers "always use https for this site". Only for the real domain,
// never for workers.dev or localhost, and without preload.
export const HSTS = "max-age=31536000";
const HSTS_HOSTS = new Set(["synkurl.com", "www.synkurl.com"]);

export function withSecurityHeaders(response, url) {
  const res = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!res.headers.has(name)) res.headers.set(name, value);
  }
  if (HSTS_HOSTS.has(url.hostname)) res.headers.set("Strict-Transport-Security", HSTS);
  return res;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

// 303 means "go and GET this other page now". Used after a form is sent.
export function redirect(path) {
  return new Response(null, { status: 303, headers: { location: path, "cache-control": "no-store" } });
}

// A plain page with a title and one message. Used when the form is sent
// without JavaScript, so the person sees words instead of raw JSON.
export function messagePage(title, text, status = 200) {
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} · Synkurl</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="wrap">
    <div class="prose">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(text)}</p>
      <p><a class="text-link" href="/">Go to the home page</a> or write to <a class="text-link" href="mailto:synkurl@synkurl.com">synkurl@synkurl.com</a>.</p>
    </div>
  </main>
</body>
</html>`;
  return new Response(page, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
