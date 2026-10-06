// Fallback for any other site: uses the page's preview tags (og:title, og:image, og:description).
(function (root) {
  const U = root.MB_UTIL;

  root.MB_ADAPTERS.generic = {
    id: 'generic',
    label: 'Website',
    library: 'manga',
    priority: 100,
    matches: () => true,

    async scrape(doc, url) {
      const meta = U.pageMeta(doc, url);
      const host = url.hostname.replace(/^www\./, '');
      // Drop a trailing " - Site Name" / " | Site Name" (spaces required, so "Re-Zero" stays intact).
      const title = meta.title.replace(/\s+[|\-–—]\s+[^|\-–—]+$/, (tail) => (tail.length < 40 ? '' : tail)).trim();
      const looksNovel = /novel/i.test(url.href) || /novel/i.test(meta.title);
      return {
        kind: 'series',
        site: host,
        siteLabel: host,
        seriesKey: null,
        url: meta.url,
        title: title || meta.title,
        coverUrl: meta.coverUrl,
        synopsis: meta.synopsis,
        authors: [],
        genres: [],
        tags: [],
        library: looksNovel ? 'novel' : 'manga',
        externalIds: {},
      };
    },
  };
})(globalThis);
