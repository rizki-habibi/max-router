export async function GET_handler(req) {
  try {
    const raw = new URL(req.url).searchParams.get("url");
    if (!raw) return Response.json({ error: "URL wajib diisi" }, { status: 400 });
    const target = new URL(raw);
    if (!["http:", "https:"].includes(target.protocol)) {
      return Response.json({ error: "URL tidak valid" }, { status: 400 });
    }

    const response = await fetch(target.origin + "/", {
      headers: { "User-Agent": "Max-Router-Favicon/1.0", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await response.text();
    const candidates = [];
    const iconPattern = /<link\\s+[^>]*rel=["']([^"']*icon[^"']*)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = iconPattern.exec(html))) {
      try { candidates.push(new URL(match[2], target.origin).href); } catch {}
    }
    for (const href of ["/favicon.ico", "/favicon.png", "/favicon.svg"]) {
      candidates.push(new URL(href, target.origin).href);
    }

    const unique = [...new Set(candidates)];
    for (const iconUrl of unique) {
      try {
        const check = await fetch(iconUrl, {
          method: "HEAD",
          headers: { "User-Agent": "Max-Router-Favicon/1.0" },
          signal: AbortSignal.timeout(4000),
        });
        if (check.ok) {
          return Response.json({ iconUrl, source: "official-site" });
        }
      } catch {}
    }
    return Response.json({ iconUrl: target.origin + "/favicon.ico", source: "official-site-fallback" });
  } catch (error) {
    return Response.json({ error: error?.message || "Gagal mengambil favicon" }, { status: 400 });
  }
}
