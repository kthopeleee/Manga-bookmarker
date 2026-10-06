import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapters, fixtureDoc, htmlDoc, scrape } from './helpers.mjs';

const sandbox = loadAdapters();

test('Mangago series page', async () => {
  const r = await scrape(
    sandbox,
    fixtureDoc('mangago-series.html'),
    'https://www.mangago.me/read-manga/dead_end_caf_in_the_royal_capital/',
  );
  assert.equal(r.kind, 'series');
  assert.equal(r.site, 'mangago');
  assert.equal(r.library, 'manga');
  assert.equal(r.seriesKey, 'dead_end_caf_in_the_royal_capital');
  assert.equal(r.url, 'https://www.mangago.me/read-manga/dead_end_caf_in_the_royal_capital/');
  assert.equal(r.title, 'Dead-End Café in the Royal Capital');
  assert.match(r.coverUrl, /^https:\/\/i4\.mangapicgallery\.com\/r\/coverlink\/.+\.webp/);
  assert.deepEqual(r.genres, ['Shoujo', 'Fantasy', 'Romance']);
  assert.deepEqual(r.authors, ['Shuu']);
  assert.equal(r.pubStatus, 'ongoing');
  assert.equal(r.chaptersAvailable, 25);
  assert.equal(r.lastReadHint, 2);
  assert.equal(r.altTitles.length, 2);
  assert.match(r.altTitles[1], /^Outo no Ikidomari Cafe/);
  assert.ok(r.tags.includes('Isekai'));
  assert.ok(r.tags.includes('Strong Female Lead'));
  assert.ok(!r.tags.some((t) => t.startsWith('WAITING')), 'joke tags are dropped');
  assert.ok(!r.tags.some((t) => /\(\d+\)/.test(t)), 'tag counts are stripped');
  assert.match(r.synopsis, /^Mai Sasaki lived a quiet life/);
  assert.match(r.synopsis, /feels like home\.$/);
  assert.match(r.synopsis, /\n\nHealthy once again/, 'paragraph breaks are kept');
});

test('Mangago chapter pages', async () => {
  const doc = htmlDoc('<html><head><title>Read</title></head><body></body></html>');
  const r = await scrape(
    sandbox,
    doc,
    'https://www.mangago.me/read-manga/dead_end_caf_in_the_royal_capital/uu/nml_chapter-25/pg-1/',
  );
  assert.deepEqual(
    { kind: r.kind, site: r.site, seriesKey: r.seriesKey, chapter: r.chapter, seriesUrl: r.seriesUrl },
    {
      kind: 'chapter',
      site: 'mangago',
      seriesKey: 'dead_end_caf_in_the_royal_capital',
      chapter: 25,
      seriesUrl: 'https://www.mangago.me/read-manga/dead_end_caf_in_the_royal_capital/',
    },
  );

  const vol = await scrape(sandbox, doc, 'https://www.mangago.me/read-manga/the_gorilla_god_s_go_to_girl/uu/to_v-6-chapter-35/pg-1/');
  assert.equal(vol.chapter, 35);

  // nhs_chapter-<id> uses an internal id, not a chapter number
  const nhs = await scrape(sandbox, doc, 'https://www.mangago.me/read-manga/x/uu/nhs_chapter-1273591/');
  assert.equal(nhs.chapter, null);
});

test('Comix series page (embedded data)', async () => {
  const r = await scrape(sandbox, fixtureDoc('comix-series.html'), 'https://comix.to/title/zgmdj-void-swell');
  assert.equal(r.kind, 'series');
  assert.equal(r.site, 'comix');
  assert.equal(r.seriesKey, 'zgmdj');
  assert.equal(r.url, 'https://comix.to/title/zgmdj-void-swell');
  assert.equal(r.title, 'Void Swell');
  assert.deepEqual(r.altTitles, ['Black Tide', '黑潮']);
  assert.equal(r.coverUrl, 'https://static.comix.to/2d0a/i/7/21/6a7c4f6fd44ad.jpg');
  assert.deepEqual(r.genres, ['Boys Love', 'Drama', 'Fantasy', 'Horror']);
  assert.ok(r.tags.includes('manhua'));
  assert.equal(r.pubStatus, 'ongoing');
  assert.equal(r.chaptersAvailable, 12);
  assert.equal(r.synopsis, 'Original Webtoon', 'markdown links become plain text');
  assert.deepEqual(r.authors, ['主神_DM']);
  assert.deepEqual(r.externalIds, { mu: '7cyaozt' });
});

