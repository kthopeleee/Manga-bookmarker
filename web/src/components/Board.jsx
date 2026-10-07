import { Card } from './Card.jsx';

// selecting / selected / onToggle: "Add to folder" mode (see SelectBar).
export function Board({ entries, store, empty, library, selecting = false, selected, onToggle }) {
  if (!entries.length) return <div className="empty">{empty}</div>;
  // Dragging a picked card takes all the picked cards with it.
  const dragIds = (id) => (selecting && selected.has(id) ? [...selected] : [id]);
  return (
    <div className={`board ${selecting ? 'board--selecting' : ''}`}>
      {entries.map((e) => (
        <Card
          key={e.id}
          entry={e}
          store={store}
          library={library}
          selecting={selecting}
          selected={selecting && selected.has(e.id)}
          onToggle={onToggle}
          dragIds={dragIds}
        />
      ))}
    </div>
  );
}
