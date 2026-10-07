// The sites the extension can read, what it gets from each, and which features work there.
// The website's Sites page shows this. Each site belongs to Manga or Light Novels; the user can move
// it there, and the choice is kept in library.json as `siteLibraries` and used for new bookmarks.
// Keep it in step with extension/adapters/ and the manifest's content_scripts: tests/sites-catalog.test.mjs
// checks that every reader and every site the badge runs on is listed here.

export const FEATURES = [
  { id: 'save', label: 'Save', about: 'The toolbar button reads the series page and saves it after a preview.' },
  {
    id: 'quickSave',
    label: 'Right-click save or update',
    about:
      'Right-click the page and choose “Save or update”. A new series goes to Unsorted. A series you saved is updated in place with new chapters, this site’s link and anything missing; your tags, genres, notes, status and folders are kept.',
  },
  {
    id: 'badge',
    label: 'Saved badge',
    about:
      'A series you saved shows a badge in the corner of its page with your status; click it to open the series here. If only its manga or light novel is saved, the badge says so.',
  },
  {
    id: 'autoUpdate',
    label: 'Auto-update',
    toggle: 'Update the chapter count',
    about: 'Landing on a series you saved updates its chapter count when the page lists newer chapters. The count only goes up.',
  },
  {
    id: 'crossSite',
    label: 'Adds this site',
    toggle: 'Add the site’s link when it was saved from another site',
    about:
      'A series you saved from another site, found here by its title, gets this page’s link too. Its cover, title and original link are kept.',
  },
  { id: 'lastRead', label: 'Last read', about: 'On a chapter page, the toolbar button sets the chapter you’re on as your last read.' },
  {
    id: 'fromLink',
    label: 'Fill in from a link',
    about: 'Paste a link into “Add by hand” to fill in the form, or press ↻ on a series’ link to read that page again.',
  },
];

// Every feature that needs the extension to run on the site's pages by itself (manifest content_scripts).
const ON_PAGE = ['badge', 'autoUpdate', 'crossSite', 'fromLink'];
const ALWAYS = ['save', 'quickSave'];

export const SITES = [
  {
    id: 'mangago',
    name: 'Mangago',
    hosts: ['mangago.me'],
    library: 'manga',
    reads: ['title', 'other titles', 'cover', 'synopsis', 'authors', 'genres', 'top tags', 'status', 'chapters', 'your Mangago history'],
    features: [...ALWAYS, ...ON_PAGE, 'lastRead'],
  },
  {
    id: 'comix',
    name: 'Comix',
    hosts: ['comix.to'],
    library: 'manga',
    reads: ['title', 'other titles', 'cover', 'synopsis', 'authors and artists', 'genres', 'tags', 'type', 'status', 'chapters', 'AniList, MAL and MangaUpdates ids'],
    features: [...ALWAYS, ...ON_PAGE, 'lastRead'],
  },
  {
    id: 'mangadex',
    name: 'MangaDex',
    hosts: ['mangadex.org'],
    library: 'manga',
    reads: ['title', 'other titles', 'cover', 'synopsis', 'authors', 'genres', 'tags', 'status', 'chapters', 'AniList, MAL and MangaUpdates ids'],
    features: [...ALWAYS, ...ON_PAGE, 'lastRead'],
  },
  {
    id: 'asura',
    name: 'Asura Scans',
    hosts: ['asurascans.com', 'asuracomic.net'],
    library: 'manga',
    reads: ['title', 'other titles', 'cover', 'synopsis', 'author and artist', 'genres', 'type', 'status', 'chapters'],
    features: [...ALWAYS, ...ON_PAGE, 'lastRead'],
  },
  {
    id: 'kingofshojo.com',
    name: 'Kingofshojo',
    hosts: ['kingofshojo.com'],
    library: 'manga',
    reads: ['title', 'other title', 'cover', 'synopsis', 'author and artist', 'genres', 'type', 'status', 'chapters'],
    features: [...ALWAYS, ...ON_PAGE, 'lastRead'],
  },
  {
    id: 'novelupdates',
    name: 'NovelUpdates',
    hosts: ['novelupdates.com'],
    library: 'novel',
    reads: ['title', 'other titles', 'cover', 'synopsis', 'authors', 'genres', 'tags', 'status', 'latest chapter'],
    // Its chapters are on translators' sites, so there are no chapter pages to read.
    features: [...ALWAYS, ...ON_PAGE],
  },
  {
    id: 'borntobenovel',
    name: 'BornToBeNovel',
    hosts: ['borntobenovel.com'],
    library: 'novel',
    reads: ['title', 'other titles', 'cover', 'synopsis', 'author', 'genres', 'status', 'chapters', 'original chapter count'],
    features: [...ALWAYS, ...ON_PAGE, 'lastRead'],
  },
];

