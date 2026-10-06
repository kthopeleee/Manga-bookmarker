// Duplicate detection: is this series already in the library?

import { EXTERNAL_ID_KEYS } from './model.js';

export function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents: café -> cafe
    .replace(/\b(manga|manhwa|manhua|novel|light novel|web novel)\b$/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    return `${host}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return String(u || '').toLowerCase();
  }
}

/**
 * Find an existing entry for a scraped series.
 * Checks, in order: same site + series id, same URL, shared external id
 * (MangaUpdates/AniList/MAL/MangaDex), then same title within the same library.
 * Returns { entry, reason } or null.
 */
export function findDuplicate(library, s) {
  const entries = library.entries;

  if (s.site && s.seriesKey) {
    const hit = entries.find((e) => e.links.some((l) => l.site === s.site && l.key === s.seriesKey));
    if (hit) return { entry: hit, reason: 'same link' };
  }

  if (s.url) {
    const nu = normalizeUrl(s.url);
    const hit = entries.find((e) => e.links.some((l) => normalizeUrl(l.url) === nu));
    if (hit) return { entry: hit, reason: 'same link' };
  }

  const ext = s.externalIds || {};
  for (const k of EXTERNAL_ID_KEYS) {
    if (!ext[k]) continue;
    const hit = entries.find((e) => e.externalIds && e.externalIds[k] === String(ext[k]));
    if (hit) return { entry: hit, reason: 'same series on another site' };
  }

  const titles = [s.title, ...(s.altTitles || [])].map(normalizeTitle).filter((t) => t.length >= 3);
  if (titles.length) {
    const want = new Set(titles);
    const hit = entries.find(
      (e) =>
        (!s.library || e.library === s.library) &&
        [e.title, ...e.altTitles].map(normalizeTitle).some((t) => want.has(t)),
    );
    if (hit) return { entry: hit, reason: 'same title' };
  }

  return null;
}
