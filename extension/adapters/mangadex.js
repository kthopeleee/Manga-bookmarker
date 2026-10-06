// MangaDex — uses the public API instead of the page (the site is a single-page app).
// Series: /title/{uuid}[/slug]   Chapter: /chapter/{uuid}[/page]
(function (root) {
  const U = root.MB_UTIL;
  const API = 'https://api.mangadex.org';
  const LANG_TYPE = { ja: 'manga', ko: 'manhwa', zh: 'manhua', 'zh-hk': 'manhua' };

  async function getJson(env, path) {
    const res = await env.fetch(API + path);
    if (!res.ok) throw new Error(`MangaDex API returned ${res.status}`);
    return res.json();
  }

  function pickTitle(attrs) {
    const t = attrs.title || {};
    if (t.en) return t.en;
    for (const alt of attrs.altTitles || []) if (alt.en) return alt.en;
    return Object.values(t)[0] || '';
  }

  root.MB_ADAPTERS.mangadex = {
    id: 'mangadex',
    label: 'MangaDex',
    library: 'manga',
    matches: (url) => /(^|\.)mangadex\.org$/i.test(url.hostname),

    async scrape(doc, url, env) {
      const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
      const chapterMatch = url.pathname.match(new RegExp(`^/chapter/${uuid}`, 'i'));
      if (chapterMatch) {
        const data = await getJson(env, `/chapter/${chapterMatch[1]}?includes[]=manga`);
        const manga = (data.data.relationships || []).find((r) => r.type === 'manga');
        const mangaId = manga && manga.id;
        return {
          kind: 'chapter',
          site: 'mangadex',
          seriesKey: mangaId,
          seriesUrl: mangaId ? `https://mangadex.org/title/${mangaId}` : null,
          seriesTitle: manga && manga.attributes ? pickTitle(manga.attributes) : '',
          chapter: U.num(data.data.attributes.chapter),
          externalIds: mangaId ? { md: mangaId } : {},
        };
      }

      const titleMatch = url.pathname.match(new RegExp(`^/title/${uuid}`, 'i'));
      if (!titleMatch) return null;
      const id = titleMatch[1];
      const data = await getJson(env, `/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`);
      const attrs = data.data.attributes;
      const rels = data.data.relationships || [];

      const title = pickTitle(attrs);
      const altTitles = U.uniq([
        ...Object.values(attrs.title || {}),
        ...(attrs.altTitles || []).flatMap((a) => Object.values(a)),
      ]).filter((t) => t !== title);

      const genres = [];
      const tags = [];
      for (const tag of attrs.tags || []) {
        const name = tag.attributes && tag.attributes.name && (tag.attributes.name.en || Object.values(tag.attributes.name)[0]);
        if (!name) continue;
        (tag.attributes.group === 'genre' ? genres : tags).push(name);
      }
      if (attrs.publicationDemographic) tags.push(attrs.publicationDemographic);
      if (LANG_TYPE[attrs.originalLanguage]) tags.push(LANG_TYPE[attrs.originalLanguage]);

      const cover = rels.find((r) => r.type === 'cover_art');
      const coverUrl =
        cover && cover.attributes && cover.attributes.fileName
          ? `https://uploads.mangadex.org/covers/${id}/${cover.attributes.fileName}.512.jpg`
          : null;

      let chaptersAvailable = U.num(attrs.lastChapter);
      if (chaptersAvailable == null) {
        // lastChapter is only set for finished series; otherwise use the highest English chapter.
        try {
          const agg = await getJson(env, `/manga/${id}/aggregate?translatedLanguage[]=en`);
          for (const vol of Object.values(agg.volumes || {})) {
            for (const ch of Object.keys(vol.chapters || {})) {
              const n = Number(ch);
              if (Number.isFinite(n) && (chaptersAvailable == null || n > chaptersAvailable)) chaptersAvailable = n;
            }
          }
        } catch {
          /* optional */
        }
      }

      const description = attrs.description || {};
      return {
        kind: 'series',
        site: 'mangadex',
        seriesKey: id,
        url: `https://mangadex.org/title/${id}`,
        title,
        altTitles: altTitles.slice(0, 10),
        coverUrl,
        synopsis: U.stripMarkdown(description.en || Object.values(description)[0] || ''),
        authors: U.uniq(
          rels
            .filter((r) => (r.type === 'author' || r.type === 'artist') && r.attributes)
            .map((r) => r.attributes.name),
        ),
        genres,
        tags: U.uniq(tags),
        pubStatus: U.pubStatus(attrs.status),
        chaptersAvailable,
        externalIds: { ...U.externalIds(attrs.links), md: id },
      };
    },
  };
})(globalThis);
