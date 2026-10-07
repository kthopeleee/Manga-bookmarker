import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LIBRARIES, addFolder, addToFolder, foldersFor, getEntry, newId, setFolderListUrl } from '@shared/model.js';
import { useRoute, boardHash, navigate } from './lib/router.js';
import { useLibrary } from './lib/useLibrary.js';
import { loadSettings, saveSettings, clearSettings, isConfigured, loadPrefs, savePrefs } from './lib/settings.js';
import { clearCoverCache } from './lib/covers.js';
import { sectionEntries, applyFilters, genreCounts, tagCounts, hasActiveFilters } from './lib/filter.js';
import { Sidebar } from './components/Sidebar.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { Board } from './components/Board.jsx';
import { EntryDetail } from './components/EntryDetail.jsx';
import { AddEntry } from './components/AddEntry.jsx';
import { SettingsPage } from './components/SettingsPage.jsx';
import { GenresPage } from './components/GenresPage.jsx';
import { SelectBar } from './components/SelectBar.jsx';
import { SitesPage } from './components/SitesPage.jsx';

const NO_FILTERS = { search: '', genres: [], tags: [], status: 'any' };

const countText = (n) => (n === 1 ? '1 series' : `${n} series`);

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, kind = 'info') => setToast({ message, kind, id: Date.now() }), []);
  const route = useRoute();
  const lib = useLibrary(settings, notify);
  const [filters, setFilters] = useState(() => ({ ...NO_FILTERS, sort: loadPrefs().sort }));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selecting, setSelecting] = useState(false); // "Add to folder" mode
  const [selected, setSelected] = useState(() => new Set());

  // The board stays visible behind an open series or the add form.
  const lastBoard = useRef(route.name === 'board' ? route : null);
  if (route.name === 'board') lastBoard.current = route;
  const entry = route.name === 'entry' && lib.library ? getEntry(lib.library, route.id) : null;
  const board =
    route.name === 'board'
      ? route
      : lastBoard.current || { name: 'board', library: entry ? entry.library : route.library || 'manga', section: 'all' };

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    savePrefs({ ...loadPrefs(), sort: filters.sort });
  }, [filters.sort]);

  // Genre and tag chips belong to one library, so clear them when switching. Folders do too, so stop picking.
  useEffect(() => {
    setFilters((f) => ({ ...f, genres: [], tags: [] }));
    setSelecting(false);
    setSelected(new Set());
  }, [board.library]);

  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const toggleSelected = useCallback(
    (id) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  useEffect(() => {
    if (!selecting || route.name !== 'board') return undefined;
    const onKey = (e) => e.key === 'Escape' && stopSelecting();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selecting, route.name, stopSelecting]);

  const { mutate } = lib;

  // Put entries in a folder by name, making the folder if there isn't one yet.
  const addToFolderNamed = useCallback(
    (name, ids) => {
      const existing = foldersFor(lib.library, board.library).find((f) => f.name.toLowerCase() === name.toLowerCase());
      const newFolderId = newId('f');
      mutate((l) => {
        if (!existing) addFolder(l, { id: newFolderId, name, library: board.library });
        const folder = l.folders.find((f) => f.library === board.library && f.name.toLowerCase() === name.toLowerCase());
        return addToFolder(l, folder.id, ids);
      }, `Add ${countText(ids.length)} to folder: ${name}`).catch(() => {});
      notify(`Added ${countText(ids.length)} to “${existing ? existing.name : name}”.`);
      stopSelecting();
    },
    [lib.library, board.library, mutate, notify, stopSelecting],
  );

  const dropOnFolder = useCallback(
    (folder, ids) => {
      mutate((l) => addToFolder(l, folder.id, ids), `Add ${countText(ids.length)} to folder: ${folder.name}`).catch(() => {});
      notify(`Added ${countText(ids.length)} to “${folder.name}”.`);
      stopSelecting();
    },
    [mutate, notify, stopSelecting],
  );

  const editListUrl = useCallback(
    (f) => {
      const url = window.prompt(
        `Link “${f.name}” to the same list on a site, like a Mangago list.\nLeave it empty to remove the link.`,
        f.listUrl || '',
      );
      if (url === null) return;
      if (url.trim() && !/^https?:\/\/\S+$/i.test(url.trim())) {
        notify('That isn’t a web address. It should start with https://', 'error');
        return;
      }
      mutate((l) => setFolderListUrl(l, f.id, url), url.trim() ? `List link: ${f.name}` : `Remove list link: ${f.name}`).catch(() => {});
    },
    [mutate, notify],
  );

  const folder =
    board.section === 'folder' && lib.library ? lib.library.folders.find((f) => f.id === board.folderId) : null;
  const libLabel = LIBRARIES.find((l) => l.id === board.library).label;
  const heading =
    board.section === 'unsorted'
      ? `${libLabel} · Unsorted`
      : board.section === 'genres'
        ? `${libLabel} · Genres`
        : folder
          ? `${libLabel} · ${folder.name}`
          : libLabel;

  useEffect(() => {
    document.title = route.name === 'entry' && entry ? `${entry.title} · Manga Shelf` : `${heading} · Manga Shelf`;
  }, [route.name, entry, heading]);

  const section = useMemo(() => (lib.library ? sectionEntries(lib.library, board) : []), [lib.library, board]);
  const shown = useMemo(() => applyFilters(section, filters), [section, filters]);
  const genres = useMemo(() => genreCounts(section), [section]);
  const tags = useMemo(() => tagCounts(section), [section]);

  const closeOverlay = useCallback(() => navigate(boardHash(board)), [board]);

  // Forget the key and cached covers on this device.
  const lock = useCallback(() => {
    clearSettings();
    clearCoverCache();
    setSettings(loadSettings());
    navigate('#/manga');
  }, []);

  // ----- locked / settings -----
  if (!isConfigured(settings) || route.name === 'settings') {
    return (
      <SettingsPage
        key={isConfigured(settings) ? 'unlocked' : 'locked'} // fresh form after locking, so the key isn't kept
        settings={settings}
        connected={isConfigured(settings)}
        library={lib.library}
        onSave={(s, remember) => {
          saveSettings(s, remember);
          setSettings({ ...s });
          if (route.name === 'settings') navigate('#/manga');
        }}
        onForget={lock}
      />
    );
  }

  if (!lib.library) {
    if (lib.status === 'missing') {
      return (
        <Centered>
          <h2>Your data repo has no library yet</h2>
          <p className="muted">
            {settings.owner}/{settings.repo} is connected but empty.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => lib.createLibrary().catch((e) => notify(e.message, 'error'))}>
            Create my library
          </button>
        </Centered>
      );
    }
    if (lib.status === 'error') {
      return (
        <Centered>
          <h2>Couldn't load your library</h2>
          <p className="muted">{lib.error?.message}</p>
          <div className="row row--center">
            <button type="button" className="btn btn--primary" onClick={lib.reload}>
              Try again
            </button>
            <a className="btn" href="#/settings">
              Settings
            </a>
          </div>
        </Centered>
      );
    }
    return (
      <Centered>
        <div className="spinner" aria-label="Loading" />
        <p className="muted">Loading your shelf…</p>
      </Centered>
    );
  }

  let empty;
  if (board.section === 'folder' && !folder) {
    empty = (
      <>
        <h2>This folder no longer exists</h2>
        <a className="btn" href={boardHash({ library: board.library, section: 'all' })}>
          Show all {libLabel}
        </a>
      </>
    );
  } else if (section.length === 0 && board.section === 'all') {
    empty = (
      <>
        <h2>Your {libLabel.toLowerCase()} shelf is empty</h2>
        <p className="muted">
          Open a series on Mangago, Comix, MangaDex, NovelUpdates or Asura Scans and click the extension's bookmark button.
          It shows up here right away.
        </p>
        <a className="btn btn--primary" href={`#/add?library=${board.library}`}>
          Or add one by hand
        </a>
      </>
    );
  } else if (section.length === 0) {
    empty = (
      <>
        <h2>Nothing here yet</h2>
        <p className="muted">
          {board.section === 'unsorted'
            ? 'Everything is in a folder. Nice.'
            : 'Drag covers onto this folder in the sidebar, or click “Add to folder” and pick them. A series can be in as many folders as you like.'}
        </p>
      </>
    );
  } else if (hasActiveFilters(filters)) {
    empty = (
      <>
        <h2>Nothing matches these filters</h2>
        <button type="button" className="btn" onClick={() => setFilters((f) => ({ ...f, ...NO_FILTERS }))}>
          Clear filters
        </button>
      </>
    );
  }

  return (
    <div className="app">
      <Sidebar
        library={lib.library}
        board={board}
        mutate={lib.mutate}
        saving={lib.saving > 0}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onLock={lock}
        onDropEntries={dropOnFolder}
      />
      <main className="main">
        {board.section === 'genres' ? (
          <GenresPage
            board={board}
            heading={heading}
            libLabel={libLabel}
            entries={section}
            genres={genres}
            store={lib.store}
            sort={filters.sort}
            onSort={(sort) => setFilters((f) => ({ ...f, sort }))}
            onMenu={() => setDrawerOpen(true)}
          />
        ) : (
          <>
            <Toolbar
              heading={heading}
              shown={shown.length}
              total={section.length}
              filters={filters}
              setFilters={setFilters}
              genres={genres}
              tags={tags}
              onMenu={() => setDrawerOpen(true)}
              addHref={`#/add?library=${board.library}`}
              folder={folder}
              onEditList={editListUrl}
              selecting={selecting}
              onSelect={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              {selecting && (
                <SelectBar
                  library={lib.library}
                  libraryId={board.library}
                  defaultName={folder ? folder.name : ''}
                  count={selected.size}
                  onAdd={(name) => addToFolderNamed(name, [...selected])}
                  onClear={() => setSelected(new Set())}
                  onCancel={stopSelecting}
                />
              )}
            </Toolbar>
            <Board
              entries={shown}
              store={lib.store}
              empty={empty}
              library={lib.library}
              selecting={selecting}
              selected={selected}
              onToggle={toggleSelected}
            />
          </>
        )}
      </main>

      {route.name === 'entry' && (
        <EntryDetail
          key={route.id}
          entry={entry}
          library={lib.library}
          store={lib.store}
          mutate={lib.mutate}
          notify={notify}
          onClose={closeOverlay}
        />
      )}
      {route.name === 'add' && (
        <AddEntry
          defaultLibrary={route.library}
          defaultFolderId={board.section === 'folder' && board.library === route.library ? board.folderId : null}
          library={lib.library}
          store={lib.store}
          mutate={lib.mutate}
          notify={notify}
          onClose={closeOverlay}
        />
      )}
      {route.name === 'sites' && <SitesPage library={lib.library} mutate={lib.mutate} notify={notify} onClose={closeOverlay} />}

      {toast && (
        <div key={toast.id} className={`toast toast--${toast.kind}`} role="status" onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Centered({ children }) {
  return <div className="centered">{children}</div>;
}
