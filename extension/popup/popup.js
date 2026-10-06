import { ext, getSettings, isConfigured, getCachedLibrary, setCachedLibrary, libraryPageUrl } from '../lib/ext.js';
import { scrapeTab, prepareCover } from '../lib/page.js';
import { GitHubStore } from '../shared/github-store.js';
import {
  LIBRARIES,
  READING_STATUSES,
  entryFieldsFromScrape,
  foldersFor,
  normalizeLibrary,
  emptyLibrary,
} from '../shared/model.js';
import { uniqueTags, displayTag, normalizeTag } from '../shared/tags.js';
import { findDuplicate } from '../shared/match.js';

const app = document.getElementById('app');
let settings;
let library = emptyLibrary();
let libraryWarning = '';
let tabId;
let scraped;
let coverPromise = Promise.resolve(null);

// ---------- tiny DOM helper (text is always set with textContent, never innerHTML) ----------

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function show(...nodes) {
  app.replaceChildren(...nodes);
}

function libraryUrl(hash = '') {
  return libraryPageUrl(settings, hash);
}

function openTab(url) {
  ext.tabs.create({ url });
  window.close();
}

// ---------- start ----------

init().catch((err) => showError('Something went wrong.', err));

async function init() {
  document.getElementById('open-options').addEventListener('click', () => {
    ext.runtime.openOptionsPage();
    window.close();
  });
  settings = await getSettings();
  if (!isConfigured(settings)) return showSetup();

  const libBtn = document.getElementById('open-library');
  if (settings.siteUrl) {
    libBtn.hidden = false;
    libBtn.addEventListener('click', () => openTab(libraryUrl()));
  }

  const libraryReady = loadLibrary();

  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;
  try {
    scraped = await scrapeTab(tabId);
  } catch (err) {
    return showError("This page can't be read.", err, true);
  }
  if (!scraped) return showError("This page can't be read.", null, true);

  if (scraped.kind === 'series') coverPromise = prepareCover(tabId, scraped.coverUrl);
  await libraryReady;

  if (scraped.kind === 'chapter') return showChapter();
  return showSeriesForm();
}

async function loadLibrary() {
  const cached = await getCachedLibrary();
  if (cached) library = normalizeLibrary(cached);
  const fresh = (async () => {
    const store = new GitHubStore(settings);
    const lib = await store.loadLibrary();
    await setCachedLibrary(lib);
    return lib;
  })();
  // Use the fresh copy if it arrives quickly; otherwise carry on with the cached one.
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), cached ? 2500 : 8000));
  try {
    const result = await Promise.race([fresh, timeout]);
    if (result !== 'timeout') library = result;
    else fresh.then((lib) => (library = lib)).catch(() => {});
  } catch (err) {
    if (err.status === 404) {
      libraryWarning = 'Your data repo has no library yet. It will be created when you save.';
    } else {
      libraryWarning = `Couldn't load your library from GitHub (${err.message}). Duplicate check uses the last saved copy.`;
    }
  }
}

// ---------- simple screens ----------

function showSetup() {
  show(
    h('p', { class: 'state', text: 'Connect your GitHub library to start saving.' }),
    h('div', { class: 'done' }, h('button', { class: 'primary', onclick: () => ext.runtime.openOptionsPage(), text: 'Open settings' })),
  );
}

function showError(title, err, offerManual) {
  const nodes = [h('p', { class: 'state', text: title })];
  if (err) nodes.push(h('p', { class: 'status error', text: err.message || String(err) }));
  if (offerManual) {
    nodes.push(
      h('p', {
        class: 'status',
        text: "Browser pages, the add-on store and some PDF viewers can't be read by extensions.",
      }),
    );
    if (settings && settings.siteUrl) {
      nodes.push(
        h('div', { class: 'done' }, h('button', { class: 'link-btn', onclick: () => openTab(libraryUrl('#/add')), text: 'Add it by hand on the website ↗' })),
      );
    }
  }
  show(...nodes);
}

function showDone(message, entryId) {
  const actions = [];
  if (settings.siteUrl && entryId) {
    actions.push(h('button', { class: 'primary', onclick: () => openTab(libraryUrl(`#/entry/${entryId}`)), text: 'Open in library' }));
  }
  actions.push(h('button', { class: 'link-btn', onclick: () => window.close(), text: 'Close' }));
  show(h('div', { class: 'done' }, h('div', { class: 'big', text: '✓' }), h('p', { text: message }), h('div', { class: 'actions' }, actions)));
}

