import { useMemo, useState } from 'react';
import { LIBRARIES, addFolder, deleteFolder, foldersFor, moveFolder, newId, renameFolder } from '@shared/model.js';
import { boardHash, navigate } from '../lib/router.js';

export function Sidebar({ library, board, mutate, open, onClose, onLock, saving }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const folders = foldersFor(library, board.library);

  const counts = useMemo(() => {
    const c = { manga: 0, novel: 0, unsorted: 0, folders: {}, genres: new Set() };
    for (const e of library.entries) {
      c[e.library]++;
      if (e.library !== board.library) continue;
      if (!e.folderIds.length) c.unsorted++;
      for (const id of e.folderIds) c.folders[id] = (c.folders[id] || 0) + 1;
      for (const g of e.genres) c.genres.add(g);
    }
    return c;
  }, [library, board.library]);

  const go = (hash) => {
    navigate(hash);
    onClose();
  };

  function createFolder(e) {
    e.preventDefault();
    const n = name.trim();
    setName('');
    setAdding(false);
    if (!n) return;
    const existing = folders.find((f) => f.name.toLowerCase() === n.toLowerCase());
    const id = existing ? existing.id : newId('f');
    if (!existing) mutate((lib) => addFolder(lib, { id, name: n, library: board.library }), `New folder: ${n}`);
    go(boardHash({ library: board.library, section: 'folder', folderId: id }));
  }

  function rename(f) {
    const n = window.prompt('Rename folder', f.name);
    if (n && n.trim() && n.trim() !== f.name) mutate((lib) => renameFolder(lib, f.id, n), `Rename folder: ${f.name} → ${n.trim()}`);
  }

  function remove(f) {
    if (!window.confirm(`Delete the folder “${f.name}”?\nThe series in it stay in your library.`)) return;
    mutate((lib) => deleteFolder(lib, f.id), `Delete folder: ${f.name}`);
    if (board.section === 'folder' && board.folderId === f.id) go(boardHash({ library: board.library, section: 'all' }));
  }

  const isActive = (section, folderId) =>
    board.section === section && (section !== 'folder' || board.folderId === folderId);

  return (
    <>
      <div className={`scrim ${open ? 'scrim--open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Library sections">
        <div className="sidebar__brand">
          <img src="./logo.png" alt="" width="43" height="26" />
          <span>Manga Shelf</span>
        </div>

        <div className="libswitch" role="tablist" aria-label="Library">
          {LIBRARIES.map((l) => (
            <button
              key={l.id}
              role="tab"
              type="button"
              aria-selected={board.library === l.id}
              className="libswitch__tab"
              onClick={() => go(boardHash({ library: l.id, section: board.section === 'genres' ? 'genres' : 'all' }))}
            >
              <span>{l.label}</span>
              <span className="libswitch__count">{counts[l.id]}</span>
            </button>
          ))}
        </div>

        <nav className="sections">
          <button type="button" className={`section ${isActive('all') ? 'section--active' : ''}`} onClick={() => go(boardHash({ library: board.library, section: 'all' }))}>
            <span>All</span>
            <span className="section__count">{counts[board.library]}</span>
          </button>
          <button
            type="button"
            className={`section ${isActive('unsorted') ? 'section--active' : ''}`}
            onClick={() => go(boardHash({ library: board.library, section: 'unsorted' }))}
          >
            <span>Unsorted</span>
            <span className="section__count">{counts.unsorted}</span>
          </button>
          <button
            type="button"
            className={`section ${isActive('genres') ? 'section--active' : ''}`}
            onClick={() => go(boardHash({ library: board.library, section: 'genres' }))}
            title="Every genre, with how many series have it"
          >
            <span>Genres</span>
            <span className="section__count">{counts.genres.size}</span>
          </button>

          <div className="sections__heading">
            <span>Folders</span>
            <button type="button" className="icon-btn" title="New folder" aria-label="New folder" onClick={() => setAdding((a) => !a)}>
              +
            </button>
          </div>

          {adding && (
            <form onSubmit={createFolder} className="newfolder">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Folder name, then Enter"
                aria-label="New folder name"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setName('');
                    setAdding(false);
                  }
                }}
              />
            </form>
          )}

          {folders.length === 0 && !adding && <p className="sections__hint">Make folders like “Action” or “Top picks”. A series can be in several.</p>}

          {folders.map((f, i) => (
            <div key={f.id} className={`section section--folder ${isActive('folder', f.id) ? 'section--active' : ''}`}>
              <button type="button" className="section__main" onClick={() => go(boardHash({ library: board.library, section: 'folder', folderId: f.id }))}>
                <span className="section__name">{f.name}</span>
                <span className="section__count">{counts.folders[f.id] || 0}</span>
              </button>
              <span className="section__tools">
                <button type="button" title="Move up" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => mutate((lib) => moveFolder(lib, f.id, -1), `Reorder folders`)}>
                  ↑
                </button>
                <button
                  type="button"
                  title="Move down"
                  aria-label={`Move ${f.name} down`}
                  disabled={i === folders.length - 1}
                  onClick={() => mutate((lib) => moveFolder(lib, f.id, 1), `Reorder folders`)}
                >
                  ↓
                </button>
                <button type="button" title="Rename" aria-label={`Rename ${f.name}`} onClick={() => rename(f)}>
                  ✎
                </button>
                <button type="button" title="Delete" aria-label={`Delete ${f.name}`} onClick={() => remove(f)}>
                  🗑
                </button>
              </span>
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <a className="btn btn--primary btn--block" href={`#/add?library=${board.library}`} onClick={onClose}>
            + Add by hand
          </a>
          <div className="sidebar__row">
            <span className="sidebar__links">
              <a href="#/settings" onClick={onClose}>
                Settings
              </a>
              <button type="button" className="linkish sidebar__lock" onClick={onLock} title="Remove the key from this device">
                Lock
              </button>
            </span>
            <span className={`sync ${saving ? 'sync--busy' : ''}`}>{saving ? 'Saving…' : 'Saved'}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
