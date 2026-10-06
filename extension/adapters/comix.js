// Comix — series page /title/{hid}-{slug}, chapter pages /title/{hid}-{slug}/{id}-chapter-{n}
// The site is a single-page app; every page embeds its data in <script id="initial-data">.
(function (root) {
  const U = root.MB_UTIL;

  function parseInitialData(json, hid) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return null;
    }
    const queries = (data && data.queries) || {};
    for (const key of Object.keys(queries)) {
      let parts;
      try {
        parts = JSON.parse(key);
      } catch {
        continue;
      }
      if (Array.isArray(parts) && parts[0] === 'manga' && parts[1] === 'detail' && parts[2] === hid) {
        return queries[key];
      }
    }
    return null;
  }

  function detailFromDoc(doc, hid) {
    const el = doc.querySelector('script#initial-data');
    return el ? parseInitialData(el.textContent, hid) : null;
  }

  function detailFromHtml(html, hid) {
    const m = html.match(/<script[^>]*id=["']initial-data["'][^>]*>([\s\S]*?)<\/script>/i);
    return m ? parseInitialData(m[1], hid) : null;
  }

  const titles = (list) => (list || []).map((x) => (typeof x === 'string' ? x : x && x.title)).filter(Boolean);

  root.MB_ADAPTERS.comix = {
    id: 'comix',
    label: 'Comix',
    library: 'manga',
    matches: (url) => /(^|\.)comix\.to$/i.test(url.hostname),

    async scrape(doc, url, env) {
      const m = url.pathname.match(/^\/title\/(([a-z0-9]+)(?:-[^/]*)?)(?:\/([^/]+))?/i);
      if (!m) return null;
      const hid = m[2];
      const seriesUrl = `${url.origin}/title/${m[1]}`;

      if (m[3]) {
        const cm = m[3].match(/chapter-(\d+(?:\.\d+)?)/i);
        return {
          kind: 'chapter',
          site: 'comix',
          seriesKey: hid,
          seriesUrl,
          chapter: cm ? Number(cm[1]) : U.maxChapter([U.text(doc.querySelector('title'))]),
        };
      }

      // After in-app navigation the embedded data can still describe the first page that was
      // opened, so if it's not for this series, download the current page and read that instead.
      let d = detailFromDoc(doc, hid);
      if (!d && env && env.fetch) {
        try {
          const res = await env.fetch(url.href, { credentials: 'include' });
          d = detailFromHtml(await res.text(), hid);
        } catch {
          /* fall through to meta tags */
        }
      }

      const meta = U.pageMeta(doc, url);
      if (!d) {
        return {
          kind: 'series',
          site: 'comix',
          seriesKey: hid,
          url: seriesUrl,
          title: meta.title,
          coverUrl: meta.coverUrl,
          synopsis: meta.synopsis,
          genres: [],
          tags: [],
          externalIds: {},
        };
      }

      const tags = [...titles(d.tags), ...titles(d.demographics), ...titles(d.formats)];
      if (d.type) tags.push(d.type);

      return {
        kind: 'series',
        site: 'comix',
        seriesKey: hid,
        url: d.url ? U.abs(d.url, url.origin) : seriesUrl,
        title: d.title || meta.title,
        altTitles: d.altTitles || [],
        coverUrl: (d.poster && (d.poster.large || d.poster.medium)) || meta.coverUrl,
        synopsis: U.stripMarkdown(d.synopsis),
        authors: U.uniq([...titles(d.authors), ...titles(d.artists)]),
        genres: titles(d.genres),
        tags: U.uniq(tags),
        pubStatus: U.pubStatus(d.status),
        chaptersAvailable: d.latestChapter || d.finalChapter || null,
        externalIds: U.externalIds(d.links),
      };
    },
  };
})(globalThis);
