import { useState } from 'react';
import { normalizeTag } from '@shared/tags.js';
import { READING_STATUSES, PUB_STATUSES } from '@shared/model.js';

export function Chip({ pressed, onClick, onRemove, title, children, count }) {
  if (onRemove) {
    return (
      <span className="chip chip--on">
        {children}
        <button type="button" className="chip__x" onClick={onRemove} aria-label={`Remove ${title || ''}`} title="Remove">
          ×
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={`chip ${pressed ? 'chip--on' : ''}`} aria-pressed={pressed} onClick={onClick} title={title}>
      {children}
      {count != null && <span className="chip__count">{count}</span>}
    </button>
  );
}

export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Text input that adds a tag on Enter or comma. */
export function TagAdder({ onAdd, placeholder = 'Add tag…' }) {
  const [value, setValue] = useState('');
  const commit = () => {
    const t = normalizeTag(value);
    if (t) onAdd(t);
    setValue('');
  };
  return (
    <input
      className="chip-input"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={() => value.trim() && commit()}
    />
  );
}

export function StatusPill({ status }) {
  if (!status) return null;
  const s = READING_STATUSES.find((x) => x.id === status);
  return <span className={`pill pill--${status}`}>{s ? s.label : status}</span>;
}

export function pubStatusLabel(id) {
  const s = PUB_STATUSES.find((x) => x.id === id);
  return s ? s.label : '';
}

const SITE_NAMES = {
  mangago: 'Mangago',
  comix: 'Comix',
  mangadex: 'MangaDex',
  novelupdates: 'NovelUpdates',
  lunascans: 'LunaScans',
};

export function siteName(link) {
  if (SITE_NAMES[link.site]) return SITE_NAMES[link.site];
  try {
    return new URL(link.url).hostname.replace(/^www\./, '');
  } catch {
    return link.site || 'Link';
  }
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function formatChapter(n) {
  return n == null ? '—' : String(n);
}
