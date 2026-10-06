// NovelUpdates — series page /series/{slug}/. Chapters are read on other sites, so no chapter pages here.
(function (root) {
  const U = root.MB_UTIL;

  // The page hides decoy release rows with CSS like `.chp-release.rand912{display:none;}`.
  function hiddenReleaseClasses(doc) {
    const hidden = new Set();
    for (const style of U.all(doc, 'style')) {
      const re = /\.chp-release\.([\w-]+)\s*\{[^}]*display\s*:\s*none/gi;
      let m;
      while ((m = re.exec(style.textContent || ''))) hidden.add(m[1]);
    }
    return hidden;
  }

  root.MB_ADAPTERS.novelupdates = {
    id: 'novelupdates',
    label: 'NovelUpdates',
    library: 'novel',
    matches: (url) => /(^|\.)novelupdates\.com$/i.test(url.hostname),

    async scrape(doc, url) {
      const m = url.pathname.match(/^\/series\/([^/]+)/);
      if (!m) return null;
      const slug = m[1];
      const meta = U.pageMeta(doc, url);

      let cover = U.imgSrc(doc.querySelector('.serieseditimg img, .seriesimg img'));
      if (cover && /noimage/i.test(cover)) cover = null;

      const hidden = hiddenReleaseClasses(doc);
      const releases = U.all(doc, '#myTable a.chp-release')
        .filter((a) => !Array.from(a.classList || []).some((c) => hidden.has(c)))
        .map((a) => a.getAttribute('title') || U.text(a));

      const statusText = U.text(doc.querySelector('#editstatus'));
      const statusParen = statusText.match(/\(([^)]+)\)/);

      const tags = [...U.texts(doc, '#showtags a'), ...U.texts(doc, '#showtype a'), ...U.texts(doc, '#showlang a')];

      return {
        kind: 'series',
        site: 'novelupdates',
        seriesKey: slug,
        url: `${url.origin}/series/${slug}/`,
        title: U.text(doc.querySelector('.seriestitlenu')) || meta.title,
        altTitles: U.multiline(doc.querySelector('#editassociated'))
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        coverUrl: U.abs(cover, url.href) || meta.coverUrl,
        synopsis: U.multiline(doc.querySelector('#editdescription')) || meta.synopsis,
        authors: U.texts(doc, '#showauthors a'),
        genres: U.texts(doc, '#seriesgenre a'),
        tags: U.uniq(tags),
        pubStatus: U.pubStatus(statusParen ? statusParen[1] : statusText),
        chaptersAvailable: U.maxChapter(releases, /c(\d+(?:\.\d+)?)/i),
        externalIds: {},
      };
    },
  };
})(globalThis);
