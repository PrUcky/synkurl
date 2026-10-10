// Synkurl site backend (a Cloudflare Worker).
//
// Cloudflare serves the files in /public directly. This code runs for:
//   POST /api/join            join the waitlist (src/waitlist.js)
//   GET  /confirm, /remove    show the page with a button (no change yet)
//   POST /confirm, /remove    the button was pressed: confirm or remove
//   the daily Cron Trigger    delete unconfirmed sign-ups older than 7 days

import { json, withSecurityHeaders } from "./http.js";
import { cleanUpPending, handleConfirm, handleJoin, handleRemove } from "./waitlist.js";

const ROUTES = {
  "/api/join": { POST: handleJoin },
  "/confirm": { POST: handleConfirm },
  "/remove": { POST: handleRemove },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];

    let response;
    if (!route) {
      response = await env.ASSETS.fetch(request);
    } else if (route[request.method]) {
      response = await route[request.method](request, env);
    } else if (!url.pathname.startsWith("/api/") && (request.method === "GET" || request.method === "HEAD")) {
      // Opening a link from an email only shows the page. It never changes anything.
      response = await env.ASSETS.fetch(request);
    } else {
      response = json({ error: "That method isn't allowed here." }, 405, { allow: Object.keys(route).join(", ") });
    }
    return withSecurityHeaders(response, url);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanUpPending(env));
  },
};