// Pages without a reader of their own. Series saved from them go where the reader guessed
// until the user moves that site; they then show up on the Sites page by name.
export const OTHER_SITES = [
  {
    id: 'wordpress',
    name: 'WordPress scan sites',
    about: 'Sites built on the Madara or MangaThemesia themes, such as LunaScans.',
    reads: ['title', 'other titles', 'cover', 'synopsis', 'authors', 'genres', 'status', 'chapters'],
    features: [...ALWAYS, 'lastRead'],
  },
  {
    id: 'any',
    name: 'Any other page',
    about: 'Uses the page’s link preview. Pages with “novel” in the address go to Light Novels.',
    reads: ['title', 'cover', 'description'],
    features: [...ALWAYS],
  },
];

// ---------- automatic updates, which the user can turn off ----------
// Kept in library.json as `features`, holding only the ones turned off: { autoUpdate: false }.

export const TOGGLES = FEATURES.filter((f) => f.toggle).map((f) => f.id);

export function normalizeFeatureToggles(raw) {
  const out = {};
  if (raw && typeof raw === 'object') for (const id of TOGGLES) if (raw[id] === false) out[id] = false;
  return out;
}

/** Whether an automatic update is on (they all start on). */
export function featureOn(library, id) {
  return !(library && library.features && library.features[id] === false);
}

/** Mutator: turn an automatic update on or off. */
export function setFeatureOn(library, id, on) {
  const toggles = normalizeFeatureToggles(library.features);
  if (on) delete toggles[id];
  else toggles[id] = false;
  library.features = toggles;
  return library;
}

// ---------- sites and their sections ----------

export function siteInfo(id) {
  return SITES.find((s) => s.id === id) || null;
}

/** Keep only valid choices: { siteId: 'manga' | 'novel' }. */
export function normalizeSiteLibraries(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const [id, lib] of Object.entries(raw)) {
      if (id && (lib === 'manga' || lib === 'novel')) out[id] = lib;
    }
  }
  return out;
}

/** The section a site's series go to: the user's choice, else the site's usual one, else null. */
export function siteLibrary(library, siteId) {
  const chosen = library && library.siteLibraries && library.siteLibraries[siteId];
  if (chosen === 'manga' || chosen === 'novel') return chosen;
  const site = siteInfo(siteId);
  return site ? site.library : null;
}

/** The section a newly scraped series goes to. */
export function libraryForScrape(library, scraped) {
  return siteLibrary(library, scraped && scraped.site) || (scraped && scraped.library === 'novel' ? 'novel' : 'manga');
}

/** Mutator: move a site to a section. Only differences from the site's usual section are stored. */
export function setSiteLibrary(library, siteId, lib) {
  const choices = { ...normalizeSiteLibraries(library.siteLibraries) };
  const site = siteInfo(siteId);
  if (site && site.library === lib) delete choices[siteId];
  else choices[siteId] = lib;
  library.siteLibraries = choices;
  return library;
}

/** The site an entry was first saved from (its first link). */
export function sourceSite(entry) {
  return (entry.links && entry.links[0] && entry.links[0].site) || null;
}

/** Sites the library has series from that aren't in SITES, e.g. a WordPress scan site. */
export function otherSavedSites(library) {
  const seen = new Map();
  for (const e of library.entries) {
    const id = sourceSite(e);
    if (!id || siteInfo(id)) continue;
    if (!seen.has(id)) seen.set(id, { id, name: id, counts: { manga: 0, novel: 0 } });
    seen.get(id).counts[e.library]++;
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Entries first saved from this site that are in the other section. */
export function entriesToMove(library, siteId, lib) {
  return library.entries.filter((e) => sourceSite(e) === siteId && e.library !== lib);
}
