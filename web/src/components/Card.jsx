import { useState } from 'react';
import { displayTag } from '@shared/tags.js';
import { LIBRARIES, relatedEntries } from '@shared/model.js';
import { CoverImage } from './CoverImage.jsx';
import { StatusPill } from './ui.jsx';

/** Drag data for cards dropped on a folder: a JSON list of entry ids. */
export const ENTRY_DRAG_TYPE = 'application/x-manga-shelf-entries';

// selecting: "Add to folder" mode, where a click picks the card instead of opening it.
// dragIds(id): the ids to drag when this card is picked up (all the picked cards, if it's one of them).
export function Card({ entry, store, library, selecting = false, selected = false, onToggle, dragIds }) {
  const [dragging, setDragging] = useState(false);
  // Linked versions in the other library, e.g. "+ Light Novels" on a manga.
  const also = library ? relatedEntries(library, entry).filter((e) => e.library !== entry.library) : [];
  const alsoLabels = [...new Set(also.map((e) => LIBRARIES.find((l) => l.id === e.library).label))];
  const hasProgress = entry.lastReadChapter != null || entry.chaptersAvailable != null;
  const behind =
    entry.chaptersAvailable != null && entry.lastReadChapter != null
      ? Math.max(0, Math.floor(entry.chaptersAvailable - entry.lastReadChapter))
      : 0;

  return (
    <a
      className={`card ${selected ? 'card--selected' : ''} ${dragging ? 'card--dragging' : ''}`}
      href={`#/entry/${encodeURIComponent(entry.id)}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ENTRY_DRAG_TYPE, JSON.stringify(dragIds ? dragIds(entry.id) : [entry.id]));
        e.dataTransfer.effectAllowed = 'copy';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      {...(selecting && {
        role: 'checkbox',
        'aria-checked': selected,
        onClick: (e) => {
          e.preventDefault();
          onToggle(entry.id);
        },
      })}
    >
      <div className="card__cover">
        <CoverImage entry={entry} store={store} />
        {behind > 0 && entry.readingStatus === 'reading' && (
          <span className="card__badge" title={`${behind} chapters you haven't read`}>
            +{behind}
          </span>
        )}
      </div>
      <div className="card__body">
        <h3 className="card__title">{entry.title}</h3>
        {(entry.readingStatus || hasProgress || alsoLabels.length > 0) && (
          <div className="card__meta">
            <StatusPill status={entry.readingStatus} />
            {alsoLabels.map((label) => (
              <span key={label} className="card__also" title={`Also in ${label}: ${also.map((e) => e.title).join(', ')}`}>
                + {label}
              </span>
            ))}
            {hasProgress && (
              <span className="card__progress">
                Ch {entry.lastReadChapter ?? '–'} / {entry.chaptersAvailable ?? '?'}
              </span>
            )}
          </div>
        )}
        {entry.genres.length > 0 && (
          <div className="card__tags">
            {entry.genres.slice(0, 3).map((g) => (
              <span key={g} className="mini-tag">
                {displayTag(g)}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
