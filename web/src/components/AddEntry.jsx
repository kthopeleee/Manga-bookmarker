import { useState } from 'react';
import { LIBRARIES, READING_STATUSES, addEntry, addFolder, createEntry, foldersFor, newId } from '@shared/model.js';
import { displayTag, uniqueTags } from '@shared/tags.js';
import { findDuplicate } from '@shared/match.js';
import { base64ToBytes, coverPathFor } from '@shared/github-store.js';
import { makeThumbnail } from '@shared/image.js';
import { Modal } from './Modal.jsx';
import { Chip, Segmented, TagAdder } from './ui.jsx';
import { navigate } from '../lib/router.js';
import { readLinkWithExtension, useExtensionAvailable } from '../lib/extension.js';

function looksLikeLink(text) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

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
  const hasExtension = useExtensionAvailable();
  const [fromSite, setFromSite] = useState(null); // { url, fields, cover } read by the extension
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState(null); // { text, error }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const folders = foldersFor(library, form.library);

  // What the extension read, as long as the link hasn't been changed since.
  const site = fromSite && form.url === fromSite.url ? fromSite.fields : null;
  const siteCover = site && fromSite.cover && !file && form.imageUrl === site.coverSourceUrl ? fromSite.cover : null;
  const identity = (title) => {
    const link = site && site.links[0];
    return link
      ? { site: link.site, seriesKey: link.key, url: link.url, externalIds: site.externalIds, altTitles: site.altTitles, title, library: form.library }
      : { title, url: form.url || null, library: form.library };
  };
  const alreadySaved = site ? findDuplicate(library, identity(form.title.trim())) : null;

  async function fillFromLink(url) {
    const link = url.trim();
    if (!link || reading) return;
    setReading(true);
    setReadNote({ text: 'Reading the page in a background tab…' });
    try {
      const { fields, cover, lastReadHint } = await readLinkWithExtension(link);
      const seriesUrl = (fields.links[0] && fields.links[0].url) || link;
      setFromSite({ url: seriesUrl, fields, cover });
      setForm((f) => ({
        ...f,
        library: fields.library || f.library,
        title: fields.title || f.title,
        url: seriesUrl,
        imageUrl: fields.coverSourceUrl || f.imageUrl,
        synopsis: fields.synopsis || f.synopsis,
        chaptersAvailable: fields.chaptersAvailable != null ? String(fields.chaptersAvailable) : f.chaptersAvailable,
        lastReadChapter: lastReadHint != null ? String(lastReadHint) : f.lastReadChapter,
      }));
      if (fields.library && fields.library !== form.library) setFolderIds([]);
      setTags((ts) => uniqueTags([...fields.scrapedTags, ...ts]));
      setReadNote({ text: 'Filled in from the page. Check it over, then add it.' });
    } catch (err) {
      setReadNote({ text: err.message, error: true });
    } finally {
      setReading(false);
    }
  }

  async function prepareCover(id) {
    if (siteCover) {
      // The extension already shrank the cover.
      const path = coverPathFor(id, siteCover.type);
      await store.putFile(path, base64ToBytes(siteCover.base64), `Cover for ${form.title}`);
      return { coverPath: path, coverSourceUrl: form.imageUrl || null };
    }
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
    const dup = findDuplicate(library, identity(title));
    if (dup && !window.confirm(`“${dup.entry.title}” is already in your library (${dup.reason}). Add it again anyway?`)) return;

    setBusy(true);
    try {
      const id = newId('e');
      const cover = await prepareCover(id);
      let links = site ? site.links : [];
      if (form.url && !site) {
        try {
          links = [{ site: new URL(form.url).hostname.replace(/^www\./, ''), key: null, url: form.url }];
        } catch {
          notify('The link is not a valid web address, so it was left out.', 'error');
        }
      }
      const num = (v) => (v === '' ? null : Number(v));
      const siteTags = new Set(site ? uniqueTags(site.scrapedTags) : []);
      const entry = createEntry({
        ...(site && {
          altTitles: site.altTitles,
          authors: site.authors,
          externalIds: site.externalIds,
          genres: site.genres,
          pubStatus: site.pubStatus,
        }),
        id,
        library: form.library,
        title,
        links,
        ...cover,
        synopsis: form.synopsis,
        scrapedTags: tags.filter((t) => siteTags.has(t)),
        customTags: tags.filter((t) => !siteTags.has(t)),
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
        <p className="muted">
          {hasExtension
            ? 'Paste a link to fill it in with the extension, or type the details yourself. Only the title is required.'
            : 'Everything except the title is optional.'}
        </p>

        <Segmented
          label="Library"
          value={form.library}
          options={LIBRARIES}
          onChange={(id) => {
            setForm((f) => ({ ...f, library: id }));
            setFolderIds([]);
          }}
        />

        <div className="field">
          <span className="field__label">Link to the series</span>
          <div className="row">
            <input
              type="url"
              placeholder="https://…"
              aria-label="Link to the series"
              autoFocus
              value={form.url}
              onChange={set('url')}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (hasExtension && looksLikeLink(text)) fillFromLink(text);
              }}
            />
            {hasExtension && (
              <button
                type="button"
                className="btn btn--small addform__fill"
                onClick={() => fillFromLink(form.url)}
                disabled={reading || !looksLikeLink(form.url)}
              >
                {reading ? 'Reading…' : 'Fill in'}
              </button>
            )}
          </div>
          {readNote && <p className={`addform__note ${readNote.error ? 'addform__note--error' : ''}`}>{readNote.text}</p>}
          {alreadySaved && (
            <p className="addform__note addform__note--error">
              Already in your library: <a href={`#/entry/${alreadySaved.entry.id}`}>{alreadySaved.entry.title}</a>
            </p>
          )}
          {!hasExtension && (
            <p className="addform__note">
              With the Manga Bookmarker extension set up for this site, pasting a link fills everything in.
            </p>
          )}
        </div>

        <label className="field">
          <span className="field__label">Title</span>
          <input required value={form.title} onChange={set('title')} />
        </label>
        <div className="field">
          <span className="field__label">Cover</span>
          <div className="row">
            {siteCover && <img className="addform__cover" src={`data:${siteCover.type};base64,${siteCover.base64}`} alt="" />}
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
