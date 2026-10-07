// The chapters of a series, and of its linked manga or light novel in a second tab. A novel and its
// manga number chapters differently, so each keeps its own count and last-read chapter: clicking a
// chapter only changes the version whose tab is open.
import { useState } from 'react';
import { LIBRARIES, relatedEntries, updateEntry } from '@shared/model.js';
import { Dropdown, siteName } from './ui.jsx';
import './Chapters.css';

const PAGE = 100; // chapters shown at a time
const libLabel = (id) => LIBRARIES.find((l) => l.id === id).label;

export function Chapters({ entry, library, mutate }) {
  const versions = [entry, ...relatedEntries(library, entry).filter((e) => e.library !== entry.library)];
  const [tabId, setTabId] = useState(entry.id);
  const [pageFor, setPageFor] = useState({}); // chosen page of 100, per version

  const current = versions.find((v) => v.id === tabId) || entry;
  const total = current.chaptersAvailable != null ? Math.floor(current.chaptersAvailable) : null;
  const read = current.lastReadChapter ?? 0;
  if (versions.length === 1 && !total) return null; // nothing the Progress field doesn't already say

  const pages = total ? Math.ceil(total / PAGE) : 0;
  // Start on the page with the next chapter to read.
  const page = Math.min(pageFor[current.id] ?? Math.floor(Math.floor(read) / PAGE), Math.max(0, pages - 1));
  const first = page * PAGE + 1;
  const last = Math.min(total || 0, (page + 1) * PAGE);
  const next = Math.floor(read) + 1;

  const setRead = (n) => {
    const to = n === read ? n - 1 : n; // clicking your last-read chapter again un-reads it
    const patch = { lastReadChapter: to > 0 ? to : null };
    if (to > 0 && (!current.readingStatus || current.readingStatus === 'plan')) patch.readingStatus = 'reading';
    mutate((lib) => updateEntry(lib, current.id, patch), `Read: ${current.title} ch. ${to}`).catch(() => {});
  };

  const sameLabel = (v) => versions.filter((w) => w.library === v.library).length > 1;
  const tabName = (v) => (sameLabel(v) ? `${libLabel(v.library)}: ${v.title}` : libLabel(v.library));

  return (
    <div className="field chapters">
      <span className="field__label">
        Chapters {versions.length > 1 && <em>(each version counts its own)</em>}
      </span>

      {versions.length > 1 && (
        <div className="chapters__tabs" role="tablist" aria-label="Versions of this story">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === current.id}
              className="chapters__tab"
              onClick={() => setTabId(v.id)}
            >
              <span className="chapters__tab-name">{tabName(v)}</span>
              <span className="chapters__tab-count">
                {v.lastReadChapter ?? 0} / {v.chaptersAvailable ?? '?'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="chapters__panel" role={versions.length > 1 ? 'tabpanel' : undefined}>
        <div className="chapters__info">
          {current.id !== entry.id && (
            <a className="chapters__title" href={`#/entry/${encodeURIComponent(current.id)}`}>
              {current.title}
            </a>
          )}
          <span className="muted">
            {read ? `Read to chapter ${read}` : 'Not started'}
            {total ? ` of ${current.chaptersAvailable}` : ''}
          </span>
          {current.links.map((l) => (
            <a key={l.url} className="chapters__site" href={l.url} target="_blank" rel="noopener noreferrer">
              {siteName(l)} ↗
            </a>
          ))}
          {pages > 1 && (
            <span className="chapters__range">
              <Dropdown
                label="Which chapters to show"
                value={String(page)}
                options={Array.from({ length: pages }, (_, p) => ({
                  id: String(p),
                  label: `${p * PAGE + 1}–${Math.min(total, (p + 1) * PAGE)}`,
                }))}
                onChange={(p) => setPageFor((m) => ({ ...m, [current.id]: Number(p) }))}
              />
            </span>
          )}
        </div>

        {total ? (
          <ol className="chapters__grid" aria-label={`${libLabel(current.library)} chapters ${first} to ${last}`}>
            {Array.from({ length: last - first + 1 }, (_, i) => {
              const n = first + i;
              const done = n <= read;
              return (
                <li key={n}>
                  <button
                    type="button"
                    className={`chapter ${done ? 'chapter--read' : ''} ${n === next ? 'chapter--next' : ''}`}
                    aria-pressed={done}
                    title={n === read ? `Your last-read chapter. Click to go back to ${n - 1}` : `Mark read up to chapter ${n}`}
                    onClick={() => setRead(n)}
                  >
                    {n}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="muted chapters__none">
            No chapter count yet. Open {current.id === entry.id ? 'this series' : 'its page'} on a site with the extension, or
            type one under Progress{current.id === entry.id ? '' : ' on its page'}.
          </p>
        )}
      </div>
    </div>
  );
}
