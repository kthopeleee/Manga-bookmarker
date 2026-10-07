// Background script: does the GitHub writes so a save finishes even if the popup closes.
import {
  ext,
  getSettings,
  isConfigured,
  getCachedLibrary,
  setCachedLibrary,
  libraryPageUrl,
  librarySitePatterns,
  urlMatches,
} from './lib/ext.js';
import { scrapeTab, prepareCover, showToast } from './lib/page.js';
import { GitHubStore, coverPathFor, base64ToBytes } from './shared/github-store.js';
import {
  LIBRARIES,
  addEntry,
  addFolder,
  createEntry,
  emptyLibrary,
  entryFieldsFromScrape,
  getEntry,
  linkEntries,
  mergeScrapeIntoEntry,
  newId,
  normalizeLibrary,
  relatedEntries,
  updateEntry,
} from './shared/model.js';
import { findCounterparts, findDuplicate, normalizeUrl } from './shared/match.js';
import { featureOn, libraryForScrape } from './shared/sites.js';

async function store() {
  const settings = await getSettings();
  if (!isConfigured(settings)) throw new Error('Open the extension options and connect your GitHub data repo first.');
  return new GitHubStore(settings);
}

async function flashBadge(text, color) {
  try {
    await ext.action.setBadgeBackgroundColor({ color });
    await ext.action.setBadgeText({ text });
    setTimeout(() => ext.action.setBadgeText({ text: '' }), 4000);
  } catch {
    /* badge is cosmetic */
  }
}

// Create any folders typed in the popup and return the full list of folder ids to use.
function resolveFolders(lib, library, folderIds, newFolderNames) {
  const ids = [...(folderIds || [])];
  for (const name of newFolderNames || []) {
    addFolder(lib, { name, library });
    const folder = lib.folders.find((f) => f.library === library && f.name.toLowerCase() === name.trim().toLowerCase());
    if (folder && !ids.includes(folder.id)) ids.push(folder.id);
  }
  return ids;
}

/**
 * payload: { mode: 'add' | 'update', entryId?, scraped (entry fields from the page),
 *            user: { title, library, readingStatus, chaptersAvailable, lastReadChapter, notes,
 *                    scrapedTags, customTags, folderIds, newFolders,
 *                    linkIds (entries in the other library to link with, e.g. the novel of this manga) },
 *            cover: { base64, type } | null }
 */
async function save(payload) {
  const gh = await store();
  const { mode, scraped, user, cover } = payload;
  const entryId = mode === 'update' ? payload.entryId : newId('e');

  let coverPath = null;
  if (cover && cover.base64) {
    coverPath = coverPathFor(entryId, cover.type);
    await gh.putFile(coverPath, base64ToBytes(cover.base64), `Cover for ${user.title}`);
  }

  let savedId = entryId;
  const verb = mode === 'update' ? 'Update' : 'Add';
  const library = await gh.updateLibrary((lib) => {
    const folderIds = resolveFolders(lib, user.library, user.folderIds, user.newFolders);
    const userFields = { ...user, folderIds };
    delete userFields.newFolders;
    delete userFields.linkIds;

    const existing = mode === 'update' ? getEntry(lib, entryId) : null;
    if (existing) {
      const merged = mergeScrapeIntoEntry(existing, scraped);
      updateEntry(lib, entryId, {
        ...merged,
        ...userFields,
        coverPath: existing.coverPath || coverPath,
      });
    } else {
      addEntry(lib, createEntry({ ...scraped, ...userFields, id: entryId, coverPath }));
      savedId = entryId;
    }
    for (const id of user.linkIds || []) if (getEntry(lib, id)) linkEntries(lib, savedId, id);
    return lib;
  }, `${verb}: ${user.title}`);

  await setCachedLibrary(library);
  await flashBadge('✓', '#2e7d32');
  return { entryId: savedId, library };
}

