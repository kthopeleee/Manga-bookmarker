import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isKnownGenre, looksLikeGenre, nonGenreTags, libraryGenres } from '../shared/genres.js';
import { displayTag } from '../shared/tags.js';
import {
  emptyLibrary,
  createEntry,
  addEntry,
  updateEntry,
  mergeScrapeIntoEntry,
  entryFieldsFromScrape,
  normalizeLibrary,
} from '../shared/model.js';

// The genre panel on mangago.me.
const MANGAGO = [
  'Yaoi', 'Comedy', 'Shounen Ai', 'Shoujo', 'Yuri', 'Josei', 'Fantasy', 'School Life', 'Romance',
  'Doujinshi', 'Smut', 'Adult', 'Mystery', 'One Shot', 'Ecchi', 'Shounen', 'Martial Arts', 'Shoujo Ai',
  'Supernatural', 'Drama', 'Action', 'Adventure', 'Harem', 'Historical', 'Horror', 'Mature', 'Mecha',
  'Psychological', 'Sci-fi', 'Seinen', 'Slice Of Life', 'Sports', 'Gender Bender', 'Tragedy', 'Bara',
  'Webtoons',
];

// The filter lists on comix.to.
const COMIX_GENRES = [
  'Action', 'Adult', 'Adventure', 'Boys Love', 'Comedy', 'Crime', 'Drama', 'Ecchi', 'Fantasy', 'Girls Love',
  'Harem', 'Hentai', 'Historical', 'Horror', 'Isekai', 'Magical Girls', 'Mature', 'Mecha', 'Medical', 'Mystery',
  'Philosophical', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Smut', 'Sports', 'Superhero',
  'Thriller', 'Tragedy', 'Wuxia',
];
const COMIX_DEMOGRAPHICS = ['Josei', 'Seinen', 'Shoujo', 'Shounen'];
const COMIX_STATUSES = ['Releasing', 'Finished', 'On hiatus', 'Discontinued', 'Not yet released'];
const COMIX_TYPES = ['Manga', 'Manhwa', 'Manhua', 'Other'];

test('every Mangago and Comix genre is known', () => {
  for (const g of [...MANGAGO, ...COMIX_GENRES, ...COMIX_DEMOGRAPHICS]) assert.ok(isKnownGenre(g), g);
  // Other sites' spellings of the same genres.
  for (const g of ["Girls' Love", "Boys' Love", 'Oneshot', 'Shonen-ai', 'Shojo', 'Genderswap', 'Slice-of-Life']) {
    assert.ok(isKnownGenre(g), g);
  }
});

test('statuses, types, formats and years are never genres', () => {
  for (const t of [...COMIX_STATUSES, ...COMIX_TYPES, 'Long Strip', 'Web Comic', 'Full Color', '4-Koma', '2024', 'Ongoing']) {
    assert.equal(looksLikeGenre(t), false, t);
  }
});

test('an unknown genre from a site is kept only if it looks like one', () => {
  for (const g of ['Xianxia', 'Xuanhuan', 'Cyberpunk']) assert.equal(looksLikeGenre(g), true, g);
  for (const g of ['', '   ', 'Ch. 12', 'https://example.com', 'MC is an idiot lol', 'WAITING FOR S2!!!', 'a']) {
    assert.equal(looksLikeGenre(g), false, g);
  }
});

function novelUpdatesEntry() {
  return createEntry(
    entryFieldsFromScrape({
      site: 'novelupdates',
      url: 'https://www.novelupdates.com/series/x/',
      title: 'X',
      library: 'novel',
      genres: ['Fantasy', 'Xianxia', 'Completed', '2019'],
      tags: ['Cultivation', 'Weak to Strong', 'Romance'],
    }),
  );
}

test('genres come from the site genre field and known genres among the tags', () => {
  const e = novelUpdatesEntry();
  assert.deepEqual(e.genres, ['fantasy', 'xianxia', 'romance']);
  assert.ok(e.scrapedTags.includes('cultivation'), 'other tags are still tags');
  assert.deepEqual(nonGenreTags(e), ['completed', '2019', 'cultivation', 'weak to strong']);
});

test('community tags never add a new genre', () => {
  const e = createEntry(entryFieldsFromScrape({ title: 'Y', genres: [], tags: ['Cultivation', 'Isekai'] }));
  assert.deepEqual(e.genres, ['isekai']);
});

test('removing a tag removes the genre; a custom tag can be a genre', () => {
  const lib = emptyLibrary();
  const e = novelUpdatesEntry();
  addEntry(lib, e);
  updateEntry(lib, e.id, { scrapedTags: e.scrapedTags.filter((t) => t !== 'xianxia'), customTags: ['Comedy'] });
  assert.deepEqual(lib.entries[0].genres, ['fantasy', 'romance', 'comedy']);
});

test('re-bookmarking from another site adds its genres', () => {
  const e = novelUpdatesEntry();
  const merged = mergeScrapeIntoEntry(e, entryFieldsFromScrape({ title: 'X', genres: ['Wuxia'], tags: [] }));
  const lib = emptyLibrary();
  addEntry(lib, e);
  updateEntry(lib, e.id, merged);
  assert.deepEqual(lib.entries[0].genres, ['fantasy', 'xianxia', 'romance', 'wuxia']);
});

test('entries saved before genres existed get them from their tags', () => {
  const lib = normalizeLibrary({ entries: [{ title: 'Old', scrapedTags: ['Romance', 'Office Workers', 'Shoujo'] }] });
  assert.deepEqual(lib.entries[0].genres, ['romance', 'shoujo']);
});

test('libraryGenres counts genres across entries', () => {
  const lib = normalizeLibrary({
    entries: [
      { title: 'A', scrapedTags: ['Romance', 'Comedy'] },
      { title: 'B', scrapedTags: ['Romance'] },
      { title: 'C', library: 'novel', scrapedTags: ['Romance', 'Wuxia'] },
    ],
  });
  assert.deepEqual(libraryGenres(lib), [
    { genre: 'romance', count: 3 },
    { genre: 'comedy', count: 1 },
    { genre: 'wuxia', count: 1 },
  ]);
  assert.deepEqual(libraryGenres(lib, 'novel').map((g) => g.genre), ['romance', 'wuxia']);
});

test('genres display the way the sites write them', () => {
  assert.equal(displayTag('shounen ai'), 'Shounen Ai');
  assert.equal(displayTag('slice of life'), 'Slice of Life');
  assert.equal(displayTag('sci-fi'), 'Sci-Fi');
  assert.equal(displayTag('girls love'), 'Girls Love');
});
