// "Reduce motion": every page must have a still version of its motion.
// The rule we check: in styles.css, every animation and transition lives inside
// @media (prefers-reduced-motion: no-preference). With "reduce motion" on, none of
// it applies, and the base styles show each picture's still, finished state.
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { PAGES } from "./pages.js";

const get = async (path) => (await exports.default.fetch(`https://synkurl.com${path}`)).text();

// Walks the CSS and lists every declaration with the @-rules and selectors around it.
function declarations(css) {
  const out = [];
  const stack = [];
  let buffer = "";
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (ch === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (ch === "}") {
      if (buffer.trim()) out.push({ decl: buffer.trim(), context: [...stack] });
      stack.pop();
      buffer = "";
    } else if (ch === ";") {
      out.push({ decl: buffer.trim(), context: [...stack] });
      buffer = "";
    } else {
      buffer += ch;
    }
  }
  return out;
}

const insideMotionGuard = (context) => context.some((c) => /prefers-reduced-motion:\s*no-preference/.test(c));

describe("reduce motion", () => {
  it("every animation, transition and page transition in styles.css is inside the motion guard", async () => {
    const css = await get("/styles.css");
    const moving = declarations(css).filter(({ decl, context }) => {
      const isMotion = /^(animation|animation-name|transition|scroll-behavior)\s*:/.test(decl) && !/:\s*none\b/.test(decl);
      const isViewTransition = context.some((c) => c.startsWith("@view-transition") || c.startsWith("::view-transition"));
      return isMotion || isViewTransition;
    });
    expect(moving.length).toBeGreaterThan(5);
    const unguarded = moving.filter(({ context }) => !insideMotionGuard(context));
    expect(unguarded.map((d) => `${d.context.join(" > ")} { ${d.decl} }`)).toEqual([]);
  });

  it("transitions and keyframes only change transform and opacity", async () => {
    const css = await get("/styles.css");
    for (const { decl, context } of declarations(css)) {
      if (/^transition\s*:/.test(decl)) {
        const props = decl.replace(/^transition\s*:/, "").replace(/\([^()]*\)/g, "()").split(",").map((part) => part.trim().split(/\s+/)[0]);
        for (const prop of props) expect(["transform", "opacity"], decl).toContain(prop);
      }
      if (context.some((c) => c.startsWith("@keyframes"))) {
        const prop = decl.split(":")[0].trim();
        expect(["transform", "opacity"], `${context.join(" > ")} { ${decl} }`).toContain(prop);
      }
    }
  });

  it("every page uses styles.css and has no motion of its own", async () => {
    for (const path of PAGES) {
      const page = await get(path);
      expect(page, path).toContain('<link rel="stylesheet" href="/styles.css">');
      expect(page, path).not.toMatch(/<style[\s>]/);
      expect(page, path).not.toMatch(/style="[^"]*(animation|transition)/);
      expect(page, path).not.toMatch(/<animate/);
    }
  });

  it("the motion scripts check the reduce-motion setting", async () => {
    for (const path of ["/motion.js", "/home.js"]) {
      expect(await get(path), path).toContain("prefers-reduced-motion: reduce");
    }
  });
});
