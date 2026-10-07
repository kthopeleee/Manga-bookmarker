// Data model for library.json, shared by the extension and the website.
// Mutators change the library object in place and return it, so they can be
// re-applied to a freshly downloaded copy when GitHub reports a write conflict.

import { uniqueTags } from './tags.js';
import { genresFor } from './genres.js';
import { normalizeFeatureToggles, normalizeSiteLibraries } from './sites.js';

export const SCHEMA_VERSION = 1;

export const LIBRARIES = [
  { id: 'manga', label: 'Manga' },
  { id: 'novel', label: 'Light Novels' },
];

export const READING_STATUSES = [
  { id: 'reading', label: 'Reading' },
  { id: 'plan', label: 'Plan to read' },
  { id: 'completed', label: 'Completed' },
  { id: 'dropped', label: 'Dropped' },
];

export const PUB_STATUSES = [
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'hiatus', label: 'Hiatus' },
  { id: 'cancelled', label: 'Cancelled' },
];

export const EXTERNAL_ID_KEYS = ['mu', 'al', 'mal', 'md'];

export function newId(prefix) {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function emptyLibrary() {
  return { version: SCHEMA_VERSION, folders: [], entries: [] };
}

function webUrlOrNull(v) {
  return typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null;
}

function toNumberOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeEntry(e) {
  const scrapedTags = uniqueTags(e.scrapedTags);
  const customTags = uniqueTags(e.customTags);
  const entry = {
    id: e.id || newId('e'),
    library: e.library === 'novel' ? 'novel' : 'manga',
    title: String(e.title || '').trim() || 'Untitled',
    altTitles: Array.isArray(e.altTitles) ? e.altTitles.filter(Boolean) : [],
    links: Array.isArray(e.links) ? e.links.filter((l) => l && l.url) : [],
    coverPath: e.coverPath || null,
    coverSourceUrl: e.coverSourceUrl || null,
    synopsis: e.synopsis || '',
    authors: Array.isArray(e.authors) ? e.authors.filter(Boolean) : [],
    scrapedTags,
    customTags,
    // Which of the tags are genres (see genres.js). Older entries get theirs from the known list.
    genres: genresFor(e.genres, [...scrapedTags, ...customTags]),
    folderIds: Array.isArray(e.folderIds) ? [...new Set(e.folderIds)] : [],
    // The same story in the other library (the manga of a light novel, or the novel of a manga).
    relatedIds: Array.isArray(e.relatedIds) ? [...new Set(e.relatedIds.filter((id) => typeof id === 'string'))] : [],
    readingStatus: READING_STATUSES.some((s) => s.id === e.readingStatus) ? e.readingStatus : null,
    pubStatus: PUB_STATUSES.some((s) => s.id === e.pubStatus) ? e.pubStatus : null,
    chaptersAvailable: toNumberOrNull(e.chaptersAvailable),
    lastReadChapter: toNumberOrNull(e.lastReadChapter),
    notes: e.notes || '',
    externalIds: {},
    addedAt: e.addedAt || nowIso(),
    updatedAt: e.updatedAt || e.addedAt || nowIso(),
  };
  for (const k of EXTERNAL_ID_KEYS) {
    if (e.externalIds && e.externalIds[k]) entry.externalIds[k] = String(e.externalIds[k]);
  }
  entry.relatedIds = entry.relatedIds.filter((id) => id !== entry.id);
  return entry;
}

export function normalizeLibrary(raw) {
  const lib = raw && typeof raw === 'object' ? raw : {};
  const folders = Array.isArray(lib.folders)
    ? lib.folders
        .filter((f) => f && f.id && f.name)
        .map((f, i) => ({
          id: f.id,
          name: String(f.name),
          library: f.library === 'novel' ? 'novel' : 'manga',
          order: Number.isFinite(f.order) ? f.order : i,
          listUrl: webUrlOrNull(f.listUrl), // the same list on a site, e.g. a Mangago list
        }))
    : [];
  const folderIds = new Set(folders.map((f) => f.id));
  const entries = Array.isArray(lib.entries)
    ? lib.entries.filter(Boolean).map((e) => {
        const entry = normalizeEntry(e);
        entry.folderIds = entry.folderIds.filter((id) => folderIds.has(id));
        return entry;
      })
    : [];
  // Links go both ways and only to entries that still exist.
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const e of entries) e.relatedIds = e.relatedIds.filter((id) => byId.has(id));
  for (const e of entries) {
    for (const id of e.relatedIds) {
      const other = byId.get(id);
      if (!other.relatedIds.includes(e.id)) other.relatedIds.push(e.id);
    }
  }
  // Which section each site's new bookmarks go to, and which automatic updates are off (see sites.js).
  return {
    version: SCHEMA_VERSION,
    folders,
    entries,
    siteLibraries: normalizeSiteLibraries(lib.siteLibraries),
    features: normalizeFeatureToggles(lib.features),
  };
}

export function createEntry(fields) {
  const now = nowIso();
  return normalizeEntry({ ...fields, id: fields.id || newId('e'), addedAt: now, updatedAt: now });
}

/** Turn a scraper result into entry fields (no id, no user fields). */
export function entryFieldsFromScrape(s) {
  return {
    library: s.library,
    title: s.title,
    altTitles: s.altTitles || [],
    links: s.url ? [{ site: s.site, key: s.seriesKey || null, url: s.url }] : [],
    coverSourceUrl: s.coverUrl || null,
    synopsis: s.synopsis || '',
    authors: s.authors || [],
    scrapedTags: [...(s.genres || []), ...(s.tags || [])],
    genres: s.genres || [],
    pubStatus: s.pubStatus || null,
    chaptersAvailable: s.chaptersAvailable ?? null,
    externalIds: s.externalIds || {},
  };
}

