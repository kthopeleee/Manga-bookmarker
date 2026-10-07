import { useEffect, useRef, useState } from 'react';
import {
  LIBRARIES,
  addFolder,
  deleteEntry,
  foldersFor,
  linkEntries,
  mergeScrapeIntoEntry,
  newId,
  relatedEntries,
  unlinkEntries,
  updateEntry,
} from '@shared/model.js';
import { findCounterparts, normalizeTitle } from '@shared/match.js';
import { displayTag, entryTags } from '@shared/tags.js';
import { nonGenreTags } from '@shared/genres.js';
import { base64ToBytes, coverPathFor } from '@shared/github-store.js';
import { makeThumbnail } from '@shared/image.js';
import { Modal } from './Modal.jsx';
import { CoverImage } from './CoverImage.jsx';
import { readLinkWithExtension, useExtensionAvailable } from '../lib/extension.js';
import { Chip, Dropdown, STATUS_OPTIONS, Segmented, StatusPill, TagAdder, formatDate, pubStatusLabel, siteName } from './ui.jsx';

// Local copy of a field while it's being edited, refreshed from the library when not focused.
function useDraft(value) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  return [draft, setDraft, editing];
}

const libraryLabel = (id) => LIBRARIES.find((l) => l.id === id).label;

/** The same story in the other library: the manga of a light novel, or the light novel of a manga. */
function LinkedSeries({ entry, library, store, mutate }) {
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const linked = relatedEntries(library, entry);
  const suggestions = findCounterparts(library, entry).filter((e) => !entry.relatedIds.includes(e.id));
  const q = normalizeTitle(query);
  const results = q
    ? library.entries
        .filter(
          (e) =>
            e.id !== entry.id &&
            !entry.relatedIds.includes(e.id) &&
            [e.title, ...e.altTitles].some((t) => normalizeTitle(t).includes(q)),
        )
        .sort((a, b) => (a.library === entry.library) - (b.library === entry.library)) // other library first
        .slice(0, 8)
    : [];

  const link = (other) => {
    setQuery('');
    setPicking(false);
    mutate((lib) => linkEntries(lib, entry.id, other.id), `Link: ${entry.title} + ${other.title}`).catch(() => {});
  };
  const unlink = (other) =>
    mutate((lib) => unlinkEntries(lib, entry.id, other.id), `Unlink: ${entry.title} + ${other.title}`).catch(() => {});

  const row = (e, action) => (
    <div key={e.id} className="related">
      <a className="related__main" href={`#/entry/${encodeURIComponent(e.id)}`} title={`Open ${e.title}`}>
        <CoverImage entry={e} store={store} className="related__cover" />
        <span className="related__text">
          <span className="related__title">{e.title}</span>
          <span className="related__meta">
            {libraryLabel(e.library)}
            {e.lastReadChapter != null && ` · read to ch ${e.lastReadChapter}`}
          </span>
        </span>
        <StatusPill status={e.readingStatus} />
      </a>
      {action}
    </div>
  );

  return (
    <div className="field">
      <span className="field__label">
        Linked series <em>(the same story as a manga or light novel)</em>
      </span>
      {linked.map((e) =>
        row(
          e,
          <button type="button" className="icon-btn" title="Unlink" aria-label={`Unlink ${e.title}`} onClick={() => unlink(e)}>
            ×
          </button>,
        ),
      )}
      {suggestions.map((e) =>
        row(
          e,
          <button type="button" className="btn btn--small" title="Same title in your other library" onClick={() => link(e)}>
            Link
          </button>,
        ),
      )}
      {picking ? (
        <div className="related__picker">
          <input
            autoFocus
            placeholder="Search your library by title…"
            aria-label="Find a series to link"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setPicking(false)}
          />
          {results.map((e) =>
            row(
              e,
              <button type="button" className="btn btn--small" onClick={() => link(e)}>
                Link
              </button>,
            ),
          )}
          {q && results.length === 0 && <p className="muted related__none">Nothing in your library matches.</p>}
        </div>
      ) : (
        <button type="button" className="linkish related__add" onClick={() => setPicking(true)}>
          + Link {entry.library === 'novel' ? 'its manga' : 'its light novel'} or another series
        </button>
      )}
    </div>
  );
}

function numberOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function EntryDetail({ entry, library, store, mutate, onClose, notify }) {
  if (!entry) {
    return (
      <Modal onClose={onClose} label="Not found">
        <div className="detail detail--missing">
          <h2>That series isn't in your library</h2>
          <p>It may have been deleted, or the link is from another library.</p>
        </div>
      </Modal>
    );
  }
  return <EntryDetailInner entry={entry} library={library} store={store} mutate={mutate} onClose={onClose} notify={notify} />;
}

