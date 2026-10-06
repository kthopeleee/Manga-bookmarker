import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LIBRARIES, getEntry } from '@shared/model.js';
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

const NO_FILTERS = { search: '', genres: [], tags: [], status: 'any' };

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, kind = 'info') => setToast({ message, kind, id: Date.now() }), []);
  const route = useRoute();
  const lib = useLibrary(settings, notify);
  const [filters, setFilters] = useState(() => ({ ...NO_FILTERS, sort: loadPrefs().sort }));
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Genre and tag chips belong to one library, so clear them when switching.
  useEffect(() => {
    setFilters((f) => ({ ...f, genres: [], tags: [] }));
  }, [board.library]);

  const folder =
    board.section === 'folder' && lib.library ? lib.library.folders.find((f) => f.id === board.folderId) : null;
  const libLabel = LIBRARIES.find((l) => l.id === board.library).label;
  const heading =
    board.section === 'unsorted' ? `${libLabel} · Unsorted` : folder ? `${libLabel} · ${folder.name}` : libLabel;

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
            : 'Open a series and tick this folder to add it. A series can be in as many folders as you like.'}
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
      />
      <main className="main">
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
        />
        <Board entries={shown} store={lib.store} empty={empty} />
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
