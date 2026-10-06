import { displayTag } from '@shared/tags.js';
import { CoverImage } from './CoverImage.jsx';
import { StatusPill } from './ui.jsx';

export function Card({ entry, store }) {
  const hasProgress = entry.lastReadChapter != null || entry.chaptersAvailable != null;
  const behind =
    entry.chaptersAvailable != null && entry.lastReadChapter != null
      ? Math.max(0, Math.floor(entry.chaptersAvailable - entry.lastReadChapter))
      : 0;

  return (
    <a className="card" href={`#/entry/${encodeURIComponent(entry.id)}`}>
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
        {(entry.readingStatus || hasProgress) && (
          <div className="card__meta">
            <StatusPill status={entry.readingStatus} />
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