// ---------- chapter page: update last-read ----------

function showChapter() {
  const s = scraped;
  const match = findDuplicate(library, {
    site: s.site,
    seriesKey: s.seriesKey,
    url: s.seriesUrl,
    title: s.seriesTitle,
    externalIds: s.externalIds,
  });
  const entry = match && match.entry;

  if (!entry) {
    const nodes = [
      h('div', {
        class: 'banner info',
        text: `You're on ${s.chapter != null ? `chapter ${s.chapter} of ` : ''}${s.seriesTitle || 'a series'} that isn't in your library yet.`,
      }),
    ];
    if (s.seriesUrl) {
      nodes.push(
        h(
          'div',
          { class: 'done' },
          h('button', {
            class: 'primary',
            text: 'Go to the series page to save it',
            onclick: async () => {
              await ext.tabs.update(tabId, { url: s.seriesUrl });
              window.close();
            },
          }),
        ),
      );
    }
    return show(...nodes);
  }

  const chapterInput = h('input', { type: 'number', min: '0', step: 'any', value: s.chapter != null ? String(s.chapter) : '' });
  const markReading = h('input', { type: 'checkbox', checked: !entry.readingStatus || entry.readingStatus === 'plan' });
  const status = h('span', { class: 'status' });
  const button = h('button', { class: 'primary', text: 'Set last read' });

  button.addEventListener('click', async () => {
    const chapter = Number(chapterInput.value);
    if (!chapterInput.value || !Number.isFinite(chapter)) {
      status.textContent = 'Enter a chapter number.';
      status.className = 'status error';
      return;
    }
    button.disabled = true;
    status.className = 'status';
    status.textContent = 'Saving…';
    const res = await ext.runtime.sendMessage({
      type: 'setLastRead',
      payload: { entryId: entry.id, chapter, markReading: markReading.checked, title: entry.title },
    });
    if (res && res.ok) return showDone(`${entry.title}: last read set to chapter ${chapter}.`, entry.id);
    button.disabled = false;
    status.className = 'status error';
    status.textContent = (res && res.error) || 'Save failed.';
  });

  const cover = entry.coverSourceUrl ? h('img', { class: 'cover', src: entry.coverSourceUrl, alt: '' }) : h('div', { class: 'cover placeholder', text: '📖' });
  show(
    h(
      'div',
      { class: 'top' },
      cover,
      h(
        'div',
        { class: 'top-main' },
        h('strong', { text: entry.title }),
        h('span', {
          class: 'meta',
          text: `Last read: ${entry.lastReadChapter ?? '—'} · Available: ${entry.chaptersAvailable ?? '—'}`,
        }),
        h('div', { class: 'field' }, h('label', { text: 'Chapter you are on' }), chapterInput),
        h('label', { class: 'check' }, markReading, 'Mark as Reading'),
      ),
    ),
    h('div', { class: 'actions' }, button, status),
  );
}

// ---------- series page: preview and save ----------

