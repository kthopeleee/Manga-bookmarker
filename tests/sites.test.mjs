import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapters, fixtureDoc, htmlDoc, scrape } from './helpers.mjs';
import { createEntry, entryFieldsFromScrape } from '../shared/model.js';

const sandbox = loadAdapters();
const ASURA = 'https://asurascans.com/comics/overgeared-bd5bdaf8';

function checkOvergeared(r) {
  assert.equal(r.kind, 'series');
  assert.equal(r.site, 'asura');
  assert.equal(r.siteLabel, 'Asura Scans');
  assert.equal(r.library, 'manga');
  assert.equal(r.seriesKey, 'overgeared');
  assert.equal(r.url, ASURA);
  assert.equal(r.title, 'Overgeared');
  assert.equal(r.altTitles[0], '템빨');
  assert.ok(r.altTitles.includes("Grid's Item Peak"));
  assert.ok(!r.altTitles.includes('Overgeared'), 'the main title is not an alt title');
  assert.deepEqual(r.authors, ['LEE Dong Wook', 'PARK Saenal', 'REDICE Studio']);
  assert.deepEqual(r.genres, ['Action', 'Adventure', 'Comedy', 'Fantasy', 'Game']);
  assert.deepEqual(r.tags, ['manhwa']);
  assert.equal(r.pubStatus, 'ongoing');
  assert.equal(r.chaptersAvailable, 342, 'chapter links for other series are ignored');
  assert.match(r.synopsis, /^Shin Youngwoo .* more than he bargained for/, 'the full synopsis, not the cut-off one');
}

test('Asura Scans series page', async () => {
  const r = await scrape(sandbox, fixtureDoc('asura-series.html'), ASURA);
  checkOvergeared(r);
  assert.equal(r.coverUrl, 'https://cdn.asurascans.com/asura-images/covers/overgeared.905990.webp');
});

test('Asura Scans series page without its schema.org data', async () => {
  const doc = fixtureDoc('asura-series.html');
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) el.remove();
  checkOvergeared(await scrape(sandbox, doc, ASURA));
});

test('Asura Scans chapter page', async () => {
  const doc = htmlDoc(`<html><head><title>Overgeared Chapter 342 - Read Online | Asura Scans</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://asurascans.com"},{"@type":"ListItem","position":2,"name":"Comics","item":"https://asurascans.com/browse"},{"@type":"ListItem","position":3,"name":"Overgeared","item":"https://asurascans.com/comics/overgeared-bd5bdaf8"},{"@type":"ListItem","position":4,"name":"Chapter 342","item":"https://asurascans.com/comics/overgeared-bd5bdaf8/chapter/342"}]}</script>
  </head><body></body></html>`);
  const r = await scrape(sandbox, doc, `${ASURA}/chapter/342`);
  assert.deepEqual(
    { kind: r.kind, site: r.site, seriesKey: r.seriesKey, seriesUrl: r.seriesUrl, seriesTitle: r.seriesTitle, chapter: r.chapter },
    { kind: 'chapter', site: 'asura', seriesKey: 'overgeared', seriesUrl: ASURA, seriesTitle: 'Overgeared', chapter: 342 },
  );
  assert.equal((await scrape(sandbox, htmlDoc('<html></html>'), `${ASURA}/chapter/0`)).chapter, 0);
});

test('Asura genres: "Game" is new but kept, since Asura lists it as a genre', async () => {
  const r = await scrape(sandbox, fixtureDoc('asura-series.html'), ASURA);
  const e = createEntry(entryFieldsFromScrape(r));
  assert.deepEqual(e.genres, ['action', 'adventure', 'comedy', 'fantasy', 'game']);
  assert.ok(e.scrapedTags.includes('manhwa'));
});

test('Kingofshojo series page (MangaThemesia table layout)', async () => {
  const r = await scrape(sandbox, fixtureDoc('kingofshojo-series.html'), 'https://kingofshojo.com/manga/a-beasts-paradise/');
  assert.equal(r.kind, 'series');
  assert.equal(r.site, 'kingofshojo.com');
  assert.equal(r.siteLabel, 'Kingofshojo');
  assert.equal(r.seriesKey, 'a-beasts-paradise');
  assert.equal(r.url, 'https://kingofshojo.com/manga/a-beasts-paradise/');
  assert.equal(r.title, 'A Beast’s Paradise');
  assert.deepEqual(r.altTitles, ['짐승의 낙원']);
  assert.equal(r.coverUrl, 'https://kingofshojo.com/wp-content/uploads/2025/01/2025-01-01-12-14-46-1735733686139.webp');
  assert.match(r.synopsis, /^For an orphan, Lee Goyo is a lucky child\./, 'the "Read manhwa ..." line is dropped');
  assert.deepEqual(r.authors, [], '"n/a" is not an author');
  assert.deepEqual(r.genres, ['Adult', 'Drama', 'Fantasy', 'Manhwa', 'Mature', 'Romance', 'Smut']);
  assert.deepEqual(r.tags, ['Manhwa']);
  assert.equal(r.pubStatus, null);
  assert.equal(r.chaptersAvailable, 50);

  const e = createEntry(entryFieldsFromScrape(r));
  assert.deepEqual(e.genres, ['adult', 'drama', 'fantasy', 'mature', 'romance', 'smut'], 'Manhwa is a type, not a genre');
});

