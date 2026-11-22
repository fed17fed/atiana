/**
 * Turns a page's HTML into a flat list of what a visitor (and a search engine) can see:
 * text pieces, image alt texts, link addresses, JSON-LD and the main <head> texts.
 * React's invisible text separators (<!-- -->) and all other markup details are ignored on purpose.
 * Used by the task 12.6 test: "with an empty text table the pages show exactly the same texts as before".
 */
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

export function htmlTokens(html: string): string[] {
  const out: string[] = [];
  const ld = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g), (m) => `ld:${decode(m[1])}`);
  let body = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  // Reviews and the newsletter form have their own components (not part of 12.6): leave them out on both sides.
  body = body.replace(/<section[^>]*aria-labelledby="quotes-h"[\s\S]*?<\/section>/g, "");
  body = body.replace(/<section[^>]*id="newsletter"[\s\S]*?<\/section>/g, "");
  // Only the page itself (inside <main>, when the HTML has one): header and footer belong to the layout, not to this task.
  const mainAt = body.search(/<main\b/);
  if (mainAt >= 0) body = body.slice(mainAt, body.lastIndexOf("</main>"));
  for (const m of body.matchAll(/<(img|a)\b([^>]*)>|<[^>]*>|([^<]+)/g)) {
    if (m[3] !== undefined) {
      const t = decode(m[3]).replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    } else if (m[1] === "img") {
      const alt = /\balt="([^"]*)"/.exec(m[2]);
      if (alt) out.push(`alt:${decode(alt[1])}`);
    } else if (m[1] === "a") {
      const href = /\bhref="([^"]*)"/.exec(m[2]);
      if (href) out.push(`href:${decode(href[1])}`);
    }
  }
  return [...out, ...ld];
}

/** <title>, description and Open Graph title / description from the head. */
export function headTexts(html: string): Record<string, string> {
  const pick = (re: RegExp) => {
    const m = re.exec(html);
    return m ? decode(m[1]) : "";
  };
  return {
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    ogTitle: pick(/<meta property="og:title" content="([^"]*)"/),
    ogDescription: pick(/<meta property="og:description" content="([^"]*)"/),
  };
}