function showSeriesForm() {
  const s = scraped;
  const fields = entryFieldsFromScrape(s);
  const match = findDuplicate(library, { ...s, library: s.library });
  const existing = match ? match.entry : null;
  let mode = existing ? 'update' : 'add';

  // Form state
  const state = {
    library: existing ? existing.library : s.library || 'manga',
    readingStatus: existing ? existing.readingStatus : null,
    chaptersAvailable: Math.max(existing?.chaptersAvailable ?? -1, s.chaptersAvailable ?? -1),
    lastReadChapter: existing?.lastReadChapter ?? s.lastReadHint ?? null,
    notes: existing ? existing.notes : '',
    scrapedTags: uniqueTags([...(existing ? existing.scrapedTags : []), ...fields.scrapedTags]),
    selectedScraped: new Set(),
    customTags: existing ? [...existing.customTags] : [],
    folderIds: new Set(existing ? existing.folderIds : []),
    newFolders: [], // { name, library }
  };
  if (state.chaptersAvailable < 0) state.chaptersAvailable = null;
  state.scrapedTags.forEach((t) => state.selectedScraped.add(t));

  const nodes = [];
  if (scraped.warning) nodes.push(h('div', { class: 'banner warn', text: scraped.warning }));
  if (libraryWarning) nodes.push(h('div', { class: 'banner warn', text: libraryWarning }));

  const dupBanner = h('div', { class: 'banner info' });
  if (existing) {
    dupBanner.append(
      `Already in your library (${match.reason}): “${existing.title}”. Saving will update it and keep your notes and folders. `,
      h('button', {
        class: 'link-btn',
        text: 'Save as a separate entry instead',
        onclick: () => {
          mode = 'add';
          dupBanner.remove();
          saveBtn.textContent = 'Save to library';
        },
      }),
    );
    nodes.push(dupBanner);
  }

  // Cover + title
  const cover = s.coverUrl ? h('img', { class: 'cover', src: s.coverUrl, alt: '' }) : h('div', { class: 'cover placeholder', text: '📖' });
  if (s.coverUrl) cover.addEventListener('error', () => cover.replaceWith(h('div', { class: 'cover placeholder', text: '📖' })));
  const titleInput = h('textarea', { class: 'title-input', rows: 2 });
  titleInput.value = existing ? existing.title : s.title || '';

  const metaBits = [s.siteLabel || s.site];
  if (s.chaptersAvailable != null) metaBits.push(`${s.chaptersAvailable} chapters`);
  if (s.pubStatus) metaBits.push(s.pubStatus);

  const segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Library' });
  const renderSegmented = () => {
    segmented.replaceChildren(
      ...LIBRARIES.map((l) =>
        h('button', {
          type: 'button',
          'aria-pressed': String(state.library === l.id),
          text: l.label,
          onclick: () => {
            state.library = l.id;
            renderSegmented();
            renderFolders();
          },
        }),
      ),
    );
  };
  renderSegmented();

  nodes.push(
    h(
      'div',
      { class: 'top' },
      cover,
      h('div', { class: 'top-main' }, titleInput, h('span', { class: 'meta', text: metaBits.join(' · ') }), segmented),
    ),
  );

  // Status + chapters
  const statusSelect = h(
    'select',
    { onchange: (e) => (state.readingStatus = e.target.value || null) },
    h('option', { value: '', text: '—' }),
    ...READING_STATUSES.map((st) => h('option', { value: st.id, text: st.label, selected: state.readingStatus === st.id })),
  );
  const availInput = h('input', { type: 'number', min: '0', step: 'any', value: state.chaptersAvailable ?? '' });
  const readInput = h('input', { type: 'number', min: '0', step: 'any', value: state.lastReadChapter ?? '' });
  nodes.push(
    h(
      'div',
      { class: 'field row' },
      h('div', {}, h('span', { class: 'field-label', text: 'Status' }), statusSelect),
      h('div', {}, h('span', { class: 'field-label', text: 'Chapters' }), availInput),
      h('div', {}, h('span', { class: 'field-label', text: 'Last read' }), readInput),
    ),
  );

  // Tags
  const tagChips = h('div', { class: 'chips' });
  const tagInput = h('input', { class: 'chip-input', placeholder: '+ add tag', 'aria-label': 'Add a tag' });
  const renderTags = () => {
    tagChips.replaceChildren(
      ...state.scrapedTags.map((t) =>
        h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(state.selectedScraped.has(t)),
          text: displayTag(t),
          title: 'From the site. Click to include or leave out.',
          onclick: () => {
            if (state.selectedScraped.has(t)) state.selectedScraped.delete(t);
            else state.selectedScraped.add(t);
            renderTags();
          },
        }),
      ),
      ...state.customTags.map((t) =>
        h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': 'true',
          text: `${displayTag(t)} ×`,
          title: 'Your tag. Click to remove.',
          onclick: () => {
            state.customTags = state.customTags.filter((x) => x !== t);
            renderTags();
          },
        }),
      ),
      tagInput,
    );
  };
  tagInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const t = normalizeTag(tagInput.value);
    tagInput.value = '';
    if (!t) return;
    if (state.scrapedTags.includes(t)) state.selectedScraped.add(t);
    else if (!state.customTags.includes(t)) state.customTags.push(t);
    renderTags();
    tagInput.focus();
  });
  renderTags();
  nodes.push(h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Tags' }), tagChips));

  // Folders
  const folderChips = h('div', { class: 'chips' });
  const folderInput = h('input', { class: 'chip-input', placeholder: '+ new folder', 'aria-label': 'New folder' });
  function renderFolders() {
    const folders = foldersFor(library, state.library);
    folderChips.replaceChildren(
      ...folders.map((f) =>
        h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(state.folderIds.has(f.id)),
          text: f.name,
          onclick: () => {
            if (state.folderIds.has(f.id)) state.folderIds.delete(f.id);
            else state.folderIds.add(f.id);
            renderFolders();
          },
        }),
      ),
      ...state.newFolders
        .filter((f) => f.library === state.library)
        .map((f) =>
          h('button', {
            type: 'button',
            class: 'chip',
            'aria-pressed': 'true',
            text: `${f.name} (new) ×`,
            onclick: () => {
              state.newFolders = state.newFolders.filter((x) => x !== f);
              renderFolders();
            },
          }),
        ),
      folderInput,
    );
  }
  folderInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = folderInput.value.trim();
    folderInput.value = '';
    if (!name) return;
    const existingFolder = foldersFor(library, state.library).find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (existingFolder) state.folderIds.add(existingFolder.id);
    else if (!state.newFolders.some((f) => f.library === state.library && f.name.toLowerCase() === name.toLowerCase())) {
      state.newFolders.push({ name, library: state.library });
    }
    renderFolders();
    folderInput.focus();
  });
  renderFolders();
  nodes.push(
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label', text: 'Folders (none = Unsorted)' }),
      folderChips,
    ),
  );

  // Notes
  const notesInput = h('textarea', { rows: 3, placeholder: 'Characters, where you stopped, anything to remember…' });
  notesInput.value = state.notes;
  nodes.push(h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Notes' }), notesInput));

  if (s.synopsis) nodes.push(h('details', {}, h('summary', { text: 'Synopsis' }), h('p', { text: s.synopsis })));

  // Save
  const saveBtn = h('button', { class: 'primary', text: existing ? 'Update entry' : 'Save to library' });
  const status = h('span', { class: 'status' });
  saveBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    if (!title) {
      status.className = 'status error';
      status.textContent = 'Give it a title.';
      return;
    }
    saveBtn.disabled = true;
    status.className = 'status';
    status.textContent = 'Saving…';

    const needCover = mode === 'add' || !existing || !existing.coverPath;
    const cover = needCover
      ? await Promise.race([coverPromise, new Promise((r) => setTimeout(() => r(null), 8000))])
      : null;

    const user = {
      title,
      library: state.library,
      readingStatus: state.readingStatus,
      chaptersAvailable: availInput.value === '' ? null : Number(availInput.value),
      lastReadChapter: readInput.value === '' ? null : Number(readInput.value),
      notes: notesInput.value,
      scrapedTags: state.scrapedTags.filter((t) => state.selectedScraped.has(t)),
      customTags: state.customTags,
      folderIds: [...state.folderIds].filter((id) => library.folders.some((f) => f.id === id && f.library === state.library)),
      newFolders: state.newFolders.filter((f) => f.library === state.library).map((f) => f.name),
    };

    let res;
    try {
      res = await ext.runtime.sendMessage({
        type: 'save',
        payload: { mode, entryId: mode === 'update' ? existing.id : null, scraped: fields, user, cover },
      });
    } catch (err) {
      res = { ok: false, error: err.message };
    }
    if (res && res.ok) {
      if (res.library) library = normalizeLibrary(res.library);
      const saved = library.entries.find((e) => e.id === res.entryId);
      const folderNames = saved
        ? library.folders.filter((f) => saved.folderIds.includes(f.id)).map((f) => f.name)
        : [...user.newFolders];
      const where = folderNames.length ? folderNames.join(', ') : 'Unsorted';
      const libLabel = LIBRARIES.find((l) => l.id === user.library).label;
      return showDone(`${mode === 'update' ? 'Updated' : 'Saved'} to ${libLabel} › ${where}.`, res.entryId);
    }
    saveBtn.disabled = false;
    status.className = 'status error';
    status.textContent = (res && res.error) || 'Save failed.';
  });
  nodes.push(h('div', { class: 'actions' }, saveBtn, status));

  show(...nodes);
  titleInput.focus();
}