async function setLastRead({ entryId, chapter, markReading, title }) {
  const gh = await store();
  const library = await gh.updateLibrary((lib) => {
    const entry = getEntry(lib, entryId);
    if (!entry) throw new Error('That series is no longer in your library.');
    const patch = { lastReadChapter: chapter };
    if (markReading && (!entry.readingStatus || entry.readingStatus === 'plan')) patch.readingStatus = 'reading';
    if (entry.chaptersAvailable == null || chapter > entry.chaptersAvailable) patch.chaptersAvailable = chapter;
    return updateEntry(lib, entryId, patch);
  }, `Read: ${title || entryId} ch. ${chapter}`);
  await setCachedLibrary(library);
  await flashBadge('✓', '#2e7d32');
  return { library };
}

async function refreshLibrary() {
  const gh = await store();
  const library = await gh.loadLibrary();
  await setCachedLibrary(library);
  return { library };
}

// ---------- right-click "Save or update" ----------
// A new series goes straight to Unsorted (organize it later in the popup). A series that's already
// saved is updated in place, never saved twice: see updateSaved below.

const QUICK_SAVE_MENU = 'quick-save';

function libraryLabel(id) {
  return (LIBRARIES.find((l) => l.id === id) || LIBRARIES[0]).label;
}

function whereIs(lib, entry) {
  const folders = lib.folders.filter((f) => entry.folderIds.includes(f.id)).map((f) => f.name);
  return `${libraryLabel(entry.library)} › ${folders.length ? folders.join(', ') : 'Unsorted'}`;
}

async function quickSave(tabId) {
  const gh = await store();
  await showToast(tabId, 'Reading this page…');

  let scraped;
  try {
    scraped = await scrapeTab(tabId);
  } catch {
    scraped = null;
  }
  if (!scraped) throw new Error("This page can't be read.");

  let lib;
  try {
    lib = await gh.loadLibrary();
  } catch (err) {
    if (err.status !== 404) throw err;
    lib = emptyLibrary();
  }

  if (scraped.kind === 'chapter') {
    const match = findDuplicate(lib, {
      site: scraped.site,
      seriesKey: scraped.seriesKey,
      url: scraped.seriesUrl,
      title: scraped.seriesTitle,
      externalIds: scraped.externalIds,
    });
    if (match) return readTo(tabId, gh, match.entry, scraped.chapter);
    throw new Error('This is a chapter page. Open the series page to save it.');
  }

  // The section this site's series go to, which the user can change on the website's Sites page.
  scraped = { ...scraped, library: libraryForScrape(lib, scraped) };
  const match = findDuplicate(lib, scraped);
  if (match) return updateSaved(tabId, gh, match.entry, scraped);

  const fields = entryFieldsFromScrape(scraped);
  if (!fields.title) throw new Error("Couldn't find a title on this page. Click the extension icon to add it by hand.");
  const cover = await Promise.race([prepareCover(tabId, scraped.coverUrl), new Promise((r) => setTimeout(() => r(null), 8000))]);
  // The same title in the other library is this story's manga or novel: link them if there's just one.
  const counterparts = findCounterparts(lib, scraped);
  const linkTo = counterparts.length === 1 ? counterparts[0] : null;

  // Same defaults the popup starts with: every tag from the site, no folders, no status.
  await save({
    mode: 'add',
    scraped: fields,
    user: {
      title: fields.title,
      library: fields.library,
      readingStatus: null,
      chaptersAvailable: fields.chaptersAvailable,
      lastReadChapter: scraped.lastReadHint ?? null,
      notes: '',
      scrapedTags: fields.scrapedTags,
      customTags: [],
      folderIds: [],
      newFolders: [],
      linkIds: linkTo ? [linkTo.id] : [],
    },
    cover,
  });
  const linked = linkTo ? `, linked with “${linkTo.title}” in ${libraryLabel(linkTo.library)}` : '';
  await showToast(tabId, `Saved “${fields.title}” to ${libraryLabel(fields.library)} › Unsorted${linked}.`, 'ok');
}

// The fields a page can add to or fill in. Everything else (title, notes, custom tags, status, folders,
// last read, cover) belongs to the user and is never changed by an update.
const PAGE_FIELDS = ['chaptersAvailable', 'links', 'scrapedTags', 'genres', 'altTitles', 'synopsis', 'authors', 'coverSourceUrl', 'pubStatus', 'externalIds'];

