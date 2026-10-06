// Mangago — series page /read-manga/{slug}/, chapter pages /read-manga/{slug}/uu/{prefix}_chapter-{n}/pg-1/
(function (root) {
  const U = root.MB_UTIL;

  function infoRows(doc) {
    const rows = {};
    for (const td of U.all(doc, '.manga_right td')) {
      const label = U.text(td.querySelector('label')).toLowerCase().replace(/[:\s]+$/, '');
      if (label) rows[label] = td;
    }
    return rows;
  }

  root.MB_ADAPTERS.mangago = {
    id: 'mangago',
    label: 'Mangago',
    library: 'manga',
    matches: (url) => /(^|\.)mangago\./i.test(url.hostname),

    async scrape(doc, url) {
      const m = url.pathname.match(/^\/read-manga\/([^/]+)\/?(.*)$/);
      if (!m) return null;
      const slug = m[1];
      const rest = m[2] || '';
      const seriesUrl = `${url.origin}/read-manga/${slug}/`;

      if (/chapter/i.test(rest)) {
        // e.g. uu/nml_chapter-25/pg-1/, uu/to_v-6-chapter-35/pg-1/. "nhs_chapter-1273591" is an internal id, not a number.
        const cm = rest.match(/([a-z]+)_(?:v-?\d+-)?chapter-(\d+(?:\.\d+)?)/i);
        let chapter = cm && cm[1].toLowerCase() !== 'nhs' ? Number(cm[2]) : null;
        if (chapter == null) chapter = U.maxChapter([U.text(doc.querySelector('title'))]);
        return { kind: 'chapter', site: 'mangago', seriesKey: slug, seriesUrl, chapter };
      }

      const rows = infoRows(doc);
      const meta = U.pageMeta(doc, url);
      const title = U.text(doc.querySelector('.w-title h1')) || meta.title.replace(/\s+manga$/i, '');
      const cover = U.imgSrc(doc.querySelector('#information .cover img'));

      const statusTd = rows['status'];
      const authorTd = rows['author'];
      const genreTd = rows['genre(s)'] || rows['genres'] || rows['genre'];
      const altTd = rows['alternative'];

      let altTitles = [];
      if (altTd) {
        const labelText = U.text(altTd.querySelector('label'));
        altTitles = U.text(altTd)
          .replace(labelText, '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const chapterLinks = U.all(doc, '#chapter_table a.chico').map(U.text);
      let chaptersAvailable = U.maxChapter(chapterLinks);
      if (chaptersAvailable == null) chaptersAvailable = U.num(U.text(doc.querySelector('#chapter_tab')));

      // Community tags in the "Top tags" box: "Isekai (99)". Long ones are usually jokes.
      const tags = U.all(doc, '.aside a.tag')
        .map((a) => U.text(a).replace(/\(\s*\d+\s*\)\s*$/, '').trim())
        .filter((t) => t && t.length <= 25);

      // "History: Ch.2" under the title is the user's own Mangago reading history.
      let lastReadHint = null;
      for (const div of U.all(doc, '.w-title div')) {
        if (/^history/i.test(U.text(div))) {
          lastReadHint = U.maxChapter([U.text(div.querySelector('a'))]);
          break;
        }
      }

      return {
        kind: 'series',
        site: 'mangago',
        seriesKey: slug,
        url: seriesUrl,
        title,
        altTitles,
        coverUrl: U.abs(cover, url.href) || meta.coverUrl,
        synopsis: U.multiline(doc.querySelector('.manga_summary')) || meta.synopsis,
        authors: authorTd ? U.uniq(U.all(authorTd, 'a').map(U.text).filter(Boolean)) : [],
        genres: genreTd ? U.uniq(U.all(genreTd, 'a').map(U.text).filter(Boolean)) : [],
        tags: U.uniq(tags),
        pubStatus: statusTd ? U.pubStatus(U.text(statusTd.querySelector('span')) || U.text(statusTd)) : null,
        chaptersAvailable,
        lastReadHint,
        externalIds: {},
      };
    },
  };
})(globalThis);
