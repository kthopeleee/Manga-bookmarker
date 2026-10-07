import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTag, uniqueTags, displayTag } from '../shared/tags.js';
import {
  emptyLibrary,
  createEntry,
  addEntry,
  addFolder,
  deleteFolder,
  updateEntry,
  mergeScrapeIntoEntry,
  entryFieldsFromScrape,
  normalizeLibrary,
  deleteEntry,
  linkEntries,
  unlinkEntries,
  relatedEntries,
  setFolderListUrl,
  addToFolder,
} from '../shared/model.js';
import { findDuplicate, findCounterparts, normalizeTitle } from '../shared/match.js';
import { GitHubStore, bytesToBase64, base64ToBytes } from '../shared/github-store.js';

test('tags are normalised and merged', () => {
  assert.equal(normalizeTag('  Sci-Fi '), 'sci-fi');
  assert.equal(normalizeTag('Sci Fi'), 'sci-fi');
  assert.equal(normalizeTag('Isekai (99)'), 'isekai');
  assert.equal(normalizeTag('Slice-of-Life'), 'slice of life');
  assert.deepEqual(uniqueTags(['Fantasy', 'fantasy', 'FANTASY ', 'Magic']), ['fantasy', 'magic']);
  assert.equal(displayTag('boys love'), 'Boys Love');
  assert.equal(displayTag('sci-fi'), 'Sci-Fi');
  assert.equal(displayTag('multiple pov'), 'Multiple POV');
});

test('titles are compared loosely', () => {
  assert.equal(normalizeTitle('Dead-End Café in the Royal Capital'), normalizeTitle('Dead End Cafe in the Royal Capital manga'));
});

function libraryWithFireForce() {
  const lib = emptyLibrary();
  addFolder(lib, { name: 'Action', library: 'manga' });
  addFolder(lib, { name: 'Top', library: 'manga' });
  const entry = createEntry({
    title: 'Fire Force',
    library: 'manga',
    links: [{ site: 'mangago', key: 'fire_force', url: 'https://www.mangago.me/read-manga/fire_force/' }],
    folderIds: lib.folders.map((f) => f.id),
    notes: 'Shinra is the MC',
    externalIds: { mu: 'abc123' },
  });
  addEntry(lib, entry);
  return { lib, entry };
}

test('an entry can be in several folders; deleting a folder keeps the entry', () => {
  const { lib, entry } = libraryWithFireForce();
  assert.equal(lib.entries[0].folderIds.length, 2);
  deleteFolder(lib, lib.folders[0].id);
  assert.equal(lib.entries.length, 1);
  assert.deepEqual(lib.entries[0].folderIds, [lib.folders[0].id]);
  assert.equal(lib.entries[0].id, entry.id);
});

test('duplicates are found by link, external id, then title', () => {
  const { lib } = libraryWithFireForce();
  assert.equal(findDuplicate(lib, { site: 'mangago', seriesKey: 'fire_force', title: 'x' }).reason, 'same link');
  assert.equal(
    findDuplicate(lib, { site: 'comix', seriesKey: 'zz', title: 'Enen no Shouboutai', externalIds: { mu: 'abc123' } }).reason,
    'same series on another site',
  );
  assert.equal(findDuplicate(lib, { site: 'comix', seriesKey: 'zz', title: 'FIRE FORCE', library: 'manga' }).reason, 'same title');
  assert.equal(findDuplicate(lib, { site: 'comix', seriesKey: 'zz', title: 'Fire Force', library: 'novel' }), null);
  assert.equal(findDuplicate(lib, { site: 'comix', seriesKey: 'zz', title: 'Something else' }), null);
});

test('re-bookmarking merges scraped data but keeps the user fields', () => {
  const { lib, entry } = libraryWithFireForce();
  const fields = entryFieldsFromScrape({
    site: 'comix',
    seriesKey: 'ff',
    url: 'https://comix.to/title/ff-fire-force',
    title: 'Fire Force',
    genres: ['Action'],
    tags: ['Supernatural'],
    chaptersAvailable: 304,
    pubStatus: 'completed',
    externalIds: { al: '1' },
  });
  const merged = mergeScrapeIntoEntry(lib.entries[0], fields);
  updateEntry(lib, entry.id, merged);
  const e = lib.entries[0];
  assert.equal(e.links.length, 2);
  assert.equal(e.notes, 'Shinra is the MC');
  assert.equal(e.folderIds.length, 2);
  assert.equal(e.chaptersAvailable, 304);
  assert.deepEqual(e.scrapedTags, ['action', 'supernatural']);
  assert.deepEqual(e.externalIds, { mu: 'abc123', al: '1' });
});

test('normalizeLibrary drops folder ids that no longer exist', () => {
  const lib = normalizeLibrary({ folders: [{ id: 'f1', name: 'A', library: 'manga' }], entries: [{ title: 'X', folderIds: ['f1', 'gone'] }] });
  assert.deepEqual(lib.entries[0].folderIds, ['f1']);
  assert.equal(lib.entries[0].library, 'manga');
});