/**
 * Right-click on a series that's already saved: update that same entry. New chapters and this site's
 * link go in the same way a visit adds them (pageChanges: the count only goes up, a site's moved link is
 * replaced). Then anything the entry is missing is filled in from the page, and the site's new tags and
 * genres are added to the ones it has: nothing is removed.
 */
async function updateSaved(tabId, gh, saved, scraped) {
  const fields = entryFieldsFromScrape(scraped);
  const siteLabel = scraped.siteLabel || scraped.site;
  let cover = null;
  if (!saved.coverPath && scraped.coverUrl) {
    cover = await Promise.race([prepareCover(tabId, scraped.coverUrl), new Promise((r) => setTimeout(() => r(null), 8000))]);
  }
  const coverPath = cover && cover.base64 ? coverPathFor(saved.id, cover.type) : null;
  if (coverPath) await gh.putFile(coverPath, base64ToBytes(cover.base64), `Cover for ${saved.title}`);

  let before = null;
  let after = null;
  let latest = null;
  try {
    latest = await gh.updateLibrary((lib) => {
      const e = getEntry(lib, saved.id);
      if (!e) throw new Error(`“${saved.title}” is no longer in your library.`);
      const visit = pageChanges(e, { seen: newChapterCount(e, scraped.chaptersAvailable), link: newLinkFor(e, scraped) });
      const merged = mergeScrapeIntoEntry({ ...e, ...visit }, { ...fields, links: [], chaptersAvailable: null });
      const patch = {};
      for (const k of PAGE_FIELDS) if (JSON.stringify(merged[k]) !== JSON.stringify(e[k])) patch[k] = merged[k];
      if (coverPath && !e.coverPath) patch.coverPath = coverPath;
      before = e;
      after = { ...e, ...patch };
      if (!Object.keys(patch).length) {
        latest = lib;
        throw NOTHING_TO_SAVE;
      }
      return updateEntry(lib, e.id, patch);
    }, `Update from ${siteLabel}: ${saved.title}`);
  } catch (err) {
    if (err !== NOTHING_TO_SAVE) throw err;
  }
  if (latest) await setCachedLibrary(latest);

  const newTags = after.scrapedTags.length - before.scrapedTags.length;
  const changes = [
    after.chaptersAvailable !== before.chaptersAvailable &&
      (before.chaptersAvailable != null
        ? `${after.chaptersAvailable - before.chaptersAvailable} new ${after.chaptersAvailable - before.chaptersAvailable === 1 ? 'chapter' : 'chapters'}`
        : `${after.chaptersAvailable} chapters`),
    JSON.stringify(after.links) !== JSON.stringify(before.links) && `this ${siteLabel} link`,
    newTags > 0 && `${newTags} new ${newTags === 1 ? 'tag' : 'tags'}`,
    after.coverPath !== before.coverPath && 'a cover',
    !before.synopsis && after.synopsis && 'a synopsis',
  ].filter(Boolean);
  const message = changes.length
    ? `Updated “${saved.title}”: ${changes.join(', ')}. Your tags, notes and status are kept.`
    : `“${saved.title}” is already up to date.`;
  await showToast(tabId, message, 'ok');
}

/** Right-click on a chapter page of a saved series: that chapter becomes the last read, if it's further on. */
async function readTo(tabId, gh, saved, chapter) {
  const n = Number(chapter);
  if (chapter == null || !Number.isFinite(n) || n <= 0) {
    return showToast(tabId, `“${saved.title}” is saved. Click the extension icon to set your last-read chapter.`, 'ok');
  }
  let already = null;
  let latest = null;
  try {
    latest = await gh.updateLibrary((lib) => {
      const e = getEntry(lib, saved.id);
      if (!e) throw new Error(`“${saved.title}” is no longer in your library.`);
      if (e.lastReadChapter != null && n <= e.lastReadChapter) {
        already = e.lastReadChapter;
        latest = lib;
        throw NOTHING_TO_SAVE;
      }
      const patch = { lastReadChapter: n };
      if (e.chaptersAvailable == null || n > e.chaptersAvailable) patch.chaptersAvailable = n;
      if (!e.readingStatus || e.readingStatus === 'plan') patch.readingStatus = 'reading';
      return updateEntry(lib, e.id, patch);
    }, `Read: ${saved.title} ch. ${n}`);
  } catch (err) {
    if (err !== NOTHING_TO_SAVE) throw err;
  }
  if (latest) await setCachedLibrary(latest);
  await showToast(
    tabId,
    already != null ? `You've already read “${saved.title}” to chapter ${already}.` : `“${saved.title}”: read to chapter ${n}.`,
    'ok',
  );
}

