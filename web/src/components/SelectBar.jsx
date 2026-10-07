import { useState } from 'react';
import { foldersFor } from '@shared/model.js';

/** "Add to folder" mode: type a folder name, click covers to pick them, then add them all at once. */
export function SelectBar({ library, libraryId, defaultName = '', count, onAdd, onClear, onCancel }) {
  const [name, setName] = useState(defaultName);
  const folders = foldersFor(library, libraryId);
  const wanted = name.trim();
  const isNew = wanted && !folders.some((f) => f.name.toLowerCase() === wanted.toLowerCase());

  return (
    <div className="selectbar" role="region" aria-label="Add to folder">
      <span className="selectbar__count">{count === 1 ? '1 series picked' : `${count} series picked`}</span>
      {count === 0 && <span className="selectbar__hint">Click covers to pick them.</span>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (wanted && count) onAdd(wanted);
        }}
      >
        <input
          list="selectbar-folders"
          placeholder="Folder name"
          aria-label="Folder name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id="selectbar-folders">
          {folders.map((f) => (
            <option key={f.id} value={f.name} />
          ))}
        </datalist>
        <button type="submit" className="btn btn--small" disabled={!wanted || !count}>
          {isNew ? 'Create folder and add' : 'Add to folder'}
        </button>
        {count > 0 && (
          <button type="button" className="btn btn--small" onClick={onClear}>
            Clear
          </button>
        )}
        <button type="button" className="btn btn--small" onClick={onCancel}>
          Done
        </button>
      </form>
    </div>
  );
}