function EntryDetailInner({ entry, library, store, mutate, onClose, notify }) {
  const save = (patch, message) =>
    mutate((lib) => updateEntry(lib, entry.id, patch), message || `Edit: ${entry.title}`).catch(() => {});

  const [title, setTitle, titleEditing] = useDraft(entry.title);
  const [notes, setNotes, notesEditing] = useDraft(entry.notes);
  const [synopsis, setSynopsis, synopsisEditing] = useDraft(entry.synopsis);
  const [lastRead, setLastRead, lastReadEditing] = useDraft(entry.lastReadChapter ?? '');
  const [available, setAvailable, availableEditing] = useDraft(entry.chaptersAvailable ?? '');
  const [editingSynopsis, setEditingSynopsis] = useState(false);
  const [notesState, setNotesState] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [newLink, setNewLink] = useState('');
  const [showAllAlt, setShowAllAlt] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(null); // the link the extension is reading
  const hasExtension = useExtensionAvailable();
  const fileRef = useRef(null);

  const folders = foldersFor(library, entry.library);
  const tags = nonGenreTags(entry);
  const progress =
    entry.chaptersAvailable && entry.lastReadChapter != null
      ? Math.min(100, Math.round((entry.lastReadChapter / entry.chaptersAvailable) * 100))
      : null;
  const caughtUp =
    entry.chaptersAvailable != null && entry.lastReadChapter != null && entry.lastReadChapter >= entry.chaptersAvailable;

  // ----- field commits -----
  const commitTitle = () => {
    titleEditing.current = false;
    const t = title.trim();
    if (t && t !== entry.title) save({ title: t }, `Rename: ${entry.title} → ${t}`);
    else setTitle(entry.title);
  };

  const commitNotes = async () => {
    notesEditing.current = false;
    if (notes === entry.notes) return;
    setNotesState('Saving…');
    try {
      await mutate((lib) => updateEntry(lib, entry.id, { notes }), `Notes: ${entry.title}`);
      setNotesState('Saved');
    } catch {
      setNotesState('Not saved');
    }
  };

  const commitSynopsis = () => {
    synopsisEditing.current = false;
    setEditingSynopsis(false);
    if (synopsis !== entry.synopsis) save({ synopsis }, `Synopsis: ${entry.title}`);
  };

  const commitLastRead = (value = lastRead) => {
    lastReadEditing.current = false;
    const n = numberOrNull(value);
    if (n !== entry.lastReadChapter) {
      const patch = { lastReadChapter: n };
      if (n != null && entry.chaptersAvailable != null && n > entry.chaptersAvailable) patch.chaptersAvailable = n;
      save(patch, `Read: ${entry.title} ch. ${n ?? '—'}`);
    }
  };

  const commitAvailable = () => {
    availableEditing.current = false;
    const n = numberOrNull(available);
    if (n !== entry.chaptersAvailable) save({ chaptersAvailable: n }, `Chapters: ${entry.title}`);
  };

  // Read up to the newest chapter. A series you hadn't started (or only planned) is now one you're reading.
  const markCaughtUp = () => {
    const n = entry.chaptersAvailable;
    lastReadEditing.current = false;
    setLastRead(n);
    const patch = { lastReadChapter: n };
    if (!entry.readingStatus || entry.readingStatus === 'plan') patch.readingStatus = 'reading';
    save(patch, `Read: ${entry.title} ch. ${n} (caught up)`);
  };

  const bumpLastRead = (delta) => {
    const n = Math.max(0, (numberOrNull(lastRead) ?? 0) + delta);
    setLastRead(n);
    commitLastRead(n);
  };

  // ----- folders, tags, links -----
  const toggleFolder = (id) => {
    const ids = entry.folderIds.includes(id) ? entry.folderIds.filter((x) => x !== id) : [...entry.folderIds, id];
    save({ folderIds: ids }, `Folders: ${entry.title}`);
  };

  const createAndAddFolder = (e) => {
    e.preventDefault();
    const name = newFolder.trim();
    setNewFolder('');
    if (!name) return;
    const id = newId('f');
    mutate((lib) => {
      addFolder(lib, { id, name, library: entry.library });
      const folder = lib.folders.find((f) => f.library === entry.library && f.name.toLowerCase() === name.toLowerCase());
      const current = lib.entries.find((x) => x.id === entry.id);
      if (!folder || !current) return lib;
      return updateEntry(lib, entry.id, { folderIds: [...new Set([...(current ? current.folderIds : []), folder.id])] });
    }, `New folder ${name}: ${entry.title}`).catch(() => {});
  };

  const removeTag = (t) =>
    save(
      { scrapedTags: entry.scrapedTags.filter((x) => x !== t), customTags: entry.customTags.filter((x) => x !== t) },
      `Remove tag ${t}: ${entry.title}`,
    );

  const addTag = (t) => {
    if (entryTags(entry).includes(t)) return;
    save({ customTags: [...entry.customTags, t] }, `Add tag ${t}: ${entry.title}`);
  };

  const addLink = async (e) => {
    e.preventDefault();
    const url = newLink.trim();
    setNewLink('');
    if (!url) return;
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      notify('That link is not a valid web address.', 'error');
      return;
    }
    // With the extension, read the page so the link comes with its details; keep the bare link if it can't.
    if (hasExtension && (await updateFromLink(url, { quiet: true }))) return;
    save({ links: [...entry.links, { site: host, key: null, url }] }, `Add link: ${entry.title}`);
  };

  /**
   * Read a link with the extension and fill in what it adds: its link, a higher chapter count, new tags and
   * alternative titles, and the synopsis, authors or cover if the entry has none. The title, the cover you
   * have, your notes, status and folders stay. So if the site a series came from closes, another site's
   * page can fill it in again. Returns false if the page couldn't be read.
   */
  async function updateFromLink(url, { quiet = false } = {}) {
    if (refreshing) return false;
    setRefreshing(url);
    try {
      const { fields, cover } = await readLinkWithExtension(url);
      const site = fields.links[0];
      let coverPatch = {};
      if (!entry.coverPath && cover && cover.base64) {
        const path = coverPathFor(entry.id, cover.type);
        await store.putFile(path, base64ToBytes(cover.base64), `Cover for ${entry.title}`);
        coverPatch = { coverPath: path, coverSourceUrl: entry.coverSourceUrl || fields.coverSourceUrl || null };
      }
      // A bare link to this site (added by hand, or a chapter page) gives way to the series link the page names.
      const sameSite = (u) => {
        try {
          return site && new URL(u).hostname === new URL(site.url).hostname;
        } catch {
          return false;
        }
      };
      const apply = (current) => {
        const merged = mergeScrapeIntoEntry(current, fields);
        const links = merged.links.filter((l) => !(site && l.url === url && l.url !== site.url && sameSite(l.url)));
        return { ...merged, links, ...coverPatch };
      };
      const after = apply(entry);
      const name = siteName(site || { url });
      await mutate((lib) => {
        const current = lib.entries.find((x) => x.id === entry.id);
        return current ? updateEntry(lib, entry.id, apply(current)) : lib;
      }, `Update from ${name}: ${entry.title}`);

      const changes = [
        after.links.length > entry.links.length && 'its link',
        after.chaptersAvailable !== entry.chaptersAvailable && after.chaptersAvailable != null && `${after.chaptersAvailable} chapters`,
        coverPatch.coverPath && 'a cover',
        !entry.synopsis && after.synopsis && 'a synopsis',
        after.scrapedTags.length > entry.scrapedTags.length &&
          `${after.scrapedTags.length - entry.scrapedTags.length} new ${after.scrapedTags.length - entry.scrapedTags.length === 1 ? 'tag' : 'tags'}`,
      ].filter(Boolean);
      notify(changes.length ? `From ${name}: ${changes.join(', ')}.` : `${name} had nothing new.`);
      return true;
    } catch (err) {
      notify(quiet ? `Saved the link. The extension couldn't read it: ${err.message}` : err.message, quiet ? 'info' : 'error');
      return false;
    } finally {
      setRefreshing(null);
    }
  }

  const removeLink = (url) => save({ links: entry.links.filter((l) => l.url !== url) }, `Remove link: ${entry.title}`);

  // ----- cover -----
  async function uploadCover(blob) {
    setCoverBusy(true);
    try {
      const thumb = await makeThumbnail(blob);
      const path = coverPathFor(entry.id, thumb.type);
      await store.putFile(path, thumb.bytes, `Cover for ${entry.title}`);
      const old = entry.coverPath;
      await mutate((lib) => updateEntry(lib, entry.id, { coverPath: path }), `Cover: ${entry.title}`);
      if (old) store.deleteFile(old, `Remove old cover for ${entry.title}`).catch(() => {});
    } catch (err) {
      notify(`Couldn't change the cover: ${err.message}`, 'error');
    } finally {
      setCoverBusy(false);
    }
  }

  async function coverFromUrl() {
    const url = window.prompt('Paste the address of a cover image');
    if (!url) return;
    let blob = null;
    try {
      const res = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (res.ok) blob = await res.blob();
    } catch {
      blob = null;
    }
    if (blob && blob.type.startsWith('image/')) return uploadCover(blob);
    // The site doesn't let other websites download its images: link to it instead.
    const old = entry.coverPath;
    await mutate((lib) => updateEntry(lib, entry.id, { coverSourceUrl: url, coverPath: null }), `Cover link: ${entry.title}`).catch(() => {});
    if (old) store.deleteFile(old, `Remove old cover for ${entry.title}`).catch(() => {});
    notify("That site doesn't allow copying the image, so the cover links to it instead.");
  }

  async function remove() {
    if (!window.confirm(`Delete “${entry.title}” from your library?\nYour notes for it will be deleted too.`)) return;
    const cover = entry.coverPath;
    onClose();
    await mutate((lib) => deleteEntry(lib, entry.id), `Delete: ${entry.title}`).catch(() => {});
    if (cover) store.deleteFile(cover, `Remove cover for ${entry.title}`).catch(() => {});
  }

  const altTitles = showAllAlt ? entry.altTitles : entry.altTitles.slice(0, 2);
  const libLabel = LIBRARIES.find((l) => l.id === entry.library).label;

  return (
    <Modal onClose={onClose} label={entry.title} wide>
      <div className="detail">
        <div className="detail__side">
          <CoverImage entry={entry} store={store} eager className="detail__cover" />
          <div className="detail__cover-tools">
            <button type="button" className="btn btn--small" disabled={coverBusy} onClick={() => fileRef.current.click()}>
              {coverBusy ? 'Uploading…' : 'Upload cover'}
            </button>
            <button type="button" className="btn btn--small" disabled={coverBusy} onClick={coverFromUrl}>
              From URL
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) uploadCover(f);
              }}
            />
          </div>
          {entry.links.length > 0 && (
            <div className="detail__links">
              {entry.links.map((l) => (
                <span key={l.url} className="linkrow">
                  <a className="btn btn--primary btn--block" href={l.url} target="_blank" rel="noopener noreferrer">
                    Read on {siteName(l)} ↗
                  </a>
                  {hasExtension && (
                    <button
                      type="button"
                      className={`icon-btn ${refreshing === l.url ? 'icon-btn--busy' : ''}`}
                      title={`Update from ${siteName(l)}: chapters, tags, and anything missing`}
                      aria-label={`Update from ${siteName(l)}`}
                      disabled={Boolean(refreshing)}
                      onClick={() => updateFromLink(l.url)}
                    >
                      ↻
                    </button>
                  )}
                  <button type="button" className="icon-btn" title="Remove link" aria-label={`Remove link to ${siteName(l)}`} onClick={() => removeLink(l.url)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={addLink} className="detail__addlink">
            <input
              type="url"
              placeholder={refreshing ? 'Reading the page…' : hasExtension ? 'Add a link from another site (https://…)' : 'Add a link (https://…)'}
              title={hasExtension ? 'The extension reads the page and fills in anything new from it' : undefined}
              value={newLink}
              disabled={Boolean(refreshing)}
              onChange={(e) => setNewLink(e.target.value)}
              aria-label="Add a link"
            />
          </form>
        </div>

        <div className="detail__main">
          <input
            className="detail__title"
            value={title}
            aria-label="Title"
            onFocus={() => (titleEditing.current = true)}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {entry.altTitles.length > 0 && (
            <p className="detail__alt">
              {altTitles.join(' · ')}
              {entry.altTitles.length > 2 && (
                <button type="button" className="linkish" onClick={() => setShowAllAlt((s) => !s)}>
                  {showAllAlt ? ' less' : ` +${entry.altTitles.length - 2} more`}
                </button>
              )}
            </p>
          )}
          <p className="detail__byline">
            {entry.authors.length > 0 && <span>by {entry.authors.join(', ')}</span>}
            {entry.pubStatus && <span className="pill pill--plain">{pubStatusLabel(entry.pubStatus)}</span>}
          </p>

          <div className="detail__grid">
            <div className="field">
              <span className="field__label">Library</span>
              <Segmented
                label="Library"
                value={entry.library}
                options={LIBRARIES}
                onChange={(id) => {
                  if (id === entry.library) return;
                  save({ library: id, folderIds: [] }, `Move to ${id}: ${entry.title}`);
                  notify(`Moved to ${LIBRARIES.find((l) => l.id === id).label} › Unsorted.`);
                }}
              />
            </div>
            <div className="field">
              <span className="field__label">Status</span>
              <Dropdown
                label="Reading status"
                value={entry.readingStatus || ''}
                options={STATUS_OPTIONS}
                onChange={(status) => {
                  if (status !== (entry.readingStatus || '')) save({ readingStatus: status || null }, `Status: ${entry.title}`);
                }}
              />
            </div>
          </div>

          <LinkedSeries entry={entry} library={library} store={store} mutate={mutate} />

          <div className="field">
            <span className="field__label">Progress</span>
            <div className="progress">
              <div className="stepper">
                <button type="button" onClick={() => bumpLastRead(-1)} aria-label="One chapter less">
                  −
                </button>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={lastRead}
                  aria-label="Last chapter read"
                  onFocus={() => (lastReadEditing.current = true)}
                  onChange={(e) => setLastRead(e.target.value)}
                  onBlur={() => commitLastRead()}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <button type="button" onClick={() => bumpLastRead(1)} aria-label="One chapter more">
                  +
                </button>
              </div>
              <span className="progress__of">read of</span>
              <input
                className="progress__total"
                type="number"
                min="0"
                step="any"
                value={available}
                aria-label="Chapters available"
                onFocus={() => (availableEditing.current = true)}
                onChange={(e) => setAvailable(e.target.value)}
                onBlur={commitAvailable}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="progress__of">chapters</span>
              {entry.chaptersAvailable != null &&
                (caughtUp ? (
                  <span className="progress__caught-up">✓ Up to date</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--small btn--primary"
                    onClick={markCaughtUp}
                    title={`Set your last-read chapter to ${entry.chaptersAvailable}, the newest one`}
                  >
                    I'm caught up
                  </button>
                ))}
            </div>
            {progress != null && (
              <div className="bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="bar__fill" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          <div className="field">
            <span className="field__label">Folders in {libLabel} {entry.folderIds.length === 0 && <em>(Unsorted)</em>}</span>
            <div className="chips">
              {folders.map((f) => (
                <Chip key={f.id} pressed={entry.folderIds.includes(f.id)} onClick={() => toggleFolder(f.id)}>
                  {f.name}
                </Chip>
              ))}
              <form onSubmit={createAndAddFolder} className="inline-form">
                <input className="chip-input" placeholder="+ New folder" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} aria-label="New folder" />
              </form>
            </div>
          </div>

          <div className="field">
            <span className="field__label">Genres</span>
            <div className="chips">
              {entry.genres.length === 0 && <span className="muted">None yet. Add a tag like “Romance” and it becomes a genre.</span>}
              {entry.genres.map((g) => (
                <Chip key={g} title={displayTag(g)} onRemove={() => removeTag(g)}>
                  {displayTag(g)}
                </Chip>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">Tags</span>
            <div className="chips">
              {tags.map((t) => (
                <Chip key={t} title={displayTag(t)} onRemove={() => removeTag(t)}>
                  {displayTag(t)}
                </Chip>
              ))}
              <TagAdder onAdd={addTag} />
            </div>
          </div>

          <div className="field">
            <span className="field__label">
              Synopsis
              {!editingSynopsis && (
                <button type="button" className="linkish" onClick={() => setEditingSynopsis(true)}>
                  {entry.synopsis ? 'Edit' : 'Add'}
                </button>
              )}
            </span>
            {editingSynopsis ? (
              <textarea
                autoFocus
                rows={6}
                value={synopsis}
                onFocus={() => (synopsisEditing.current = true)}
                onChange={(e) => setSynopsis(e.target.value)}
                onBlur={commitSynopsis}
              />
            ) : (
              entry.synopsis && <p className="detail__synopsis">{entry.synopsis}</p>
            )}
          </div>

          <div className="field">
            <span className="field__label">
              My notes {notesState && <span className="muted">· {notesState}</span>}
            </span>
            <textarea
              className="notes"
              rows={6}
              placeholder="Characters, plot so far, where you stopped, what to remember before re-reading…"
              value={notes}
              onFocus={() => {
                notesEditing.current = true;
                setNotesState('');
              }}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
            />
          </div>

          <footer className="detail__foot">
            <span className="muted">
              Added {formatDate(entry.addedAt)} · Changed {formatDate(entry.updatedAt)}
            </span>
            <button type="button" className="btn btn--danger btn--small" onClick={remove}>
              Delete
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  );
}