ext.runtime.onInstalled.addListener(async () => {
  syncLibraryBridge();
  await ext.contextMenus.removeAll();
  ext.contextMenus.create({
    id: QUICK_SAVE_MENU,
    title: 'Save or update',
    contexts: ['page', 'frame', 'selection', 'link', 'image'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
  });
});

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== QUICK_SAVE_MENU || !tab || tab.id == null) return;
  quickSave(tab.id).catch(async (err) => {
    await flashBadge('!', '#c62828');
    await showToast(tab.id, (err && err.message) || String(err), 'error');
  });
});

// ---------- "already read" badge on manga sites (content/badge.js asks here) ----------

const CACHE_MAX_AGE = 10 * 60 * 1000;
let refreshing = null;

// Answers from the saved copy so the badge shows instantly. A copy older than CACHE_MAX_AGE is
// refreshed from GitHub in the background; open tabs re-check when the new copy is stored.
async function libraryForBadge() {
  const { libraryCachedAt } = await ext.storage.local.get('libraryCachedAt');
  const cached = await getCachedLibrary();
  if (!cached || !libraryCachedAt || Date.now() - libraryCachedAt > CACHE_MAX_AGE) {
    refreshing ||= refreshLibrary()
      .catch(() => null)
      .finally(() => (refreshing = null));
    if (!cached) return (await refreshing)?.library || null;
  }
  return normalizeLibrary(cached);
}

// ---------- a saved series' page: keep its chapter count and links up to date ----------
// Visiting the page of a saved series adds the page's link if the entry doesn't have it (the same
// series read on another site, found by its title) and saves a higher chapter count. The title,
// cover, synopsis and existing links stay as they are.

const pageUpdates = new Map(); // entry id -> save in progress, so two tabs don't both save
const NOTHING_TO_SAVE = new Error('Nothing to save');