test('a manga and its light novel can both be saved, then linked both ways', () => {
  const lib = emptyLibrary();
  addEntry(lib, createEntry({ id: 'm', library: 'manga', title: 'Solo Leveling', links: [{ site: 'mangago', key: 'solo', url: 'https://www.mangago.me/read-manga/solo/' }] }));
  const novel = { site: 'novelupdates', seriesKey: 'solo-leveling', title: 'Solo Leveling', altTitles: ['Na Honjaman Level Up'], library: 'novel' };
  assert.equal(findDuplicate(lib, novel), null);
  assert.deepEqual(findCounterparts(lib, novel).map((e) => e.id), ['m']);
  assert.deepEqual(findCounterparts(lib, { ...novel, library: 'manga' }), []);

  addEntry(lib, createEntry({ id: 'n', library: 'novel', title: 'Solo Leveling' }));
  linkEntries(lib, 'n', 'm');
  linkEntries(lib, 'm', 'n'); // linking twice changes nothing
  assert.deepEqual(lib.entries.map((e) => e.relatedIds), [['n'], ['m']]);
  assert.deepEqual(relatedEntries(lib, lib.entries[0]).map((e) => e.id), ['n']);

  unlinkEntries(lib, 'm', 'n');
  assert.deepEqual(lib.entries.map((e) => e.relatedIds), [[], []]);

  linkEntries(lib, 'm', 'n');
  deleteEntry(lib, 'n');
  assert.deepEqual(lib.entries[0].relatedIds, []);
});

test('normalizeLibrary repairs one-way and dangling links', () => {
  const lib = normalizeLibrary({
    entries: [
      { id: 'a', title: 'A', relatedIds: ['b', 'gone', 'a'] },
      { id: 'b', title: 'B', library: 'novel' },
    ],
  });
  assert.deepEqual(lib.entries.map((e) => e.relatedIds), [['b'], ['a']]);
});

test('a folder can link to a list on a site', () => {
  const lib = normalizeLibrary({ folders: [{ id: 'f1', name: 'Faves', library: 'manga', listUrl: 'javascript:alert(1)' }] });
  assert.equal(lib.folders[0].listUrl, null);
  setFolderListUrl(lib, 'f1', ' https://www.mangago.me/home/mangalist/123/ ');
  assert.equal(lib.folders[0].listUrl, 'https://www.mangago.me/home/mangalist/123/');
  assert.equal(normalizeLibrary(lib).folders[0].listUrl, 'https://www.mangago.me/home/mangalist/123/');
  setFolderListUrl(lib, 'f1', '');
  assert.equal(lib.folders[0].listUrl, null);
});

test('addToFolder adds several entries at once, only from the folder’s library', () => {
  const lib = normalizeLibrary({
    folders: [{ id: 'f1', name: 'Faves', library: 'manga' }],
    entries: [
      { id: 'a', title: 'A', library: 'manga' },
      { id: 'b', title: 'B', library: 'manga', folderIds: ['f1'] },
      { id: 'c', title: 'C', library: 'novel' },
    ],
  });
  addToFolder(lib, 'f1', ['a', 'b', 'c']);
  assert.deepEqual(lib.entries.map((e) => e.folderIds), [['f1'], ['f1'], []]);
  assert.throws(() => addToFolder(lib, 'gone', ['a']), /no longer exists/);
});

test('base64 round-trips binary and unicode', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

// A tiny fake of the GitHub Contents API for one file.
function fakeGitHub() {
  const state = { content: null, sha: null, version: 0, puts: 0 };
  const respond = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.cache, 'no-store');
    assert.equal(opts.headers.Authorization, 'Bearer t0ken');
    if (url.endsWith('/contents/library.json') && opts.method === 'GET') {
      if (!state.content) return respond(404, { message: 'Not Found' });
      return respond(200, { sha: state.sha, encoding: 'base64', content: state.content });
    }
    if (url.endsWith('/contents/library.json') && opts.method === 'PUT') {
      const body = JSON.parse(opts.body);
      state.puts++;
      if ((state.sha || null) !== (body.sha || null)) return respond(409, { message: 'sha mismatch' });
      state.content = body.content;
      state.version++;
      state.sha = `sha${state.version}`;
      return respond(200, { content: { sha: state.sha } });
    }
    return respond(500, { message: 'unexpected ' + url });
  };
  return { state, fetchImpl };
}

test('updateLibrary creates the file, then retries on a conflict', async () => {
  const { state, fetchImpl } = fakeGitHub();
  const store = new GitHubStore({ owner: 'me', repo: 'data', token: 't0ken', fetchImpl });
  await store.initLibrary();
  assert.equal(state.sha, 'sha1');

  // Someone else saves between our read and our write: the first PUT conflicts.
  const other = new GitHubStore({ owner: 'me', repo: 'data', token: 't0ken', fetchImpl });
  let first = true;
  const saved = await store.updateLibrary(async (lib) => {
    if (first) {
      first = false;
      await other.updateLibrary((l) => addFolder(l, { name: 'From website', library: 'manga' }));
    }
    return addFolder(lib, { name: 'From extension', library: 'manga' });
  });
  assert.deepEqual(saved.folders.map((f) => f.name).sort(), ['From extension', 'From website']);
  assert.equal(state.sha, 'sha3');
});
