import { useState } from 'react';
import { LIBRARIES, READING_STATUSES, addEntry, addFolder, createEntry, foldersFor, newId } from '@shared/model.js';
import { displayTag } from '@shared/tags.js';
import { findDuplicate } from '@shared/match.js';
import { coverPathFor } from '@shared/github-store.js';
import { makeThumbnail } from '@shared/image.js';
import { Modal } from './Modal.jsx';
import { Chip, Segmented, TagAdder } from './ui.jsx';
import { navigate } from '../lib/router.js';

export function AddEntry({ defaultLibrary, defaultFolderId, library, store, mutate, onClose, notify }) {
  const [form, setForm] = useState({
    library: defaultLibrary,
    title: '',
    url: '',
    imageUrl: '',
    synopsis: '',
    readingStatus: '',
    chaptersAvailable: '',
    lastReadChapter: '',
    notes: '',
  });
  const [file, setFile] = useState(null);
  const [tags, setTags] = useState([]);
  const [folderIds, setFolderIds] = useState(defaultFolderId ? [defaultFolderId] : []);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const folders = foldersFor(library, form.library);

  async function prepareCover(id) {
    let blob = file;
    if (!blob && form.imageUrl) {
      try {
        const res = await fetch(form.imageUrl, { referrerPolicy: 'no-referrer' });
        if (res.ok) blob = await res.blob();
      } catch {
        blob = null; // the site blocks downloads: link to the image instead
      }
    }
    if (!blob || !blob.type.startsWith('image/')) return { coverPath: null, coverSourceUrl: form.imageUrl || null };
    const thumb = await makeThumbnail(blob);
    const path = coverPathFor(id, thumb.type);
    await store.putFile(path, thumb.bytes, `Cover for ${form.title}`);
    return { coverPath: path, coverSourceUrl: form.imageUrl || null };
  }

  async function submit(e) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    const dup = findDuplicate(library, { title, url: form.url || null, library: form.library });
    if (dup && !window.confirm(`“${dup.entry.title}” is already in your library (${dup.reason}). Add it again anyway?`)) return;

    setBusy(true);
    try {
      const id = newId('e');
      const cover = await prepareCover(id);
      let links = [];
      if (form.url) {
        try {
          links = [{ site: new URL(form.url).hostname.replace(/^www\./, ''), key: null, url: form.url }];
        } catch {
          notify('The link is not a valid web address, so it was left out.', 'error');
        }
      }
      const num = (v) => (v === '' ? null : Number(v));
      const entry = createEntry({
        id,
        library: form.library,
        title,
        links,
        ...cover,
        synopsis: form.synopsis,
        customTags: tags,
        folderIds: folderIds.filter((fid) => folders.some((f) => f.id === fid)),
        readingStatus: form.readingStatus || null,
        chaptersAvailable: num(form.chaptersAvailable),
        lastReadChapter: num(form.lastReadChapter),
        notes: form.notes,
      });
      await mutate((lib) => addEntry(lib, entry), `Add: ${title}`);
      navigate(`#/entry/${id}`);
    } catch (err) {
      notify(`Couldn't add it: ${err.message}`, 'error');
      setBusy(false);
    }
  }

  function newFolder() {
    const name = window.prompt('New folder name');
    if (!name || !name.trim()) return;
    const existing = folders.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
    const id = existing ? existing.id : newId('f');
    if (!existing) mutate((lib) => addFolder(lib, { id, name: name.trim(), library: form.library }), `New folder: ${name.trim()}`).catch(() => {});
    setFolderIds((ids) => [...new Set([...ids, id])]);
  }

  return (
    <Modal onClose={onClose} label="Add a series">
      <form className="addform" onSubmit={submit}>
        <h2>Add a series by hand</h2>
        <p className="muted">For sites the extension can't read. Everything except the title is optional.</p>

        <Segmented
          label="Library"
          value={form.library}
          options={LIBRARIES}
          onChange={(id) => {
            setForm((f) => ({ ...f, library: id }));
            setFolderIds([]);
          }}
        />

        <label className="field">
          <span className="field__label">Title</span>
          <input required autoFocus value={form.title} onChange={set('title')} />
        </label>
        <label className="field">
          <span className="field__label">Link to the series</span>
          <input type="url" placeholder="https://…" value={form.url} onChange={set('url')} />
        </label>
        <div className="field">
          <span className="field__label">Cover</span>
          <div className="row">
            <input type="url" placeholder="Image address (https://…)" value={form.imageUrl} onChange={set('imageUrl')} disabled={!!file} />
            <label className="btn btn--small">
              {file ? file.name : 'Upload…'}
              <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
            </label>
          </div>
        </div>
        <div className="row">
          <label className="field">
            <span className="field__label">Status</span>
            <select value={form.readingStatus} onChange={set('readingStatus')}>
              <option value="">—</option>
              {READING_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Chapters</span>
            <input type="number" min="0" step="any" value={form.chaptersAvailable} onChange={set('chaptersAvailable')} />
          </label>
          <label className="field">
            <span className="field__label">Last read</span>
            <input type="number" min="0" step="any" value={form.lastReadChapter} onChange={set('lastReadChapter')} />
          </label>
        </div>
        <div className="field">
          <span className="field__label">Genres and tags</span>
          <div className="chips">
            {tags.map((t) => (
              <Chip key={t} title={displayTag(t)} onRemove={() => setTags((ts) => ts.filter((x) => x !== t))}>
                {displayTag(t)}
              </Chip>
            ))}
            <TagAdder onAdd={(t) => setTags((ts) => (ts.includes(t) ? ts : [...ts, t]))} placeholder="Fantasy, Isekai…" />
          </div>
        </div>
        <div className="field">
          <span className="field__label">Folders (none = Unsorted)</span>
          <div className="chips">
            {folders.map((f) => (
              <Chip
                key={f.id}
                pressed={folderIds.includes(f.id)}
                onClick={() => setFolderIds((ids) => (ids.includes(f.id) ? ids.filter((x) => x !== f.id) : [...ids, f.id]))}
              >
                {f.name}
              </Chip>
            ))}
            <button type="button" className="linkish" onClick={newFolder}>
              + New folder
            </button>
          </div>
        </div>
        <label className="field">
          <span className="field__label">Synopsis</span>
          <textarea rows={3} value={form.synopsis} onChange={set('synopsis')} />
        </label>
        <label className="field">
          <span className="field__label">Notes</span>
          <textarea rows={3} value={form.notes} onChange={set('notes')} />
        </label>
        <div className="addform__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !form.title.trim()}>
            {busy ? 'Saving…' : 'Add to library'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