/** The chapter count the page shows, if it's believable and more than the library has. */
function newChapterCount(entry, seen) {
  const n = Number(seen);
  if (seen == null || !Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return entry.chaptersAvailable == null || n > entry.chaptersAvailable ? n : null;
}

/** This page's link, if the entry doesn't have it yet. */
function newLinkFor(entry, series) {
  if (!series.site || !series.url) return null;
  const url = normalizeUrl(series.url);
  if (entry.links.some((l) => normalizeUrl(l.url) === url)) return null;
  return { site: series.site, key: series.seriesKey || null, url: series.url };
}

// The changes to make to `e` (as it is on GitHub now). The count only ever goes up, so two sites that
// disagree can't flip it back and forth. A site the entry already has a link for gets that link
// updated (the site moved the series), so it doesn't end up with a dead one next to the new one.
function pageChanges(e, { seen, link }) {
  const patch = {};
  if (seen != null && (e.chaptersAvailable == null || seen > e.chaptersAvailable)) patch.chaptersAvailable = seen;
  if (link && newLinkFor(e, link)) {
    const i = e.links.findIndex((l) => l.site === link.site);
    patch.links = i === -1 ? [...e.links, link] : e.links.map((l, j) => (j === i ? { ...l, ...link } : l));
  }
  return patch;
}

async function saveFromPage(entry, changes, siteLabel) {
  const gh = await store();
  const what = [
    changes.link && `link`,
    changes.seen != null && `chapters ${entry.chaptersAvailable ?? '?'} → ${changes.seen}`,
  ].filter(Boolean);
  let latest = null;
  try {
    latest = await gh.updateLibrary((lib) => {
      const e = getEntry(lib, entry.id);
      // Check the switches again on the copy from GitHub: the cached one may not have the latest change.
      const allowed = {
        seen: featureOn(lib, 'autoUpdate') ? changes.seen : null,
        link: featureOn(lib, 'crossSite') ? changes.link : null,
      };
      const patch = e ? pageChanges(e, allowed) : {};
      if (!Object.keys(patch).length) {
        latest = lib; // someone already saved it: nothing to write
        throw NOTHING_TO_SAVE;
      }
      return updateEntry(lib, entry.id, patch);
    }, `From ${siteLabel}: ${entry.title} (${what.join(', ')})`);
  } catch (err) {
    if (err !== NOTHING_TO_SAVE) throw err;
  }
  if (latest) await setCachedLibrary(latest);
}

// What the badge shows about an entry.
function badgeEntry(lib, e, settings) {
  return {
    title: e.title,
    readingStatus: e.readingStatus,
    lastReadChapter: e.lastReadChapter,
    chaptersAvailable: e.chaptersAvailable,
    where: whereIs(lib, e),
    libraryUrl: libraryPageUrl(settings, `#/entry/${e.id}`),
  };
}

/**
 * payload: the series identity from the page ({ site, seriesKey, url, title, altTitles, externalIds, library })
 * plus siteLabel and chaptersAvailable, the newest chapter the page lists. A higher count, and this page's
 * link if the entry doesn't have it, are saved to the library.
 */
async function lookup(series) {
  let lib;
  try {
    lib = await libraryForBadge();
  } catch {
    lib = null;
  }
  if (!lib) return { entry: null };
  const settings = await getSettings();
  // Look in the section the user puts this site's series in (Sites page), not just the reader's guess.
  const asked = { ...series, library: libraryForScrape(lib, series) };
  const match = findDuplicate(lib, asked);
  if (!match) {
    // Not saved, but the same story is in the other library: its manga, or its light novel. Its chapter
    // count is left alone, since a novel and its manga number chapters differently.
    const other = findCounterparts(lib, asked)[0];
    if (!other) return { entry: null };
    return {
      entry: { ...badgeEntry(lib, other, settings), counterpart: other.library === 'novel' ? 'light novel' : 'manga', newChapters: 0 },
    };
  }
  const e = match.entry;

  // Each automatic update can be turned off on the website's Sites page; right-click "Save or update"
  // still does it when asked.
  const found = newChapterCount(e, series.chaptersAvailable);
  const seen = featureOn(lib, 'autoUpdate') ? found : null;
  const link = featureOn(lib, 'crossSite') ? newLinkFor(e, series) : null;
  const siteLabel = series.siteLabel || series.site;
  if ((seen != null || link) && !pageUpdates.has(e.id)) {
    pageUpdates.set(
      e.id,
      saveFromPage(e, { seen, link }, siteLabel)
        .catch((err) => console.warn(`Couldn't save the update from ${siteLabel} for ${e.title}:`, err))
        .finally(() => pageUpdates.delete(e.id)),
    );
  }

  return {
    entry: {
      ...badgeEntry(lib, e, settings),
      chaptersAvailable: seen ?? e.chaptersAvailable,
      // How many chapters came out since the library last had a count (none if it had no count).
      newChapters: seen != null && e.chaptersAvailable != null ? seen - e.chaptersAvailable : 0,
      // New chapters on the page that weren't saved because auto-update is off.
      waitingChapters: seen == null && found != null && e.chaptersAvailable != null ? found - e.chaptersAvailable : 0,
      // This page's site, when its link is being added to the entry.
      addedLink: link ? siteLabel : null,
      // Its linked manga or light novel, for the tooltip.
      linked: relatedEntries(lib, e).map((r) => ({ title: r.title, library: libraryLabel(r.library), lastReadChapter: r.lastReadChapter })),
    },
  };
}

// ---------- "Fill in from link" on the library website (content/library-bridge.js asks here) ----------

const BRIDGE_ID = 'library-bridge';
const SUPPORTED_SITES = ext.runtime.getManifest().content_scripts[0].matches;
let bridgeSync = Promise.resolve();

// Register the bridge for the library website in the settings, once the browser allows access to it.
function syncLibraryBridge() {
  bridgeSync = bridgeSync
    .then(async () => {
      const site = librarySitePatterns((await getSettings()).siteUrl);
      const registered = await ext.scripting.getRegisteredContentScripts({ ids: [BRIDGE_ID] });
      if (registered.length) await ext.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] });
      if (!site || !(await ext.permissions.contains({ origins: [site.origin] }))) return;
      await ext.scripting.registerContentScripts([
        { id: BRIDGE_ID, matches: [site.page], js: ['content/library-bridge.js'], runAt: 'document_end' },
      ]);
    })
    .catch((err) => console.warn('Library website bridge:', err));
  return bridgeSync;
}

