// Asura Scans — series page /comics/{slug}-{id}, chapter pages /comics/{slug}-{id}/chapter/{n}
// (older domains used /series/ for the same thing). The page's schema.org data has almost
// everything; the visible page is the fallback when that's missing.
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

  // The text next to a small label such as "Status" or "Type".
  function labelled(doc, label) {
    for (const el of U.all(doc, 'div, span')) {
      if (el.children.length === 0 && U.text(el) === label && el.parentElement) {
        return U.text(el.parentElement).slice(label.length).trim();
      }
    }
    return '';
  }

  // "LEE Dong Wook/ PARK Saenal" is two people.
  const people = (list) => U.uniq(list.flatMap((s) => String(s || '').split('/')).map((s) => s.trim()).filter(Boolean));
  const list = (v) => (Array.isArray(v) ? v : v ? String(v).split(/\s*[,•]\s*/) : []).map((s) => String(s).trim()).filter(Boolean);

  // The id after the name ("overgeared-bd5bdaf8") has changed before, so the key is just the name.
  const keyFor = (slug) => slug.replace(/-[0-9a-f]{8}$/i, '');

  root.MB_ADAPTERS.asura = {
    id: 'asura',
    label: 'Asura Scans',
    library: 'manga',
    matches: (url) => /(^|\.)(asurascans|asuracomic|asuratoon)\.[a-z]+$/i.test(url.hostname),

    async scrape(doc, url) {
      const m = url.pathname.match(/^\/(comics|series)\/([^/]+)(?:\/chapter\/(\d+(?:\.\d+)?))?/i);
      if (!m) return null;
      const seriesUrl = `${url.origin}/${m[1]}/${m[2]}`;
      const seriesKey = keyFor(m[2]);

      if (m[3] != null) {
        const crumbs = (jsonLd(doc, 'BreadcrumbList') || {}).itemListElement || [];
        const crumb = crumbs.find((c) => String(c.item || '').replace(/\/$/, '') === seriesUrl);
        return {
          kind: 'chapter',
          site: 'asura',
          seriesKey,
          seriesUrl,
          seriesTitle: crumb ? crumb.name : U.text(doc.querySelector('title')).replace(/\s+chapter\s+\d.*$/i, ''),
          chapter: Number(m[3]),
        };
      }

      const ld = jsonLd(doc, 'ComicSeries') || {};
      const meta = U.pageMeta(doc, url);
      const title = ld.name || U.text(doc.querySelector('h1')) || meta.title.replace(/\s*\|\s*Asura Scans$/i, '');
      const image = ld.image && typeof ld.image === 'object' ? ld.image.url : ld.image;

      const authors = ld.author
        ? people([ld.author.name, ld.illustrator && ld.illustrator.name])
        : people(U.all(doc, 'a[href*="/browse?author="], a[href*="/browse?artist="]').map(U.text));

      const genres = ld.genre ? list(ld.genre) : U.texts(doc, 'a[href*="/browse?genres="]');
      const type = labelled(doc, 'Type');

      // Only this series' chapter links; the page also links to other series.
      const chapterHrefs = U.all(doc, 'a[href*="/chapter/"]')
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => h.includes(`/${m[2]}/chapter/`));
      const chaptersAvailable = U.maxChapter(chapterHrefs, /\/chapter\/(\d+(?:\.\d+)?)/) ?? (ld.numberOfEpisodes || null);

      return {
        kind: 'series',
        site: 'asura',
        seriesKey,
        url: seriesUrl,
        title,
        altTitles: list(ld.alternateName || U.text(doc.querySelector('#alt-titles'))).filter(
          (t) => t.toLowerCase() !== title.toLowerCase(),
        ),
        coverUrl: U.abs(image, url.href) || meta.coverUrl,
        // The schema.org description is cut short ("Gr..."), the page has all of it.
        synopsis: U.multiline(doc.querySelector('#description-text')) || ld.description || meta.synopsis,
        authors,
        genres,
        tags: type ? [type] : [],
        pubStatus: U.pubStatus(labelled(doc, 'Status')),
        chaptersAvailable,
        externalIds: {},
      };
    },
  };
})(globalThis);
