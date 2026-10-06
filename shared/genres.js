// Genres: the tags that say what kind of story a series is (Romance, Isekai, Shounen...).
// Genres are still ordinary tags; entry.genres just marks which of the entry's tags are genres.
//
// A tag is a genre when it is on the built-in list below, or when a site put it in its own
// genre field and it passes looksLikeGenre(). Community tags (Mangago "Top tags", NovelUpdates
// tags, ...) can only ever match the built-in list, so they never add a new genre.

import { normalizeTag, uniqueTags, entryTags } from './tags.js';

// Mangago's genre panel plus Comix's genre and demographic filters, as normalised tag keys.
export const KNOWN_GENRES = new Set([
  'action',
  'adult',
  'adventure',
  'bara',
  'boys love',
  'comedy',
  'crime',
  'doujinshi',
  'drama',
  'ecchi',
  'fantasy',
  'gender bender',
  'girls love',
  'harem',
  'hentai',
  'historical',
  'horror',
  'isekai',
  'josei',
  'magical girls',
  'martial arts',
  'mature',
  'mecha',
  'medical',
  'mystery',
  'one shot',
  'philosophical',
  'psychological',
  'romance',
  'school life',
  'sci-fi',
  'seinen',
  'shoujo',
  'shoujo ai',
  'shounen',
  'shounen ai',
  'slice of life',
  'smut',
  'sports',
  'superhero',
  'supernatural',
  'thriller',
  'tragedy',
  'webtoons',
  'wuxia',
  'yaoi',
  'yuri',
]);

// Things sites mix into their genre lists that aren't genres: statuses, types and formats.
const NOT_GENRES = new Set([
  'ongoing',
  'completed',
  'complete',
  'releasing',
  'finished',
  'hiatus',
  'on hiatus',
  'discontinued',
  'cancelled',
  'canceled',
  'dropped',
  'not yet released',
  'updating',
  'unknown',
  'none',
  'other',
  'manga',
  'manhwa',
  'manhua',
  'comic',
  'comics',
  'novel',
  'light novel',
  'web novel',
  'web comic',
  'long strip',
  'full color',
  '4 koma',
  'anthology',
  'adaptation',
  'award winning',
  'official colored',
  'fan colored',
  'genre',
  'genres',
]);

export function isKnownGenre(tag) {
  return KNOWN_GENRES.has(normalizeTag(tag));
}

/** Whether a genre a site gave us is believable enough to keep even though it isn't on our list. */
export function looksLikeGenre(raw) {
  const t = normalizeTag(raw);
  if (KNOWN_GENRES.has(t)) return true;
  if (!t || NOT_GENRES.has(t)) return false;
  if (t.length < 3 || t.length > 24 || t.split(' ').length > 3) return false;
  // Letters only: rules out years, counts, chapter numbers, links and jokey sentences.
  return /^\p{L}[\p{L}' &-]*$/u.test(t);
}

/**
 * The genres for an entry with these tags: every known genre among the tags, plus the
 * site-declared genres that look real. Only tags the entry still has count, so removing a
 * tag also removes it as a genre.
 */
export function genresFor(declared, tags) {
  const ok = new Set(uniqueTags(declared).filter(looksLikeGenre));
  return uniqueTags(tags).filter((t) => KNOWN_GENRES.has(t) || ok.has(t));
}

/** An entry's tags that aren't genres, for showing the two separately. */
export function nonGenreTags(entry) {
  const genres = new Set(entry.genres || []);
  return entryTags(entry).filter((t) => !genres.has(t));
}

/**
 * Every genre used in the library, with how many entries have it, most common first.
 * Pass lib ('manga' or 'novel') to count only that library.
 */
export function libraryGenres(library, lib) {
  const counts = new Map();
  for (const e of library.entries) {
    if (lib && e.library !== lib) continue;
    for (const g of e.genres || []) counts.set(g, (counts.get(g) || 0) + 1);
  }
  return [...counts]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
}