// Written from MangaThemesia's usual chapter-page markup, not a saved Kingofshojo page.
test('Kingofshojo chapter page', async () => {
  const doc = htmlDoc(`<html><body>
    <h1 class="entry-title">A Beast’s Paradise Chapter 50</h1>
    <div class="allc">All chapters are in <a href="https://kingofshojo.com/manga/a-beasts-paradise/">A Beast’s Paradise</a></div>
    <div id="readerarea"></div>
  </body></html>`);
  const r = await scrape(sandbox, doc, 'https://kingofshojo.com/a-beasts-paradise-chapter-50/');
  assert.equal(r.kind, 'chapter');
  assert.equal(r.seriesKey, 'a-beasts-paradise');
  assert.equal(r.seriesUrl, 'https://kingofshojo.com/manga/a-beasts-paradise/');
  assert.equal(r.chapter, 50);
});

const B2B = 'https://borntobenovel.com/novel/i-possessed-a-promiscuous-guide';

test('BornToBeNovel series page', async () => {
  const r = await scrape(sandbox, fixtureDoc('borntobenovel-series.html'), B2B);
  assert.equal(r.kind, 'series');
  assert.equal(r.site, 'borntobenovel');
  assert.equal(r.siteLabel, 'BornToBeNovel');
  assert.equal(r.library, 'novel');
  assert.equal(r.seriesKey, 'i-possessed-a-promiscuous-guide');
  assert.equal(r.url, B2B);
  assert.equal(r.title, 'I Possessed a Promiscuous Guide');
  assert.deepEqual(r.altTitles, ['mullanhan guideue binguihaetta', '문란한 가이드에 빙의했다']);
  assert.equal(r.coverUrl, 'https://borntobenovel.com/images/covers/dd4eb554-da32-464f-9135-a12862fc5f66.webp');
  assert.match(r.synopsis, /^After being involved in an unexpected accident, .* 'It's not possession .* going to be okay\?$/);
  assert.equal(r.pubStatus, 'completed');
  assert.equal(r.chaptersAvailable, 120, 'no chapter list on the page, so the "Orig:120ch." badge');
  assert.ok(!r.tags.some((t) => /18\+|Completed|Orig/.test(t)), 'the rating, status and count badges are not tags');
  assert.equal(r.tags.length, 20);
  assert.deepEqual(r.tags.slice(0, 3), ['Yaoi', 'Supernatural', 'Omegaverse']);
});

test('BornToBeNovel genres come from its mixed genre-and-tag list', async () => {
  const r = await scrape(sandbox, fixtureDoc('borntobenovel-series.html'), B2B);
  const e = createEntry(entryFieldsFromScrape(r));
  assert.deepEqual(e.genres, ['yaoi', 'supernatural', 'drama', 'romance']);
  assert.ok(e.scrapedTags.includes('omegaverse') && e.scrapedTags.includes('male lead'));
});

test('BornToBeNovel counts the chapter list when there is one, not the Read button', async () => {
  const doc = fixtureDoc('borntobenovel-series.html');
  const list = doc.createElement('div');
  list.className = 'chapters-grid';
  for (const n of [1, 2, 57]) {
    const card = doc.createElement('div');
    card.className = 'chapter-card';
    const a = doc.createElement('a');
    a.className = 'chapter-link';
    a.setAttribute('href', `/novel/i-possessed-a-promiscuous-guide/chapters/ch-${n}`);
    card.append(a);
    list.append(card);
  }
  doc.querySelector('main').append(list);
  assert.equal((await scrape(sandbox, doc, B2B)).chaptersAvailable, 57, 'translated so far, not the original 120');
});

test('BornToBeNovel chapter page', async () => {
  const doc = htmlDoc(`<html><head><title>Chapter 12 – I Possessed a Promiscuous Guide – read novel online on BornToBeNovel</title></head><body></body></html>`);
  const r = await scrape(sandbox, doc, `${B2B}/chapters/ch-12`);
  assert.deepEqual(
    { kind: r.kind, site: r.site, seriesKey: r.seriesKey, seriesUrl: r.seriesUrl, chapter: r.chapter },
    { kind: 'chapter', site: 'borntobenovel', seriesKey: 'i-possessed-a-promiscuous-guide', seriesUrl: B2B, chapter: 12 },
  );
});