ext.runtime.onStartup.addListener(syncLibraryBridge);
ext.permissions.onAdded.addListener(syncLibraryBridge);
ext.permissions.onRemoved.addListener(syncLibraryBridge);
ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.siteUrl) syncLibraryBridge();
});

async function openHiddenTab(url, near) {
  const props = { url, active: false };
  if (near) Object.assign(props, { windowId: near.windowId, index: near.index + 1 });
  const tab = await ext.tabs.create(props);
  return tab.id;
}

async function waitForLoad(tabId, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    const tab = await ext.tabs.get(tabId);
    if (tab.status === 'complete' && /^https?:/.test(tab.url || '')) return;
  }
  throw new Error('The page took too long to load.');
}

// Some sites finish drawing a moment after loading, so give the page a second chance.
async function scrapeLoadedTab(tabId) {
  for (const delay of [300, 1500]) {
    await new Promise((r) => setTimeout(r, delay));
    let s = null;
    try {
      s = await scrapeTab(tabId);
    } catch {
      s = null;
    }
    if (s && s.adapter !== 'generic') return s;
  }
  return null;
}

// Opens the link in a background tab, reads it with the same site readers as the popup, closes it.
async function readSeriesPage(url, near) {
  const tabId = await openHiddenTab(url, near);
  try {
    await waitForLoad(tabId);
    const scraped = await scrapeLoadedTab(tabId);
    const cover =
      scraped && scraped.kind === 'series'
        ? await Promise.race([prepareCover(tabId, scraped.coverUrl), new Promise((r) => setTimeout(() => r(null), 8000))])
        : null;
    return { scraped, cover };
  } finally {
    ext.tabs.remove(tabId).catch(() => {});
  }
}

/** payload: { url } of a series (or chapter) page. Only your library website may ask. */
async function readLink({ url }, sender) {
  const site = librarySitePatterns((await getSettings()).siteUrl);
  if (!site || !sender.url || !urlMatches(sender.url, [site.page])) {
    throw new Error('Only your library website can ask the extension to read links.');
  }
  let link;
  try {
    link = new URL(url);
  } catch {
    throw new Error('That isn’t a valid link.');
  }
  if (!urlMatches(link.href, SUPPORTED_SITES)) {
    throw new Error(`The extension can't read ${link.hostname.replace(/^www\./, '')}, so fill this one in by hand.`);
  }

  let { scraped, cover } = await readSeriesPage(link.href, sender.tab);
  if (scraped && scraped.kind === 'chapter' && scraped.seriesUrl) {
    ({ scraped, cover } = await readSeriesPage(scraped.seriesUrl, sender.tab)); // a chapter link: read its series
  }
  if (!scraped || scraped.kind !== 'series') {
    throw new Error("Couldn't find a series on that page. If the site shows a captcha, open the link and use the extension button there.");
  }
  return { fields: entryFieldsFromScrape(scraped), cover, lastReadHint: scraped.lastReadHint ?? null };
}

// ---------- messages from the popup and content scripts ----------

const handlers = { save, setLastRead, refreshLibrary, lookup };
// Content scripts run inside web pages, so they only get these. readLink also checks the page is your library website.
const contentScriptHandlers = { lookup, readLink };

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fromExtensionPage = Boolean(sender.url && sender.url.startsWith(ext.runtime.getURL('')));
  const handler = msg && (fromExtensionPage ? handlers : contentScriptHandlers)[msg.type];
  if (!handler) return false;
  handler(msg.payload || {}, sender).then(
    (result) => sendResponse({ ok: true, ...result }),
    async (err) => {
      if (fromExtensionPage) await flashBadge('!', '#c62828');
      sendResponse({ ok: false, error: (err && err.message) || String(err) });
    },
  );
  return true; // keep the channel open for the async response
});
