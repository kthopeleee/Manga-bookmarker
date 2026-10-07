// BornToBeNovel (B2B Novel) — series page /novel/{slug}, chapter pages /novel/{slug}/chapters/ch-{n}.
// The schema.org Book data names the series as "English / romanised / original", one list mixes genres
// with tags, and a badge like "Orig:120ch." gives the original chapter count.
(function (root) {
  const U = root.MB_UTIL;

  function jsonLd(doc, type) {
    for (const el of U.all(doc, 'script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(el.textContent);
      } catch {
        continue;
      }
      for (const item of Array.isArray(data) ? data : data['@graph'] || [data]) {
        if (item && item['@type'] === type) return item;
      }
    }
    return null;
  }

  // "I Possessed a Promiscuous Guide / mullanhan guideue binguihaetta / 문란한 가이드에 빙의했다"
  const names = (s) =>
    String(s || '')
      .split(' / ')
      .map((t) => t.trim())
      .filter(Boolean);

  const SITE_SUFFIX = /\s*(?:\[[^\]]*\]\s*)?[–—-]\s*read novel online on BornToBeNovel\s*$/i;

  root.MB_ADAPTERS.borntobenovel = {
    id: 'borntobenovel',
    label: 'BornToBeNovel',
    library: 'novel',
    matches: (url) => /(^|\.)borntobenovel\.com$/i.test(url.hostname),

    async scrape(doc, url) {
      const m = url.pathname.match(/^\/novel\/([^/]+)(?:\/chapters\/ch-(\d+(?:\.\d+)?))?/i);
      if (!m) return null;
      const slug = m[1];
      const seriesUrl = `${url.origin}/novel/${slug}`;
      const meta = U.pageMeta(doc, url);

      if (m[2] != null) {
        return {
          kind: 'chapter',
          site: 'borntobenovel',
          seriesKey: slug,
          seriesUrl,
          seriesTitle: names(meta.title.replace(SITE_SUFFIX, '').replace(/\s*[–—|:-]?\s*ch(?:apter)?\.?\s*\d.*$/i, ''))[0] || '',
          chapter: Number(m[2]),
        };
      }

      const ld = jsonLd(doc, 'Book') || {};
      const all = names(ld.name || meta.title.replace(SITE_SUFFIX, ''));
      const heading = doc.querySelector('.desktop-title, .hero-title');
      let title = all[0] || '';
      if (!title && heading) {
        const clone = heading.cloneNode(true);
        for (const alt of clone.querySelectorAll('.alt-names')) alt.remove();
        title = U.text(clone);
      }

      // The first badges are the age rating, the status and the chapter count; the rest are genres and tags.
      const badges = U.all(doc, '.desktop-genres .genre-tag, .genres-scroll .genre-tag');
      const isLabel = (el) => /\b(rating|status|chapters)-tag\b/.test(el.className || '');
      const tags = U.uniq([...badges.filter((el) => !isLabel(el)).map(U.text), ...(Array.isArray(ld.genre) ? ld.genre : [])]).filter(Boolean);
      const statusEl = doc.querySelector('.status-tag');
      const origEl = doc.querySelector('.chapters-tag');

      // Chapters on the site, if the list is on the page; otherwise the original's count from the badge.
      // Only the chapter list counts: the cover and the Read button link to chapter 1 too.
      const chapterHrefs = U.all(doc, '.chapter-card a, a.chapter-link')
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => h.includes(`/novel/${slug}/chapters/ch-`));
      const listed = U.maxChapter(chapterHrefs, /\/chapters\/ch-(\d+(?:\.\d+)?)/i);
      const original = origEl ? U.num(U.text(origEl)) : null;

      return {
        kind: 'series',
        site: 'borntobenovel',
        seriesKey: slug,
        url: seriesUrl,
        title,
        altTitles: all.slice(1).filter((t) => t.toLowerCase() !== title.toLowerCase()),
        coverUrl: U.abs(ld.image, url.href) || U.abs(U.imgSrc(doc.querySelector('.desktop-cover, .hero-cover')), url.href) || meta.coverUrl,
        // The schema.org copy keeps HTML entities like &#39; as text, the page doesn't.
        synopsis: U.multiline(doc.querySelector('.desktop-description .novel-description, .novel-description')) || meta.synopsis,
        authors: [],
        // One list holds both, e.g. "Yaoi, Omegaverse, Male Lead": the shared genre list picks out the genres.
        genres: [],
        tags,
        pubStatus: U.pubStatus(statusEl ? U.text(statusEl) : ''),
        chaptersAvailable: listed ?? original,
        externalIds: {},
      };
    },
  };
})(globalThis);
