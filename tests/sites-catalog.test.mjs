import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadAdapters } from './helpers.mjs';
import { SITES, libraryForScrape, setSiteLibrary, siteLibrary, entriesToMove, otherSavedSites } from '../shared/sites.js';
import { normalizeLibrary } from '../shared/model.js';

const sandbox = loadAdapters();
const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('every site reader is on the Sites page, in the same section', () => {
  for (const adapter of Object.values(sandbox.MB_ADAPTERS)) {
    if (adapter.id === 'generic' || adapter.id === 'wp-manga') continue; // listed under "Also works on"
    const site = SITES.find((s) => s.id === adapter.id);
    assert.ok(site, `${adapter.label} is missing from SITES in shared/sites.js`);
    assert.equal(site.library, adapter.library, `${adapter.label}: section differs from its reader`);
  }
});

test('sites where the badge runs are listed with the badge features, and only those', () => {
  const badgeHosts = manifest.content_scripts.flatMap((c) => c.matches).map((m) => m.replace(/^https:\/\/\*\./, '').replace(/\/\*$/, ''));
  for (const host of badgeHosts) {
    const site = SITES.find((s) => s.hosts.includes(host));
    assert.ok(site, `${host} runs the badge but isn't in SITES`);
    for (const f of ['badge', 'autoUpdate', 'crossSite']) assert.ok(site.features.includes(f), `${site.name} should list ${f}`);
  }
  for (const site of SITES.filter((s) => s.features.includes('badge'))) {
    assert.ok(site.hosts.every((h) => badgeHosts.includes(h)), `${site.name} lists the badge but the extension doesn't run there`);
  }
});

test('BornToBeNovel and NovelUpdates are novel sites; the rest are manga', () => {
  assert.deepEqual(SITES.filter((s) => s.library === 'novel').map((s) => s.id).sort(), ['borntobenovel', 'novelupdates']);
});

test('the user can move a site, and new bookmarks follow it', () => {
  const lib = normalizeLibrary({ entries: [] });
  assert.equal(libraryForScrape(lib, { site: 'novelupdates', library: 'novel' }), 'novel');
  setSiteLibrary(lib, 'novelupdates', 'manga');
  assert.equal(libraryForScrape(lib, { site: 'novelupdates', library: 'novel' }), 'manga');
  setSiteLibrary(lib, 'novelupdates', 'novel');
  assert.deepEqual(lib.siteLibraries, {}, 'moving it back stores nothing');

  // A site without its own reader keeps the reader's guess until it is moved.
  assert.equal(libraryForScrape(lib, { site: 'lunascans', library: 'manga' }), 'manga');
  setSiteLibrary(lib, 'lunascans', 'novel');
  assert.equal(siteLibrary(lib, 'lunascans'), 'novel');
  assert.equal(libraryForScrape(lib, { site: 'lunascans', library: 'manga' }), 'novel');
});

test('the choices survive saving, and bad values are dropped', () => {
  const lib = normalizeLibrary({ entries: [], siteLibraries: { mangago: 'novel', comix: 'books', '': 'manga' } });
  assert.deepEqual(lib.siteLibraries, { mangago: 'novel' });
  assert.deepEqual(normalizeLibrary(JSON.parse(JSON.stringify(lib))).siteLibraries, { mangago: 'novel' });
});

test('series saved from a moved site can be found to move too', () => {
  const lib = normalizeLibrary({
    entries: [
      { id: 'a', title: 'A', library: 'manga', links: [{ site: 'novelupdates', url: 'https://www.novelupdates.com/series/a/' }] },
      { id: 'b', title: 'B', library: 'novel', links: [{ site: 'novelupdates', url: 'https://www.novelupdates.com/series/b/' }] },
      // Only the first link counts: this one was saved from Asura and got a NovelUpdates link later.
      { id: 'c', title: 'C', library: 'manga', links: [{ site: 'asura', url: 'https://asurascans.com/comics/c' }, { site: 'novelupdates', url: 'https://www.novelupdates.com/series/c/' }] },
      { id: 'd', title: 'D', library: 'manga', links: [{ site: 'lunascans', url: 'https://lunascans.example/manga/d/' }] },
    ],
  });
  assert.deepEqual(entriesToMove(lib, 'novelupdates', 'novel').map((e) => e.id), ['a']);
  assert.deepEqual(otherSavedSites(lib), [{ id: 'lunascans', name: 'lunascans', counts: { manga: 1, novel: 0 } }]);
});