test('Comix: stale embedded data after in-app navigation is re-fetched', async () => {
  // The page still holds data for "zgmdj", but the URL is now another series.
  const doc = fixtureDoc('comix-series.html');
  const otherHtml = `<html><body><script type="application/json" id="initial-data">${JSON.stringify({
    queries: {
      [JSON.stringify(['manga', 'detail', 'lldl2'])]: {
        hid: 'lldl2',
        title: 'Creating Hidden Endings',
        status: 'finished',
        latestChapter: 62,
        url: '/title/lldl2-creating-hidden-endings',
        genres: [{ title: 'Action' }],
        links: { md: 'https://mangadex.org/title/9aaec59c-3bd9-48fa-b1e2-ab0961d0231b', al: 'https://anilist.co/manga/191071' },
      },
    },
  })}</script></body></html>`;
  let fetched = null;
  const env = {
    fetch: async (url) => {
      fetched = url;
      return { ok: true, text: async () => otherHtml };
    },
  };
  const r = await scrape(sandbox, doc, 'https://comix.to/title/lldl2-creating-hidden-endings', env);
  assert.equal(fetched, 'https://comix.to/title/lldl2-creating-hidden-endings');
  assert.equal(r.title, 'Creating Hidden Endings');
  assert.equal(r.pubStatus, 'completed');
  assert.equal(r.chaptersAvailable, 62);
  assert.deepEqual(r.externalIds, { al: '191071', md: '9aaec59c-3bd9-48fa-b1e2-ab0961d0231b' });
});

test('Comix chapter page', async () => {
  const r = await scrape(sandbox, htmlDoc('<html><body></body></html>'), 'https://comix.to/title/zgmdj-void-swell/11456936-chapter-12');
  assert.equal(r.kind, 'chapter');
  assert.equal(r.seriesKey, 'zgmdj');
  assert.equal(r.chapter, 12);
  assert.equal(r.seriesUrl, 'https://comix.to/title/zgmdj-void-swell');
});

test('NovelUpdates series page', async () => {
  const r = await scrape(
    sandbox,
    fixtureDoc('novelupdates-series.html'),
    'https://www.novelupdates.com/series/buying-the-villainess-at-the-start-as-a-background-character/',
  );
  assert.equal(r.kind, 'series');
  assert.equal(r.site, 'novelupdates');
  assert.equal(r.library, 'novel');
  assert.equal(r.title, 'Buying the Villainess at the Start as a Background Character');
  assert.equal(
    r.coverUrl,
    'https://cdn.novelupdates.com/images/2026/05/Buying-the-Villainess-at-the-Start-as-a-Background-Character.png',
  );
  assert.deepEqual(r.genres, ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Harem']);
  assert.equal(r.tags.length, 20); // 18 tags + type + language
  assert.ok(r.tags.includes('Web Novel'));
  assert.ok(r.tags.includes('Chinese'));
  assert.ok(r.tags.includes('Master-Servant Relationship'));
  assert.deepEqual(r.authors, ['梦游的猫儿']);
  assert.deepEqual(r.altTitles, ['转生路人甲，开局买下女反派']);
  assert.equal(r.pubStatus, 'completed');
  assert.equal(r.chaptersAvailable, 180);
  assert.match(r.synopsis, /^The good news was/);
  assert.match(r.synopsis, /passerby character!\n\nBlake Percival/);
});

test('NovelUpdates: hidden decoy release rows are ignored', async () => {
  const doc = fixtureDoc('novelupdates-series.html');
  const tbody = doc.querySelector('#myTable tbody');
  tbody.insertAdjacentHTML(
    'afterbegin',
    '<tr><td>10/07/26</td><td>x</td><td><a title="c999" class="chp-release rand912" href="#">c999</a></td></tr>',
  );
  const r = await scrape(sandbox, doc, 'https://www.novelupdates.com/series/buying-the-villainess-at-the-start-as-a-background-character/');
  assert.equal(r.chaptersAvailable, 180);
});

test('MangaDex series uses the API', async () => {
  const id = 'a96676e5-8ae2-425e-b549-7f15dd34a6d8';
  const calls = [];
  const env = {
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('/aggregate')) {
        return { ok: true, json: async () => ({ volumes: { 1: { chapters: { 1: {}, 2: {}, '2.5': {} } }, none: { chapters: { 500: {} } } } }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            id,
            attributes: {
              title: { 'ja-ro': 'Komi-san wa Komyushou Desu.' },
              altTitles: [{ en: "Komi Can't Communicate" }, { ja: '古見さんは、コミュ症です。' }],
              description: { en: 'Komi is a [popular](https://x) girl.\n\n---\n\n**Links:**' },
              status: 'completed',
              lastChapter: '',
              originalLanguage: 'ja',
              publicationDemographic: 'shounen',
              links: { al: '97852', mu: '126329', mal: '99007' },
              tags: [
                { attributes: { name: { en: 'Romance' }, group: 'genre' } },
                { attributes: { name: { en: 'School Life' }, group: 'theme' } },
              ],
            },
            relationships: [
              { type: 'cover_art', attributes: { fileName: 'cover.jpg' } },
              { type: 'author', attributes: { name: 'Oda Tomohito' } },
              { type: 'artist', attributes: { name: 'Oda Tomohito' } },
            ],
          },
        }),
      };
    },
  };
  const r = await scrape(sandbox, htmlDoc('<html></html>'), `https://mangadex.org/title/${id}/komi-san`, env);
  assert.ok(calls[0].startsWith(`https://api.mangadex.org/manga/${id}?`));
  assert.equal(r.title, "Komi Can't Communicate");
  assert.equal(r.coverUrl, `https://uploads.mangadex.org/covers/${id}/cover.jpg.512.jpg`);
  assert.deepEqual(r.genres, ['Romance']);
  assert.deepEqual(r.tags, ['School Life', 'shounen', 'manga']);
  assert.deepEqual(r.authors, ['Oda Tomohito']);
  assert.equal(r.pubStatus, 'completed');
  assert.equal(r.chaptersAvailable, 500);
  assert.equal(r.synopsis, 'Komi is a popular girl.\n\nLinks:');
  assert.deepEqual(r.externalIds, { al: '97852', mal: '99007', mu: '126329', md: id });
});

