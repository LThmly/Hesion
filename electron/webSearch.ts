/** Lightweight web search + page fetch for tool-calling fallbacks. */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#92;/g, "\\")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function unwrapDuckUrl(raw: string): string {
  let url = decodeEntities(raw);
  if (url.startsWith("//")) url = `https:${url}`;
  try {
    const u = new URL(url);
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
  } catch {
    // keep url
  }
  return url;
}

function parseDuckDuckGoLite(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  // Lite markup: href='...' class='result-link'>title</a>
  const linkRe =
    /href=['"]([^'"]+)['"][^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && hits.length < 8) {
    const url = unwrapDuckUrl(m[1]);
    const title = stripTags(m[2]);
    if (!title || title.toLowerCase() === "more info") continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (/duckduckgo\.com\/(?:duckduckgo-help|y\.js)/i.test(url)) continue;
    if (/[?&]ad_domain=/i.test(url) || /bing\.com\/aclick/i.test(url)) continue;

    const after = html.slice(m.index, m.index + 1200);
    const snip = /class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i.exec(
      after,
    );
    const snippet = snip ? stripTags(snip[1]) : "";
    hits.push({ title, url, snippet });
  }
  return hits;
}

export async function webSearch(
  query: string,
  signal?: AbortSignal,
): Promise<string> {
  const q = query.trim();
  if (!q) return "No query provided.";

  const res = await fetch(
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal,
    },
  );

  if (!res.ok) {
    return `Search failed (${res.status}).`;
  }

  const html = await res.text();
  if (/captcha|anomaly-modal/i.test(html)) {
    return "Search temporarily blocked (captcha). Try again shortly.";
  }

  const hits = parseDuckDuckGoLite(html);
  if (!hits.length) {
    return `No web results for: ${q}`;
  }

  return hits
    .map(
      (h, i) =>
        `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ""}`,
    )
    .join("\n\n");
}

/** Fetch a URL and return readable text (for verifying search hits). */
export async function fetchPage(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http(s) URLs are allowed.";
  }

  const res = await fetch(parsed.toString(), {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Hesion/0.1; +https://hesion.local)",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
    signal,
  });

  if (!res.ok) {
    return `Fetch failed (${res.status}) for ${parsed.toString()}`;
  }

  const ctype = res.headers.get("content-type") || "";
  const raw = await res.text();
  let text = raw;
  if (/html/i.test(ctype) || /<html/i.test(raw.slice(0, 500))) {
    text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    text = stripTags(text);
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 12000) {
    text = `${text.slice(0, 12000)}\n…[truncated]`;
  }
  return text || "(empty page)";
}
