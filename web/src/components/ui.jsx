import { useEffect, useId, useRef, useState } from 'react';
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

/**
 * A select whose list opens attached under the button. Keyboard works like a native select:
 * arrows to move, Enter or Space to pick, Escape to close, a letter to jump.
 * options: [{ id, label }]
 */
export function Dropdown({ value, options, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const id = useId();
  const selected = Math.max(0, options.findIndex((o) => o.id === value));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const choose = (i) => {
    onChange(options[i].id);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    const last = options.length - 1;
    if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      // Jump to the next option starting with that letter.
      const from = open ? active : selected;
      for (let step = 1; step <= options.length; step++) {
        const i = (from + step) % options.length;
        if (options[i].label.toLowerCase().startsWith(e.key.toLowerCase())) {
          if (open) setActive(i);
          else onChange(options[i].id);
          break;
        }
      }
      return;
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const moves = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={`dropdown ${open ? 'dropdown--open' : ''}`} ref={rootRef}>
      <div
        className="dropdown__trigger"
        role="combobox"
        tabIndex={0}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        {/* Every label is stacked invisibly underneath so the button is as wide as the longest one. */}
        <span className="dropdown__value">
          {options.map((o) => (
            <span key={o.id} className="dropdown__sizer" aria-hidden="true">
              {o.label}
            </span>
          ))}
          <span>{options[selected]?.label}</span>
        </span>
        <svg className="dropdown__chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </div>
      {open && (
        <ul className="dropdown__menu" role="listbox" id={`${id}-list`} aria-label={label} ref={listRef}>
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              className={`dropdown__option ${i === active ? 'dropdown__option--active' : ''}`}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.label}
              {i === selected && (
                <svg className="dropdown__check" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
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