test('Madara-theme scan site (LunaScans-style)', async () => {
  const doc = htmlDoc(`<html><head><meta property="og:title" content="Tower Climber - Luna Scans"></head><body class="wp-manga-template-default">
    <div class="post-title"><h1><span class="manga-title-badges hot">HOT</span> Tower Climber</h1></div>
    <div class="summary_image"><img data-src="https://lunascans.example/wp-content/uploads/cover.jpg" src="data:image/gif;base64,R0"></div>
    <div class="post-content_item"><div class="summary-heading"><h5>Alternative</h5></div><div class="summary-content">Climber; 탑 등반자</div></div>
    <div class="post-content_item"><div class="summary-heading"><h5>Status</h5></div><div class="summary-content">OnGoing</div></div>
    <div class="author-content"><a href="#">Writer A</a></div>
    <div class="genres-content"><a>Action</a>, <a>Fantasy</a></div>
    <div class="description-summary"><div class="summary__content"><p>A tower.</p><p>A climber.</p></div></div>
    <ul><li class="wp-manga-chapter"><a href="#">Chapter 41</a></li><li class="wp-manga-chapter"><a href="#">Chapter 40.5</a></li></ul>
  </body></html>`);
  const r = await scrape(sandbox, doc, 'https://lunascans.example/manga/tower-climber/');
  assert.equal(r.site, 'lunascans');
  assert.equal(r.siteLabel, 'LunaScans');
  assert.equal(r.title, 'Tower Climber');
  assert.equal(r.seriesKey, 'tower-climber');
  assert.equal(r.coverUrl, 'https://lunascans.example/wp-content/uploads/cover.jpg');
  assert.deepEqual(r.altTitles, ['Climber', '탑 등반자']);
  assert.equal(r.pubStatus, 'ongoing');
  assert.deepEqual(r.genres, ['Action', 'Fantasy']);
  assert.equal(r.chaptersAvailable, 41);
  assert.equal(r.synopsis, 'A tower.\n\nA climber.');
});

test('Unknown site falls back to preview tags', async () => {
  const doc = htmlDoc(`<html><head>
    <meta property="og:title" content="Re-Zero Light Novel - Some Reader">
    <meta property="og:image" content="/img/rezero.jpg">
    <meta property="og:description" content="Subaru is summoned.">
  </head><body></body></html>`);
  const r = await scrape(sandbox, doc, 'https://somereader.example/novel/re-zero');
  assert.equal(r.kind, 'series');
  assert.equal(r.site, 'somereader.example');
  assert.equal(r.title, 'Re-Zero Light Novel');
  assert.equal(r.coverUrl, 'https://somereader.example/img/rezero.jpg');
  assert.equal(r.synopsis, 'Subaru is summoned.');
  assert.equal(r.library, 'novel');
});
