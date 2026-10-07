// Updating a saved series from a site page (right-click "Save or update", the popup's Update, the website's
// "Update from site") must change that same entry and only add to it: the user's own things stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLibrary, entryFieldsFromScrape, mergeScrapeIntoEntry, updateEntry } from '../shared/model.js';
import { featureOn, setFeatureOn } from '../shared/sites.js';

function savedLibrary() {
  return normalizeLibrary({
    folders: [{ id: 'f1', name: 'Favourites', library: 'manga' }],
    entries: [
      {
        id: 'e1',
        title: 'My Own Title',
        library: 'manga',
        links: [{ site: 'mangago', key: 'beast', url: 'https://www.mangago.me/read-manga/beast/' }],
        coverPath: 'covers/e1.webp',
        synopsis: 'My synopsis',
        scrapedTags: ['Romance', 'Office Workers'],
        customTags: ['reread later'],
        notes: 'Stopped at the wedding arc',
        readingStatus: 'reading',
        lastReadChapter: 40,
        chaptersAvailable: 50,
        folderIds: ['f1'],
      },
    ],
  });
}

const asuraPage = (chapters) =>
  entryFieldsFromScrape({
    site: 'asura',
    seriesKey: 'beast',
    url: 'https://asurascans.com/comics/beast-1a2b3c4d',
    title: 'A Different Title',
    synopsis: 'The site’s synopsis',
    coverUrl: 'https://cdn.asurascans.com/beast.webp',
    genres: ['Fantasy'],
    tags: ['manhwa'],
    chaptersAvailable: chapters,
  });

test('an update changes the saved series and keeps everything the user added', () => {
  const lib = savedLibrary();
  updateEntry(lib, 'e1', mergeScrapeIntoEntry(lib.entries[0], asuraPage(60)));
  const e = lib.entries[0];

  assert.equal(lib.entries.length, 1, 'no second copy');
  assert.equal(e.id, 'e1');
  assert.equal(e.title, 'My Own Title');
  assert.equal(e.notes, 'Stopped at the wedding arc');
  assert.deepEqual(e.customTags, ['reread later']);
  assert.equal(e.readingStatus, 'reading');
  assert.equal(e.lastReadChapter, 40);
  assert.deepEqual(e.folderIds, ['f1']);
  assert.equal(e.coverPath, 'covers/e1.webp');
  assert.equal(e.synopsis, 'My synopsis');

  // Tags and genres are only ever added to.
  for (const t of ['romance', 'office workers', 'fantasy', 'manhwa']) assert.ok(e.scrapedTags.includes(t), t);
  for (const g of ['romance', 'fantasy']) assert.ok(e.genres.includes(g), g);
  // New chapters and the site's link are added; the original link stays first.
  assert.equal(e.chaptersAvailable, 60);
  assert.deepEqual(e.links.map((l) => l.site), ['mangago', 'asura']);
});

test('a page with fewer chapters never lowers the count', () => {
  const lib = savedLibrary();
  updateEntry(lib, 'e1', mergeScrapeIntoEntry(lib.entries[0], asuraPage(30)));
  assert.equal(lib.entries[0].chaptersAvailable, 50);
});

test('the automatic updates start on, can be turned off, and are saved with the library', () => {
  const lib = savedLibrary();
  assert.equal(featureOn(lib, 'autoUpdate'), true);
  assert.equal(featureOn(lib, 'crossSite'), true);
  setFeatureOn(lib, 'autoUpdate', false);
  assert.equal(featureOn(lib, 'autoUpdate'), false);
  assert.equal(featureOn(lib, 'crossSite'), true);

  const reloaded = normalizeLibrary(JSON.parse(JSON.stringify(lib)));
  assert.deepEqual(reloaded.features, { autoUpdate: false });
  setFeatureOn(reloaded, 'autoUpdate', true);
  assert.deepEqual(reloaded.features, {}, 'turning it back on stores nothing');
  assert.deepEqual(normalizeLibrary({ features: { autoUpdate: 'no', save: false } }).features, {}, 'only real switches are kept');
});