export function getEntry(library, id) {
  return library.entries.find((e) => e.id === id) || null;
}

/** The entries linked to this one (e.g. its light novel or manga version). */
export function relatedEntries(library, entry) {
  return entry.relatedIds.map((id) => getEntry(library, id)).filter(Boolean);
}

// ---------- mutators ----------

export function addEntry(library, entry) {
  library.entries.push(normalizeEntry(entry));
  return library;
}

export function updateEntry(library, id, patch) {
  const i = library.entries.findIndex((e) => e.id === id);
  if (i === -1) throw new Error('That entry no longer exists in your library.');
  const merged = normalizeEntry({ ...library.entries[i], ...patch, id, updatedAt: nowIso() });
  const folderIds = new Set(library.folders.map((f) => f.id));
  merged.folderIds = merged.folderIds.filter((fid) => folderIds.has(fid));
  library.entries[i] = merged;
  return library;
}

export function deleteEntry(library, id) {
  library.entries = library.entries.filter((e) => e.id !== id);
  for (const e of library.entries) e.relatedIds = e.relatedIds.filter((rid) => rid !== id);
  return library;
}

/** Link two entries as versions of the same story. Links go both ways. */
export function linkEntries(library, aId, bId) {
  if (aId === bId) return library;
  const a = getEntry(library, aId);
  const b = getEntry(library, bId);
  if (!a || !b) throw new Error('That entry no longer exists in your library.');
  if (!a.relatedIds.includes(bId)) a.relatedIds.push(bId);
  if (!b.relatedIds.includes(aId)) b.relatedIds.push(aId);
  return library;
}

export function unlinkEntries(library, aId, bId) {
  for (const [id, other] of [[aId, bId], [bId, aId]]) {
    const e = getEntry(library, id);
    if (e) e.relatedIds = e.relatedIds.filter((x) => x !== other);
  }
  return library;
}

/**
 * Merge freshly scraped data into an existing entry without touching the
 * user's own fields (notes, folders, reading status, custom tags).
 */
export function mergeScrapeIntoEntry(entry, fields) {
  const links = [...entry.links];
  for (const link of fields.links || []) {
    const idx = links.findIndex(
      (l) => (l.site === link.site && link.key && l.key === link.key) || l.url === link.url,
    );
    if (idx === -1) links.push(link);
    else links[idx] = { ...links[idx], ...link };
  }
  const altTitles = [...new Set([...entry.altTitles, ...(fields.altTitles || [])])].filter(
    (t) => t && t !== entry.title,
  );
  const externalIds = { ...(fields.externalIds || {}), ...entry.externalIds };
  return {
    ...entry,
    altTitles,
    links,
    coverSourceUrl: entry.coverSourceUrl || fields.coverSourceUrl || null,
    synopsis: entry.synopsis || fields.synopsis || '',
    authors: entry.authors.length ? entry.authors : fields.authors || [],
    scrapedTags: uniqueTags([...entry.scrapedTags, ...(fields.scrapedTags || [])]),
    genres: uniqueTags([...(entry.genres || []), ...(fields.genres || [])]),
    pubStatus: fields.pubStatus || entry.pubStatus,
    chaptersAvailable: maxOrNull(entry.chaptersAvailable, fields.chaptersAvailable),
    externalIds,
  };
}

function maxOrNull(a, b) {
  const nums = [a, b].map(toNumberOrNull).filter((n) => n != null);
  return nums.length ? Math.max(...nums) : null;
}

export function addFolder(library, folder) {
  const exists = library.folders.some(
    (f) => f.library === folder.library && f.name.toLowerCase() === folder.name.trim().toLowerCase(),
  );
  if (exists) return library;
  const order = library.folders.filter((f) => f.library === folder.library).length;
  library.folders.push({
    id: folder.id || newId('f'),
    name: folder.name.trim(),
    library: folder.library === 'novel' ? 'novel' : 'manga',
    order,
  });
  return library;
}

export function renameFolder(library, id, name) {
  const f = library.folders.find((x) => x.id === id);
  if (f) f.name = name.trim() || f.name;
  return library;
}

export function deleteFolder(library, id) {
  library.folders = library.folders.filter((f) => f.id !== id);
  for (const e of library.entries) e.folderIds = e.folderIds.filter((fid) => fid !== id);
  return library;
}

export function moveFolder(library, id, direction) {
  const f = library.folders.find((x) => x.id === id);
  if (!f) return library;
  const siblings = library.folders.filter((x) => x.library === f.library).sort((a, b) => a.order - b.order);
  const i = siblings.indexOf(f);
  const j = i + direction;
  if (j < 0 || j >= siblings.length) return library;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  siblings.forEach((x, k) => (x.order = k));
  return library;
}

export function foldersFor(library, lib) {
  return library.folders.filter((f) => f.library === lib).sort((a, b) => a.order - b.order);
}

/** Link a folder to the same list on a site (e.g. a Mangago list). An empty url removes the link. */
export function setFolderListUrl(library, id, url) {
  const f = library.folders.find((x) => x.id === id);
  if (f) f.listUrl = webUrlOrNull(url);
  return library;
}

/** Put entries into a folder. Entries from the other library are left out, since folders belong to one. */
export function addToFolder(library, folderId, entryIds) {
  const folder = library.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error('That folder no longer exists.');
  const ids = new Set(entryIds);
  for (const e of library.entries) {
    if (ids.has(e.id) && e.library === folder.library && !e.folderIds.includes(folderId)) e.folderIds.push(folderId);
  }
  return library;
}
