// Every genre in one library with how many series have it. Tick several to see the series that
// have all of them (or any of them).
import { useMemo } from 'react';
import { displayTag } from '@shared/tags.js';
import { boardHash, navigate } from '../lib/router.js';
import { applyFilters } from '../lib/filter.js';
import { Board } from './Board.jsx';
import { Dropdown, Segmented } from './ui.jsx';
import { SORTS } from './Toolbar.jsx';

const MATCHES = [
  { id: 'all', label: 'All ticked' },
  { id: 'any', label: 'Any ticked' },
];

/** "A", "A and B", "A, B and C" */
function joinNames(names, word) {
  if (names.length < 3) return names.join(` ${word} `);
  return `${names.slice(0, -1).join(', ')} ${word} ${names[names.length - 1]}`;
}

export function GenresPage({ board, heading, libLabel, entries, genres, store, sort, onSort, onMenu }) {
  const selected = board.genres;
  const update = (patch) => navigate(boardHash({ ...board, ...patch }), { replace: true });
  const toggle = (g) => update({ genres: selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g] });

  // A to Z, so a genre is easy to find. A ticked genre no series has any more still shows, so it can be unticked.
  const list = useMemo(() => {
    const missing = selected.filter((g) => !genres.some((x) => x.value === g)).map((value) => ({ value, n: 0 }));
    return [...genres, ...missing].sort((a, b) => a.value.localeCompare(b.value));
  }, [genres, selected]);

  const shown = useMemo(
    () =>
      selected.length
        ? applyFilters(entries, { search: '', tags: [], status: 'any', genres: selected, genreMatch: board.match, sort })
        : [],
    [entries, selected, board.match, sort],
  );

  const names = selected.map(displayTag);
  const word = board.match === 'any' ? 'or' : 'and';

  let empty;
  if (!genres.length) {
    empty = (
      <>
        <h2>No genres yet</h2>
        <p className="muted">
          Genres come from the sites you bookmark from. You can also add one, like “Romance”, as a tag on any series.
        </p>
      </>
    );
  } else if (!selected.length) {
    empty = (
      <>
        <h2>Pick some genres</h2>
        <p className="muted">Tick one or more genres above to see the {libLabel.toLowerCase()} that have them.</p>
      </>
    );
  } else {
    empty = (
      <>
        <h2>No series has {joinNames(names, word)}</h2>
        {board.match === 'all' && selected.length > 1 && (
          <button type="button" className="btn" onClick={() => update({ match: 'any' })}>
            Show series with any of them
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <header className="genres">
        <div className="toolbar__top">
          <button type="button" className="icon-btn menu-btn" onClick={onMenu} aria-label="Open folders">
            ☰
          </button>
          <div className="toolbar__heading">
            <h1>{heading}</h1>
            <span className="toolbar__count">
              {genres.length} {genres.length === 1 ? 'genre' : 'genres'} · {entries.length} series
            </span>
          </div>
        </div>

        {list.length > 0 && (
          <div className="genres__grid" role="group" aria-label="Genres">
            {list.map(({ value, n }) => {
              const on = selected.includes(value);
              return (
                <label key={value} className={`genre ${on ? 'genre--on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(value)} />
                  <span className="genre__name">{displayTag(value)}</span>
                  <span className="genre__count" aria-label={`${n} series`}>
                    {n}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {selected.length > 0 && (
          <div className="genres__bar">
            <span className="genres__summary" role="status">
              {shown.length} series with {joinNames(names, word)}
            </span>
            {selected.length > 1 && (
              <Segmented label="Show series that have" value={board.match} options={MATCHES} onChange={(match) => update({ match })} />
            )}
            <Dropdown label="Sort" value={sort} options={SORTS} onChange={onSort} />
            <button type="button" className="linkish" onClick={() => update({ genres: [] })}>
              Untick all
            </button>
          </div>
        )}
      </header>
      <Board entries={shown} store={store} empty={empty} />
    </>
  );
}
