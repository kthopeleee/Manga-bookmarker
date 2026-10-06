// Which entries the board shows, and the genre/tag chips for the current section.
import { entryTags } from '@shared/tags.js';
import { nonGenreTags } from '@shared/genres.js';

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Entries in the current library + section, before search and chip filters. */
export function sectionEntries(library, board) {
  let list = library.entries.filter((e) => e.library === board.library);
  if (board.section === 'unsorted') list = list.filter((e) => e.folderIds.length === 0);
  if (board.section === 'folder') list = list.filter((e) => e.folderIds.includes(board.folderId));
  return list;
}

export function applyFilters(list, filters) {
  const q = fold(filters.search).trim();
  const words = q ? q.split(/\s+/) : [];
  let out = list.filter((e) => {
    if (filters.status === 'none' && e.readingStatus) return false;
    if (filters.status && filters.status !== 'any' && filters.status !== 'none' && e.readingStatus !== filters.status) {
      return false;
    }
    if (filters.genres.length) {
      // 'any': at least one of the genres. Otherwise every one of them.
      const has = (g) => e.genres.includes(g);
      if (!(filters.genreMatch === 'any' ? filters.genres.some(has) : filters.genres.every(has))) return false;
    }
    if (filters.tags.length) {
      const tags = entryTags(e);
      if (!filters.tags.every((t) => tags.includes(t))) return false;
    }
    if (words.length) {
      const hay = fold([e.title, ...e.altTitles, ...e.authors, ...entryTags(e), e.notes].join(' '));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  const byText = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  const unread = (e) =>
    e.chaptersAvailable != null && e.lastReadChapter != null ? e.chaptersAvailable - e.lastReadChapter : -1;
  const sorters = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    title: byText,
    unread: (a, b) => unread(b) - unread(a) || byText(a, b),
  };
  out = [...out].sort(sorters[filters.sort] || sorters.added);
  return out;
}

function count(list, getValues) {
  const counts = new Map();
  for (const e of list) for (const v of getValues(e)) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

export function genreCounts(list) {
  return count(list, (e) => e.genres);
}

export function tagCounts(list) {
  return count(list, (e) => nonGenreTags(e));
}

export function hasActiveFilters(f) {
  return Boolean(f.search || f.genres.length || f.tags.length || (f.status && f.status !== 'any'));
}
