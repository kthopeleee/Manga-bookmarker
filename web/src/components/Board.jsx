import { Card } from './Card.jsx';

export function Board({ entries, store, empty }) {
  if (!entries.length) return <div className="empty">{empty}</div>;
  return (
    <div className="board">
      {entries.map((e) => (
        <Card key={e.id} entry={e} store={store} />
      ))}
    </div>
  );
}
