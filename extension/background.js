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
  mergeScrapeIntoEntry,
  newId,
  normalizeLibrary,
  updateEntry,
} from './shared/model.js';
import { findDuplicate } from './shared/match.js';

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
 *                    scrapedTags, customTags, folderIds, newFolders },
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

// ---------- right-click quick save: straight to Unsorted, organize later in the popup ----------

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
  await showToast(tabId, 'Saving to your library…');

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
    if (match) {
      return showToast(tabId, `“${match.entry.title}” is already in ${whereIs(lib, match.entry)}. Click the extension icon to set your last-read chapter.`, 'ok');
    }
    throw new Error('This is a chapter page. Open the series page to save it.');
  }

  const match = findDuplicate(lib, scraped);
  if (match) {
    await setCachedLibrary(lib);
    return showToast(tabId, `Already saved: “${match.entry.title}” is in ${whereIs(lib, match.entry)}.`, 'ok');
  }

  const fields = entryFieldsFromScrape(scraped);
  if (!fields.title) throw new Error("Couldn't find a title on this page. Click the extension icon to add it by hand.");
  const cover = await Promise.race([prepareCover(tabId, scraped.coverUrl), new Promise((r) => setTimeout(() => r(null), 8000))]);

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
    },
    cover,
  });
  await showToast(tabId, `Saved “${fields.title}” to ${libraryLabel(fields.library)} › Unsorted.`, 'ok');
}

ext.runtime.onInstalled.addListener(async () => {
  syncLibraryBridge();
  await ext.contextMenus.removeAll();
  ext.contextMenus.create({
    id: QUICK_SAVE_MENU,
    title: 'Save to Unsorted',
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

/** payload: the series identity from the page ({ site, seriesKey, url, title, altTitles, externalIds, library }). */
async function lookup(series) {
  let lib;
  try {
    lib = await libraryForBadge();
  } catch {
    lib = null;
  }
  const match = lib && findDuplicate(lib, series);
  if (!match) return { entry: null };
  const e = match.entry;
  return {
    entry: {
      title: e.title,
      readingStatus: e.readingStatus,
      lastReadChapter: e.lastReadChapter,
      chaptersAvailable: e.chaptersAvailable,
      where: whereIs(lib, e),
      libraryUrl: libraryPageUrl(await getSettings(), `#/entry/${e.id}`),
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
