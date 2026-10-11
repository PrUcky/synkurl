// The site's pages, shared by the tests.
export const MODEL_IDS = ["arch", "dome", "spine", "stack", "box", "box-plus"];
export const INDEXED = ["/", "/models/", ...MODEL_IDS.map((id) => `/models/${id}/`), "/for-families", "/faq", "/join", "/investors", "/privacy"];
export const UTILITY = ["/check-email", "/confirm", "/remove", "/confirmed", "/removed", "/link-expired"];
export const PAGES = [...INDEXED, ...UTILITY, "/404"];

// The text a visitor can read: no tags, scripts, styles or JSON data blocks.
export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
