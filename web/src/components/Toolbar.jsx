import { useState } from 'react';
import { READING_STATUSES } from '@shared/model.js';
import { displayTag } from '@shared/tags.js';
import { Chip, Dropdown } from './ui.jsx';
import { hasActiveFilters } from '../lib/filter.js';

export const SORTS = [
  { id: 'added', label: 'Recently added' },
  { id: 'updated', label: 'Recently changed' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'unread', label: 'Most unread chapters' },
];

const STATUS_FILTERS = [{ id: 'any', label: 'Any status' }, ...READING_STATUSES, { id: 'none', label: 'No status' }];

function ChipRow({ label, items, selected, onToggle, limit = 14 }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  // Selected chips always show, then the most common ones.
  const chosen = items.filter((i) => selected.includes(i.value));
  const rest = items.filter((i) => !selected.includes(i.value));
  const visible = expanded ? [...chosen, ...rest] : [...chosen, ...rest.slice(0, Math.max(0, limit - chosen.length))];
  const hidden = chosen.length + rest.length - visible.length;
  return (
    <div className="chiprow">
      <span className="chiprow__label">{label}</span>
      <div className="chips">
        {visible.map((i) => (
          <Chip key={i.value} pressed={selected.includes(i.value)} onClick={() => onToggle(i.value)} count={i.n}>
            {displayTag(i.value)}
          </Chip>
        ))}
        {(hidden > 0 || expanded) && (
          <button type="button" className="linkish" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Fewer' : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'the site';
  }
}

// folder / onEditList: the folder being shown and its link to a list on a site.
// selecting / onSelect / children: "Add to folder" mode, whose bar is passed in as children.
export function Toolbar({ heading, shown, total, filters, setFilters, genres, tags, onMenu, addHref, folder, onEditList, selecting, onSelect, children }) {
  const toggle = (key) => (value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  return (
    <header className="toolbar">
      <div className="toolbar__top">
        <button type="button" className="icon-btn menu-btn" onClick={onMenu} aria-label="Open folders">
          ☰
        </button>
        <div className="toolbar__heading">
          <h1>{heading}</h1>
          <span className="toolbar__count">
            {shown === total ? `${total} series` : `${shown} of ${total}`}
          </span>
          {folder && (
            <span className="toolbar__list">
              {folder.listUrl ? (
                <>
                  <a href={folder.listUrl} target="_blank" rel="noopener noreferrer">
                    List on {hostOf(folder.listUrl)} ↗
                  </a>
                  <button type="button" className="linkish" onClick={() => onEditList(folder)}>
                    Edit
                  </button>
                </>
              ) : (
                <button type="button" className="linkish" onClick={() => onEditList(folder)} title="Save a link to the same list on a site, like a Mangago list">
                  + Link a list
                </button>
              )}
            </span>
          )}
        </div>
        <div className="toolbar__controls">
          <input
            type="search"
            className="search"
            placeholder="Search titles, authors, notes…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            aria-label="Search"
          />
          <Dropdown
            label="Reading status"
            value={filters.status}
            options={STATUS_FILTERS}
            onChange={(status) => setFilters((f) => ({ ...f, status }))}
          />
          <Dropdown label="Sort" value={filters.sort} options={SORTS} onChange={(sort) => setFilters((f) => ({ ...f, sort }))} />
          <button type="button" className="btn" aria-pressed={selecting} onClick={onSelect} title="Pick several covers and put them in a folder">
            Add to folder
          </button>
          <a className="btn btn--primary add-btn" href={addHref}>
            + Add
          </a>
        </div>
      </div>
      {children}
      <ChipRow label="Genres" items={genres} selected={filters.genres} onToggle={toggle('genres')} />
      <ChipRow label="Tags" items={tags} selected={filters.tags} onToggle={toggle('tags')} limit={10} />
      {hasActiveFilters(filters) && (
        <button type="button" className="linkish clear-filters" onClick={() => setFilters((f) => ({ ...f, search: '', genres: [], tags: [], status: 'any' }))}>
          Clear filters
        </button>
      )}
    </header>
  );
}
