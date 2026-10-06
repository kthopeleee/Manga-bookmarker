// Scanlation sites built on the two common WordPress manga themes, Madara and MangaThemesia
// (LunaScans and many others). Detected from the page structure, not the host name.
// NOTE: written from the themes' usual markup; check against a saved LunaScans page.
(function (root) {
  const U = root.MB_UTIL;

  function siteInfo(url, doc) {
    const host = url.hostname.replace(/^www\./, '');
    if (/luna/i.test(host)) return { site: 'lunascans', label: 'LunaScans' };
    return { site: host, label: (doc && U.meta(doc, 'og:site_name')) || host };
  }

  function isMadara(doc) {
    return !!doc.querySelector('.summary_image, .wp-manga-chapter, .reading-content, body.wp-manga-template-default');
  }

  function isThemesia(doc) {
    return !!doc.querySelector('.seriestucontl, .infox, #chapterlist, .bigcontent, .ts-breadcrumb, #readerarea');
  }

  // Madara: "Status", "Alternative", "Author(s)" rows are .post-content_item with .summary-heading + .summary-content
  function madaraRow(doc, name) {
    for (const item of U.all(doc, '.post-content_item, .post-status .post-content_item')) {
      if (U.text(item.querySelector('.summary-heading')).toLowerCase().startsWith(name)) {
        return item.querySelector('.summary-content');
      }
    }
    return null;
  }

  function themesiaRow(doc, name) {
    for (const el of U.all(doc, '.imptdt, .fmed, .tsinfo .imptdt')) {
      const t = U.text(el).toLowerCase();
      if (t.startsWith(name)) return el.querySelector('i, span, a') || el;
    }
    return null;
  }

  // MangaThemesia's "seriestu" layout (Kingofshojo) puts Alternative, Status, Type, Author... in a table.
  function themesiaTable(doc) {
    const rows = {};
    for (const tr of U.all(doc, 'table.infotable tr')) {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 2) rows[U.text(tds[0]).toLowerCase()] = U.text(tds[1]);
    }
    return rows;
  }

  // What these themes show when a field is empty.
  const isBlank = (s) => !s || /^(-|\?|n\/a|unknown|updating)$/i.test(s);

  function seriesFromPath(url) {
    const m = url.pathname.match(/^\/(manga|series|comics|comic|webtoon|manhwa|title)\/([^/]+)\/?(.*)$/i);
    return m ? { base: m[1], slug: m[2], rest: m[3] || '' } : null;
  }

  function madara(doc, url) {
    const info = siteInfo(url);
    const p = seriesFromPath(url);
    const slug = p ? p.slug : url.pathname.replace(/\/+$/, '').split('/').pop();
    const seriesUrl = p ? `${url.origin}/${p.base}/${p.slug}/` : url.href;

    if ((p && /chapter/i.test(p.rest)) || doc.querySelector('.reading-content')) {
      const crumbs = U.all(doc, '.breadcrumb a, .wp-manga-nav .breadcrumb a');
      const seriesLink = crumbs.length >= 2 ? crumbs[crumbs.length - 1] : null;
      return {
        kind: 'chapter',
        site: info.site,
        seriesKey: slug,
        seriesUrl: seriesLink ? U.abs(seriesLink.getAttribute('href'), url.href) : seriesUrl,
        seriesTitle: seriesLink ? U.text(seriesLink) : '',
        chapter: U.maxChapter([p ? p.rest : '', U.text(doc.querySelector('#chapter-heading, h1'))], /chapter[-_\s]*(\d+(?:\.\d+)?)/i),
      };
    }

    const titleEl = doc.querySelector('.post-title h1, .post-title h3');
    let title = U.text(titleEl);
    if (titleEl) {
      const badge = U.text(titleEl.querySelector('span'));
      if (badge) title = title.replace(badge, '').trim();
    }
    const status = madaraRow(doc, 'status');
    const alt = madaraRow(doc, 'alternative');
    return {
      kind: 'series',
      site: info.site,
      seriesKey: slug,
      url: seriesUrl,
      title,
      altTitles: alt ? U.text(alt).split(/[;,/]/).map((s) => s.trim()).filter(Boolean) : [],
      coverUrl: U.abs(U.imgSrc(doc.querySelector('.summary_image img')), url.href),
      synopsis: U.multiline(doc.querySelector('.description-summary .summary__content, .summary__content, .manga-excerpt')),
      authors: U.texts(doc, '.author-content a, .artist-content a'),
      genres: U.texts(doc, '.genres-content a'),
      tags: U.texts(doc, '.tags-content a'),
      pubStatus: U.pubStatus(U.text(status)),
      chaptersAvailable: U.maxChapter(U.all(doc, '.wp-manga-chapter a').map(U.text)),
      externalIds: {},
    };
  }

  function themesia(doc, url) {
    const info = siteInfo(url);
    const p = seriesFromPath(url);

    if (doc.querySelector('#readerarea') || (!p && /chapter/i.test(url.pathname))) {
      const crumbs = U.all(doc, '.ts-breadcrumb a, ol[itemtype*="BreadcrumbList"] a');
      const allc = doc.querySelector('.allc a');
      const seriesLink = allc || (crumbs.length >= 2 ? crumbs[1] : null);
      const seriesHref = seriesLink ? U.abs(seriesLink.getAttribute('href'), url.href) : null;
      const sp = seriesHref ? seriesFromPath(new URL(seriesHref)) : null;
      return {
        kind: 'chapter',
        site: info.site,
        seriesKey: sp ? sp.slug : null,
        seriesUrl: seriesHref,
        seriesTitle: seriesLink ? U.text(seriesLink) : '',
        chapter: U.maxChapter([url.pathname, U.text(doc.querySelector('h1.entry-title, h1'))], /chapter[-_\s]*(\d+(?:\.\d+)?)/i),
      };
    }
    if (!p) return null;

    const table = themesiaTable(doc);
    const field = (name) => {
      const v = U.text(themesiaRow(doc, name)) || table[name] || '';
      return isBlank(v) ? '' : v;
    };

    const nums = U.all(doc, '#chapterlist li[data-num]').map((li) => 'chapter ' + li.getAttribute('data-num'));
    // ".epcurlast" is the "Latest: Chapter 50" button, for when the chapter list loads later.
    const chapterTexts = nums.length ? nums : U.all(doc, '#chapterlist .chapternum, .eph-num .chapternum, .epcurlast').map(U.text);
    const alt = U.text(doc.querySelector('.seriestualt, .alternative, .wd-full .alter')) || field('alternative');
    const type = field('type');
    return {
      kind: 'series',
      site: info.site,
      seriesKey: p.slug,
      url: `${url.origin}/${p.base}/${p.slug}/`,
      title: U.text(doc.querySelector('h1.entry-title, .seriestuheader h1')),
      altTitles: alt ? alt.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [],
      coverUrl: U.abs(U.imgSrc(doc.querySelector('.thumb img, .seriestucontl .thumb img, .bigcover img')), url.href),
      // Some sites start the synopsis with an SEO line: "Read manhwa A Beast's Paradise / 짐승의 낙원".
      synopsis: U.multiline(doc.querySelector('.entry-content[itemprop="description"], .seriestuhead .entry-content, .synp .entry-content')).replace(
        /^read (?:manhwa|manhua|manga|webtoon|comics?)\b[^\n]*\n+/i,
        '',
      ),
      authors: U.uniq([field('author'), field('artist')].filter(Boolean)),
      genres: U.texts(doc, '.mgen a, .seriestugenre a, .genxed a'),
      tags: type ? [type] : [],
      pubStatus: U.pubStatus(field('status')),
      chaptersAvailable: U.maxChapter(chapterTexts),
      externalIds: {},
    };
  }

  root.MB_ADAPTERS['wp-manga'] = {
    id: 'wp-manga',
    label: 'Scan site',
    library: 'manga',
    priority: 10, // after the site-specific adapters
    matches: (url, doc) => !!doc && (isMadara(doc) || isThemesia(doc)),

    async scrape(doc, url) {
      const r = isMadara(doc) ? madara(doc, url) : themesia(doc, url);
      if (r) r.siteLabel = siteInfo(url, doc).label;
      return r;
    },
  };
})(globalThis);
