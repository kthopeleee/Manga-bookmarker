import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, boardHash } from '../web/src/lib/router.js';

test('the genres screen keeps the ticked genres in the URL', () => {
  const hash = boardHash({ library: 'novel', section: 'genres', genres: ['romance', 'slice of life'], match: 'any' });
  assert.equal(hash, '#/novel/genres?g=romance&g=slice+of+life&match=any');
  assert.deepEqual(parseHash(hash), {
    name: 'board',
    library: 'novel',
    section: 'genres',
    genres: ['romance', 'slice of life'],
    match: 'any',
  });
});

test('the genres screen with nothing ticked', () => {
  assert.equal(boardHash({ library: 'manga', section: 'genres' }), '#/manga/genres');
  assert.deepEqual(parseHash('#/manga/genres'), { name: 'board', library: 'manga', section: 'genres', genres: [], match: 'all' });
  assert.deepEqual(parseHash('#/manga/genres?g=isekai&g=isekai&match=nonsense').genres, ['isekai']);
  assert.equal(parseHash('#/manga/genres?match=nonsense').match, 'all');
});
