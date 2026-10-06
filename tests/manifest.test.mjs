import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTER_FILES } from './helpers.mjs';
import { librarySitePatterns, urlMatches } from '../extension/lib/ext.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the badge content script loads the same page scripts the popup injects', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  const pageJs = read('extension/lib/page.js');
  const list = pageJs.match(/const PAGE_SCRIPTS = \[([\s\S]*?)\]/)[1];
  const pageScripts = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);

  assert.deepEqual(pageScripts, ADAPTER_FILES);
  assert.deepEqual(manifest.content_scripts[0].js, [...pageScripts, 'content/badge.js']);
  for (const file of manifest.content_scripts[0].js) assert.ok(fs.existsSync(path.join(root, 'extension', file)), file);
});

test('the extension has explicit access to every site the badge runs on', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  for (const pattern of manifest.content_scripts[0].matches) assert.ok(manifest.host_permissions.includes(pattern), pattern);
});

test('urlMatches follows extension match patterns', () => {
  const sites = ['https://*.mangago.me/*', 'https://*.comix.to/*'];
  assert.ok(urlMatches('https://www.mangago.me/read-manga/x/', sites));
  assert.ok(urlMatches('https://mangago.me/read-manga/x/', sites));
  assert.ok(urlMatches('https://comix.to/title/abc-x', sites));
  assert.ok(!urlMatches('https://evilmangago.me/', sites));
  assert.ok(!urlMatches('https://mangago.me.evil.com/', sites));
  assert.ok(!urlMatches('http://www.mangago.me/', sites));
  assert.ok(!urlMatches('not a url', sites));
});

test('librarySitePatterns limits the bridge to the library website', () => {
  const site = librarySitePatterns('https://kthopeleee.github.io/Manga-bookmarker/');
  assert.deepEqual(site, {
    origin: 'https://kthopeleee.github.io/*',
    page: 'https://kthopeleee.github.io/Manga-bookmarker/*',
  });
  assert.ok(urlMatches('https://kthopeleee.github.io/Manga-bookmarker/#/add?library=manga', [site.page]));
  assert.ok(!urlMatches('https://kthopeleee.github.io/someone-else/', [site.page]));
  assert.ok(!urlMatches('https://other.github.io/Manga-bookmarker/', [site.page]));

  assert.equal(librarySitePatterns('http://localhost:5173/').page, 'http://localhost/*');
  assert.equal(librarySitePatterns('https://example.com/shelf/index.html').page, 'https://example.com/shelf/*');
  assert.equal(librarySitePatterns(''), null);
  assert.equal(librarySitePatterns('ftp://example.com/'), null);
});
